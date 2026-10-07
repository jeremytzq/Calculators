(function () {
  const ids = ["purchasePrice", "downPaymentPct", "interestRate", "loanTerm", "monthlyIncome", "otherDebt"];
  const el = {};
  ids.forEach((id) => (el[id] = document.getElementById(id)));

  const results = document.getElementById("results");
  const tdsrSection = document.getElementById("tdsr-section");
  const yearlyBody = document.getElementById("yearly-body");
  const out = {
    loanAmount: document.getElementById("out-loanAmount"),
    downPayment: document.getElementById("out-downPayment"),
    monthly: document.getElementById("out-monthly"),
    totalInterest: document.getElementById("out-totalInterest"),
    totalPaid: document.getElementById("out-totalPaid"),
    interestShare: document.getElementById("out-interestShare"),
    year1Interest: document.getElementById("out-year1Interest"),
    year1Principal: document.getElementById("out-year1Principal"),
    tdsr: document.getElementById("out-tdsr"),
    maxInstalment: document.getElementById("out-maxInstalment"),
    headroom: document.getElementById("out-headroom"),
    maxLoan: document.getElementById("out-maxLoan"),
  };

  const TDSR_LIMIT = 0.55;
  const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  function fmtCurrency(value) {
    const sign = value < 0 ? "-" : "";
    return sign + "S$" + numberFmt.format(Math.abs(value));
  }

  function fmtPercent(value, decimals = 1) {
    return value.toFixed(decimals) + "%";
  }

  function num(id, fallback = 0) {
    const v = parseFloat(String(el[id].value).replace(/,/g, ""));
    return isFinite(v) ? v : fallback;
  }

  function filled(id) {
    return String(el[id].value).replace(/,/g, "").trim() !== "";
  }

  function monthlyPayment(principal, annualRatePct, termYears) {
    const n = Math.round(termYears * 12);
    if (n <= 0 || principal <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / n;
    return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  function loanFromPayment(payment, annualRatePct, termYears) {
    const n = Math.round(termYears * 12);
    if (n <= 0 || payment <= 0) return 0;
    const r = annualRatePct / 100 / 12;
    if (r === 0) return payment * n;
    return (payment * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n));
  }

  function setSign(node, value) {
    node.classList.remove("positive", "negative");
    if (value > 0) node.classList.add("positive");
    if (value < 0) node.classList.add("negative");
  }

  function calculate() {
    const price = num("purchasePrice");
    const downPct = num("downPaymentPct");
    const rate = num("interestRate");
    const years = num("loanTerm");
    const n = Math.round(years * 12);

    if (!(price > 0) || downPct < 0 || downPct > 100 || !(years >= 1) || rate < 0) {
      results.hidden = true;
      return;
    }

    const downPayment = price * (downPct / 100);
    const loan = price - downPayment;
    const payment = monthlyPayment(loan, rate, years);
    const r = rate / 100 / 12;

    let balance = loan;
    let totalInterest = 0;
    let yearInterest = 0;
    let yearPrincipal = 0;
    const yearsRows = [];

    yearlyBody.innerHTML = "";

    for (let m = 1; m <= n && loan > 0; m++) {
      const interest = r === 0 ? 0 : balance * r;
      let principalPaid = m === n ? balance : payment - interest;
      principalPaid = Math.min(Math.max(principalPaid, 0), balance);
      balance -= principalPaid;
      totalInterest += interest;
      yearInterest += interest;
      yearPrincipal += principalPaid;
      if (m % 12 === 0 || m === n) {
        yearsRows.push({
          year: Math.ceil(m / 12),
          interest: yearInterest,
          principal: yearPrincipal,
          balance,
        });
        yearInterest = 0;
        yearPrincipal = 0;
      }
    }

    const totalPaid = loan + totalInterest;
    const interestShare = totalPaid > 0 ? (totalInterest / totalPaid) * 100 : 0;

    out.loanAmount.textContent = fmtCurrency(loan);
    out.downPayment.textContent = fmtCurrency(downPayment);
    out.monthly.textContent = fmtCurrency(payment);
    out.totalInterest.textContent = fmtCurrency(totalInterest);
    out.totalPaid.textContent = fmtCurrency(totalPaid);
    out.interestShare.textContent = fmtPercent(interestShare);
    out.year1Interest.textContent = fmtCurrency(yearsRows[0] ? yearsRows[0].interest : 0);
    out.year1Principal.textContent = fmtCurrency(yearsRows[0] ? yearsRows[0].principal : 0);

    yearsRows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.year}</td>
        <td>${fmtCurrency(row.interest)}</td>
        <td>${fmtCurrency(row.principal)}</td>
        <td>${fmtCurrency(row.balance)}</td>
      `;
      yearlyBody.appendChild(tr);
    });

    const incomeOn = filled("monthlyIncome") && num("monthlyIncome") > 0;
    tdsrSection.hidden = !incomeOn;
    if (incomeOn) {
      const income = num("monthlyIncome");
      const other = Math.max(num("otherDebt"), 0);
      const tdsr = ((payment + other) / income) * 100;
      const maxInstalment = income * TDSR_LIMIT - other;
      const headroom = maxInstalment - payment;
      const maxLoan = loanFromPayment(Math.max(maxInstalment, 0), rate, years);

      out.tdsr.textContent = fmtPercent(tdsr);
      setSign(out.tdsr, TDSR_LIMIT * 100 - tdsr);
      out.maxInstalment.textContent = fmtCurrency(Math.max(maxInstalment, 0));
      out.headroom.textContent = fmtCurrency(headroom);
      setSign(out.headroom, headroom);
      out.maxLoan.textContent = fmtCurrency(maxLoan);
    }

    results.hidden = false;
  }

  ids.forEach((id) => el[id].addEventListener("input", calculate));
  const form = document.getElementById("mortgage-form");
  form.addEventListener("submit", (e) => e.preventDefault());
  document.getElementById("clear-btn").addEventListener("click", () => {
    form.reset();
    form.querySelectorAll('input[inputmode="decimal"]').forEach((input) => window.NumberFormat.attach(input));
    calculate();
  });

  calculate();
})();
