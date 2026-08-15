// Color-codes the labeled parts of a calculator (".panel-section" input groups and
// ".results-section" output groups) so the eye can tell them apart at a glance — a colored
// square next to each heading plus a matching tinted divider above it, cycling through the
// --hue-0..5 custom properties defined in styles.css.
//
// Counts each section's position among same-class siblings within its own parent (not a
// flat document-order count) so numbering restarts naturally per form/panel instead of
// drifting continuously across unrelated calculators sharing the page, and stays correct
// even when other markup (summary bars, dividers) sits between sections in the same parent.
(function () {
  const HUE_COUNT = 6;

  function applyTones(selector) {
    const byParent = new Map();
    document.querySelectorAll(selector).forEach((section) => {
      const parent = section.parentElement;
      const index = byParent.get(parent) || 0;
      section.style.setProperty("--section-hue", `var(--hue-${index % HUE_COUNT})`);
      byParent.set(parent, index + 1);
    });
  }

  function run() {
    applyTones(".panel-section");
    applyTones(".results-section");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
