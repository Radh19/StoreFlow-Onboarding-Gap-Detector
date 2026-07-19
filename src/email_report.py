"""
email_report.py
Builds the HTML weekly report and sends it via Gmail SMTP.
Credentials are read from environment variables — never hardcode them.
"""

import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

TIER_LABEL = {
    "observed": "✅ Observed pattern",
    "hypothesis": "🟡 AI hypothesis",
    "needs_validation": "🔴 Needs validation",
}


def generate_html_report(insights_df, ai_explanations, spikes=None, dashboard_url=None):
    rows = ""
    for _, row in insights_df.iterrows():
        explanation = ai_explanations.get(row["channel"], {})
        tier_label = TIER_LABEL.get(row.get("evidence_tier"), "")
        rows += f"""
        <tr>
            <td><b>{row['channel']}</b></td>
            <td>{tier_label}</td>
            <td>{row['activation_rate']}%</td>
            <td style='color:#c0392b;font-weight:bold'>{row['biggest_drop_step']}</td>
            <td>{row['drop_percentage']}%</td>
            <td>{explanation.get('fix', 'N/A')}</td>
        </tr>"""

    spike_html = ""
    if spikes:
        spike_items = "".join(
            f"<li><b>{s['channel']}</b>: activation {s['direction']} from "
            f"{s['from']}% to {s['to']}% (week {s['week']}) — investigate deploys, "
            f"pricing changes, or competitor activity.</li>"
            for s in spikes
        )
        spike_html = f"""
        <h3>⚠️ Detected week-over-week anomalies</h3>
        <ul>{spike_items}</ul>
        """

    dashboard_link = (
        f"<p>View the full dashboard: <a href='{dashboard_url}'>StoreFlow Onboarding Dashboard</a></p>"
        if dashboard_url else ""
    )

    return f"""
    <html><body style='font-family:Arial,sans-serif'>
    <h2>🛍️ StoreFlow — Weekly Onboarding Gap Report</h2>
    <p><b>Week of {datetime.now().strftime('%B %d, %Y')}</b></p>
    <p>Onboarding insights by acquisition channel. Evidence tier reflects
       sample size and week-over-week stability — treat "AI hypothesis" and
       "Needs validation" rows as starting points for investigation, not
       settled conclusions.</p>
    <table border='1' cellpadding='10' style='border-collapse:collapse;width:100%'>
        <tr style='background:#f5f5f5'>
            <th>Channel</th><th>Evidence</th><th>Activation Rate</th>
            <th>Biggest Drop Step</th><th>Drop %</th><th>Recommended Fix</th>
        </tr>
        {rows}
    </table>
    {spike_html}
    {dashboard_link}
    <p style='color:gray;font-size:12px'>Auto-generated every Monday by the Onboarding Gap Detector.</p>
    </body></html>
    """


def send_report(html_content, recipient_email):
    sender = os.environ["GMAIL_SENDER"]
    password = os.environ["GMAIL_APP_PASSWORD"]  # Gmail App Password, not the account password

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📊 StoreFlow Onboarding Report — {datetime.now().strftime('%b %d, %Y')}"
    msg["From"] = sender
    msg["To"] = recipient_email
    msg.attach(MIMEText(html_content, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(sender, password)
        server.sendmail(sender, recipient_email, msg.as_string())

    print(f"Report sent to {recipient_email}")
