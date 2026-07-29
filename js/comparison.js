(function () {
  const ids = [
    "investmentAmount", "horizonYears",
    "resDownPct", "resRate", "resTerm", "resAppreciation", "resNetYield", "resSellingCosts",
    "indPurchaseType", "indRentalStartYear",
    "indDownPct", "indRate", "indTerm", "indAppreciation", "indNetYield", "indSellingCosts",
    "finReturn", "finYield", "finFees", "finExitFees",
    "cryReturn", "cryYield", "cryFees", "cryExitFees",
  ];
  const el = {};
  ids.forEach((id) => (el[id] = document.getElementById(id)));

  const results = document.getElementById("results");
  const barChart = document.getElementById("bar-chart");
  const compareBody = document.getElementById("compare-body");
  const tableWrap = document.querySelector(".table-wrap");
  const scrollHint = document.getElementById("table-scroll-hint");
  const indBucFields = document.getElementById("ind-buc-fields");

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

  function npv(rate, cashFlows) {
    return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
  }

  function irr(cashFlows) {
    let lo = -0.99;
    let hi = 10;
    let npvLo = npv(lo, cashFlows);
    const npvHi = npv(hi, cashFlows);
    if (npvLo === 0) return lo;
    if (npvHi === 0) return hi;
    if ((npvLo > 0) === (npvHi > 0)) return null;

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

  // Leveraged property (residential / industrial) model. `rentalStartYear` lets a BUC
  // (Building Under Construction) purchase skip rental income for its first N years,
  // while appreciation and debt service still run from year 1.
  function computeProperty(capital, downPct, rate, term, appreciation, netYield, sellingCostsPct, years, rentalStartYear = 1) {
    const assetValue0 = downPct > 0 ? capital / (downPct / 100) : capital;
    const loan0 = Math.max(assetValue0 - capital, 0);
    const M = monthlyPayment(loan0, rate, term);

    let cumulativeCashFlow = 0;
    const cashFlowSeries = [-capital];

    for (let y = 1; y <= years; y++) {
      const beginValue = assetValue0 * Math.pow(1 + appreciation / 100, y - 1);
      const noi = y >= rentalStartYear ? beginValue * (netYield / 100) : 0;
      const monthsEnd = Math.min(y * 12, term * 12);
      const monthsStart = Math.min((y - 1) * 12, term * 12);
      const debtService = monthsEnd > monthsStart ? M * (monthsEnd - monthsStart) : 0;
      const cf = noi - debtService;
      cumulativeCashFlow += cf;
      cashFlowSeries.push(cf);
    }

    const finalValue = assetValue0 * Math.pow(1 + appreciation / 100, years);
    const remBalance = remainingBalance(loan0, rate, term, years * 12);
    const sellingCosts = finalValue * (sellingCostsPct / 100);
    const netSaleProceeds = finalValue - sellingCosts - remBalance;
    const totalProfit = netSaleProceeds - capital + cumulativeCashFlow;
    const totalRoi = capital > 0 ? (totalProfit / capital) * 100 : 0;

    const irrCashFlows = cashFlowSeries.slice();
    irrCashFlows[irrCashFlows.length - 1] += netSaleProceeds;
    const irrRate = irr(irrCashFlows);

    return {
      assetValue: assetValue0,
      loan: loan0,
      cumulativeCashFlow,
      endingValue: netSaleProceeds,
      totalProfit,
      totalRoi,
      annualizedReturn: irrRate === null ? null : irrRate * 100,
      leveraged: true,
    };
  }

  // Unleveraged asset (financial vehicles / crypto) model.
  function computeUnleveraged(capital, priceReturn, yieldPct, feesPct, exitFeesPct, years) {
    const netAnnualReturn = priceReturn + yieldPct - feesPct;
    const grossFinalValue = capital * Math.pow(1 + netAnnualReturn / 100, years);
    const exitFees = grossFinalValue * (exitFeesPct / 100);
    const finalValue = grossFinalValue - exitFees;
    const totalProfit = finalValue - capital;
    const totalRoi = capital > 0 ? (totalProfit / capital) * 100 : 0;
    const annualizedReturn = capital > 0 && years > 0 ? (Math.pow(finalValue / capital, 1 / years) - 1) * 100 : 0;

    return {
      assetValue: capital,
      loan: 0,
      cumulativeCashFlow: null, // reinvested, not collected separately
      endingValue: finalValue,
      totalProfit,
      totalRoi,
      annualizedReturn,
      leveraged: false,
    };
  }

  function buildBarChart(items) {
    barChart.innerHTML = "";
    const values = items.map((i) => (i.result.annualizedReturn === null ? 0 : i.result.annualizedReturn));
    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(0, ...values);
    // Pad the domain so the most extreme bar never touches the track edge —
    // otherwise its outside-placed value label has nowhere to sit.
    const pad = (rawMax - rawMin || 1) * 0.18;
    const domainMin = rawMin - pad;
    const domainMax = rawMax + pad;
    const range = domainMax - domainMin || 1;
    const zeroPct = ((0 - domainMin) / range) * 100;

    items.forEach((item) => {
      const value = item.result.annualizedReturn;
      const v = value === null ? 0 : value;
      const startPct = v >= 0 ? zeroPct : ((v - domainMin) / range) * 100;
      const widthPct = Math.max((Math.abs(v) / range) * 100, value === null ? 0 : 0.5);

      const row = document.createElement("div");
      row.className = "bar-row";

      const label = document.createElement("div");
      label.className = "bar-label";
      label.innerHTML = `<span class="swatch ${item.cls}"></span>${item.name}`;

      const track = document.createElement("div");
      track.className = "bar-track";

      const zeroLine = document.createElement("div");
      zeroLine.className = "zero-line";
      zeroLine.style.left = zeroPct + "%";
      track.appendChild(zeroLine);

      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.left = startPct + "%";
      fill.style.width = widthPct + "%";
      fill.style.background = `var(--series-${item.cls})`;
      track.appendChild(fill);

      const valueLabel = document.createElement("span");
      valueLabel.className = "bar-value";
      valueLabel.textContent = value === null ? "N/A" : fmtPercent(value);
      if (v >= 0) {
        valueLabel.style.left = `calc(${startPct + widthPct}% + 8px)`;
      } else {
        valueLabel.style.right = `calc(${100 - startPct}% + 8px)`;
      }
      track.appendChild(valueLabel);

      row.appendChild(label);
      row.appendChild(track);
      barChart.appendChild(row);
    });
  }

  function buildTable(items) {
    compareBody.innerHTML = "";

    const metricRows = [
      ["Asset value controlled", (r) => fmtCurrency(r.assetValue)],
      ["Financing (loan)", (r) => (r.loan > 0 ? fmtCurrency(r.loan) : "No leverage")],
      [
        "Cumulative income collected",
        (r) => (r.cumulativeCashFlow === null ? "Reinvested" : fmtCurrency(r.cumulativeCashFlow)),
        (r) => r.cumulativeCashFlow,
      ],
      ["Ending value (net)", (r) => fmtCurrency(r.endingValue), () => null],
      ["Total profit", (r) => fmtCurrency(r.totalProfit), (r) => r.totalProfit],
      ["Total ROI", (r) => fmtPercent(r.totalRoi), (r) => r.totalRoi],
      [
        "Annualized return",
        (r) => (r.annualizedReturn === null ? "N/A" : fmtPercent(r.annualizedReturn)),
        (r) => r.annualizedReturn,
      ],
    ];

    const capitalRow = document.createElement("tr");
    const capital = num("investmentAmount");
    capitalRow.innerHTML =
      `<td>Capital invested</td>` + items.map(() => `<td>${fmtCurrency(capital)}</td>`).join("");
    compareBody.appendChild(capitalRow);

    metricRows.forEach(([label, format, signOf]) => {
      const tr = document.createElement("tr");
      let html = `<td>${label}</td>`;
      items.forEach((item) => {
        const display = format(item.result);
        const sign = signOf ? signOf(item.result) : null;
        let cls = "";
        if (sign !== null && isFinite(sign)) {
          if (sign > 0) cls = "positive";
          else if (sign < 0) cls = "negative";
        }
        html += `<td class="${cls}">${display}</td>`;
      });
      tr.innerHTML = html;
      compareBody.appendChild(tr);
    });
  }

  function calculate() {
    const capital = num("investmentAmount");
    const years = Math.max(1, Math.round(num("horizonYears", 10)));

    if (!(capital > 0) || !(years >= 1)) {
      results.hidden = true;
      return;
    }

    const residential = computeProperty(
      capital,
      num("resDownPct", 20),
      num("resRate"),
      num("resTerm", 30),
      num("resAppreciation"),
      num("resNetYield"),
      num("resSellingCosts"),
      years
    );

    const indIsBuc = el.indPurchaseType.value === "buc";
    const indRentalStartYear = indIsBuc ? Math.max(1, Math.round(num("indRentalStartYear", 4))) : 1;
    indBucFields.hidden = !indIsBuc;

    const industrial = computeProperty(
      capital,
      num("indDownPct", 30),
      num("indRate"),
      num("indTerm", 20),
      num("indAppreciation"),
      num("indNetYield"),
      num("indSellingCosts"),
      years,
      indRentalStartYear
    );

    const financial = computeUnleveraged(
      capital,
      num("finReturn"),
      num("finYield"),
      num("finFees"),
      num("finExitFees"),
      years
    );

    const crypto = computeUnleveraged(
      capital,
      num("cryReturn"),
      num("cryYield"),
      num("cryFees"),
      num("cryExitFees"),
      years
    );

    const items = [
      { name: "Residential", cls: "residential", result: residential },
      { name: "Industrial", cls: "industrial", result: industrial },
      { name: "Financial", cls: "financial", result: financial },
      { name: "Crypto", cls: "crypto", result: crypto },
    ];

    buildBarChart(items);
    buildTable(items);

    results.hidden = false;
    scrollHint.hidden = tableWrap.scrollWidth <= tableWrap.clientWidth;
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  el.indPurchaseType.addEventListener("change", calculate);
  document.getElementById("compare-form").addEventListener("submit", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    if (!results.hidden) scrollHint.hidden = tableWrap.scrollWidth <= tableWrap.clientWidth;
  });
  calculate();
})();
