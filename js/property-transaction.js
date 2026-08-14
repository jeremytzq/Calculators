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
  // never clobbers CPF values already typed into the existing ones.
  function makeSellerRenderer(containerId, addBtnId, maxSellers, onInput) {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);
    let count = 0;

    function addCard() {
      count += 1;
      const card = document.createElement("div");
      card.className = "seller-card";
      const inputId = `${containerId}-cpf-${count}`;
      card.innerHTML = `
        <div class="seller-card-title">Seller #${count}</div>
        <div class="field">
          <label for="${inputId}">CPF used with accrued interest</label>
          <div class="input-wrap has-prefix">
            <span class="prefix">S$</span>
            <input type="text" id="${inputId}" inputmode="decimal" value="0" min="0" step="any" />
          </div>
        </div>
      `;
      container.appendChild(card);
      const input = card.querySelector("input");
      window.NumberFormat.attach(input);
      input.addEventListener("input", onInput);
      addBtn.disabled = count >= maxSellers;
    }

    function totalCpf() {
      let total = 0;
      for (let i = 1; i <= count; i++) {
        total += num(document.getElementById(`${containerId}-cpf-${i}`));
      }
      return total;
    }

    addBtn.addEventListener("click", () => {
      if (count >= maxSellers) return;
      addCard();
      onInput();
    });

    addCard();
    addCard();
    return { totalCpf };
  }

  // Results exposed for the (future) Resale Purchase tab to read Net Cash Proceeds / CPF
  // Refund from whichever property type the user last calculated a sale for.
  window.PropertyTransactionResults = {
    hdb: { netCashProceeds: 0, cpfRefund: 0 },
    private: { netCashProceeds: 0, cpfRefund: 0 },
  };

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

      window.PropertyTransactionResults.hdb = { netCashProceeds, cpfRefund };
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

      window.PropertyTransactionResults.private = { netCashProceeds, cpfRefund };
    }

    Object.values(el).forEach((input) => input && input.addEventListener("input", calculate));
    el.agentRate.addEventListener("change", calculate);
    el.agentAuto.addEventListener("change", calculate);
    document.getElementById("spp-form").addEventListener("submit", (e) => e.preventDefault());

    calculate();
    window.PropertyTransactionCalc = window.PropertyTransactionCalc || {};
    window.PropertyTransactionCalc.privateSale = calculate;
  })();

  // ==================== Property type toggle (HDB / Private) within Sale Proceeds tab ====================
  initSegmented("sp-propertyType", (value) => {
    document.getElementById("sp-hdb").hidden = value !== "hdb";
    document.getElementById("sp-private").hidden = value !== "private";
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
  });
  tabPurchase.addEventListener("click", () => {
    if (tabPurchase.disabled) return;
    tabSale.classList.remove("active");
    tabSale.setAttribute("aria-selected", "false");
    tabPurchase.classList.add("active");
    tabPurchase.setAttribute("aria-selected", "true");
    panelSale.hidden = true;
    panelPurchase.hidden = false;
  });
})();
