# Penny

A private, local-first budget tracker. No accounts, no servers, no subscriptions — your data stays in your browser.

**[Live demo →](https://t2lv-compute.github.io/penny/)**

---

## Built by Claude

This project was designed and written entirely by [Claude](https://claude.ai) (Anthropic's AI assistant) across a single conversation. The human contributor provided a brief and a GitHub repository — no code, design decisions, or architecture came from a human hand.

The app concept, feature set, visual design, data model, and all three source files were chosen and authored by the AI. It exists as a real-world example of what fully AI-driven software development looks like.

---

## Features

- **Expense logging** — add transactions by amount, date, category, and note
- **Category budgets** — set monthly limits per category with colour-coded progress bars
- **Daily Budget card** — see exactly how much you can spend per day to stay on track
- **Spending breakdown** — donut chart showing where your money goes
- **6-month trend** — bar chart of your spending history
- **Savings goals** — track progress with a one-click deposit button
- **Edit & delete transactions** — fix mistakes without losing your history
- **Dark mode** — full dark theme, persisted across sessions
- **CSV export** — download all your data at any time
- **Custom categories** — add your own with a custom name
- **Configurable billing cycle** — set the day your month starts (e.g. the 15th)

## Privacy

Everything is stored in your browser's `localStorage`. No data is ever sent anywhere. Clearing your browser data will erase it, so use the CSV export to back up regularly.

## Usage

Open `index.html` in any modern browser — or visit the live demo above. No installation, no build step.

### Running locally

```bash
git clone https://github.com/t2lv-compute/penny.git
cd penny
# Open index.html in your browser
```

### GitHub Pages

The app is already configured for GitHub Pages. Fork the repo, enable Pages under **Settings → Pages → Deploy from branch → `main` / `/ (root)`**, and it will be live at `https://<your-username>.github.io/penny/`.

## Tech

Vanilla HTML, CSS, and JavaScript. No framework, no build step, no dependencies beyond [Chart.js](https://www.chartjs.org/) loaded from CDN.
