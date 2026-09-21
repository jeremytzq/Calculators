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

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Segmented pill control — same pattern used across the site, with each control's
  // HTML-authored default captured for the Clear-fields button to restore later.
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
      if (!container) return;
      const target = Array.from(container.querySelectorAll("button")).find((b) => b.dataset.value === value);
      if (target && !target.classList.contains("active")) target.click();
    });
  }

  // Buyer's Stamp Duty — non-residential rates (industrial, commercial): flatter than
  // residential, capped at 4% with no escalation for higher-value purchases, and no ABSD
  // at all since ABSD only applies to residential property.
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

  function makeSide(prefix, gstContainerId) {
    const el = {
      price: document.getElementById(`${prefix}-price`),
      size: document.getElementById(`${prefix}-size`),
      lease: document.getElementById(`${prefix}-lease`),
      gstRate: document.getElementById(`${prefix}-gstRate`),
      legalFee: document.getElementById(`${prefix}-legalFee`),
      agentFee: document.getElementById(`${prefix}-agentFee`),
      renovation: document.getElementById(`${prefix}-renovation`),
      ltv: document.getElementById(`${prefix}-ltv`),
      interestRate: document.getElementById(`${prefix}-interestRate`),
      loanTenure: document.getElementById(`${prefix}-loanTenure`),
      rental: document.getElementById(`${prefix}-rental`),
      maintenance: document.getElementById(`${prefix}-maintenance`),
    };

    const getGst = initSegmented(gstContainerId, () => calculate());

    let latest = null;

    function calculate() {
      const price = num(el.price);
      const size = num(el.size);
      const lease = num(el.lease, 1);

      const gstApplicable = getGst() === "yes";
      const gstRate = num(el.gstRate);
      const gstAmount = gstApplicable ? price * (gstRate / 100) : 0;

      const bsd = buyersStampDutyNonResidential(price);
      const legalFee = num(el.legalFee);
      const agentFee = num(el.agentFee);
      const renovation = num(el.renovation);
      const upfrontCosts = gstAmount + bsd + legalFee + agentFee + renovation;

      const ltv = num(el.ltv);
      const interestRate = num(el.interestRate);
      const loanTenureInput = num(el.loanTenure);
      // A bank won't lend past the point the lease itself runs out.
      const effectiveTenure = Math.min(loanTenureInput, lease);

      const loanAmount = price * (ltv / 100);
      const downpayment = price - loanAmount;
      const monthlyInstalment = monthlyPayment(loanAmount, interestRate, effectiveTenure);
      const totalCash = downpayment + upfrontCosts;

      const rental = num(el.rental);
      const maintenance = num(el.maintenance);
      const netCashFlow = rental - monthlyInstalment - maintenance;
      const cashYield = totalCash > 0 ? (netCashFlow * 12 * 100) / totalCash : 0;

      const pricePerSqft = size > 0 ? price / size : 0;

      text(`${prefix}-out-gst`, fmtCurrency(gstAmount));
      text(`${prefix}-out-bsd`, fmtCurrency(bsd));
      text(`${prefix}-out-upfrontCosts`, fmtCurrency(upfrontCosts));
      text(`${prefix}-out-maxTenure`, `${lease} years`);
      text(`${prefix}-out-loanAmount`, fmtCurrency(loanAmount));
      text(`${prefix}-out-downpayment`, fmtCurrency(downpayment));
      text(`${prefix}-out-monthlyInstalment`, fmtCurrency(monthlyInstalment));
      text(`${prefix}-out-totalCash`, fmtCurrency(totalCash));
      text(`${prefix}-out-netCashFlow`, fmtCurrency(netCashFlow));

      latest = { price, size, pricePerSqft, lease, gstAmount, bsd, legalFee, agentFee, renovation, upfrontCosts, loanAmount, downpayment, totalCash, monthlyInstalment, rental, netCashFlow, cashYield };

      buildComparisonTable();
    }

    Object.values(el).forEach((input) => input && input.addEventListener("input", calculate));
    document.getElementById(`${prefix}-form`).addEventListener("submit", (e) => e.preventDefault());

    return {
      calculate,
      getValues: () => latest,
    };
  }

  const newSide = makeSide("in", "in-gst");
  const resaleSide = makeSide("rs", "rs-gst");

  const ROWS = [
    { label: "Purchase price", key: "price", fmt: "currency" },
    { label: "Price per sqft", key: "pricePerSqft", fmt: "currency" },
    { label: "Remaining lease", key: "lease", fmt: "years", lowerIsBetter: false },
    { label: "GST", key: "gstAmount", fmt: "currency" },
    { label: "Buyer's Stamp Duty", key: "bsd", fmt: "currency" },
    { label: "Legal fee", key: "legalFee", fmt: "currency" },
    { label: "Agent fee", key: "agentFee", fmt: "currency" },
    { label: "Renovation / fit-out", key: "renovation", fmt: "currency" },
    { label: "Total upfront costs", key: "upfrontCosts", fmt: "currency", emphasize: true },
    { label: "Loan amount", key: "loanAmount", fmt: "currency" },
    { label: "Downpayment (cash)", key: "downpayment", fmt: "currency" },
    { label: "Total cash required", key: "totalCash", fmt: "currency", emphasize: true },
    { label: "Monthly instalment", key: "monthlyInstalment", fmt: "currency" },
    { label: "Monthly rental income", key: "rental", fmt: "currency", lowerIsBetter: false },
    { label: "Net monthly cash flow", key: "netCashFlow", fmt: "currency", lowerIsBetter: false },
    { label: "Annual cash-on-cash yield", key: "cashYield", fmt: "percent", lowerIsBetter: false },
  ];

  function formatValue(value, fmt) {
    if (fmt === "percent") return `${value.toFixed(2)}%`;
    if (fmt === "years") return `${value.toFixed(0)} yrs`;
    return fmtCurrency(value);
  }

  function buildComparisonTable() {
    const nv = newSide.getValues();
    const rv = resaleSide.getValues();
    if (!nv || !rv) return;

    const tbody = document.getElementById("cmp-tbody");
    tbody.innerHTML = ROWS.map((row) => {
      const a = nv[row.key];
      const b = rv[row.key];
      const lowerIsBetter = row.lowerIsBetter !== false;
      const diff = a - b;
      let newClass = "";
      let rsClass = "";
      let diffClass = "";
      if (Math.abs(diff) > 0.005) {
        const newIsBetter = lowerIsBetter ? a < b : a > b;
        if (newIsBetter) {
          newClass = "diff-better";
          diffClass = "diff-better";
        } else {
          rsClass = "diff-better";
          diffClass = "diff-worse";
        }
      }
      const diffSign = diff > 0.005 ? "+" : diff < -0.005 ? "−" : "";
      const diffText = diffSign + formatValue(Math.abs(diff), row.fmt);
      return `<tr${row.emphasize ? ' class="emphasize"' : ""}>
        <td>${escapeHtml(row.label)}</td>
        <td class="${newClass}">${formatValue(a, row.fmt)}</td>
        <td class="${rsClass}">${formatValue(b, row.fmt)}</td>
        <td class="${diffClass}">${diffText}</td>
      </tr>`;
    }).join("");

    const cashDiff = nv.totalCash - rv.totalCash;
    let verdict;
    if (Math.abs(cashDiff) < 1) {
      verdict = "Both options need about the same cash upfront.";
    } else if (cashDiff > 0) {
      verdict = `Brand New needs ${fmtCurrency(cashDiff)} more cash upfront than Resale.`;
    } else {
      verdict = `Resale needs ${fmtCurrency(-cashDiff)} more cash upfront than Brand New.`;
    }
    if (nv.rental > 0 || rv.rental > 0) {
      const newAhead = nv.cashYield >= rv.cashYield;
      verdict += ` On rental yield, ${newAhead ? "Brand New" : "Resale"} comes out ahead at ${Math.max(nv.cashYield, rv.cashYield).toFixed(2)}% vs ${Math.min(nv.cashYield, rv.cashYield).toFixed(2)}%.`;
    }
    text("cmp-verdict", verdict);
  }

  newSide.calculate();
  resaleSide.calculate();

  // ==================== Clear all fields ====================
  document.getElementById("clear-btn").addEventListener("click", () => {
    resetAllSegmented();
    ["in-form", "rs-form"].forEach((formId) => {
      const form = document.getElementById(formId);
      form.reset();
      form.querySelectorAll('input[inputmode="decimal"]').forEach((input) => window.NumberFormat.attach(input));
      form.querySelectorAll("input, select").forEach((input) => input.dispatchEvent(new Event("change", { bubbles: true })));
    });
    newSide.calculate();
    resaleSide.calculate();
  });
})();
