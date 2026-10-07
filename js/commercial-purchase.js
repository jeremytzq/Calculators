(function () {
  const ids = [
    "purchasePrice", "gstRate", "leaseYears",
    "legalFee", "agentFee", "renovation",
    "ltv", "interestRate", "loanTenure",
    "monthlyRent", "monthlyOpex",
  ];
  const el = {};
  ids.forEach((id) => (el[id] = document.getElementById(id)));

  const results = document.getElementById("results");
  const tenureNote = document.getElementById("note-tenure");
  const out = {
    bsd: document.getElementById("out-bsd"),
    gst: document.getElementById("out-gst"),
    loan: document.getElementById("out-loan"),
    cash: document.getElementById("out-cash"),
    monthly: document.getElementById("out-monthly"),
    grossYield: document.getElementById("out-grossYield"),
    netYield: document.getElementById("out-netYield"),
    cashFlow: document.getElementById("out-cashFlow"),
    cashOnCash: document.getElementById("out-cashOnCash"),
  };

  const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  function fmtCurrency(value) {
    const sign = value < 0 ? "-" : "";
    return sign + "S$" + numberFmt.format(Math.abs(value));
  }

  function fmtPercent(value, decimals = 2) {
    return value.toFixed(decimals) + "%";
  }

  function num(id, fallback = 0) {
    const v = parseFloat(String(el[id].value).replace(/,/g, ""));
    return isFinite(v) ? v : fallback;
  }

  function setSign(node, value) {
    node.classList.remove("positive", "negative");
    if (value > 0) node.classList.add("positive");
    if (value < 0) node.classList.add("negative");
  }

  // Non-residential Buyer's Stamp Duty: 1% / 2% / 3% on the first S$1m, then 4%.
  // No higher residential tiers, and no ABSD.
  function buyersStampDutyNonResidential(price) {
    const bands = [
      [180000, 0.01],
      [180000, 0.02],
      [640000, 0.03],
    ];
    let remaining = price;
    let total = 0;
    for (const [amt, rate] of bands) {
      const take = Math.min(remaining, amt);
      total += take * rate;
      remaining -= take;
      if (remaining <= 0) break;
    }
    if (remaining > 0) total += remaining * 0.04;
    return total;
  }

  function monthlyPayment(principal, annualRatePct, termYears) {
    const n = Math.round(termYears * 12);
    if (n <= 0 || principal <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  const segmentedDefaults = {};
  function initSegmented(containerId, onChange) {
    const container = document.getElementById(containerId);
    const buttons = Array.from(container.querySelectorAll("button"));
    segmentedDefaults[containerId] = container.querySelector("button.active").dataset.value;
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

  function resetAllSegmented() {
    Object.entries(segmentedDefaults).forEach(([containerId, value]) => {
      const container = document.getElementById(containerId);
      const target = Array.from(container.querySelectorAll("button")).find((b) => b.dataset.value === value);
      if (target && !target.classList.contains("active")) target.click();
    });
  }

  const getGst = initSegmented("gst-applicable", () => calculate());

  function calculate() {
    const price = num("purchasePrice");
    const lease = num("leaseYears");
    const ltv = num("ltv");
    const tenureInput = num("loanTenure");
    const rate = num("interestRate");

    if (!(price > 0) || !(lease > 0) || ltv < 0 || ltv > 100 || !(tenureInput >= 1) || rate < 0) {
      results.hidden = true;
      return;
    }

    const gstOn = getGst() === "yes";
    const gst = gstOn ? price * (num("gstRate") / 100) : 0;
    const bsd = buyersStampDutyNonResidential(price);
    const legal = num("legalFee");
    const agent = num("agentFee");
    const renovation = num("renovation");

    const loan = price * (ltv / 100);
    const down = price - loan;
    const cash = down + gst + bsd + legal + agent + renovation;

    const effectiveTenure = Math.min(tenureInput, lease);
    const payment = monthlyPayment(loan, rate, effectiveTenure);

    const annualRent = num("monthlyRent") * 12;
    const annualOpex = num("monthlyOpex") * 12;
    const noi = annualRent - annualOpex;
    const annualDebt = payment * 12;
    const annualCashFlow = noi - annualDebt;
    const monthlyCashFlow = num("monthlyRent") - num("monthlyOpex") - payment;
    const grossYield = (annualRent / price) * 100;
    const netYield = (noi / price) * 100;
    const cashOnCash = cash > 0 ? (annualCashFlow / cash) * 100 : 0;

    if (effectiveTenure < tenureInput) {
      tenureNote.textContent = `Capped at ${effectiveTenure} years by the remaining lease.`;
    } else {
      tenureNote.textContent = `${effectiveTenure} years, within the remaining lease.`;
    }

    out.bsd.textContent = fmtCurrency(bsd);
    out.gst.textContent = fmtCurrency(gst);
    out.loan.textContent = fmtCurrency(loan);
    out.cash.textContent = fmtCurrency(cash);
    out.monthly.textContent = fmtCurrency(payment);
    out.grossYield.textContent = fmtPercent(grossYield);
    out.netYield.textContent = fmtPercent(netYield);
    out.cashFlow.textContent = fmtCurrency(monthlyCashFlow);
    setSign(out.cashFlow, monthlyCashFlow);
    out.cashOnCash.textContent = fmtPercent(cashOnCash);
    setSign(out.cashOnCash, cashOnCash);

    results.hidden = false;
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  const form = document.getElementById("commercial-form");
  form.addEventListener("submit", (e) => e.preventDefault());
  document.getElementById("clear-btn").addEventListener("click", () => {
    form.reset();
    form.querySelectorAll('input[inputmode="decimal"]').forEach((input) => window.NumberFormat.attach(input));
    resetAllSegmented();
    calculate();
  });

  calculate();
})();
