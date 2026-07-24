"""Relay outbox/claude-brief.txt to Telegram.

Written by Claude (Cowork) on push; this script just ships whatever text
is currently in the file to the existing market bot. Reuses
TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — the same secrets as market_brief.py.
"""

from __future__ import annotations

import os
import sys

import requests

BRIEF_PATH = "outbox/claude-brief.txt"
CHAR_LIMIT = 4000


def main() -> None:
    if not os.path.exists(BRIEF_PATH):
        sys.exit(f"error: {BRIEF_PATH} not found")

    message = open(BRIEF_PATH, encoding="utf-8").read().strip()
    if not message:
        sys.exit("error: brief file is empty")
    if len(message) > CHAR_LIMIT:
        message = message[: CHAR_LIMIT - 3] + "..."

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token:
        sys.exit("error: TELEGRAM_BOT_TOKEN is not set (repo secret).")
    if not chat_id:
        sys.exit("error: TELEGRAM_CHAT_ID is not set (repo secret).")

    print(f"Sending {len(message)} chars to Telegram...")
    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": message},
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
