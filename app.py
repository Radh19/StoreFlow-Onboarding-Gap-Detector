"""
app.py
Streamlit dashboard — the production analogue of dashboard-preview/storeflow_dashboard.jsx.
Run: streamlit run app.py
"""

import json
import os
import sys

import pandas as pd
import plotly.express as px
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from warehouse import get_onboarding_data
from analyze_cohorts import run_cohort_analysis, funnel_for_cohort, STEPS

st.set_page_config(page_title="AI Onboarding Gap Detector", layout="wide")
st.title("🛍️ StoreFlow — AI Onboarding Gap Detector")
st.caption("Weekly drop-off analysis powered by AI — auto-generated every Monday")

TIER_STYLE = {
    "observed": ("✅ Observed pattern", "green"),
    "hypothesis": ("🟡 AI hypothesis", "orange"),
    "needs_validation": ("🔴 Needs validation", "red"),
}


@st.cache_data(ttl=3600)
def load_data():
    df = get_onboarding_data()
    insights_df, spikes = run_cohort_analysis(df)
    funnel_rates = {
        channel: funnel_for_cohort(df[df["channel"] == channel])
        for channel in df["channel"].unique()
    }
    explanations_path = "data/ai_explanations.json"
    ai_explanations = {}
    if os.path.exists(explanations_path):
        with open(explanations_path) as f:
            ai_explanations = json.load(f)
    return df, insights_df, spikes, funnel_rates, ai_explanations


df, insights_df, spikes, funnel_rates, ai_explanations = load_data()

# ── TOP METRICS ───────────────────────────────────────────
col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Overall Activation Rate", f"{df['activated'].mean():.1%}")
col2.metric("Total Merchants", f"{len(df):,}")
col3.metric("Worst Channel", insights_df.sort_values("activation_rate").iloc[0]["channel"])
col4.metric("Median Time-to-Launch", f"{df['days_to_activate'].dropna().median():.0f}d")
needs_validation = (insights_df["evidence_tier"] != "observed").sum()
col5.metric("Cohorts Needing Validation", int(needs_validation))

st.divider()

# ── FUNNEL CHART ──────────────────────────────────────────
st.subheader("📉 Onboarding Funnel by Acquisition Channel")

funnel_data = []
for channel in df["channel"].unique():
    cohort = df[df["channel"] == channel]
    for i, step in enumerate(STEPS):
        completed = (cohort["steps_completed"] >= i + 1).sum()
        funnel_data.append({"channel": channel, "step": step, "pct": round(completed / len(cohort) * 100, 1)})

fig1 = px.line(pd.DataFrame(funnel_data), x="step", y="pct", color="channel", markers=True,
               labels={"pct": "% Merchants Remaining", "step": "Onboarding Step"})
st.plotly_chart(fig1, use_container_width=True)

st.divider()

# ── SPIKES ────────────────────────────────────────────────
if spikes:
    st.subheader("⚠️ Detected Week-over-Week Anomalies")
    for s in spikes:
        st.warning(
            f"**{s['channel']}** activation {s['direction']} from {s['from']}% to "
            f"{s['to']}% in week {s['week']} — investigate deploys, pricing, competitor activity."
        )
    st.divider()

# ── AI INSIGHTS PER COHORT ────────────────────────────────
st.subheader("🤖 AI-Generated Insights by Cohort")

for _, row in insights_df.iterrows():
    channel = row["channel"]
    explanation = ai_explanations.get(channel, {})
    tier_label, tier_color = TIER_STYLE.get(row["evidence_tier"], ("", "gray"))

    with st.expander(
        f"**{channel}** — {tier_label} | Activation: {row['activation_rate']}% | "
        f"Drops at: **{row['biggest_drop_step']}** ({row['drop_percentage']}% drop)"
    ):
        col1, col2 = st.columns([1, 2])
        with col1:
            st.metric("Activation Rate", f"{row['activation_rate']}%")
            st.metric("Sample Size (n)", int(row["n"]))
            st.metric("Median Time-to-Launch", f"{row['median_days_to_activate']}d")
            st.markdown(f":{tier_color}[{tier_label}]")
        with col2:
            if row["evidence_tier"] == "needs_validation":
                st.error("Sample size is below the reliability threshold. Treat this as a starting hypothesis only.")
            st.error(f"**🔍 WHY:** {explanation.get('why', 'N/A')}")
            st.success(f"**🔧 FIX:** {explanation.get('fix', 'N/A')}")
            st.info(f"**📏 METRIC:** {explanation.get('metric', 'N/A')}")

st.divider()

# ── SEGMENT BREAKDOWNS ─────────────────────────────────────
col_a, col_b = st.columns(2)

with col_a:
    st.subheader("🏪 Activation Rate by Business Type")
    biz = df.groupby("business_type")["activated"].mean().mul(100).round(1).reset_index()
    fig2 = px.bar(biz.sort_values("activated"), x="business_type", y="activated",
                  color="activated", color_continuous_scale="RdYlGn",
                  labels={"activated": "Activation Rate (%)", "business_type": "Business Type"})
    st.plotly_chart(fig2, use_container_width=True)

with col_b:
    st.subheader("📱 Activation Rate by Device")
    device = df.groupby("device")["activated"].mean().mul(100).round(1).reset_index()
    fig3 = px.bar(device.sort_values("activated"), x="device", y="activated",
                  color="activated", color_continuous_scale="RdYlGn",
                  labels={"activated": "Activation Rate (%)", "device": "Device"})
    st.plotly_chart(fig3, use_container_width=True)
