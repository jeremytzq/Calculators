// Live thousand-separator formatting for numeric text inputs.
// Targets every <input inputmode="decimal"> on the page — the convention every
// calculator on this site already uses for its numeric fields.
(function () {
  const lastValue = new WeakMap();

  function formatInteger(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Strip to at most one leading minus, digits, and one decimal point.
  function clean(raw) {
    const negative = raw.trim().startsWith("-");
    let value = raw.replace(/[^0-9.]/g, "");
    const dot = value.indexOf(".");
    if (dot !== -1) {
      value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, "");
    }
    return (negative ? "-" : "") + value;
  }

  function display(cleaned) {
    if (cleaned === "" || cleaned === "-") return cleaned;
    const negative = cleaned.startsWith("-");
    const unsigned = negative ? cleaned.slice(1) : cleaned;
    const dot = unsigned.indexOf(".");
    let intPart = dot === -1 ? unsigned : unsigned.slice(0, dot);
    const decPart = dot === -1 ? "" : unsigned.slice(dot); // includes the "."
    intPart = intPart.replace(/^0+(?=\d)/, "");
    if (intPart === "" && dot !== -1) intPart = "0";
    return (negative ? "-" : "") + formatInteger(intPart) + decPart;
  }

  function digitsBefore(str, pos) {
    let count = 0;
    for (let i = 0; i < pos && i < str.length; i++) {
      if (str[i] >= "0" && str[i] <= "9") count++;
    }
    return count;
  }

  // Position right after the Nth digit in an integer-part string (commas only —
  // no decimal point involved). Used only for cursor placement left of the dot.
  function positionAfterDigits(str, digitCount) {
    if (digitCount <= 0) {
      let i = 0;
      while (i < str.length && !(str[i] >= "0" && str[i] <= "9")) i++;
      return i;
    }
    let count = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] >= "0" && str[i] <= "9") {
        count++;
        if (count === digitCount) return i + 1;
      }
    }
    return str.length;
  }

  // A lone Backspace/Delete that only removes an auto-inserted separator (comma or
  // decimal point) would otherwise look like a no-op once reformatted, since the
  // separator gets reinserted in the same place. Detect that single-character case
  // via inputType and extend the deletion to the adjacent digit so every keystroke
  // visibly does something.
  function adjustForSeparatorDeletion(raw, cursor, prev, inputType) {
    if (inputType === "deleteContentBackward" && raw.length === prev.length - 1 && cursor > 0) {
      const deletedChar = prev[cursor];
      if (deletedChar && !/[0-9]/.test(deletedChar)) {
        return { raw: prev.slice(0, cursor - 1) + prev.slice(cursor + 1), cursor: cursor - 1 };
      }
    } else if (inputType === "deleteContentForward" && raw.length === prev.length - 1) {
      const deletedChar = prev[cursor];
      if (deletedChar && !/[0-9]/.test(deletedChar)) {
        return { raw: prev.slice(0, cursor) + prev.slice(cursor + 2), cursor };
      }
    }
    return { raw, cursor };
  }

  // Comma-grouping only ever touches the integer part, and never inserts anything
  // into the decimal part — so cursor placement is computed differently on each
  // side of the decimal point: by digit count within the (re-grouped) integer part
  // on the left, or by a plain digit offset from the dot on the right. Mixing the
  // two into one "digits before cursor" count (as a naive approach would) loses
  // track of the decimal point itself and lets typed digits drift into the
  // integer part after the first one following the dot.
  function computeCursor(raw, cursor, formatted) {
    const dotInRaw = raw.indexOf(".");
    if (dotInRaw === -1 || cursor <= dotInRaw) {
      return positionAfterDigits(formatted, digitsBefore(raw, cursor));
    }
    const decDigitsBefore = digitsBefore(raw.slice(dotInRaw + 1), cursor - dotInRaw - 1);
    const dotInFormatted = formatted.indexOf(".");
    return dotInFormatted === -1 ? formatted.length : dotInFormatted + 1 + decDigitsBefore;
  }

  function reformat(input, event) {
    const prev = lastValue.get(input) || "";
    const rawCursor = input.selectionStart;
    const inputType = event && event.inputType;
    const { raw, cursor } = adjustForSeparatorDeletion(input.value, rawCursor, prev, inputType);

    const formatted = display(clean(raw));
    input.value = formatted;
    lastValue.set(input, formatted);

    const pos = computeCursor(raw, cursor, formatted);
    input.setSelectionRange(pos, pos);
  }

  function formatInitial(input) {
    const formatted = display(clean(input.value));
    input.value = formatted;
    lastValue.set(input, formatted);
  }

  function init() {
    document.querySelectorAll('input[inputmode="decimal"]').forEach((input) => {
      formatInitial(input);
      input.addEventListener("input", (event) => reformat(input, event));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
