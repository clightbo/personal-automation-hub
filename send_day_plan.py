"""Send outbox/day-plan.txt to Telegram as a plain text message, using the
Vanna bot (@vannanabannanabot) — separate from the market-brief bot.
"""

from __future__ import annotations

import os
import sys

import requests

TEXT_PATH = "outbox/day-plan.txt"


def main() -> None:
    if not os.path.exists(TEXT_PATH):
        sys.exit(f"error: {TEXT_PATH} not found")

    token = os.environ.get("VANNA_TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("VANNA_TELEGRAM_CHAT_ID", "").strip()
    if not token:
        sys.exit("error: VANNA_TELEGRAM_BOT_TOKEN is not set (repo secret).")
    if not chat_id:
        sys.exit("error: VANNA_TELEGRAM_CHAT_ID is not set (repo secret).")

    with open(TEXT_PATH, "r", encoding="utf-8") as fh:
        text = fh.read()

    print("Sending day plan to Telegram...")
    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
        timeout=30,
    )
    if response.status_code >= 400:
        sys.exit(
            f"error: Telegram rejected the send ({response.status_code}): "
            f"{response.text[:300]}"
        )
    print("Done.")


if __name__ == "__main__":
    main()
