"""
analyze_cohorts.py
Same funnel_for_cohort / find_biggest_drop logic as before, now fed by
warehouse.get_onboarding_data() instead of a hardcoded CSV path, plus the
evidence_tier and spike detection ported from the dashboard preview.
"""

import pandas as pd
from warehouse import get_onboarding_data

STEPS = [
    "signup", "verify_email", "add_store_details",
    "add_first_product", "connect_payment", "store_launched",
]

MIN_SAMPLE_SIZE = 50       # below this: 'needs_validation' regardless of trend
VOLATILITY_THRESHOLD = 0.25  # coefficient of variation above this: 'hypothesis'
SPIKE_THRESHOLD = 0.35       # week-over-week relative change flagged as a spike


def funnel_for_cohort(cohort_df: pd.DataFrame) -> dict:
    total = len(cohort_df)
    rates = {}
    for i, step in enumerate(STEPS):
        completed = (cohort_df["steps_completed"] >= i + 1).sum()
        rates[step] = round(completed / total * 100, 1) if total else 0.0
    return rates


def find_biggest_drop(funnel_rates: dict):
    steps_list = list(funnel_rates.keys())
    values = list(funnel_rates.values())
    drops = {steps_list[i]: values[i - 1] - values[i] for i in range(1, len(values))}
    worst_step = max(drops, key=drops.get)
    return worst_step, round(drops[worst_step], 1)


def evidence_tier(n: int, weekly_rates: list[float]) -> str:
    """
    Mirrors evidenceTier() from the dashboard preview:
    - 'needs_validation': sample too small to trust any explanation
    - 'hypothesis':       enough sample, but week-to-week rate is unstable
    - 'observed':         enough sample AND stable — safe to state with confidence
    """
    if n < MIN_SAMPLE_SIZE:
        return "needs_validation"
    series = pd.Series(weekly_rates)
    mean = series.mean()
    cv = (series.std() / mean) if mean else 0
    if cv > VOLATILITY_THRESHOLD:
        return "hypothesis"
    return "observed"


def detect_spikes(weekly_df: pd.DataFrame) -> list[dict]:
    """
    weekly_df: index = week, columns = channels, values = activation rate.
    Flags any week-over-week move exceeding SPIKE_THRESHOLD (relative).
    """
    spikes = []
    for channel in weekly_df.columns:
        series = weekly_df[channel]
        for i in range(1, len(series)):
            prev, cur = series.iloc[i - 1], series.iloc[i]
            if prev > 0 and abs(cur - prev) / prev > SPIKE_THRESHOLD:
                spikes.append({
                    "channel": channel,
                    "week": series.index[i],
                    "from": round(prev, 1),
                    "to": round(cur, 1),
                    "direction": "drop" if cur < prev else "rise",
                })
    return spikes


def run_cohort_analysis(df: pd.DataFrame = None) -> pd.DataFrame:
    df = df if df is not None else get_onboarding_data()

    weekly = (
        df.groupby(["cohort_week", "channel"])["activated"]
        .mean()
        .mul(100)
        .unstack("channel")
        .sort_index()
    )

    rows = []
    for channel in df["channel"].unique():
        cohort = df[df["channel"] == channel]
        rates = funnel_for_cohort(cohort)
        worst_step, drop_pct = find_biggest_drop(rates)
        weekly_rates = weekly[channel].dropna().tolist() if channel in weekly.columns else []
        tier = evidence_tier(len(cohort), weekly_rates)
        rows.append({
            "channel": channel,
            "n": len(cohort),
            "activation_rate": rates["store_launched"],
            "biggest_drop_step": worst_step,
            "drop_percentage": drop_pct,
            "evidence_tier": tier,
            "median_days_to_activate": cohort["days_to_activate"].dropna().median(),
        })

    insights_df = pd.DataFrame(rows)
    spikes = detect_spikes(weekly)

    return insights_df, spikes


if __name__ == "__main__":
    insights_df, spikes = run_cohort_analysis()
    insights_df.to_csv("data/cohort_insights.csv", index=False)
    print(insights_df)
    print("\nDetected spikes:")
    for s in spikes:
        print(f"  {s['channel']} — {s['direction']} from {s['from']}% to {s['to']}% (week {s['week']})")
