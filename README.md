# Calculators

A fast, no-build calculator website. Plain HTML/CSS/JS, deployable anywhere (GitHub Pages, Netlify, or any static host).

## Structure

- `index.html` — home page listing all calculators
- `calculators/` — one HTML page per calculator
- `css/styles.css` — shared design system (light/dark mode)
- `js/theme.js` — dark mode toggle, shared across pages
- `js/<calculator>.js` — logic for each calculator

## Calculators

- **Real Estate ROI Calculator** (`calculators/roi.html`) — cap rate, cash-on-cash return, DSCR, and annualized IRR for a rental property purchase
- **Real Estate ROE Calculator** (`calculators/roe.html`) — return on equity today, plus a year-by-year projection of how it trends as appreciation and loan paydown build equity
- **Investment Comparison Calculator** (`calculators/comparison.html`) — compares the same capital deployed into residential property, industrial property, financial vehicles, and crypto, with per-asset leverage, income, fees, and growth assumptions
- **Compound Interest Calculator** (`calculators/compound-interest.html`) — principal plus regular contributions compounded at any frequency, with a year-by-year stacked chart of contributions vs. interest earned

All planned calculators from the home page are now built.

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
