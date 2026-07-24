"""Send an arbitrary Telegram message (for Claude / manual dispatch).

Environment:
    TELEGRAM_BOT_TOKEN   Market / main bot token
    TELEGRAM_CHAT_ID     Your chat id
    MESSAGE              Text to send (required)
"""

from __future__ import annotations

import os
import sys

from market_summary import send_telegram

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

    print(f"Sending {len(message)} chars to Telegram...")
    send_telegram(message)
    print("Done.")


if __name__ == "__main__":
    main()
