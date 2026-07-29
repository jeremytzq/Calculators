(function () {
  const ids = [
    "purchaseType", "rentalStartYear",
    "purchasePrice", "sizeSqft", "downPaymentPct", "interestRate", "loanTerm", "holdingPeriod",
    "rentalPsf", "vacancyRate",
    "maintenanceMonthly", "propertyTaxMonthly",
    "absdPct", "conveyancing", "agentCommissionPct",
    "capAppreciation", "nextPropertyDownPct",
  ];
  const el = {};
  ids.forEach((id) => (el[id] = document.getElementById(id)));

  const results = document.getElementById("results");
  const sizeSqmNote = document.getElementById("size-sqm-note");
  const grossYieldNote = document.getElementById("gross-yield-note");
  const plBucFields = document.getElementById("pl-buc-fields");
  const costsHoldingHeader = document.getElementById("costs-holding-header");
  const costsNote = document.getElementById("costs-note");
  const costsBucNote = document.getElementById("costs-buc-note");
  const costsTableBody = document.getElementById("costs-table-body");
  const costsTableWrap = document.querySelector("#costs-table").closest(".table-wrap");
  const costsScrollHint = document.getElementById("costs-scroll-hint");
  const yearlyTableBody = document.getElementById("yearly-table-body");
  const yearlyTableWrap = document.querySelector("#yearly-table").closest(".table-wrap");
  const yearlyScrollHint = document.getElementById("yearly-scroll-hint");
  const leverageTableBody = document.getElementById("leverage-table-body");
  const leverageTableWrap = document.querySelector("#leverage-table").closest(".table-wrap");
  const leverageScrollHint = document.getElementById("leverage-scroll-hint");
  const tileAbsd = document.getElementById("tile-absd");

  const out = {
    psfPrice: document.getElementById("out-psfPrice"),
    loanAmount: document.getElementById("out-loanAmount"),
    monthlyInstalment: document.getElementById("out-monthlyInstalment"),
    totalCashOutlay: document.getElementById("out-totalCashOutlay"),
    breakeven: document.getElementById("out-breakeven"),
    breakevenNote: document.getElementById("out-breakeven-note"),
    downPayment: document.getElementById("out-downPayment"),
    stampDuty: document.getElementById("out-stampDuty"),
    absd: document.getElementById("out-absd"),
    conveyancing: document.getElementById("out-conveyancing"),
    outstandingMortgage: document.getElementById("out-outstandingMortgage"),
    vacancyLoss: document.getElementById("out-vacancyLoss"),
    vacancyRateNote: document.getElementById("out-vacancyRateNote"),
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

  function monthlyPayment(principal, annualRatePct, termYears) {
    const n = Math.round(termYears * 12);
    if (n <= 0 || principal <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  function remainingBalance(principal, annualRatePct, termYears, monthsElapsed) {
    const n = Math.round(termYears * 12);
    if (principal <= 0 || n <= 0) return 0;
    const k = Math.min(Math.max(monthsElapsed, 0), n);
    const r = annualRatePct / 100 / 12;
    const M = monthlyPayment(principal, annualRatePct, termYears);
    if (r === 0) return Math.max(principal - M * k, 0);
    const bal = principal * Math.pow(1 + r, k) - (M * (Math.pow(1 + r, k) - 1)) / r;
    return Math.max(bal, 0);
  }

  // Principal/interest split for a single year (year 1 = months 1-12), capped at the loan term.
  function amortizationForYear(principal, annualRatePct, termYears, year) {
    const n = Math.round(termYears * 12);
    const monthsStart = Math.min((year - 1) * 12, n);
    const monthsEnd = Math.min(year * 12, n);
    const beginBalance = remainingBalance(principal, annualRatePct, termYears, monthsStart);
    const endBalance = remainingBalance(principal, annualRatePct, termYears, monthsEnd);
    const M = monthlyPayment(principal, annualRatePct, termYears);
    const paid = M * (monthsEnd - monthsStart);
    const principalPaid = beginBalance - endBalance;
    const interestPaid = paid - principalPaid;
    return { paid, principalPaid, interestPaid, endBalance };
  }

  // Singapore Buyer's Stamp Duty (residential), progressive bands.
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

  function buildCostsTable(rows) {
    costsTableBody.innerHTML = "";
    rows.forEach(({ label, month, year, holding, emphasize }) => {
      const tr = document.createElement("tr");
      if (emphasize) tr.style.fontWeight = "700";
      tr.innerHTML = `
        <td>${label}</td>
        <td>${fmtCurrency(month)}</td>
        <td>${fmtCurrency(year)}</td>
        <td>${fmtCurrency(holding)}</td>
      `;
      costsTableBody.appendChild(tr);
    });
  }

  function buildYearlyTable(rows) {
    yearlyTableBody.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const netCls = r.netCashFlow > 0 ? "positive" : r.netCashFlow < 0 ? "negative" : "";
      const posCls = r.netPosition > 0 ? "positive" : r.netPosition < 0 ? "negative" : "";
      tr.innerHTML = `
        <td>${r.year}</td>
        <td>${fmtCurrency(r.propertyValue)}</td>
        <td>${fmtCurrency(r.appreciationGain)}</td>
        <td>${fmtCurrency(r.principalPaid)}</td>
        <td>${fmtCurrency(r.interestPaid)}</td>
        <td>${fmtCurrency(r.loanBalance)}</td>
        <td>${fmtCurrency(r.equity)}</td>
        <td>${fmtCurrency(r.equityGain)}</td>
        <td>${fmtCurrency(r.rentalIncome)}</td>
        <td class="${netCls}">${fmtCurrency(r.netCashFlow)}</td>
        <td class="${netCls}">${fmtCurrency(r.cumulativeCashFlow)}</td>
        <td class="${posCls}">${fmtCurrency(r.netPosition)}</td>
      `;
      if (r.isBreakEvenYear) tr.style.fontWeight = "700";
      yearlyTableBody.appendChild(tr);
    });
  }

  function buildLeverageTable(scenarios) {
    leverageTableBody.innerHTML = "";
    scenarios.forEach((s) => {
      const tr = document.createElement("tr");
      const profitCls = s.capitalProfit > 0 ? "positive" : s.capitalProfit < 0 ? "negative" : "";
      tr.innerHTML = `
        <td>${s.label}</td>
        <td>${fmtCurrency(s.salePrice)}</td>
        <td>${fmtCurrency(s.sellingCosts)}</td>
        <td class="${profitCls}">${fmtCurrency(s.capitalProfit)}</td>
        <td>${fmtCurrency(s.equityAvailable)}</td>
        <td>${fmtCurrency(s.nextPropertyValue)}</td>
        <td>${fmtPercent(s.leveragePct, 1)}</td>
      `;
      leverageTableBody.appendChild(tr);
    });
  }

  function updateScrollHints() {
    costsScrollHint.hidden = costsTableWrap.scrollWidth <= costsTableWrap.clientWidth;
    yearlyScrollHint.hidden = yearlyTableWrap.scrollWidth <= yearlyTableWrap.clientWidth;
    leverageScrollHint.hidden = leverageTableWrap.scrollWidth <= leverageTableWrap.clientWidth;
  }

  function calculate() {
    const isBuc = el.purchaseType.value === "buc";
    plBucFields.hidden = !isBuc;
    const rentalStartYear = isBuc ? Math.max(1, Math.round(num("rentalStartYear", 4))) : 1;

    const purchasePrice = num("purchasePrice");
    const sizeSqft = num("sizeSqft");
    const downPaymentPct = num("downPaymentPct", 25);
    const interestRate = num("interestRate");
    const loanTerm = num("loanTerm", 30);
    const holdingPeriod = Math.max(1, Math.round(num("holdingPeriod", 10)));

    const rentalPsf = num("rentalPsf");
    const vacancyRate = num("vacancyRate");

    const maintenanceMonthly = num("maintenanceMonthly");
    const propertyTaxMonthly = num("propertyTaxMonthly");

    const absdPct = num("absdPct");
    const conveyancing = num("conveyancing");
    const agentCommissionPct = num("agentCommissionPct");

    const capAppreciation = num("capAppreciation");
    const nextPropertyDownPct = num("nextPropertyDownPct", 20);

    if (!(purchasePrice > 0) || !(sizeSqft > 0) || !(downPaymentPct > 0) || !(nextPropertyDownPct > 0)) {
      results.hidden = true;
      return;
    }

    const sizeSqm = sizeSqft / 10.7639;
    sizeSqmNote.textContent = `= ${sizeSqm.toFixed(1)} sqm`;

    const psfPrice = purchasePrice / sizeSqft;
    const loanAmount = purchasePrice * (1 - downPaymentPct / 100);
    const downPayment = purchasePrice - loanAmount;
    const monthlyInstalment = monthlyPayment(loanAmount, interestRate, loanTerm);
    const annualInstalment = monthlyInstalment * 12;

    const grossRentalMonthly = rentalPsf * sizeSqft;
    const grossRentalAnnual = grossRentalMonthly * 12;
    const netRentalAnnualSteadyState = grossRentalAnnual * (1 - vacancyRate / 100);
    const grossRentalYieldPct = purchasePrice > 0 ? (grossRentalAnnual / purchasePrice) * 100 : 0;
    grossYieldNote.textContent = fmtPercent(grossRentalYieldPct);

    const maintenanceAnnual = maintenanceMonthly * 12;
    const propertyTaxAnnual = propertyTaxMonthly * 12;
    const opexAnnual = maintenanceAnnual + propertyTaxAnnual;
    const subTotalMonthly = maintenanceMonthly + propertyTaxMonthly + monthlyInstalment;
    const subTotalAnnual = opexAnnual + annualInstalment;
    const netCashflowAnnualSteadyState = netRentalAnnualSteadyState - subTotalAnnual;

    const stampDuty = buyersStampDuty(purchasePrice);
    const absdAmount = purchasePrice * (absdPct / 100);
    // Cash actually required at purchase — excludes agent commission, which is only
    // paid at exit, years later, against whatever the property sells for by then.
    const totalCashOutlay = downPayment + stampDuty + absdAmount + conveyancing;

    // --- Year-by-year simulation (drives the costs table, break-even, and mortgage figures) ---
    const yearlyRows = [];
    let cumulativeCashFlow = 0;
    let cumulativeMaintenance = 0;
    let cumulativePropertyTax = 0;
    let cumulativeInstalment = 0;
    let cumulativeGrossRental = 0;
    let cumulativeVacancyLoss = 0;
    let breakEvenYear = null;
    let prevPropertyValue = purchasePrice;
    let prevEquity = downPayment;

    for (let y = 1; y <= holdingPeriod; y++) {
      const propertyValue = purchasePrice * Math.pow(1 + capAppreciation / 100, y);
      const appreciationGain = propertyValue - prevPropertyValue;

      const amort = amortizationForYear(loanAmount, interestRate, loanTerm, y);
      const loanBalance = amort.endBalance;
      const equity = propertyValue - loanBalance;
      const equityGain = equity - prevEquity;

      const rentalActive = y >= rentalStartYear;
      const grossRentalThisYear = rentalActive ? grossRentalAnnual : 0;
      const vacancyLossThisYear = grossRentalThisYear * (vacancyRate / 100);
      const rentalIncome = grossRentalThisYear - vacancyLossThisYear;

      const netCashFlow = rentalIncome - opexAnnual - amort.paid;
      cumulativeCashFlow += netCashFlow;
      cumulativeMaintenance += maintenanceAnnual;
      cumulativePropertyTax += propertyTaxAnnual;
      cumulativeInstalment += amort.paid;
      cumulativeGrossRental += grossRentalThisYear;
      cumulativeVacancyLoss += vacancyLossThisYear;

      const sellingCostsIfSoldNow = propertyValue * (agentCommissionPct / 100);
      const netPosition = equity + cumulativeCashFlow - sellingCostsIfSoldNow - totalCashOutlay;
      const isBreakEvenYear = netPosition >= 0 && breakEvenYear === null;
      if (isBreakEvenYear) breakEvenYear = y;

      yearlyRows.push({
        year: y,
        propertyValue,
        appreciationGain,
        principalPaid: amort.principalPaid,
        interestPaid: amort.interestPaid,
        loanBalance,
        equity,
        equityGain,
        rentalIncome,
        netCashFlow,
        cumulativeCashFlow,
        netPosition,
        isBreakEvenYear,
      });

      prevPropertyValue = propertyValue;
      prevEquity = equity;
    }

    const netCashflowOverHolding = cumulativeCashFlow;
    const grossRentalOverHolding = cumulativeGrossRental;
    const vacancyLossOverHolding = cumulativeVacancyLoss;
    const outstandingMortgage = remainingBalance(loanAmount, interestRate, loanTerm, holdingPeriod * 12);

    // --- Key metrics & break-even ---
    out.psfPrice.textContent = fmtCurrency(psfPrice);
    out.loanAmount.textContent = fmtCurrency(loanAmount);
    out.monthlyInstalment.textContent = fmtCurrency(monthlyInstalment);
    out.totalCashOutlay.textContent = fmtCurrency(totalCashOutlay);

    if (breakEvenYear !== null) {
      out.breakeven.textContent = `Year ${breakEvenYear}`;
      out.breakevenNote.textContent = "When equity + cash collected first covers your cash invested";
    } else {
      out.breakeven.textContent = "Not reached";
      out.breakevenNote.textContent = `Within your ${holdingPeriod}-year holding period`;
    }

    out.downPayment.textContent = fmtCurrency(downPayment);
    out.stampDuty.textContent = fmtCurrency(stampDuty);
    tileAbsd.hidden = absdAmount <= 0;
    out.absd.textContent = fmtCurrency(absdAmount);
    out.conveyancing.textContent = fmtCurrency(conveyancing);
    out.outstandingMortgage.textContent = fmtCurrency(outstandingMortgage);
    out.vacancyLoss.textContent = fmtCurrency(vacancyLossOverHolding);
    out.vacancyRateNote.textContent = `${fmtPercent(vacancyRate, 1)} of gross rental, over the holding period`;

    // --- Costs & rental table (steady-state per month/year, simulated total over holding) ---
    costsNote.textContent = `Over ${holdingPeriod} year${holdingPeriod === 1 ? "" : "s"}`;
    costsHoldingHeader.textContent = `Over ${holdingPeriod} year${holdingPeriod === 1 ? "" : "s"}`;
    costsBucNote.hidden = !isBuc;
    buildCostsTable([
      { label: "Maintenance", month: maintenanceMonthly, year: maintenanceAnnual, holding: cumulativeMaintenance },
      { label: "Property tax", month: propertyTaxMonthly, year: propertyTaxAnnual, holding: cumulativePropertyTax },
      { label: "Loan instalment", month: monthlyInstalment, year: annualInstalment, holding: cumulativeInstalment },
      {
        label: "Sub-total costs",
        month: subTotalMonthly,
        year: subTotalAnnual,
        holding: cumulativeMaintenance + cumulativePropertyTax + cumulativeInstalment,
        emphasize: true,
      },
      { label: "Gross rental", month: grossRentalMonthly, year: grossRentalAnnual, holding: grossRentalOverHolding },
      {
        label: "Net cashflow",
        month: netCashflowAnnualSteadyState / 12,
        year: netCashflowAnnualSteadyState,
        holding: netCashflowOverHolding,
        emphasize: true,
      },
    ]);

    buildYearlyTable(yearlyRows);

    // --- Leverage scenarios ---
    function scenario(label, appreciationRate) {
      const salePrice = purchasePrice * Math.pow(1 + appreciationRate / 100, holdingPeriod);
      const sellingCosts = salePrice * (agentCommissionPct / 100);
      const capitalProfit = salePrice - purchasePrice;
      const equityAvailable =
        salePrice -
        sellingCosts -
        outstandingMortgage +
        netCashflowOverHolding -
        stampDuty -
        absdAmount -
        conveyancing;
      const nextPropertyValue = equityAvailable / (nextPropertyDownPct / 100);
      const leveragePct = purchasePrice > 0 ? (nextPropertyValue / purchasePrice) * 100 : 0;
      return { label, salePrice, sellingCosts, capitalProfit, equityAvailable, nextPropertyValue, leveragePct };
    }

    buildLeverageTable([
      scenario(`${holdingPeriod} yrs @ ${capAppreciation}% p.a.`, capAppreciation),
      scenario(`${holdingPeriod} yrs @ 0% growth (conservative)`, 0),
    ]);

    results.hidden = false;
    updateScrollHints();
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  el.purchaseType.addEventListener("change", calculate);
  document.getElementById("pl-form").addEventListener("submit", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    if (!results.hidden) updateScrollHints();
  });
  calculate();
})();
