# StoreFlow AI – Merchant Activation Intelligence Dashboard

**Turns raw onboarding data into evidence-backed, confidence-scored recommendations — cutting the time to spot activation drop-offs from hours of manual analysis to minutes.**
<!-- Replace with your own one-line, outcome-style hook if this metric isn't accurate -->

[Dataset](#dataset) · [Tech Stack](#tech-stack)

<img width="960" height="431" alt="image" src="https://github.com/user-attachments/assets/8e654863-fbf3-441a-8d1e-3a8cd6c4b325" />
<!-- Hero image reused from the Executive Summary screenshot below -->

StoreFlow AI is an AI-powered onboarding analytics dashboard that helps product teams monitor merchant activation, identify onboarding bottlenecks, detect anomalies, prioritize improvement opportunities, and generate evidence-backed AI recommendations.

---

## Problem Statement

Traditional funnel dashboards only show where users drop off. They don't explain why, whether the finding is statistically reliable, or what action should be taken. StoreFlow AI bridges that gap using evidence scoring, anomaly detection, and AI-assisted insights.

---

## Features

| Feature                | Description                                                               |
| ----------------------- | -------------------------------------------------------------------------- |
| Funnel Analytics        | Visualize merchant drop-offs across onboarding stages                     |
| Weekly Trends & Spikes  | Detect unusual activation changes over time                               |
| Cohort Insights         | Explain channel performance using evidence-backed AI                      |
| Opportunity Priority    | Rank improvement opportunities by impact and effort                       |
| Benchmarks              | Compare channels against company and industry targets                     |
| Root Cause Analysis     | Drill down by device and business type                                    |
| Editable Assumptions    | Instantly recalculate opportunity using configurable business assumptions |

---

## Dashboard Walkthrough

### Executive Summary
<img width="960" height="431" alt="image" src="https://github.com/user-attachments/assets/8e654863-fbf3-441a-8d1e-3a8cd6c4b325" />

- Activation Rate
- Total Merchants
- Worst Channel
- Median Time-to-Launch
- GMV Opportunity

### Funnel Analysis
<img width="949" height="427" alt="image" src="https://github.com/user-attachments/assets/365cfa12-6224-4727-884a-be9f12ff0879" />

Shows merchant progression through each onboarding step and allows drill-down into root causes for any drop-off.

### Trends & Spikes
<img width="960" height="436" alt="image" src="https://github.com/user-attachments/assets/939896ec-59ec-4761-8dd3-0fc9946743f8" />

Tracks weekly activation trends, detects significant anomalies (>35% WoW movement), and supports event annotations for explaining changes.

### Cohort Insights
<img width="960" height="440" alt="image" src="https://github.com/user-attachments/assets/eb975793-2e90-432f-bd2b-d113c4a9b706" />

Displays evidence-backed AI explanations, confidence levels, evidence signals, and recommended actions for each acquisition channel.

**Example output:**
> **Referral · Observed pattern · Confidence: High · Evidence: 1/5 signals**
> n = 5,000 · 46.6% drop at *Connect Payment*
>
> **WHY** — A 43% drop-off at the `connect_payment` step suggests merchants in the Referral cohort are struggling with the technical complexity or trust concerns of connecting a payment system.
> **FIX** — Streamline payment onboarding with clear step-by-step instructions and inline support (tooltips, guided tour) at the `connect_payment` step.
> **METRIC** — Track drop-off rate at `connect_payment`, targeting a minimum 15% reduction within 6 weeks.
>
> Median time-to-launch: 6d · Potential lift to target: +0% (~0 merchants, ~$0)


### Evidence signal breakdown:
<img width="924" height="262" alt="image" src="https://github.com/user-attachments/assets/5e4ce8d9-a44b-42cf-941e-9615add5ffe8" />

Every AI claim is backed by a transparent, threshold-based check rather than an opaque model output. For each cohort, five signals are tested against fixed thresholds (sample size, device concentration, first-time seller share, business type concentration, worst-step drop severity), and the confidence tier is only as strong as the number of signals that actually pass.

### Opportunity Priority & Benchmarks
<img width="956" height="416" alt="image" src="https://github.com/user-attachments/assets/2c22109b-3ad1-4818-ba9f-a9745a53ff87" />

Ranks improvement opportunities based on impact and effort while comparing channel performance against company and industry benchmarks.

### Root Cause Analysis
<img width="960" height="431" alt="image" src="https://github.com/user-attachments/assets/f9c199d2-25d4-4963-a1f3-31105df4c1a3" />

Drills into activation and drop-off patterns by device and business type, isolating which segments are driving a given trend or anomaly.

### Editable Assumptions
<img width="960" height="97" alt="image" src="https://github.com/user-attachments/assets/fcc9ef72-8f52-42c9-910f-fa782c369b39" />

Lets you adjust underlying business assumptions (e.g. average order value, conversion targets) and instantly recalculates GMV opportunity across the dashboard.

---

## AI & Analytics Logic

```text
CSV Upload
      ↓
Data Processing
      ↓
Metric Calculation
      ↓
Evidence Signals
      ↓
Evidence Tier
      ↓
AI Recommendation Engine
      ↓
Interactive Dashboard
```

---

## Dataset

The project includes a production-style synthetic dataset containing:

- 20,000 merchant records
- 8 weeks of onboarding activity
- 4 acquisition channels
- 6 onboarding steps
- Device & business type segmentation
- Weekly anomalies for spike detection
- AI-ready fields for cohort analysis

---

## Tech Stack

- React
- TypeScript
- Tailwind CSS
- Recharts
- PapaParse
- Groq API
- Vite

---

## How to Run

```bash
git clone <repo>

npm install

# Add your Groq API key
cp .env.example .env
# then set GROQ_API_KEY=your_key_here in .env

npm run dev
```

> Requires a free [Groq API key](https://console.groq.com) to power the AI recommendation engine. The dashboard's charts and funnel views work without it — only the AI-generated insights need the key.
<!-- Adjust the env var name / setup steps to match how your app actually reads the key -->
