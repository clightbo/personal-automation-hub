"""Render outbox/claude-brief.html to PDF and send it to Telegram as a
document (sendDocument), using the same market bot as the text relay.
"""

from __future__ import annotations

import os
import sys
from datetime import date

import requests
from weasyprint import HTML

HTML_PATH = "outbox/claude-brief.html"
PDF_PATH = "outbox/claude-brief.pdf"


def main() -> None:
    if not os.path.exists(HTML_PATH):
        sys.exit(f"error: {HTML_PATH} not found")

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token:
        sys.exit("error: TELEGRAM_BOT_TOKEN is not set (repo secret).")
    if not chat_id:
        sys.exit("error: TELEGRAM_CHAT_ID is not set (repo secret).")

    print("Rendering PDF from HTML brief...")
    HTML(filename=HTML_PATH).write_pdf(PDF_PATH)

    filename = f"Market-Brief-{date.today().isoformat()}.pdf"
    print(f"Sending {filename} to Telegram...")
    with open(PDF_PATH, "rb") as fh:
        response = requests.post(
            f"https://api.telegram.org/bot{token}/sendDocument",
            data={
                "chat_id": chat_id,
                "caption": "Daily market brief (PDF) — Claude (Cowork)",
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
