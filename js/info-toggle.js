// Wires up every "i" info button: .info-btn[aria-controls] shows/hides the panel it
// points at. Panels stay inline (rather than floating tooltips) so long formulas wrap
// and read fine on narrow screens.
(function () {
  function setOpen(btn, open) {
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    if (!panel) return;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
  }

  document.querySelectorAll(".info-btn[aria-controls]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setOpen(btn, btn.getAttribute("aria-expanded") !== "true");
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
        setOpen(btn, false);
      }
    });
  });
})();
