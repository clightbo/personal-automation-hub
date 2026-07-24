"""Send an arbitrary Telegram message (for Claude / manual dispatch).

Environment:
    TELEGRAM_BOT_TOKEN   Market / main bot token
    TELEGRAM_CHAT_ID     Your chat id
    MESSAGE              Text to send (required)
"""

from __future__ import annotations

import os
import sys

import requests

MESSAGE_CHAR_LIMIT = 4000


def main() -> None:
    message = (os.environ.get("MESSAGE") or "").strip()
    if not message:
        sys.exit(
            "error: MESSAGE is empty. Pass text via the workflow input "
            "or MESSAGE env var."
        )
    if len(message) > MESSAGE_CHAR_LIMIT:
        message = message[: MESSAGE_CHAR_LIMIT - 3] + "..."

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip().removeprefix("bot")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if ":" not in token and ":" in chat_id:
        token, chat_id = chat_id, token
    if ":" not in token:
        sys.exit("error: TELEGRAM_BOT_TOKEN doesn't look like a bot token.")
    if not chat_id.lstrip("-").isdigit():
        sys.exit("error: TELEGRAM_CHAT_ID doesn't look like a chat id.")

    print(f"Sending {len(message)} chars to Telegram...")
    response = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": message},
        timeout=30,
    )
    if response.status_code >= 400:
        sys.exit(f"error: Telegram rejected the send ({response.status_code}): "
                 f"{response.text[:300]}")
    print("Done.")


if __name__ == "__main__":
    main()
