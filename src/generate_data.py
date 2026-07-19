"""
generate_data.py
Creates data/onboarding_data.csv for local development / DATA_SOURCE=csv.
In production this file is not used — warehouse.py pulls from the real
event log instead. Kept here so the project runs end-to-end with zero
external dependencies out of the box.
"""

import os
import random

import numpy as np
import pandas as pd
from faker import Faker

fake = Faker()
np.random.seed(42)
random.seed(42)

N_USERS = 1000
N_WEEKS = 8

CHANNELS = ["Instagram Ad", "Google Ad", "Organic", "Referral"]
BUSINESS_TYPES = ["Fashion", "Electronics", "Food & Beverage", "Home Decor"]
SELLER_TYPES = ["First-time seller", "Existing business"]
DEVICES = ["Mobile", "Desktop", "Tablet"]

STEPS = [
    "signup", "verify_email", "add_store_details",
    "add_first_product", "connect_payment", "store_launched",
]

# Drop-off probability per step, per channel.
DROP_OFF_RATES = {
    "Instagram Ad": [0.05, 0.25, 0.20, 0.15, 0.45, 0.10],
    "Google Ad":    [0.05, 0.15, 0.15, 0.35, 0.20, 0.08],
    "Organic":      [0.05, 0.10, 0.12, 0.18, 0.15, 0.06],
    "Referral":     [0.05, 0.08, 0.10, 0.12, 0.30, 0.07],
}


def generate():
    rows = []
    uid = 1

    for week in range(N_WEEKS):
        anomaly_week = week == 5  # injected spike for the trend-detector demo
        week_signup_date = fake.date_between(start_date=f"-{(N_WEEKS - week) * 7}d",
                                              end_date=f"-{(N_WEEKS - week - 1) * 7}d")

        for channel in CHANNELS:
            n = random.randint(30, 55)
            for _ in range(n):
                biz_type = random.choice(BUSINESS_TYPES)
                seller_type = random.choice(SELLER_TYPES)
                device = random.choices(DEVICES, weights=[0.55, 0.25, 0.20])[0]

                completed_steps = []
                for j, step in enumerate(STEPS):
                    drop_rate = DROP_OFF_RATES[channel][j]

                    if seller_type == "First-time seller" and step in ("add_first_product", "connect_payment"):
                        drop_rate += 0.10
                    if biz_type == "Food & Beverage" and step == "add_store_details":
                        drop_rate += 0.08
                    if device == "Mobile" and step == "connect_payment":
                        drop_rate += 0.06
                    if anomaly_week and channel == "Google Ad" and step == "add_first_product":
                        drop_rate += 0.28

                    if random.random() > drop_rate:
                        completed_steps.append(step)
                    else:
                        break

                last_step = completed_steps[-1] if completed_steps else "none"
                dropped_at_step = STEPS[len(completed_steps)] if len(completed_steps) < len(STEPS) else None
                activated = "store_launched" in completed_steps
                days_to_activate = (
                    random.randint(1, 7) + (2 if seller_type == "First-time seller" else 0)
                    if activated else None
                )

                rows.append({
                    "user_id": f"SF{uid:05d}",
                    "cohort_week": week_signup_date,
                    "channel": channel,
                    "business_type": biz_type,
                    "seller_type": seller_type,
                    "device": device,
                    "last_completed_step": last_step,
                    "dropped_at_step": dropped_at_step,
                    "steps_completed": len(completed_steps),
                    "activated": int(activated),
                    "days_to_activate": days_to_activate,
                })
                uid += 1

    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = generate()
    os.makedirs("data", exist_ok=True)
    df.to_csv("data/onboarding_data.csv", index=False)
    print(f"Wrote {len(df)} rows to data/onboarding_data.csv")
    print(f"Activation rate: {df['activated'].mean():.1%}")
