# Calculators

A fast, no-build calculator website. Plain HTML/CSS/JS, deployable anywhere (GitHub Pages, Netlify, or any static host).

## Structure

- `index.html` — home page listing all calculators
- `calculators/` — one HTML page per calculator
- `css/styles.css` — shared design system (light/dark mode)
- `js/theme.js` — dark mode toggle, shared across pages
- `js/<calculator>.js` — logic for each calculator

## Calculators

- **ROI Calculator** (`calculators/roi.html`) — return on investment, net profit, annualized (CAGR) return

More (ROE, capital appreciation simulator, compound interest) are planned — see the "Coming soon" cards on the home page.

## Running locally

No build step needed. From the project root:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Adding a new calculator

1. Add a new HTML page in `calculators/`, copying the structure of `calculators/roi.html`.
2. Add its logic in a new `js/<name>.js` file.
3. Add a card for it on `index.html` (or un-disable an existing "Coming soon" card).
