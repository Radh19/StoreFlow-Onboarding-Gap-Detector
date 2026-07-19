"""
ai_agent.py
Generates WHY/FIX/METRIC per cohort using Groq's free-tier LLM API
(OpenAI-compatible chat completions, running open models like Llama 3.3).
Only aggregated cohort-level stats are sent — never raw merchant records,
emails, or business names. This matters once the input is a real warehouse
table with PII in it.

Get a free API key at https://console.groq.com/keys
"""

import json
import os

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
# Free-tier Groq model. Swap via GROQ_MODEL env var if you want a different
# one (see https://console.groq.com/docs/models for current options).
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

TIER_INSTRUCTION = {
    "observed": "State the explanation with reasonable confidence — the pattern is backed by sufficient sample size and is stable week over week.",
    "hypothesis": "Frame the explanation explicitly as a hypothesis to test — the sample is adequate but the trend has been volatile week over week.",
    "needs_validation": "Frame the explanation as a low-confidence guess only. Explicitly state that sample size is too small to draw a reliable conclusion, and that this needs qualitative validation (exit survey, session recordings) before acting on it.",
}


def generate_cohort_explanation(channel, n, activation_rate, biggest_drop_step,
                                 drop_pct, funnel_rates, evidence_tier):
    prompt = f"""
You are an expert product analyst reviewing onboarding data for StoreFlow,
a SaaS e-commerce platform that helps small businesses launch online stores.

Cohort: Merchants acquired via {channel}
Sample size: {n} merchants
Evidence tier: {evidence_tier}
Activation rate: {activation_rate}%
Funnel performance: {json.dumps(funnel_rates, indent=2)}
Biggest drop-off: {drop_pct}% of merchants drop at the '{biggest_drop_step}' step

Confidence instruction: {TIER_INSTRUCTION[evidence_tier]}

Based on this data, provide:
1. A 2-sentence explanation of WHY this cohort drops at this step
2. One specific, actionable product fix
3. A measurable success metric to track if the fix worked

Format your response exactly like this, with no other text before or after:
WHY: [explanation]
FIX: [recommendation]
METRIC: [success metric]
"""
    completion = client.chat.completions.create(
        model=GROQ_MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return completion.choices[0].message.content


def parse_explanation(text: str) -> dict:
    result = {}
    for line in text.strip().split("\n"):
        if line.startswith("WHY:"):
            result["why"] = line.replace("WHY:", "").strip()
        elif line.startswith("FIX:"):
            result["fix"] = line.replace("FIX:", "").strip()
        elif line.startswith("METRIC:"):
            result["metric"] = line.replace("METRIC:", "").strip()
    return result


def generate_all_explanations(insights_df, funnel_rates_by_channel: dict) -> dict:
    explanations = {}
    for _, row in insights_df.iterrows():
        raw = generate_cohort_explanation(
            channel=row["channel"],
            n=row["n"],
            activation_rate=row["activation_rate"],
            biggest_drop_step=row["biggest_drop_step"],
            drop_pct=row["drop_percentage"],
            funnel_rates=funnel_rates_by_channel[row["channel"]],
            evidence_tier=row["evidence_tier"],
        )
        explanations[row["channel"]] = parse_explanation(raw)
    return explanations
