(function () {
  const ids = [
    "currentValue", "currentLoanBalance", "annualCashFlow",
    "loanRate", "loanRemainingTerm",
    "appreciationRate", "cashFlowGrowthRate", "projectionYears",
  ];
  const el = {};
  ids.forEach((id) => (el[id] = document.getElementById(id)));

  const results = document.getElementById("results");
  const projectionNote = document.getElementById("projection-note");
  const projectionBody = document.getElementById("projection-body");

  const out = {
    equity: document.getElementById("out-equity"),
    ltv: document.getElementById("out-ltv"),
    cashRoe: document.getElementById("out-cashRoe"),
    totalRoe: document.getElementById("out-totalRoe"),
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
    return value.toFixed(decimals) + "%";
  }

  function setSign(tile, value) {
    tile.classList.remove("positive", "negative");
    if (value > 0) tile.classList.add("positive");
    if (value < 0) tile.classList.add("negative");
  }

  function num(id, fallback = 0) {
    const v = parseFloat(el[id].value);
    return isFinite(v) ? v : fallback;
  }

  // Monthly payment that fully amortizes `principal` over `termYears` at `annualRatePct`.
  function monthlyPayment(principal, annualRatePct, termYears) {
    const n = Math.round(termYears * 12);
    if (n <= 0 || principal <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  // Remaining balance after `monthsElapsed` payments on a loan currently at `principal`.
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

  function calculate() {
    const currentValue = num("currentValue");
    const currentLoanBalance = num("currentLoanBalance");
    const annualCashFlow = num("annualCashFlow", NaN);
    const loanRate = num("loanRate");
    const loanRemainingTerm = num("loanRemainingTerm");
    const appreciationRate = num("appreciationRate");
    const cashFlowGrowthRate = num("cashFlowGrowthRate");
    const projectionYears = Math.round(num("projectionYears", 10));

    if (!(currentValue > 0) || !isFinite(annualCashFlow) || !(projectionYears >= 1)) {
      results.hidden = true;
      return;
    }

    const currentEquity = currentValue - currentLoanBalance;

    out.equity.textContent = fmtCurrency(currentEquity);
    setSign(out.equity, currentEquity);

    const ltv = currentValue > 0 ? (currentLoanBalance / currentValue) * 100 : 0;
    out.ltv.textContent = fmtPercent(ltv, 1);

    // Property value / loan balance at the start of each year (year 0 = today).
    function propertyValueAt(y) {
      return currentValue * Math.pow(1 + appreciationRate / 100, y);
    }
    function loanBalanceAt(y) {
      return remainingBalance(currentLoanBalance, loanRate, loanRemainingTerm, y * 12);
    }
    function cashFlowForYear(y) {
      // Cash flow collected during year y (y=1 is this coming year), grown from today's cash flow.
      return annualCashFlow * Math.pow(1 + cashFlowGrowthRate / 100, y - 1);
    }

    projectionNote.textContent = `Next ${projectionYears} year${projectionYears === 1 ? "" : "s"}`;
    projectionBody.innerHTML = "";

    let year1CashRoe = null;
    let year1TotalRoe = null;

    for (let y = 1; y <= projectionYears; y++) {
      const beginValue = propertyValueAt(y - 1);
      const endValue = propertyValueAt(y);
      const beginBalance = loanBalanceAt(y - 1);
      const endBalance = loanBalanceAt(y);
      const beginEquity = beginValue - beginBalance;
      const endEquity = endValue - endBalance;
      const cf = cashFlowForYear(y);
      const appreciationGain = endValue - beginValue;

      const cashRoe = beginEquity !== 0 ? (cf / beginEquity) * 100 : NaN;
      const totalRoe = beginEquity !== 0 ? ((cf + appreciationGain) / beginEquity) * 100 : NaN;

      if (y === 1) {
        year1CashRoe = cashRoe;
        year1TotalRoe = totalRoe;
      }

      const tr = document.createElement("tr");
      const cashRoeClass = isFinite(cashRoe) ? (cashRoe > 0 ? "positive" : cashRoe < 0 ? "negative" : "") : "";
      const totalRoeClass = isFinite(totalRoe) ? (totalRoe > 0 ? "positive" : totalRoe < 0 ? "negative" : "") : "";
      tr.innerHTML = `
        <td>${y}</td>
        <td>${fmtCurrency(endValue)}</td>
        <td>${fmtCurrency(endBalance)}</td>
        <td>${fmtCurrency(endEquity)}</td>
        <td>${fmtCurrency(cf)}</td>
        <td class="${cashRoeClass}">${isFinite(cashRoe) ? fmtPercent(cashRoe) : "—"}</td>
        <td class="${totalRoeClass}">${isFinite(totalRoe) ? fmtPercent(totalRoe) : "—"}</td>
      `;
      projectionBody.appendChild(tr);
    }

    if (year1CashRoe !== null && isFinite(year1CashRoe)) {
      out.cashRoe.textContent = fmtPercent(year1CashRoe);
      setSign(out.cashRoe, year1CashRoe);
    } else {
      out.cashRoe.textContent = "—";
      setSign(out.cashRoe, 0);
    }

    if (year1TotalRoe !== null && isFinite(year1TotalRoe)) {
      out.totalRoe.textContent = fmtPercent(year1TotalRoe);
      setSign(out.totalRoe, year1TotalRoe);
    } else {
      out.totalRoe.textContent = "—";
      setSign(out.totalRoe, 0);
    }

    results.hidden = false;
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  document.getElementById("roe-form").addEventListener("submit", (e) => e.preventDefault());
})();
