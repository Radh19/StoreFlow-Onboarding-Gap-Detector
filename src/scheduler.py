"""
scheduler.py
Runs the full weekly pipeline: pull data -> analyze cohorts -> generate
AI explanations -> email the report. Scheduled for Monday 8AM.
"""

import os
import time

import schedule

from warehouse import get_onboarding_data
from analyze_cohorts import run_cohort_analysis, STEPS, funnel_for_cohort
from ai_agent import generate_all_explanations
from email_report import generate_html_report, send_report

RECIPIENT_EMAIL = os.environ.get("REPORT_RECIPIENT", "pm@storeflow.com")
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "https://storeflow-onboarding-detector.streamlit.app")


def run_full_pipeline():
    print("Running weekly onboarding pipeline...")

    df = get_onboarding_data()
    insights_df, spikes = run_cohort_analysis(df)

    funnel_rates_by_channel = {
        channel: funnel_for_cohort(df[df["channel"] == channel])
        for channel in df["channel"].unique()
    }

    ai_explanations = generate_all_explanations(insights_df, funnel_rates_by_channel)

    html = generate_html_report(insights_df, ai_explanations, spikes, DASHBOARD_URL)
    send_report(html, RECIPIENT_EMAIL)

    print("Pipeline complete.")


if __name__ == "__main__":
    schedule.every().monday.at("08:00").do(run_full_pipeline)
    print("Scheduler running — waiting for Monday 8AM...")
    while True:
        schedule.run_pending()
        time.sleep(60)
