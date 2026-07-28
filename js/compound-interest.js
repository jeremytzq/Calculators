(function () {
  const ids = ["principal", "monthlyContribution", "annualRate", "years", "compoundFrequency", "contributionTiming"];
  const el = {};
  ids.forEach((id) => (el[id] = document.getElementById(id)));

  const results = document.getElementById("results");
  const growthChart = document.getElementById("growth-chart");
  const growthChartWrap = document.getElementById("growth-chart-wrap");
  const growthTicks = document.getElementById("growth-ticks");
  const chartScrollHint = document.getElementById("chart-scroll-hint");
  const tableBody = document.getElementById("ci-table-body");
  const tableWrap = document.querySelector(".table-wrap");
  const scrollHint = document.getElementById("ci-scroll-hint");

  const out = {
    finalBalance: document.getElementById("out-finalBalance"),
    totalContributions: document.getElementById("out-totalContributions"),
    totalInterest: document.getElementById("out-totalInterest"),
    interestShare: document.getElementById("out-interestShare"),
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

  function fmtPercent(value, decimals = 1) {
    return value.toFixed(decimals) + "%";
  }

  function num(id, fallback = 0) {
    const v = parseFloat(el[id].value);
    return isFinite(v) ? v : fallback;
  }

  // Convert a nominal annual rate compounded n times/year into an effective monthly rate.
  function effectiveMonthlyRate(annualRatePct, n) {
    if (n <= 0) return 0;
    const r = annualRatePct / 100;
    return Math.pow(1 + r / n, n / 12) - 1;
  }

  function simulate(principal, monthlyContribution, annualRatePct, n, years, timing) {
    const monthlyRate = effectiveMonthlyRate(annualRatePct, n);
    const totalMonths = Math.round(years * 12);

    let balance = principal;
    let contributions = principal;
    const yearly = [];

    for (let m = 1; m <= totalMonths; m++) {
      if (timing === "beginning") {
        balance += monthlyContribution;
        contributions += monthlyContribution;
      }
      balance *= 1 + monthlyRate;
      if (timing === "end") {
        balance += monthlyContribution;
        contributions += monthlyContribution;
      }
      if (m % 12 === 0) {
        yearly.push({ year: m / 12, contributions, interest: balance - contributions, balance });
      }
    }

    return { finalBalance: balance, totalContributions: contributions, yearly };
  }

  function buildChart(yearly) {
    growthChart.innerHTML = "";
    growthTicks.innerHTML = "";

    const maxBalance = Math.max(...yearly.map((y) => y.balance), 1);
    // .growth-chart is 220px tall (border-box) with 28px top padding reserved for the
    // end label, so the actual content height bars can scale against is 192px.
    const chartHeightPx = 192;
    const count = yearly.length;
    const tickEvery = Math.max(1, Math.ceil(count / 10));

    yearly.forEach((y, idx) => {
      const principalPx = Math.max((y.contributions / maxBalance) * chartHeightPx, 0);
      const interestPx = Math.max((y.interest / maxBalance) * chartHeightPx, 0);
      const isLast = idx === count - 1;

      const col = document.createElement("div");
      col.className = "growth-col";
      col.title =
        `Year ${y.year}\n` +
        `Contributions: ${fmtCurrency(y.contributions)}\n` +
        `Interest: ${fmtCurrency(y.interest)}\n` +
        `Balance: ${fmtCurrency(y.balance)}`;

      const bar = document.createElement("div");
      bar.className = "col-bar";

      const interestSeg = document.createElement("div");
      interestSeg.className = "seg-interest";
      interestSeg.style.height = interestPx + "px";

      const principalSeg = document.createElement("div");
      principalSeg.className = "seg-principal";
      principalSeg.style.height = principalPx + "px";

      bar.appendChild(interestSeg);
      bar.appendChild(principalSeg);
      col.appendChild(bar);

      if (isLast) {
        // Right-align rather than center, since a centered label on the rightmost
        // column would overflow past the chart's edge.
        const totalLabel = document.createElement("span");
        totalLabel.className = "col-total col-total-end";
        totalLabel.textContent = fmtCurrency(y.balance);
        totalLabel.style.bottom = principalPx + interestPx + 6 + "px";
        col.appendChild(totalLabel);
      }

      growthChart.appendChild(col);

      const tick = document.createElement("div");
      tick.className = "tick";
      tick.textContent = idx === 0 || isLast || y.year % tickEvery === 0 ? y.year : "";
      growthTicks.appendChild(tick);
    });
  }

  function buildTable(yearly) {
    tableBody.innerHTML = "";
    yearly.forEach((y) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${y.year}</td>
        <td>${fmtCurrency(y.contributions)}</td>
        <td>${fmtCurrency(y.interest)}</td>
        <td>${fmtCurrency(y.balance)}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // Must run after #results is unhidden — measuring scrollWidth/clientWidth while an
  // ancestor is display:none always yields 0 for both, which looks like "no overflow".
  function updateScrollHints() {
    chartScrollHint.hidden = growthChartWrap.scrollWidth <= growthChartWrap.clientWidth;
    scrollHint.hidden = tableWrap.scrollWidth <= tableWrap.clientWidth;
  }

  function calculate() {
    const principal = num("principal");
    const monthlyContribution = num("monthlyContribution");
    const annualRate = num("annualRate");
    const years = Math.max(1, Math.round(num("years", 20)));
    const n = num("compoundFrequency", 12);
    const timing = el.contributionTiming.value;

    if (!(principal >= 0) || !(monthlyContribution >= 0) || !(years >= 1)) {
      results.hidden = true;
      return;
    }

    const { finalBalance, totalContributions, yearly } = simulate(
      principal,
      monthlyContribution,
      annualRate,
      n,
      years,
      timing
    );

    const totalInterest = finalBalance - totalContributions;
    const interestShare = finalBalance > 0 ? (totalInterest / finalBalance) * 100 : 0;

    out.finalBalance.textContent = fmtCurrency(finalBalance);
    out.totalContributions.textContent = fmtCurrency(totalContributions);
    out.totalInterest.textContent = fmtCurrency(totalInterest);
    out.interestShare.textContent = fmtPercent(interestShare);

    buildChart(yearly);
    buildTable(yearly);

    results.hidden = false;
    updateScrollHints();
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  el.compoundFrequency.addEventListener("change", calculate);
  el.contributionTiming.addEventListener("change", calculate);
  document.getElementById("ci-form").addEventListener("submit", (e) => e.preventDefault());
  window.addEventListener("resize", () => {
    if (!results.hidden) updateScrollHints();
  });
  calculate();
})();
