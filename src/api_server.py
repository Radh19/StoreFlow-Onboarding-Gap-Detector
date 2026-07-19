"""
api_server.py
A minimal local backend so the standalone dashboard-preview React app can
get live AI explanations without ever putting an API key in the browser.

Why this exists: a browser can never safely hold a real API key — anyone
could open devtools and steal it. This server holds the Groq API key
(from .env) server-side, and the dashboard calls this endpoint instead of
calling any AI provider directly.

Run:
    python src/api_server.py
Then in another terminal:
    cd dashboard-preview && npm run dev

The dashboard calls http://localhost:8787/api/cohort-explanation.
"""

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

from ai_agent import generate_cohort_explanation, parse_explanation  # noqa: E402

app = Flask(__name__)
# Restrict to the Vite dev server origin. Add your production frontend's
# origin here too once this is deployed somewhere real.
CORS(app, origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
])


@app.route("/api/cohort-explanation", methods=["POST"])
def cohort_explanation():
    body = request.get_json(force=True) or {}
    required = ["channel", "n", "activationRate", "dropStep", "dropPct", "tier", "evidenceBullets"]
    missing = [f for f in required if f not in body]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        raw = generate_cohort_explanation(
            channel=body["channel"],
            n=body["n"],
            activation_rate=body["activationRate"],
            biggest_drop_step=body["dropStep"],
            drop_pct=body["dropPct"],
            funnel_rates={},  # not needed for the explanation prompt itself
            evidence_tier=body["tier"],
        )
        parsed = parse_explanation(raw)
        if not all(k in parsed for k in ("why", "fix", "metric")):
            return jsonify({"error": "Model response didn't include why/fix/metric", "raw": raw}), 502
        return jsonify(parsed)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "has_api_key": bool(os.environ.get("GROQ_API_KEY"))})


if __name__ == "__main__":
    if not os.environ.get("GROQ_API_KEY"):
        print("WARNING: GROQ_API_KEY is not set in your .env — /api/cohort-explanation will fail.")
        print("Get a free key at https://console.groq.com/keys")
    app.run(port=8787, debug=True)
