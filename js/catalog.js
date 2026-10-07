// Property-type filter for the home page. The decision groups stay put;
// this only hides cards that belong to the other sector. Savings tools
// (data-sector="general" or "both") stay visible in every view.
(function () {
  const buttons = document.querySelectorAll(".sector-filter button");
  const cards = document.querySelectorAll(".calc-card[data-sector]");
  const groups = document.querySelectorAll(".catalog-group");
  const navLinks = document.querySelectorAll(".catalog-nav a");

  function apply(sector) {
    buttons.forEach((btn) => {
      const on = btn.dataset.sector === sector;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });

    cards.forEach((card) => {
      const cardSector = card.dataset.sector;
      const show =
        sector === "all" ||
        cardSector === sector ||
        cardSector === "both" ||
        cardSector === "general";
      card.hidden = !show;
    });

    groups.forEach((group) => {
      const visible = group.querySelectorAll(".calc-card:not([hidden])").length;
      group.hidden = visible === 0;
      const count = group.querySelector(".catalog-count");
      if (count) count.textContent = visible + (visible === 1 ? " tool" : " tools");
    });

    navLinks.forEach((link) => {
      const id = (link.getAttribute("href") || "").replace("#", "");
      const group = document.getElementById(id);
      link.hidden = !group || group.hidden;
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => apply(btn.dataset.sector));
  });

  apply("all");
})();
