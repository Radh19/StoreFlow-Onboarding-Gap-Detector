# StoreFlow — AI Onboarding Gap Detector

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Streamlit](https://img.shields.io/badge/Streamlit-dashboard-FF4B4B?logo=streamlit&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-Llama%203.3-F55036)
![License](https://img.shields.io/badge/license-MIT-informational)

An AI-assisted analytics tool that detects **where and why merchants drop
off** during e-commerce onboarding, grades its own confidence in every
explanation instead of presenting guesses as facts, and turns funnel
percentages into business-impact numbers (merchants, GMV, priority) that a
PM can actually act on.

Built to demonstrate a full PM-to-production workflow: PRD → data pipeline
→ AI-assisted analysis → interactive dashboard → scheduled reporting.

---

## Table of contents

- [Why this project is different](#why-this-project-is-different)
- [Architecture](#architecture)
- [Features](#features)
- [Quickstart](#quickstart)
  - [Option A — React dashboard (upload your own CSV)](#option-a--react-dashboard-upload-your-own-csv)
  - [Option B — Streamlit production dashboard](#option-b--streamlit-production-dashboard)
- [Repo structure](#repo-structure)
- [Running against a real warehouse](#running-against-a-real-warehouse)
- [Automating the weekly email](#automating-the-weekly-email)
- [Data governance](#data-governance)
- [Honest framing](#honest-framing)
- [License](#license)

---

## Why this project is different

A funnel chart shows *where* merchants drop off. It can't tell you *why*.
Most "AI-powered analytics" tools blur that line — presenting a model's
guess with the same confidence as an actual measurement. This project
tags every AI-generated explanation with one of three evidence tiers:

- **Observed pattern** — enough sample size, stable week over week. Safe to trust.
- **AI hypothesis** — enough sample, but the trend is still volatile. Treat as a lead, not a conclusion.
- **Needs validation** — sample too small to trust *any* explanation yet, AI-written or not.

Every tier is backed by a transparent, clickable breakdown of exactly which
signals passed or failed and why — not a black box.

## Architecture

```
Data source (CSV upload, or a real warehouse in production)
        ↓
Python / JS: clean + segment merchants by channel, business type, device
        ↓
Evidence tiering: is this pattern observed, a hypothesis, or unproven?
        ↓
AI Agent (Groq / Llama 3.3): generate WHY / FIX / METRIC per cohort
        ↓
Interactive dashboard (React or Streamlit) + weekly email report (scheduled)
```

## Features

**Executive layer**
- Auto-generated weekly summary (WoW delta, weakest channel, top abandonment step, GMV opportunity)
- Alerts for detected spikes and low-confidence cohorts, with one click through to a full breakdown
- Editable business assumptions (AOV, target activation, industry benchmark) — never silently hardcoded

**Analysis layer**
- Funnel view with raw counts *and* percentages per step, per channel
- Weekly trend chart with a configurable spike-sensitivity threshold
- Manual annotations (deploys, campaigns, pricing changes) auto-correlated with detected spikes on the same week
- **Contributing Segments** breakdown: real per-segment drop *rates* (not just share of the drop pile), flagging any segment ≥1.5x the average as "Abnormally High" — deliberately not called "root cause," since this is correlation, not proof
- Opportunity Priority table (impact × effort → star rating) for "what should we fix first"
- Benchmarks tab with company average / target / industry reference lines and a legend

**AI layer**
- Live, on-demand AI-generated WHY / FIX / METRIC per cohort via Groq (free tier)
- Every generated explanation is grounded in a clickable **evidence table** — signal, threshold, actual value, pass/fail — so nothing is asserted without a visible basis
- Confidence language in the AI prompt itself matches the evidence tier (a low-confidence cohort gets hedged language, not false certainty)

**Production plumbing**
- CSV upload with flexible column matching (works with real warehouse exports, not just a fixed schema)
- Data source abstraction (`warehouse.py`) — swap between CSV, Snowflake, BigQuery, Postgres via one env var
- Weekly scheduled email report, PII-safe (only aggregates ever leave the pipeline)
- Local AI proxy server so the React dashboard's API key is never exposed in the browser

## Quickstart

### Option A — React dashboard (upload your own CSV)

```bash
# 1. Backend (needed only for the "Generate AI explanations" button)
pip install -r requirements.txt
cp .env.example .env
# get a free key at https://console.groq.com/keys, set GROQ_API_KEY in .env
python src/api_server.py            # http://localhost:8787

# 2. Frontend (separate terminal)
cd dashboard-preview
npm install
npm run dev                          # http://localhost:5173
```

Open the printed URL, drop in a CSV (or click "Template" for the expected
column shape), and the dashboard populates from your real data — no mock
data, no warehouse connection required for this path.

### Option B — Streamlit production dashboard

```bash
pip install -r requirements.txt
cp .env.example .env
# set GROQ_API_KEY (leave DATA_SOURCE=csv for a fully local run)

python src/run_pipeline.py           # generates data if needed, runs
                                      # analysis, calls Groq, saves data/*.csv
streamlit run app.py                 # http://localhost:8501
```

`run_pipeline.py` only generates mock data if `data/onboarding_data.csv`
doesn't already exist. Add `--send-email` to also send the weekly report
(`GMAIL_SENDER` / `GMAIL_APP_PASSWORD` required in `.env`).

## Repo structure

```
storeflow-onboarding-detector/
├── data/                        # generated locally, gitignored
├── src/
│   ├── generate_data.py         # mock data generator (local dev only)
│   ├── warehouse.py             # data source abstraction (csv/snowflake/bigquery/postgres)
│   ├── analyze_cohorts.py       # funnel math, evidence tiers, spike detection
│   ├── ai_agent.py              # Groq API calls for WHY/FIX/METRIC
│   ├── api_server.py            # local proxy so the React dashboard can call Groq safely
│   ├── email_report.py          # HTML report + Gmail send
│   ├── scheduler.py             # wires it all together, runs Monday 8AM
│   └── run_pipeline.py          # one-command local pipeline runner
├── sql/
│   └── onboarding_funnel.sql    # warehouse query, event-log -> wide format
├── dashboard-preview/            # standalone React + Vite app
│   ├── storeflow_dashboard.jsx
│   └── main.jsx / index.html / vite.config.js / package.json
├── docs/
│   ├── PRD.md
│   └── INTERVIEW_GUIDE.md       # KPI-by-KPI walkthrough of every design decision
├── app.py                       # Streamlit production dashboard
├── requirements.txt
├── .env.example
└── .gitignore
```

## Running against a real warehouse

Set `DATA_SOURCE` in `.env` to `snowflake`, `bigquery`, or `postgres` and
fill in the matching credentials (see `.env.example`). No other file needs
to change — every downstream script consumes the same DataFrame shape
regardless of source. `sql/onboarding_funnel.sql` reshapes a realistic
event-log table (the format Segment/Amplitude/RudderStack land in a
warehouse) into the wide format the analysis expects.

## Automating the weekly email

Run `python src/scheduler.py` on a persistent process (a small VM, a
scheduled Cloud Function, or a cron-triggered container). It checks every
minute and fires the full pipeline every Monday at 8AM.

## Data governance

Only aggregated cohort-level statistics (rates, percentages, sample sizes)
are ever sent to the Groq API — never raw merchant IDs, emails, or business
names. See `docs/PRD.md` for the full failure-mode discussion.

## Honest framing

The funnel detection is genuinely data-driven. The AI explanation layer is
a hypothesis generator — a legitimate, valuable PM tool, but one that
should be described as exactly that, not as a proven causal finding. The
evidence-tier system in `analyze_cohorts.py` (and its live, inspectable
counterpart in the dashboard) is what keeps the tool honest about that
difference instead of quietly overstating its own certainty.

## License

MIT — see [LICENSE](LICENSE). Free to use, modify, and build on.
