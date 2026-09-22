"""Render outbox/day-plan.html to PDF and send it to Telegram as a
document (sendDocument), using the same day-plan bot (@vannanabannanabot)
that send_day_plan.py uses for the plain-text version.
"""

from __future__ import annotations

import os
import sys
from datetime import date

import requests
from weasyprint import HTML

HTML_PATH = "outbox/day-plan.html"
PDF_PATH = "outbox/day-plan.pdf"


def main() -> None:
    if not os.path.exists(HTML_PATH):
        sys.exit(f"error: {HTML_PATH} not found")

    token = os.environ.get("VANNA_TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("VANNA_TELEGRAM_CHAT_ID", "").strip()
    if not token:
        sys.exit("error: VANNA_TELEGRAM_BOT_TOKEN is not set (repo secret).")
    if not chat_id:
        sys.exit("error: VANNA_TELEGRAM_CHAT_ID is not set (repo secret).")

    print("Rendering PDF from HTML day plan...")
    HTML(filename=HTML_PATH).write_pdf(PDF_PATH)

    filename = f"Day-Plan-{date.today().isoformat()}.pdf"
    print(f"Sending {filename} to Telegram...")
    with open(PDF_PATH, "rb") as fh:
        response = requests.post(
            f"https://api.telegram.org/bot{token}/sendDocument",
            data={
                "chat_id": chat_id,
                "caption": "Daily plan (PDF)",
            },
            files={"document": (filename, fh, "application/pdf")},
            timeout=60,
        )
    if response.status_code >= 400:
        sys.exit(
            f"error: Telegram rejected the send ({response.status_code}): "
            f"{response.text[:300]}"
        )
    print("Done.")


if __name__ == "__main__":
    main()
