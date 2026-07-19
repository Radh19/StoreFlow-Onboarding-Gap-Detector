"""
run_pipeline.py
One command to run the whole thing locally:
  1. Generate mock data if data/onboarding_data.csv doesn't exist yet
  2. Run cohort analysis (funnel rates, evidence tiers, spike detection)
  3. Call the Groq API for WHY/FIX/METRIC per cohort
  4. Save data/cohort_insights.csv and data/ai_explanations.json
     (these are what app.py reads)

Usage:
    python src/run_pipeline.py
    python src/run_pipeline.py --send-email    # also emails the report
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv

load_dotenv()

from warehouse import get_onboarding_data
from analyze_cohorts import run_cohort_analysis, funnel_for_cohort
from ai_agent import generate_all_explanations


def main(send_email: bool = False):
    if not os.path.exists("data/onboarding_data.csv") and os.environ.get("DATA_SOURCE", "csv") == "csv":
        print("No local data found — generating mock data first...")
        from generate_data import generate
        os.makedirs("data", exist_ok=True)
        generate().to_csv("data/onboarding_data.csv", index=False)

    print("Loading data...")
    df = get_onboarding_data()
    print(f"  {len(df)} rows loaded.")

    print("Running cohort analysis...")
    insights_df, spikes = run_cohort_analysis(df)
    os.makedirs("data", exist_ok=True)
    insights_df.to_csv("data/cohort_insights.csv", index=False)
    print(insights_df.to_string(index=False))

    if spikes:
        print("\nDetected spikes:")
        for s in spikes:
            print(f"  {s['channel']} — {s['direction']} from {s['from']}% to {s['to']}% (week {s['week']})")

    print("\nCalling Groq API for cohort explanations...")
    funnel_rates_by_channel = {
        channel: funnel_for_cohort(df[df["channel"] == channel])
        for channel in df["channel"].unique()
    }
    ai_explanations = generate_all_explanations(insights_df, funnel_rates_by_channel)

    with open("data/ai_explanations.json", "w") as f:
        json.dump(ai_explanations, f, indent=2)
    print("Saved data/ai_explanations.json")

    for channel, exp in ai_explanations.items():
        print(f"\n{channel}:")
        print(f"  WHY:    {exp.get('why')}")
        print(f"  FIX:    {exp.get('fix')}")
        print(f"  METRIC: {exp.get('metric')}")

    if send_email:
        print("\nSending email report...")
        from email_report import generate_html_report, send_report
        dashboard_url = os.environ.get("DASHBOARD_URL")
        recipient = os.environ.get("REPORT_RECIPIENT", "pm@storeflow.com")
        html = generate_html_report(insights_df, ai_explanations, spikes, dashboard_url)
        send_report(html, recipient)

    print("\nDone. Run `streamlit run app.py` to view the dashboard.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--send-email", action="store_true", help="Also send the email report")
    args = parser.parse_args()
    main(send_email=args.send_email)
