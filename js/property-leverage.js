(function () {
  const ids = [
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
  const costsHoldingHeader = document.getElementById("costs-holding-header");
  const costsNote = document.getElementById("costs-note");
  const costsTableBody = document.getElementById("costs-table-body");
  const costsTableWrap = document.querySelector("#costs-table").closest(".table-wrap");
  const costsScrollHint = document.getElementById("costs-scroll-hint");
  const leverageTableBody = document.getElementById("leverage-table-body");
  const leverageTableWrap = document.querySelector("#leverage-table").closest(".table-wrap");
  const leverageScrollHint = document.getElementById("leverage-scroll-hint");
  const tileAbsd = document.getElementById("tile-absd");

  const out = {
    psfPrice: document.getElementById("out-psfPrice"),
    loanAmount: document.getElementById("out-loanAmount"),
    monthlyInstalment: document.getElementById("out-monthlyInstalment"),
    totalCashOutlay: document.getElementById("out-totalCashOutlay"),
    downPayment: document.getElementById("out-downPayment"),
    stampDuty: document.getElementById("out-stampDuty"),
    absd: document.getElementById("out-absd"),
    conveyancing: document.getElementById("out-conveyancing"),
    agentCommission: document.getElementById("out-agentCommission"),
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
    const v = parseFloat(el[id].value);
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

  function buildLeverageTable(scenarios) {
    leverageTableBody.innerHTML = "";
    scenarios.forEach((s) => {
      const tr = document.createElement("tr");
      const profitCls = s.capitalProfit > 0 ? "positive" : s.capitalProfit < 0 ? "negative" : "";
      tr.innerHTML = `
        <td>${s.label}</td>
        <td>${fmtCurrency(s.salePrice)}</td>
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
    leverageScrollHint.hidden = leverageTableWrap.scrollWidth <= leverageTableWrap.clientWidth;
  }

  function calculate() {
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
    const monthsPaid = Math.min(holdingPeriod * 12, loanTerm * 12);
    const instalmentOverHolding = monthlyInstalment * monthsPaid;

    const grossRentalMonthly = rentalPsf * sizeSqft;
    const grossRentalAnnual = grossRentalMonthly * 12;
    const grossRentalOverHolding = grossRentalAnnual * holdingPeriod;
    const grossRentalYieldPct = purchasePrice > 0 ? (grossRentalAnnual / purchasePrice) * 100 : 0;
    grossYieldNote.textContent = fmtPercent(grossRentalYieldPct);

    const maintenanceAnnual = maintenanceMonthly * 12;
    const maintenanceOverHolding = maintenanceAnnual * holdingPeriod;
    const propertyTaxAnnual = propertyTaxMonthly * 12;
    const propertyTaxOverHolding = propertyTaxAnnual * holdingPeriod;

    const subTotalMonthly = maintenanceMonthly + propertyTaxMonthly + monthlyInstalment;
    const subTotalAnnual = maintenanceAnnual + propertyTaxAnnual + annualInstalment;
    const subTotalOverHolding = maintenanceOverHolding + propertyTaxOverHolding + instalmentOverHolding;

    const netCashflowMonthly = grossRentalMonthly - subTotalMonthly;
    const netCashflowAnnual = grossRentalAnnual - subTotalAnnual;
    const netCashflowOverHolding = grossRentalOverHolding - subTotalOverHolding;

    const vacancyLoss = grossRentalOverHolding * (vacancyRate / 100);

    const stampDuty = buyersStampDuty(purchasePrice);
    const absdAmount = purchasePrice * (absdPct / 100);
    const agentCommissionAmount = purchasePrice * (agentCommissionPct / 100);
    const totalCashOutlay = downPayment + stampDuty + absdAmount + conveyancing + agentCommissionAmount;

    const outstandingMortgage = remainingBalance(loanAmount, interestRate, loanTerm, holdingPeriod * 12);

    // --- Key metrics & cash outlay tiles ---
    out.psfPrice.textContent = fmtCurrency(psfPrice);
    out.loanAmount.textContent = fmtCurrency(loanAmount);
    out.monthlyInstalment.textContent = fmtCurrency(monthlyInstalment);
    out.totalCashOutlay.textContent = fmtCurrency(totalCashOutlay);

    out.downPayment.textContent = fmtCurrency(downPayment);
    out.stampDuty.textContent = fmtCurrency(stampDuty);
    tileAbsd.hidden = absdAmount <= 0;
    out.absd.textContent = fmtCurrency(absdAmount);
    out.conveyancing.textContent = fmtCurrency(conveyancing);
    out.agentCommission.textContent = fmtCurrency(agentCommissionAmount);
    out.outstandingMortgage.textContent = fmtCurrency(outstandingMortgage);
    out.vacancyLoss.textContent = fmtCurrency(vacancyLoss);
    out.vacancyRateNote.textContent = `${fmtPercent(vacancyRate, 1)} of gross rental over the holding period`;

    // --- Costs & rental table ---
    costsNote.textContent = `Over ${holdingPeriod} year${holdingPeriod === 1 ? "" : "s"}`;
    costsHoldingHeader.textContent = `Over ${holdingPeriod} year${holdingPeriod === 1 ? "" : "s"}`;
    buildCostsTable([
      { label: "Maintenance", month: maintenanceMonthly, year: maintenanceAnnual, holding: maintenanceOverHolding },
      { label: "Property tax", month: propertyTaxMonthly, year: propertyTaxAnnual, holding: propertyTaxOverHolding },
      { label: "Loan instalment", month: monthlyInstalment, year: annualInstalment, holding: instalmentOverHolding },
      { label: "Sub-total costs", month: subTotalMonthly, year: subTotalAnnual, holding: subTotalOverHolding, emphasize: true },
      { label: "Gross rental", month: grossRentalMonthly, year: grossRentalAnnual, holding: grossRentalOverHolding },
      { label: "Net cashflow", month: netCashflowMonthly, year: netCashflowAnnual, holding: netCashflowOverHolding, emphasize: true },
    ]);

    // --- Leverage scenarios ---
    function scenario(label, appreciationRate) {
      const salePrice = purchasePrice * Math.pow(1 + appreciationRate / 100, holdingPeriod);
      const capitalProfit = salePrice - purchasePrice;
      const equityAvailable =
        salePrice +
        netCashflowOverHolding -
        outstandingMortgage -
        stampDuty -
        absdAmount -
        conveyancing -
        agentCommissionAmount -
        vacancyLoss;
      const nextPropertyValue = equityAvailable / (nextPropertyDownPct / 100);
      const leveragePct = purchasePrice > 0 ? (nextPropertyValue / purchasePrice) * 100 : 0;
      return { label, salePrice, capitalProfit, equityAvailable, nextPropertyValue, leveragePct };
    }

    buildLeverageTable([
      scenario(`${holdingPeriod} yrs @ ${capAppreciation}% p.a.`, capAppreciation),
      scenario(`${holdingPeriod} yrs @ 0% growth (conservative)`, 0),
    ]);

    results.hidden = false;
    updateScrollHints();
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  document.getElementById("pl-form").addEventListener("submit", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    if (!results.hidden) updateScrollHints();
  });
  calculate();
})();
