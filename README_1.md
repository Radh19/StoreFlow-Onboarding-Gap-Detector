# StoreFlow AI – Merchant Activation Intelligence Dashboard

**Turns raw onboarding data into evidence-backed, confidence-scored recommendations — cutting the time to spot activation drop-offs from hours of manual analysis to minutes.**
<!-- Replace with your own one-line, outcome-style hook if this metric isn't accurate -->

[**Live Demo**](https://your-deployed-link.vercel.app) · [Dataset](#dataset) · [Tech Stack](#tech-stack)
<!-- Replace with your actual deployed URL (Vercel/Netlify/etc). If not deployed yet, deploying is the single highest-leverage addition you can make here. -->

![Dashboard Hero Screenshot](./screenshots/hero.png)
<!-- Replace with a full-dashboard screenshot, e.g. the Executive Summary tab -->

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
<img width="956" height="435" alt="image" src="https://github.com/user-attachments/assets/fd201b84-6e7b-4710-a744-b6876c15e820" />

- Activation Rate
- Total Merchants
- Worst Channel
- Median Time-to-Launch
- GMV Opportunity

### Funnel Analysis
<img width="944" height="439" alt="image" src="https://github.com/user-attachments/assets/e62b264b-db01-4aab-80f5-7baaaf4b88f3" />


Shows merchant progression through each onboarding step and allows drill-down into root causes for any drop-off.

### Trends & Spikes
![Trends & Spikes](./screenshots/trends-spikes.png)

Tracks weekly activation trends, detects significant anomalies (>35% WoW movement), and supports event annotations for explaining changes.

### Cohort Insights
![Cohort Insights](./screenshots/cohort-insights.png)

Displays evidence-backed AI explanations, confidence levels, evidence signals, and recommended actions for each acquisition channel.

**Example output:**
> **Channel: Referral · Confidence: High (0.87)**
> Activation lags company benchmark by 14% among mobile users in weeks 5–6, correlating with a spike in step-3 (KYC) abandonment. *Recommended action:* simplify KYC document upload flow for mobile before scaling referral spend.

<!-- Replace with a real example pulled from your app's actual output — this is the single fastest way to prove the "AI-powered" claim is real -->

### Opportunity Priority & Benchmarks
![Opportunity Priority & Benchmarks](./screenshots/opportunity-benchmarks.png)

Ranks improvement opportunities based on impact and effort while comparing channel performance against company and industry benchmarks.

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
