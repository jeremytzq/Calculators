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
  const bucScheduleSection = document.getElementById("pl-buc-schedule-section");
  const bucScheduleDownpaymentNote = document.getElementById("buc-schedule-downpayment");
  const bucScheduleTableBody = document.getElementById("buc-schedule-table-body");
  const bucScheduleTableWrap = document.querySelector("#buc-schedule-table").closest(".table-wrap");
  const bucScheduleScrollHint = document.getElementById("buc-schedule-scroll-hint");
  const bucCalloutExtra = document.getElementById("buc-callout-extra");

  const out = {
    psfPrice: document.getElementById("out-psfPrice"),
    loanAmount: document.getElementById("out-loanAmount"),
    monthlyInstalment: document.getElementById("out-monthlyInstalment"),
    monthlyInstalmentNote: document.getElementById("out-monthlyInstalmentNote"),
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

  // --- BUC progressive payment schedule ---
  // Standard Singapore BUC stage-by-stage loan disbursement (Housing Developers Rules), expressed
  // as % of the LOAN, not the purchase price — the down payment alone covers everything up to
  // booking/S&P, so every stage from Foundation onward is 100% bank-financed. "month" is each
  // stage's typical timing from booking at a representative pace; scaled per-calculator so the
  // TOP stage lands on whichever "rental starts in year" the user sets (TOP is when a BUC unit
  // can actually be occupied/rented).
  const BUC_STAGES = [
    { name: "Foundation", pct: 12.5, month: 9.5 },
    { name: "Reinforced concrete framework", pct: 12.5, month: 17 },
    { name: "Partition walls", pct: 6.25, month: 21.5 },
    { name: "Roofing / ceiling", pct: 6.25, month: 26 },
    { name: "Door & window frames", pct: 6.25, month: 30.5 },
    { name: "Electrical wiring, plumbing & air-con", pct: 6.25, month: 35 },
    { name: "Car park, roads & drains", pct: 6.25, month: 39.5 },
    { name: "Temporary Occupation Permit (TOP)", pct: 31.25, month: 50 },
    { name: "Certificate of Statutory Completion (CSC)", pct: 12.5, month: 62 },
  ];
  const BUC_TOP_INDEX = 7;
  const RESALE_SCHEDULE = [{ name: "Disbursement", cumPct: 100, month: 1 }];

  function bucSchedule(rentalStartYear) {
    const userTopMonth = Math.max(1, (rentalStartYear - 1) * 12);
    const scale = userTopMonth / BUC_STAGES[BUC_TOP_INDEX].month;
    let cumPct = 0;
    return BUC_STAGES.map((s) => {
      cumPct += s.pct;
      return { name: s.name, cumPct, month: Math.max(1, Math.round(s.month * scale)) };
    });
  }

  // Fraction (0..1) of the loan disbursed by a given month, per the schedule. A single-stage
  // schedule (100% at month 1) reduces this to the plain resale case.
  function disbursedFraction(schedule, month) {
    let frac = 0;
    for (const s of schedule) {
      if (month >= s.month) frac = s.cumPct / 100;
    }
    return frac;
  }

  // Month-by-month loan simulation covering both resale and BUC via the schedule passed in.
  // During construction, each month's interest is charged only on the amount disbursed so far;
  // the instalment is what a fresh loan of that disbursed amount would cost over the full loan
  // term, and the portion above interest is treated as a real paydown of what's owed — so once
  // the loan is fully disbursed, less is actually left than the nominal loan amount. From full
  // disbursement onward it's a standard amortizing loan on whatever balance remained.
  function simulateLoanMonthly(loanAmount, annualRatePct, termYears, totalMonths, schedule) {
    const monthlyRate = annualRatePct / 100 / 12;
    const termMonths = Math.round(termYears * 12);
    const monthly = [];
    let netBalance = 0;
    let fullyDisbursed = false;
    let completionMonth = 0;
    let netBalanceAtCompletion = 0;
    let remainingTermYears = termYears;

    for (let m = 1; m <= totalMonths; m++) {
      if (!fullyDisbursed) {
        const grossDisbursed = loanAmount * disbursedFraction(schedule, m);
        const prevGross = loanAmount * disbursedFraction(schedule, m - 1);
        netBalance += grossDisbursed - prevGross;
        const interest = grossDisbursed * monthlyRate;
        const instalment = monthlyPayment(grossDisbursed, annualRatePct, termYears);
        const principal = Math.max(instalment - interest, 0);
        netBalance = Math.max(netBalance - principal, 0);
        monthly.push({ interest, principal, instalment, balance: netBalance });
        if (grossDisbursed >= loanAmount - 0.005) {
          fullyDisbursed = true;
          completionMonth = m;
          netBalanceAtCompletion = netBalance;
          // Continue the same tenure clock rather than resetting to a fresh full term — the
          // loan's total tenure runs from month 1, so only what's left of it remains. (For the
          // resale case, completionMonth is always 1, so this is ~termYears and the whole
          // simulation reduces to plain single-shot amortization, matching it exactly.)
          remainingTermYears = Math.max(termMonths - completionMonth, 1) / 12;
        }
      } else {
        const k = m - completionMonth;
        const beginBalance = remainingBalance(netBalanceAtCompletion, annualRatePct, remainingTermYears, k - 1);
        const endBalance = remainingBalance(netBalanceAtCompletion, annualRatePct, remainingTermYears, k);
        const instalment = monthlyPayment(netBalanceAtCompletion, annualRatePct, remainingTermYears);
        const principal = beginBalance - endBalance;
        const interest = instalment - principal;
        monthly.push({ interest, principal, instalment, balance: endBalance });
      }
    }
    return monthly;
  }

  // Sum a year's worth of months (year is 1-indexed; monthly[] is 0-indexed by month - 1).
  function aggregateYear(monthly, year) {
    const start = (year - 1) * 12;
    const end = Math.min(year * 12, monthly.length);
    let interestPaid = 0;
    let principalPaid = 0;
    let paid = 0;
    for (let i = start; i < end; i++) {
      interestPaid += monthly[i].interest;
      principalPaid += monthly[i].principal;
      paid += monthly[i].instalment;
    }
    const endBalance = end > 0 ? monthly[end - 1].balance : 0;
    return { paid, principalPaid, interestPaid, endBalance };
  }

  // Snapshot of what each stage's disbursement looks like in isolation — for the progressive
  // payment schedule table. Independent of holding period, so it always shows the full schedule.
  function bucStageDisplayRows(loanAmount, annualRatePct, termYears, schedule) {
    return schedule.map((s) => {
      const cumulativeLoan = loanAmount * (s.cumPct / 100);
      const interest = cumulativeLoan * (annualRatePct / 100 / 12);
      const instalment = monthlyPayment(cumulativeLoan, annualRatePct, termYears);
      const principal = Math.max(instalment - interest, 0);
      return { name: s.name, month: s.month, cumPct: s.cumPct, loanDisbursed: cumulativeLoan, interest, principal, instalment };
    });
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

  function buildBucScheduleTable(rows) {
    bucScheduleTableBody.innerHTML = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.name}</td>
        <td>~Year ${Math.ceil(r.month / 12)}</td>
        <td>${fmtPercent(r.cumPct, 2)}</td>
        <td>${fmtCurrency(r.loanDisbursed)}</td>
        <td>${fmtCurrency(r.interest)}</td>
        <td>${fmtCurrency(r.principal)}</td>
        <td>${fmtCurrency(r.instalment)}</td>
      `;
      bucScheduleTableBody.appendChild(tr);
    });
  }

  function updateScrollHints() {
    costsScrollHint.hidden = costsTableWrap.scrollWidth <= costsTableWrap.clientWidth;
    yearlyScrollHint.hidden = yearlyTableWrap.scrollWidth <= yearlyTableWrap.clientWidth;
    leverageScrollHint.hidden = leverageTableWrap.scrollWidth <= leverageTableWrap.clientWidth;
    if (!bucScheduleSection.hidden) {
      bucScheduleScrollHint.hidden = bucScheduleTableWrap.scrollWidth <= bucScheduleTableWrap.clientWidth;
    }
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

    // Loan disbursement schedule: progressive BUC stages, or a single "fully disbursed month 1"
    // stage for resale (which reduces the simulation below to plain amortization).
    const useProgressiveSchedule = isBuc && rentalStartYear > 1;
    const loanSchedule = useProgressiveSchedule ? bucSchedule(rentalStartYear) : RESALE_SCHEDULE;
    const totalMonths = holdingPeriod * 12;
    const monthlySim = simulateLoanMonthly(loanAmount, interestRate, loanTerm, totalMonths, loanSchedule);

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

      const amort = aggregateYear(monthlySim, y);
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
    const outstandingMortgage = monthlySim.length > 0 ? monthlySim[monthlySim.length - 1].balance : 0;

    // --- Key metrics & break-even ---
    out.psfPrice.textContent = fmtCurrency(psfPrice);
    out.loanAmount.textContent = fmtCurrency(loanAmount);
    out.monthlyInstalment.textContent = fmtCurrency(monthlyInstalment);
    out.monthlyInstalmentNote.textContent = useProgressiveSchedule
      ? "Steady-state once the loan is fully disbursed — starts lower during construction"
      : "";
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

    // --- Progressive payment schedule (BUC only) ---
    bucScheduleSection.hidden = !useProgressiveSchedule;
    bucCalloutExtra.hidden = !useProgressiveSchedule;
    if (useProgressiveSchedule) {
      bucScheduleDownpaymentNote.textContent = fmtCurrency(downPayment);
      buildBucScheduleTable(bucStageDisplayRows(loanAmount, interestRate, loanTerm, loanSchedule));
    }

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

  // Pre-fill fields from URL query params, e.g. linking here from a unit listing:
  // property-leverage.html?purchasePrice=2538000&sizeSqft=1625&purchaseType=buc&capAppreciation=4
  // Any field id above is accepted; unknown params and unmatched select values are ignored.
  function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    ids.forEach((id) => {
      if (!params.has(id)) return;
      const value = params.get(id);
      const field = el[id];
      if (field.tagName === "SELECT") {
        const hasOption = Array.from(field.options).some((o) => o.value === value);
        if (hasOption) field.value = value;
      } else {
        field.value = value;
      }
    });
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  el.purchaseType.addEventListener("change", calculate);
  document.getElementById("pl-form").addEventListener("submit", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    if (!results.hidden) updateScrollHints();
  });
  applyUrlParams();
  calculate();
})();
