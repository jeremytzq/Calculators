(function () {
  const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  function fmtCurrency(value) {
    const sign = value < 0 ? "-" : "";
    return sign + "S$" + numberFmt.format(Math.abs(value));
  }

  function num(el, fallback = 0) {
    if (!el) return fallback;
    const v = parseFloat(String(el.value).replace(/,/g, ""));
    return isFinite(v) ? v : fallback;
  }

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // Places every duration badge (".timeline-gap") at the exact vertical midpoint between
  // the dot immediately before it and the dot immediately after it — the true middle of the
  // line segment it sits on. Pure CSS can't do this: the true distance between two dots
  // depends on how tall the card in between happens to be, which varies per stage and isn't
  // knowable from the gap row's own box alone. Only measures elements that are actually
  // visible/laid out, so it's safe to call on hidden panels (they're just skipped).
  function positionTimelineGaps() {
    document.querySelectorAll(".timeline").forEach((timeline) => {
      const items = Array.from(timeline.children);
      items.forEach((item, i) => {
        const gap = item.querySelector(".timeline-gap");
        if (!gap) return;
        const prevDot = items[i - 1] && items[i - 1].querySelector(".timeline-dot");
        const nextDot = items[i + 1] && items[i + 1].querySelector(".timeline-dot");
        if (!prevDot || !nextDot) return;
        const prevRect = prevDot.getBoundingClientRect();
        const nextRect = nextDot.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (itemRect.width === 0 && itemRect.height === 0) return; // item itself is hidden
        const midY = (prevRect.top + prevRect.height / 2 + nextRect.top + nextRect.height / 2) / 2;
        gap.style.top = midY - itemRect.top + "px";
      });
    });
  }

  let positionGapsScheduled = false;
  function schedulePositionTimelineGaps() {
    if (positionGapsScheduled) return;
    positionGapsScheduled = true;
    requestAnimationFrame(() => {
      positionGapsScheduled = false;
      positionTimelineGaps();
    });
  }

  window.addEventListener("resize", schedulePositionTimelineGaps);
  document.addEventListener("DOMContentLoaded", schedulePositionTimelineGaps);
  window.addEventListener("load", schedulePositionTimelineGaps);

  // --- Segmented pill control: wires click handlers, returns a getter for the active value ---
  function initSegmented(containerId, onChange) {
    const container = document.getElementById(containerId);
    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("active")) return;
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        onChange(btn.dataset.value);
      });
    });
    return () => container.querySelector("button.active").dataset.value;
  }

  // Seller Stamp Duty — flat % of selling price based on holding period before resale.
  // Current rates for residential property bought on/after 20 Feb 2010.
  function ssdRate(selectEl) {
    return num(selectEl, 0);
  }

  // Buyer's Stamp Duty — progressive bands on the purchase price, current published rates.
  function buyersStampDuty(price) {
    const bands = [
      [180000, 0.01],
      [180000, 0.02],
      [640000, 0.03],
      [500000, 0.04],
      [1500000, 0.05],
    ];
    let remaining = price;
    let total = 0;
    for (const [amt, rate] of bands) {
      const take = Math.min(remaining, amt);
      total += take * rate;
      remaining -= take;
      if (remaining <= 0) break;
    }
    if (remaining > 0) total += remaining * 0.06;
    return total;
  }

  // Additional Buyer's Stamp Duty — flat % of purchase price by residency × property count.
  function absdRate(residency, propertyCount) {
    if (residency === "foreigner") return 60;
    if (residency === "company") return 65;
    const table = {
      citizen: { 1: 0, 2: 20, 3: 30, 4: 30 },
      pr: { 1: 5, 2: 30, 3: 35, 4: 35 },
    };
    const row = table[residency] || table.citizen;
    return row[propertyCount] ?? row[4];
  }

  function monthlyPayment(principal, annualRatePct, termYears) {
    const n = Math.round(termYears * 12);
    if (n <= 0 || principal <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  // Matches a Resale Purchase buyer's name (case-insensitive, exact) against every seller
  // recorded on the Sale Proceeds tab (HDB and Private both) and sums their CPF used + CPF
  // accrued interest — that combined figure is what carries over automatically per the rule
  // that CPF only follows the money when it's provably the same person.
  function matchedCpfFromSale(name) {
    const trimmed = (name || "").trim().toLowerCase();
    if (!trimmed) return { amount: 0, matches: [] };
    const all = [...window.PropertyTransactionResults.hdb.sellers, ...window.PropertyTransactionResults.private.sellers];
    const matches = all.filter((s) => s.name.trim().toLowerCase() === trimmed);
    const amount = matches.reduce((sum, s) => sum + s.cpfUsed + s.cpfAccruedInterest, 0);
    return { amount, matches };
  }

  // Agent commission rate select stores values like "2" or "2gst" — parseFloat naturally
  // stops at the first non-numeric character, so this reads the rate regardless of suffix.
  function agentRateInfo(selectEl) {
    const raw = selectEl.value;
    const rate = parseFloat(raw) / 100;
    const withGst = raw.endsWith("gst");
    return { rate, withGst };
  }

  function agentFeeAmount(sellingPrice, selectEl) {
    const { rate, withGst } = agentRateInfo(selectEl);
    const base = sellingPrice * rate;
    return withGst ? base * 1.09 : base;
  }

  // --- Dynamic seller cards ---
  // Appends one card at a time rather than re-rendering the whole list, so adding a seller
  // never clobbers values already typed into the existing ones. Each seller has a name (so a
  // future Resale Purchase tab can match a buyer back to "the same person" as a seller here),
  // plus CPF used and CPF accrued interest as separate figures — accrued interest is refunded
  // on top of the principal withdrawn, not folded into a single lump sum.
  function makeSellerRenderer(containerId, addBtnId, maxSellers, onInput) {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);
    let count = 0;

    function addCard() {
      count += 1;
      const card = document.createElement("div");
      card.className = "seller-card";
      const nameId = `${containerId}-name-${count}`;
      const usedId = `${containerId}-cpfused-${count}`;
      const interestId = `${containerId}-cpfinterest-${count}`;
      card.innerHTML = `
        <div class="seller-card-title">Seller #${count}</div>
        <div class="field" style="margin-bottom: 10px;">
          <label for="${nameId}">Name <span style="font-weight: 400; color: var(--text-muted);">(optional)</span></label>
          <input type="text" id="${nameId}" placeholder="e.g. John Tan" />
        </div>
        <div class="field" style="margin-bottom: 10px;">
          <label for="${usedId}">CPF used</label>
          <div class="input-wrap has-prefix">
            <span class="prefix">S$</span>
            <input type="text" id="${usedId}" inputmode="decimal" value="0" min="0" step="any" />
          </div>
        </div>
        <div class="field">
          <label for="${interestId}">CPF accrued interest</label>
          <div class="input-wrap has-prefix">
            <span class="prefix">S$</span>
            <input type="text" id="${interestId}" inputmode="decimal" value="0" min="0" step="any" />
          </div>
        </div>
      `;
      container.appendChild(card);
      card.querySelectorAll('input[inputmode="decimal"]').forEach((input) => window.NumberFormat.attach(input));
      card.querySelectorAll("input").forEach((input) => input.addEventListener("input", onInput));
      addBtn.disabled = count >= maxSellers;
    }

    function totalCpf() {
      let total = 0;
      for (let i = 1; i <= count; i++) {
        total += num(document.getElementById(`${containerId}-cpfused-${i}`)) + num(document.getElementById(`${containerId}-cpfinterest-${i}`));
      }
      return total;
    }

    // Per-seller detail — for a future Resale Purchase tab to match a buyer's name back to
    // a seller here and carry over that specific person's CPF used + accrued interest.
    function sellerRows() {
      const rows = [];
      for (let i = 1; i <= count; i++) {
        const nameEl = document.getElementById(`${containerId}-name-${i}`);
        const cpfUsed = num(document.getElementById(`${containerId}-cpfused-${i}`));
        const cpfAccruedInterest = num(document.getElementById(`${containerId}-cpfinterest-${i}`));
        rows.push({ name: (nameEl && nameEl.value.trim()) || "", cpfUsed, cpfAccruedInterest });
      }
      return rows;
    }

    addBtn.addEventListener("click", () => {
      if (count >= maxSellers) return;
      addCard();
      onInput();
    });

    addCard();
    addCard();
    return { totalCpf, sellers: sellerRows };
  }

  // Results exposed for the (future) Resale Purchase tab: Net Cash Proceeds / CPF Refund
  // totals, plus a per-seller breakdown (name, CPF used, CPF accrued interest) so a matching
  // buyer name on the purchase side can carry over that specific seller's CPF figures instead
  // of just the aggregate total.
  window.PropertyTransactionResults = {
    hdb: { netCashProceeds: 0, cpfRefund: 0, sellers: [] },
    private: { netCashProceeds: 0, cpfRefund: 0, sellers: [] },
  };
  window.PropertyTransactionCalc = {};

  // ==================== HDB Sale Proceeds ====================
  (function () {
    const el = {
      sellingPrice: document.getElementById("sph-sellingPrice"),
      outstandingLoan: document.getElementById("sph-outstandingLoan"),
      ssdRate: document.getElementById("sph-ssdRate"),
      resaleApplication: document.getElementById("sph-resaleApplication"),
      legalFee: document.getElementById("sph-legalFee"),
      townCouncilTax: document.getElementById("sph-townCouncilTax"),
      agentFee: document.getElementById("sph-agentFee"),
      agentRate: document.getElementById("sph-agentRate"),
      agentAuto: document.getElementById("sph-agentAuto"),
      bankPenalty: document.getElementById("sph-bankPenalty"),
      resaleLevy: document.getElementById("sph-resaleLevy"),
      outstandingHIP: document.getElementById("sph-outstandingHIP"),
      others: document.getElementById("sph-others"),
      optionFee: document.getElementById("sph-optionFee"),
      exerciseFee: document.getElementById("sph-exerciseFee"),
    };
    const loanFields = document.getElementById("sph-loan-fields");

    const getLoanType = initSegmented("sph-loanType", () => calculate());

    const sellers = makeSellerRenderer("sph-sellers", "sph-addSeller", 4, () => calculate());

    function calculate() {
      const loanType = getLoanType();
      loanFields.hidden = loanType === "none";

      const sellingPrice = num(el.sellingPrice);
      const outstandingLoan = loanType === "none" ? 0 : num(el.outstandingLoan);
      const totalCpf = sellers.totalCpf();

      el.agentFee.readOnly = el.agentAuto.checked;
      if (el.agentAuto.checked) {
        const computed = agentFeeAmount(sellingPrice, el.agentRate);
        el.agentFee.value = computed.toFixed(0);
        window.NumberFormat.attach(el.agentFee);
      }
      const agentFee = num(el.agentFee);

      const ssdAmount = sellingPrice * (ssdRate(el.ssdRate) / 100);
      const resaleApplication = num(el.resaleApplication);
      const legalFee = num(el.legalFee);
      const townCouncilTax = num(el.townCouncilTax);
      const bankPenalty = num(el.bankPenalty);
      const resaleLevy = num(el.resaleLevy);
      const outstandingHIP = num(el.outstandingHIP);
      const others = num(el.others);
      const optionFee = num(el.optionFee);
      const exerciseFee = num(el.exerciseFee);

      const totalExpenses =
        ssdAmount + resaleApplication + legalFee + townCouncilTax + agentFee + bankPenalty + resaleLevy + outstandingHIP + others;

      // HDB nets CPF out of Gross Sales Proceeds directly (the two are then equal).
      const grossSalesProceeds = sellingPrice - outstandingLoan - totalCpf;
      const cpfRefund = totalCpf;
      const grossCashProceeds = grossSalesProceeds;
      const netCashProceeds = grossCashProceeds - totalExpenses;

      const endorsementCash = ssdAmount + legalFee + townCouncilTax + bankPenalty + resaleLevy + outstandingHIP;
      const completionCash = agentFee + others;
      const completionProceeds = grossCashProceeds - optionFee - exerciseFee;

      text("sph-out-totalCpf", fmtCurrency(totalCpf));
      text("sph-out-grossSalesProceeds", fmtCurrency(grossSalesProceeds));
      text("sph-out-cpfRefund", fmtCurrency(cpfRefund));
      text("sph-out-grossCashProceeds", fmtCurrency(grossCashProceeds));
      text("sph-out-totalExpenses", fmtCurrency(totalExpenses));
      text("sph-out-ssd", fmtCurrency(ssdAmount));
      text("sph-out-netCashProceeds", fmtCurrency(netCashProceeds));

      text("sph-tl-resaleApplication", fmtCurrency(resaleApplication));
      text("sph-tl-endorsementCash", fmtCurrency(endorsementCash));
      text("sph-tl-ssd", fmtCurrency(ssdAmount));
      text("sph-tl-legalFee", fmtCurrency(legalFee));
      text("sph-tl-townCouncilTax", fmtCurrency(townCouncilTax));
      text("sph-tl-bankPenalty", fmtCurrency(bankPenalty));
      text("sph-tl-resaleLevy", fmtCurrency(resaleLevy));
      text("sph-tl-outstandingHIP", fmtCurrency(outstandingHIP));
      text("sph-tl-completionCash", fmtCurrency(completionCash));
      text("sph-tl-agentFee", fmtCurrency(agentFee));
      text("sph-tl-others", fmtCurrency(others));
      text("sph-tl-completionProceeds", fmtCurrency(completionProceeds));

      window.PropertyTransactionResults.hdb = { netCashProceeds, cpfRefund, sellers: sellers.sellers() };
      if (window.PropertyTransactionCalc.hdbPurchase) window.PropertyTransactionCalc.hdbPurchase();
      if (window.PropertyTransactionCalc.privatePurchase) window.PropertyTransactionCalc.privatePurchase();
    }

    Object.values(el).forEach((input) => input && input.addEventListener("input", calculate));
    el.agentRate.addEventListener("change", calculate);
    el.agentAuto.addEventListener("change", calculate);
    document.getElementById("sph-form").addEventListener("submit", (e) => e.preventDefault());

    calculate();
    window.PropertyTransactionCalc = window.PropertyTransactionCalc || {};
    window.PropertyTransactionCalc.hdbSale = calculate;
  })();

  // ==================== Private Sale Proceeds ====================
  (function () {
    const el = {
      sellingPrice: document.getElementById("spp-sellingPrice"),
      outstandingLoan: document.getElementById("spp-outstandingLoan"),
      ssdRate: document.getElementById("spp-ssdRate"),
      bankPenalty: document.getElementById("spp-bankPenalty"),
      legalFee: document.getElementById("spp-legalFee"),
      agentFee: document.getElementById("spp-agentFee"),
      agentRate: document.getElementById("spp-agentRate"),
      agentAuto: document.getElementById("spp-agentAuto"),
      others: document.getElementById("spp-others"),
      optionFeePct: document.getElementById("spp-optionFeePct"),
      exerciseFeePct: document.getElementById("spp-exerciseFeePct"),
    };
    const loanFields = document.getElementById("spp-loan-fields");

    const getLoanType = initSegmented("spp-loanType", () => calculate());

    const sellers = makeSellerRenderer("spp-sellers", "spp-addSeller", 4, () => calculate());

    function calculate() {
      const loanType = getLoanType();
      loanFields.hidden = loanType === "none";

      const sellingPrice = num(el.sellingPrice);
      const outstandingLoan = loanType === "none" ? 0 : num(el.outstandingLoan);
      const totalCpf = sellers.totalCpf();

      el.agentFee.readOnly = el.agentAuto.checked;
      if (el.agentAuto.checked) {
        const computed = agentFeeAmount(sellingPrice, el.agentRate);
        el.agentFee.value = computed.toFixed(0);
        window.NumberFormat.attach(el.agentFee);
      }
      const agentFee = num(el.agentFee);

      const ssdAmount = sellingPrice * (ssdRate(el.ssdRate) / 100);
      const bankPenalty = num(el.bankPenalty);
      const legalFee = num(el.legalFee);
      const others = num(el.others);
      const optionFeePct = num(el.optionFeePct);
      const exerciseFeePct = num(el.exerciseFeePct);

      const totalExpenses = ssdAmount + bankPenalty + legalFee + agentFee + others;

      // Private: Gross Sales Proceeds excludes CPF at this step; CPF is netted out next.
      const grossSalesProceeds = sellingPrice - outstandingLoan;
      const cpfRefund = totalCpf;
      const grossCashProceeds = grossSalesProceeds - cpfRefund;
      const netCashProceeds = grossCashProceeds - totalExpenses;

      const optionAmount = sellingPrice * (optionFeePct / 100);
      const exerciseAmount = sellingPrice * (exerciseFeePct / 100);
      // Only the option fee is paid directly to the seller ahead of completion — the
      // exercise deposit sits in the buyer's lawyer's stakeholding account and is only
      // released to the seller at completion, so it isn't "already received" before then.
      const balanceReceivable = grossCashProceeds - totalExpenses - optionAmount;

      text("spp-out-totalCpf", fmtCurrency(totalCpf));
      text("spp-out-grossSalesProceeds", fmtCurrency(grossSalesProceeds));
      text("spp-out-cpfRefund", fmtCurrency(cpfRefund));
      text("spp-out-grossCashProceeds", fmtCurrency(grossCashProceeds));
      text("spp-out-totalExpenses", fmtCurrency(totalExpenses));
      text("spp-out-ssd", fmtCurrency(ssdAmount));
      text("spp-out-netCashProceeds", fmtCurrency(netCashProceeds));

      text("spp-out-optionAmount", fmtCurrency(optionAmount));
      text("spp-out-exerciseAmount", fmtCurrency(exerciseAmount));

      text("spp-tl-totalExpenses", fmtCurrency(totalExpenses));
      text("spp-tl-ssd", fmtCurrency(ssdAmount));
      text("spp-tl-bankPenalty", fmtCurrency(bankPenalty));
      text("spp-tl-legalFee", fmtCurrency(legalFee));
      text("spp-tl-agentFee", fmtCurrency(agentFee));
      text("spp-tl-others", fmtCurrency(others));

      text("spp-tl-cpfRefund", fmtCurrency(cpfRefund));
      text("spp-tl-balanceReceivable", fmtCurrency(balanceReceivable));
      text("spp-tl-grossCashProceeds", fmtCurrency(grossCashProceeds));
      text("spp-tl-lessExpenses", fmtCurrency(totalExpenses));
      text("spp-tl-lessOption", fmtCurrency(optionAmount));

      window.PropertyTransactionResults.private = { netCashProceeds, cpfRefund, sellers: sellers.sellers() };
      if (window.PropertyTransactionCalc.hdbPurchase) window.PropertyTransactionCalc.hdbPurchase();
      if (window.PropertyTransactionCalc.privatePurchase) window.PropertyTransactionCalc.privatePurchase();
    }

    Object.values(el).forEach((input) => input && input.addEventListener("input", calculate));
    el.agentRate.addEventListener("change", calculate);
    el.agentAuto.addEventListener("change", calculate);
    document.getElementById("spp-form").addEventListener("submit", (e) => e.preventDefault());

    calculate();
    window.PropertyTransactionCalc = window.PropertyTransactionCalc || {};
    window.PropertyTransactionCalc.privateSale = calculate;
  })();

  // ==================== HDB Resale Purchase ====================
  (function () {
    const el = {
      purchasePrice: document.getElementById("rph-purchasePrice"),
      valuation: document.getElementById("rph-valuation"),
      buyerName: document.getElementById("rph-buyerName"),
      cpfAvailable: document.getElementById("rph-cpfAvailable"),
      housingGrant: document.getElementById("rph-housingGrant"),
      proximityGrant: document.getElementById("rph-proximityGrant"),
      legalFee: document.getElementById("rph-legalFee"),
      hpsPremium: document.getElementById("rph-hpsPremium"),
      ltv: document.getElementById("rph-ltv"),
      buyerAge: document.getElementById("rph-buyerAge"),
      loanTenure: document.getElementById("rph-loanTenure"),
      interestRate: document.getElementById("rph-interestRate"),
      cpfGrantsUsed: document.getElementById("rph-cpfGrantsUsed"),
      valuationFee: document.getElementById("rph-valuationFee"),
      resaleApplication: document.getElementById("rph-resaleApplication"),
      others: document.getElementById("rph-others"),
      agentFee: document.getElementById("rph-agentFee"),
      agentRate: document.getElementById("rph-agentRate"),
      agentAuto: document.getElementById("rph-agentAuto"),
      optionFee: document.getElementById("rph-optionFee"),
      exerciseFee: document.getElementById("rph-exerciseFee"),
    };

    const getLoanType = initSegmented("rph-loanType", () => calculate());
    const getBsdMethod = initSegmented("rph-bsdMethod", () => calculate());
    const getLegalFeeMethod = initSegmented("rph-legalFeeMethod", () => calculate());
    const getHpsPremiumMethod = initSegmented("rph-hpsPremiumMethod", () => calculate());
    const getAbsdMethod = initSegmented("rph-absdMethod", () => calculate());
    const getResidency = initSegmented("rph-residency", () => calculate());
    const getPropertyCount = initSegmented("rph-propertyCount", () => calculate());

    function calculate() {
      const loanType = getLoanType();
      const purchasePrice = num(el.purchasePrice);
      const valuation = num(el.valuation);
      const whicheverLower = Math.min(purchasePrice, valuation);

      const matched = matchedCpfFromSale(el.buyerName.value);
      const noteEl = document.getElementById("rph-cpfFromSaleNote");
      if (matched.amount > 0) {
        noteEl.hidden = false;
        noteEl.textContent = `Matched ${matched.matches.map((m) => m.name).join(", ")} as seller — ${fmtCurrency(matched.amount)} CPF (used + accrued interest) carried over automatically.`;
      } else {
        noteEl.hidden = true;
      }

      const cpfAvailable = num(el.cpfAvailable);
      const housingGrant = num(el.housingGrant);
      const proximityGrant = num(el.proximityGrant);
      const totalCpfGrants = cpfAvailable + housingGrant + proximityGrant + matched.amount;

      const bsd = buyersStampDuty(purchasePrice);
      const legalFee = num(el.legalFee);
      const hpsPremium = num(el.hpsPremium);
      const rate = absdRate(getResidency(), parseInt(getPropertyCount(), 10));
      const absd = purchasePrice * (rate / 100);

      const bsdMethod = getBsdMethod();
      const legalFeeMethod = getLegalFeeMethod();
      const hpsPremiumMethod = getHpsPremiumMethod();
      const absdMethod = getAbsdMethod();

      const cpfDeductibles =
        (bsdMethod === "cpf" ? bsd : 0) +
        (legalFeeMethod === "cpf" ? legalFee : 0) +
        (hpsPremiumMethod === "cpf" ? hpsPremium : 0) +
        (absdMethod === "cpf" ? absd : 0);
      const balanceCpfGrants = totalCpfGrants - cpfDeductibles;

      const ageCap = Math.max(0, 65 - num(el.buyerAge));
      const loanTypeCap = loanType === "hdb" ? 25 : 30;
      const maxTenure = Math.min(loanTypeCap, ageCap);

      const ltv = num(el.ltv);
      const loanAmount = loanType === "none" ? 0 : whicheverLower * (ltv / 100);
      const monthlyInstalment = monthlyPayment(loanAmount, num(el.interestRate), num(el.loanTenure));
      const downPayment = whicheverLower - loanAmount;

      const optionFee = num(el.optionFee);
      const exerciseFee = num(el.exerciseFee);
      const fivePctCash = whicheverLower * 0.05;
      const cpfGrantsUsed = num(el.cpfGrantsUsed);
      const cashTopUp = downPayment - fivePctCash - cpfGrantsUsed;

      el.agentFee.readOnly = el.agentAuto.checked;
      if (el.agentAuto.checked) {
        const computed = agentFeeAmount(purchasePrice, el.agentRate);
        el.agentFee.value = computed.toFixed(0);
        window.NumberFormat.attach(el.agentFee);
      }
      const agentFee = num(el.agentFee);

      const valuationFee = num(el.valuationFee);
      const resaleApplication = num(el.resaleApplication);
      const others = num(el.others);
      const totalExpenses =
        valuationFee +
        resaleApplication +
        others +
        agentFee +
        (bsdMethod === "cash" ? bsd : 0) +
        (legalFeeMethod === "cash" ? legalFee : 0) +
        (hpsPremiumMethod === "cash" ? hpsPremium : 0) +
        (absdMethod === "cash" ? absd : 0);

      const totalOutlay = downPayment + totalExpenses;

      const endorsementCash =
        (bsdMethod === "cash" ? bsd : 0) +
        (legalFeeMethod === "cash" ? legalFee : 0) +
        (hpsPremiumMethod === "cash" ? hpsPremium : 0) +
        (absdMethod === "cash" ? absd : 0) +
        agentFee;
      const endorsementCpf = cpfDeductibles;

      const balance5pct = fivePctCash - optionFee - exerciseFee;
      const cashAboveValuation = Math.max(purchasePrice - valuation, 0);
      const completionCash = balance5pct + cashAboveValuation + cashTopUp + others;

      text("rph-out-bsdInline", `— ${fmtCurrency(bsd)}`);
      text("rph-out-totalCpfGrants", fmtCurrency(totalCpfGrants));
      text("rph-out-cpfDeductibles", fmtCurrency(cpfDeductibles));
      text("rph-out-absdRate", `(${rate}%)`);
      text("rph-out-absd", fmtCurrency(absd));
      text("rph-out-balanceCpfGrants", fmtCurrency(balanceCpfGrants));
      text("rph-out-whicheverLower", fmtCurrency(whicheverLower));
      text("rph-out-maxTenure", `${maxTenure} years`);
      text("rph-out-loanAmount", fmtCurrency(loanAmount));
      text("rph-out-monthlyInstalment", fmtCurrency(monthlyInstalment));
      text("rph-out-downPayment", fmtCurrency(downPayment));
      text("rph-out-fivePctCash", fmtCurrency(fivePctCash));
      text("rph-out-cashTopUp", fmtCurrency(cashTopUp));
      text("rph-out-totalExpenses", fmtCurrency(totalExpenses));
      text("rph-out-totalOutlay", fmtCurrency(totalOutlay));

      text("rph-tl-resaleApplication", fmtCurrency(resaleApplication));
      text("rph-tl-endorsementCash", fmtCurrency(endorsementCash));
      text("rph-tl-endorsementCpf", fmtCurrency(endorsementCpf));
      text("rph-tl-bsd", fmtCurrency(bsd));
      text("rph-tl-absd", fmtCurrency(absd));
      text("rph-tl-legalFee", fmtCurrency(legalFee));
      text("rph-tl-hpsPremium", fmtCurrency(hpsPremium));
      text("rph-tl-agentFee", fmtCurrency(agentFee));
      text("rph-tl-cpfGrantsUsed", fmtCurrency(cpfGrantsUsed));
      text("rph-tl-completionCash", fmtCurrency(completionCash));
      text("rph-tl-balance5pct", fmtCurrency(balance5pct));
      text("rph-tl-cashAboveValuation", fmtCurrency(cashAboveValuation));
      text("rph-tl-cashTopUp", fmtCurrency(cashTopUp));
      text("rph-tl-others", fmtCurrency(others));

      schedulePositionTimelineGaps();
    }

    Object.values(el).forEach((input) => input && input.addEventListener("input", calculate));
    el.agentRate.addEventListener("change", calculate);
    el.agentAuto.addEventListener("change", calculate);
    document.getElementById("rph-form").addEventListener("submit", (e) => e.preventDefault());

    calculate();
    window.PropertyTransactionCalc.hdbPurchase = calculate;
  })();

  // ==================== Private Resale Purchase ====================
  (function () {
    const el = {
      purchasePrice: document.getElementById("rpp-purchasePrice"),
      buyerName: document.getElementById("rpp-buyerName"),
      ltv: document.getElementById("rpp-ltv"),
      interestRate: document.getElementById("rpp-interestRate"),
      buyerAge: document.getElementById("rpp-buyerAge"),
      loanTenure: document.getElementById("rpp-loanTenure"),
      cpfFromSale: document.getElementById("rpp-cpfFromSale"),
      legalFee: document.getElementById("rpp-legalFee"),
      others: document.getElementById("rpp-others"),
      optionFeePct: document.getElementById("rpp-optionFeePct"),
      exerciseFeePct: document.getElementById("rpp-exerciseFeePct"),
    };

    // Loan number sets the standard MAS default LTV cap and minimum cash %.
    const loanNumberConfig = {
      1: { ltv: 75, cashPct: 5 },
      2: { ltv: 45, cashPct: 25 },
      3: { ltv: 35, cashPct: 25 },
    };

    const getLoanType = initSegmented("rpp-loanType", () => calculate());
    const getLoanNumber = initSegmented("rpp-loanNumber", (value) => {
      const cfg = loanNumberConfig[value];
      if (cfg) {
        el.ltv.value = cfg.ltv;
        window.NumberFormat.attach(el.ltv);
      }
      calculate();
    });
    const getResidency = initSegmented("rpp-residency", () => calculate());
    const getPropertyCount = initSegmented("rpp-propertyCount", () => calculate());

    function calculate() {
      const loanType = getLoanType();
      const purchasePrice = num(el.purchasePrice);
      const ltv = num(el.ltv);
      const loanAmount = loanType === "none" ? 0 : purchasePrice * (ltv / 100);
      const monthlyInstalment = monthlyPayment(loanAmount, num(el.interestRate), num(el.loanTenure));
      const downPayment = purchasePrice - loanAmount;

      const ageCap = Math.max(0, 65 - num(el.buyerAge));
      const maxTenure = Math.min(30, ageCap);

      const cfg = loanNumberConfig[getLoanNumber()] || loanNumberConfig[1];
      const cashPct = cfg.cashPct;
      const cashMin = purchasePrice * (cashPct / 100);

      const matched = matchedCpfFromSale(el.buyerName.value);
      const noteEl = document.getElementById("rpp-cpfFromSaleNote");
      if (matched.amount > 0) {
        noteEl.hidden = false;
        noteEl.textContent = `Matched ${matched.matches.map((m) => m.name).join(", ")} as seller — ${fmtCurrency(matched.amount)} CPF (used + accrued interest) available to add to your own CPF savings above.`;
      } else {
        noteEl.hidden = true;
      }

      const cpfFromSale = num(el.cpfFromSale);
      const remainingCashCpf = downPayment - cashMin - cpfFromSale;

      const bsd = buyersStampDuty(purchasePrice);
      const rate = absdRate(getResidency(), parseInt(getPropertyCount(), 10));
      const absd = purchasePrice * (rate / 100);
      const legalFee = num(el.legalFee);
      const others = num(el.others);
      const totalExpenses = bsd + absd + legalFee + others;
      const totalOutlay = downPayment + totalExpenses;

      const optionFeePct = num(el.optionFeePct);
      const exerciseFeePct = num(el.exerciseFeePct);
      const optionAmount = purchasePrice * (optionFeePct / 100);
      const exerciseAmount = purchasePrice * (exerciseFeePct / 100);
      const balancePct = 100 - ltv - (optionFeePct + exerciseFeePct);
      const balanceAmount = purchasePrice * (balancePct / 100);

      text("rpp-cashLabel", `${cashPct}% cash`);
      text("rpp-out-loanAmount", fmtCurrency(loanAmount));
      text("rpp-out-monthlyInstalment", fmtCurrency(monthlyInstalment));
      text("rpp-out-maxTenure", `${maxTenure} years`);
      text("rpp-out-downPayment", fmtCurrency(downPayment));
      text("rpp-out-cashMin", fmtCurrency(cashMin));
      text("rpp-out-remainingCashCpf", fmtCurrency(remainingCashCpf));
      text("rpp-out-totalExpenses", fmtCurrency(totalExpenses));
      text("rpp-out-bsd", fmtCurrency(bsd));
      text("rpp-out-absdRate", `(${rate}%)`);
      text("rpp-out-absd", fmtCurrency(absd));
      text("rpp-out-totalOutlay", fmtCurrency(totalOutlay));

      text("rpp-out-optionAmount", fmtCurrency(optionAmount));
      text("rpp-out-exerciseAmount", fmtCurrency(exerciseAmount));
      text("rpp-tl-totalExpenses", fmtCurrency(totalExpenses));
      text("rpp-tl-bsd", fmtCurrency(bsd));
      text("rpp-tl-absd", fmtCurrency(absd));
      text("rpp-tl-legalFee", fmtCurrency(legalFee));
      text("rpp-tl-others", fmtCurrency(others));
      text("rpp-tl-balancePct", `${balancePct}%`);
      text("rpp-tl-balanceAmount", fmtCurrency(balanceAmount));

      schedulePositionTimelineGaps();
    }

    Object.values(el).forEach((input) => input && input.addEventListener("input", calculate));
    document.getElementById("rpp-form").addEventListener("submit", (e) => e.preventDefault());

    calculate();
    window.PropertyTransactionCalc.privatePurchase = calculate;
  })();

  // ==================== Property type toggle (HDB / Private) within Resale Purchase tab ====================
  initSegmented("rp-propertyType", (value) => {
    document.getElementById("rp-hdb").hidden = value !== "hdb";
    document.getElementById("rp-private").hidden = value !== "private";
    schedulePositionTimelineGaps();
  });

  // ==================== Property type toggle (HDB / Private) within Sale Proceeds tab ====================
  initSegmented("sp-propertyType", (value) => {
    document.getElementById("sp-hdb").hidden = value !== "hdb";
    document.getElementById("sp-private").hidden = value !== "private";
    schedulePositionTimelineGaps();
  });

  // ==================== Page-level tabs (Sale Proceeds / Resale Purchase) ====================
  const tabSale = document.getElementById("pt-tab-sale");
  const tabPurchase = document.getElementById("pt-tab-purchase");
  const panelSale = document.getElementById("pt-panel-sale");
  const panelPurchase = document.getElementById("pt-panel-purchase");
  tabSale.addEventListener("click", () => {
    tabSale.classList.add("active");
    tabSale.setAttribute("aria-selected", "true");
    tabPurchase.classList.remove("active");
    tabPurchase.setAttribute("aria-selected", "false");
    panelSale.hidden = false;
    panelPurchase.hidden = true;
    schedulePositionTimelineGaps();
  });
  tabPurchase.addEventListener("click", () => {
    if (tabPurchase.disabled) return;
    tabSale.classList.remove("active");
    tabSale.setAttribute("aria-selected", "false");
    tabPurchase.classList.add("active");
    tabPurchase.setAttribute("aria-selected", "true");
    panelSale.hidden = true;
    panelPurchase.hidden = false;
    schedulePositionTimelineGaps();
  });

  schedulePositionTimelineGaps();
})();
