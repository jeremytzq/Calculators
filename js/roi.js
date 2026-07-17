(function () {
  const initialInput = document.getElementById("initial");
  const finalInput = document.getElementById("final");
  const yearsInput = document.getElementById("years");
  const results = document.getElementById("results");
  const outRoi = document.getElementById("out-roi");
  const outProfit = document.getElementById("out-profit");
  const outCagr = document.getElementById("out-cagr");
  const tileCagr = document.getElementById("tile-cagr");

  const currencyFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

  function formatPercent(value) {
    return (value >= 0 ? "+" : "") + value.toFixed(2) + "%";
  }

  function setSign(el, value) {
    el.classList.remove("positive", "negative");
    if (value > 0) el.classList.add("positive");
    if (value < 0) el.classList.add("negative");
  }

  function calculate() {
    const initial = parseFloat(initialInput.value);
    const final = parseFloat(finalInput.value);
    const years = parseFloat(yearsInput.value);

    if (!isFinite(initial) || !isFinite(final) || initial <= 0) {
      results.hidden = true;
      return;
    }

    const profit = final - initial;
    const roi = (profit / initial) * 100;

    outRoi.textContent = formatPercent(roi);
    setSign(outRoi, roi);

    outProfit.textContent = (profit >= 0 ? "+" : "-") + currencyFmt.format(Math.abs(profit));
    setSign(outProfit, profit);

    if (isFinite(years) && years > 0 && final >= 0) {
      const cagr = (Math.pow(final / initial, 1 / years) - 1) * 100;
      outCagr.textContent = formatPercent(cagr);
      setSign(outCagr, cagr);
      tileCagr.hidden = false;
    } else {
      tileCagr.hidden = true;
    }

    results.hidden = false;
  }

  [initialInput, finalInput, yearsInput].forEach((el) => {
    el.addEventListener("input", calculate);
  });

  document.getElementById("roi-form").addEventListener("submit", (e) => e.preventDefault());
})();
