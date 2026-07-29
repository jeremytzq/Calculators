(function () {
  const ids = [
    "purchasePrice", "closingCosts", "rehabCosts", "downPaymentPct", "interestRate", "loanTerm",
    "monthlyRent", "otherIncome", "vacancyRate",
    "propertyTax", "insurance", "hoa", "maintenancePct", "managementPct", "otherExpenses",
    "appreciationRate", "rentGrowthRate", "expenseGrowthRate", "holdingPeriod", "sellingCostsPct",
  ];
  const el = {};
  ids.forEach((id) => (el[id] = document.getElementById(id)));

  const results = document.getElementById("results");
  const noteDownpayment = document.getElementById("note-downpayment");
  const saleNote = document.getElementById("sale-note");

  const out = {
    loanAmount: document.getElementById("out-loanAmount"),
    downPayment: document.getElementById("out-downPayment"),
    monthlyPayment: document.getElementById("out-monthlyPayment"),
    cashInvested: document.getElementById("out-cashInvested"),
    egi: document.getElementById("out-egi"),
    opex: document.getElementById("out-opex"),
    noi: document.getElementById("out-noi"),
    capRate: document.getElementById("out-capRate"),
    cashFlow: document.getElementById("out-cashFlow"),
    coc: document.getElementById("out-coc"),
    dscr: document.getElementById("out-dscr"),
    grm: document.getElementById("out-grm"),
    salePrice: document.getElementById("out-salePrice"),
    remainingBalance: document.getElementById("out-remainingBalance"),
    sellingCosts: document.getElementById("out-sellingCosts"),
    netProceeds: document.getElementById("out-netProceeds"),
    cumCashFlow: document.getElementById("out-cumCashFlow"),
    totalProfit: document.getElementById("out-totalProfit"),
    totalRoi: document.getElementById("out-totalRoi"),
    irr: document.getElementById("out-irr"),
  };

  const currencyFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  function fmtCurrency(value) {
    const sign = value < 0 ? "-" : "";
    return sign + currencyFmt.format(Math.abs(value));
  }

  function fmtPercent(value, decimals = 2) {
    return (value >= 0 ? "" : "") + value.toFixed(decimals) + "%";
  }

  function setSign(tile, value) {
    tile.classList.remove("positive", "negative");
    if (value > 0) tile.classList.add("positive");
    if (value < 0) tile.classList.add("negative");
  }

  function num(id, fallback = 0) {
    const v = parseFloat(String(el[id].value).replace(/,/g, ""));
    return isFinite(v) ? v : fallback;
  }

  // Monthly payment (principal & interest) for an amortizing loan.
  function monthlyPayment(principal, annualRatePct, termYears) {
    const n = Math.round(termYears * 12);
    if (n <= 0 || principal <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  // Remaining loan balance after `monthsElapsed` payments.
  function remainingBalance(principal, annualRatePct, termYears, monthsElapsed) {
    const n = Math.round(termYears * 12);
    const k = Math.min(Math.max(monthsElapsed, 0), n);
    if (principal <= 0 || n <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    const M = monthlyPayment(principal, annualRatePct, termYears);
    if (r === 0) return Math.max(principal - M * k, 0);
    const bal = principal * Math.pow(1 + r, k) - (M * (Math.pow(1 + r, k) - 1)) / r;
    return Math.max(bal, 0);
  }

  // Net present value of a cash flow series (index 0 = year 0) at rate `rate`.
  function npv(rate, cashFlows) {
    return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
  }

  // Solve for IRR via bisection. Returns null if no sign change is found.
  function irr(cashFlows) {
    let lo = -0.99;
    let hi = 10; // 1000%
    let npvLo = npv(lo, cashFlows);
    let npvHi = npv(hi, cashFlows);
    if (npvLo === 0) return lo;
    if (npvHi === 0) return hi;
    if ((npvLo > 0) === (npvHi > 0)) return null; // no sign change, can't bisect

    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const npvMid = npv(mid, cashFlows);
      if (Math.abs(npvMid) < 1e-6) return mid;
      if ((npvMid > 0) === (npvLo > 0)) {
        lo = mid;
        npvLo = npvMid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }

  function calculate() {
    const purchasePrice = num("purchasePrice");
    const closingCosts = num("closingCosts");
    const rehabCosts = num("rehabCosts");
    const downPaymentPct = num("downPaymentPct");
    const interestRate = num("interestRate");
    const loanTerm = num("loanTerm");

    const monthlyRent = num("monthlyRent");
    const otherIncome = num("otherIncome");
    const vacancyRate = num("vacancyRate");

    const propertyTax = num("propertyTax");
    const insurance = num("insurance");
    const hoa = num("hoa");
    const maintenancePct = num("maintenancePct");
    const managementPct = num("managementPct");
    const otherExpenses = num("otherExpenses");

    const appreciationRate = num("appreciationRate");
    const rentGrowthRate = num("rentGrowthRate");
    const expenseGrowthRate = num("expenseGrowthRate");
    const holdingPeriod = num("holdingPeriod");
    const sellingCostsPct = num("sellingCostsPct");

    if (
      !(purchasePrice > 0) ||
      !(monthlyRent >= 0) ||
      !(downPaymentPct >= 0 && downPaymentPct <= 100) ||
      !(interestRate >= 0) ||
      !(loanTerm > 0) ||
      !(holdingPeriod > 0)
    ) {
      results.hidden = true;
      return;
    }

    // --- Financing ---
    const downPayment = purchasePrice * (downPaymentPct / 100);
    const loanAmount = purchasePrice - downPayment;
    const cashInvested = downPayment + closingCosts + rehabCosts;
    const monthlyMortgage = monthlyPayment(loanAmount, interestRate, loanTerm);
    const annualDebtServiceBase = monthlyMortgage * 12;

    noteDownpayment.textContent = `= ${fmtCurrency(downPayment)} down, ${fmtCurrency(loanAmount)} loan`;

    out.loanAmount.textContent = fmtCurrency(loanAmount);
    out.downPayment.textContent = fmtCurrency(downPayment);
    out.monthlyPayment.textContent = fmtCurrency(monthlyMortgage);
    out.cashInvested.textContent = fmtCurrency(cashInvested);

    // --- Year-by-year cash flow over the holding period ---
    const years = Math.max(1, Math.round(holdingPeriod));
    let cumulativeCashFlow = 0;
    let year1Noi = 0;
    let year1Egi = 0;
    let year1Opex = 0;
    let year1CashFlow = 0;
    const cashFlowSeries = [-cashInvested];

    for (let y = 1; y <= years; y++) {
      const growth = (rate) => Math.pow(1 + rate / 100, y - 1);

      const grossRent = monthlyRent * 12 * growth(rentGrowthRate);
      const grossOther = otherIncome * 12 * growth(rentGrowthRate);
      const egi = (grossRent + grossOther) * (1 - vacancyRate / 100);

      const maintenance = grossRent * (maintenancePct / 100);
      const management = egi * (managementPct / 100);
      const fixedExpenses = (propertyTax + insurance + hoa * 12 + otherExpenses) * growth(expenseGrowthRate);
      const opex = maintenance + management + fixedExpenses;

      const noi = egi - opex;

      const monthsPaidByEndOfYear = Math.min(y * 12, loanTerm * 12);
      const monthsPaidByStartOfYear = Math.min((y - 1) * 12, loanTerm * 12);
      const debtServiceThisYear =
        monthsPaidByEndOfYear > monthsPaidByStartOfYear
          ? monthlyMortgage * (monthsPaidByEndOfYear - monthsPaidByStartOfYear)
          : 0;

      const cashFlow = noi - debtServiceThisYear;
      cumulativeCashFlow += cashFlow;
      cashFlowSeries.push(cashFlow);

      if (y === 1) {
        year1Egi = egi;
        year1Opex = opex;
        year1Noi = noi;
        year1CashFlow = cashFlow;
      }
    }

    const capRate = purchasePrice > 0 ? (year1Noi / purchasePrice) * 100 : 0;
    const cashOnCash = cashInvested > 0 ? (year1CashFlow / cashInvested) * 100 : 0;
    const dscr = annualDebtServiceBase > 0 ? year1Noi / annualDebtServiceBase : Infinity;
    const annualGrossRentYear1 = monthlyRent * 12 + otherIncome * 12;
    const grm = annualGrossRentYear1 > 0 ? purchasePrice / annualGrossRentYear1 : 0;

    out.egi.textContent = fmtCurrency(year1Egi);
    out.opex.textContent = fmtCurrency(year1Opex);
    out.noi.textContent = fmtCurrency(year1Noi);
    out.capRate.textContent = fmtPercent(capRate);
    out.cashFlow.textContent = fmtCurrency(year1CashFlow);
    setSign(out.cashFlow, year1CashFlow);
    out.coc.textContent = fmtPercent(cashOnCash);
    setSign(out.coc, cashOnCash);
    out.dscr.textContent = isFinite(dscr) ? dscr.toFixed(2) + "×" : "—";
    out.grm.textContent = grm > 0 ? grm.toFixed(1) + "×" : "—";

    // --- At sale ---
    const salePrice = purchasePrice * Math.pow(1 + appreciationRate / 100, years);
    const remBalance = remainingBalance(loanAmount, interestRate, loanTerm, years * 12);
    const sellingCosts = salePrice * (sellingCostsPct / 100);
    const netProceeds = salePrice - sellingCosts - remBalance;
    const totalProfit = netProceeds - cashInvested + cumulativeCashFlow;
    const totalRoi = cashInvested > 0 ? (totalProfit / cashInvested) * 100 : 0;

    saleNote.textContent = `After ${years} year${years === 1 ? "" : "s"}`;

    out.salePrice.textContent = fmtCurrency(salePrice);
    out.remainingBalance.textContent = fmtCurrency(remBalance);
    out.sellingCosts.textContent = fmtCurrency(sellingCosts);
    out.netProceeds.textContent = fmtCurrency(netProceeds);
    out.cumCashFlow.textContent = fmtCurrency(cumulativeCashFlow);
    setSign(out.cumCashFlow, cumulativeCashFlow);
    out.totalProfit.textContent = fmtCurrency(totalProfit);
    setSign(out.totalProfit, totalProfit);
    out.totalRoi.textContent = fmtPercent(totalRoi);
    setSign(out.totalRoi, totalRoi);

    // IRR: replace final year's cash flow with cash flow + net sale proceeds.
    const irrCashFlows = cashFlowSeries.slice();
    irrCashFlows[irrCashFlows.length - 1] += netProceeds;
    const irrRate = irr(irrCashFlows);
    if (irrRate === null) {
      out.irr.textContent = "N/A";
    } else {
      out.irr.textContent = fmtPercent(irrRate * 100);
      setSign(out.irr, irrRate);
    }

    results.hidden = false;
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  document.getElementById("roi-form").addEventListener("submit", (e) => e.preventDefault());
})();
