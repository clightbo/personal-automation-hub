#!/usr/bin/env python3
"""
Daily Market Brief -> Telegram, modeled on the "daily-market-brief" PDF layout:

    Daily Market Brief — <date> · pre-market · <RISK-ON/OFF regime line>
    MARKET SNAPSHOT       (US + international indices, 10Y, Brent, gold, BTC)
    TOP 3 THINGS THAT MATTER TODAY   (each with a "Why it matters:")
    ON THE CALENDAR TODAY (DATA / EARNINGS / WATCH)
    ONE THING TO SOUND SMART ABOUT   (mini deep-dive)
    LEARNING NUGGET       (tied to today's news)

Numbers, econ calendar, and earnings come from live feeds (Yahoo, ForexFactory,
Nasdaq); the narrative sections are written by an LLM via GitHub Models from
~40 fresh headlines. Deterministic fallback keeps the brief arriving if the
LLM is unavailable.

Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
Env (optional): WATCHLIST, LLM_MODEL, GITHUB_TOKEN, DRY_RUN=1.
"""

import html
import os
import re
import sys
import time
import datetime
import urllib.parse
import requests

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
WATCHLIST = [t.strip().upper() for t in os.environ.get("WATCHLIST", "AAPL,NVDA,MSFT").split(",") if t.strip()]
LLM_MODEL = os.environ.get("LLM_MODEL") or "openai/gpt-4o"

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MarketBrief/1.0)"}

# (symbol, label, is_dollar)
MARKETS = [
    ("^GSPC", "S&P 500", False),
    ("^IXIC", "Nasdaq", False),
    ("^DJI", "Dow Jones", False),
    ("^TNX", "10-Yr Treasury", False),
    ("BZ=F", "Brent Crude", True),
    ("GC=F", "Gold", True),
    ("BTC-USD", "Bitcoin", True),
    ("^N225", "Nikkei 225", False),
    ("^HSI", "Hang Seng", False),
    ("^FTSE", "FTSE 100", False),
]

ECON_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
EARNINGS_URL = "https://api.nasdaq.com/api/calendar/earnings"

RSS_FEEDS = {
    "CNBC Markets": "https://www.cnbc.com/id/20910258/device/rss/rss.html",
    "CNBC World": "https://www.cnbc.com/id/100727362/device/rss/rss.html",
    "CNBC Deals": "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    "MarketWatch": "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    "Yahoo Finance": "https://finance.yahoo.com/news/rssindex",
}
MAX_HEADLINES = 40

FALLBACK_NUGGETS = [
    "Duration: how sensitive a price is to interest-rate moves. Long bonds and high-growth tech fall hardest when yields rise.",
    "Free cash flow: cash left after operations and capex. It's what actually pays dividends and buybacks.",
    "The yield curve: when short Treasury yields exceed long ones (inversion), a recession has often followed.",
    "Beta: how much a stock moves relative to the market. Beta > 1 swings harder than the index, both ways.",
    "Multiple expansion: a stock rising because investors pay a higher P/E, not because earnings grew.",
]


# ------------------------------------------------------------------ quotes

def fetch_quote(symbol):
    """Return (price, day_pct, range_flag) using 1y of daily closes."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=1y&interval=1d"
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    closes = [c for c in res["indicators"]["quote"][0]["close"] if c is not None]
    if len(closes) < 2:
        raise ValueError("not enough data")
    price, prev = closes[-1], closes[-2]
    pct = (price - prev) / prev * 100
    hi, lo = max(closes), min(closes)
    flag = ""
    if price >= hi * 0.995:
        flag = "near 52-wk high"
    elif price <= lo * 1.005:
        flag = "near 52-wk low"
    return price, pct, flag


def get(symbol):
    try:
        return fetch_quote(symbol)
    except Exception as exc:
        print(f"warning: quote failed for {symbol}: {exc}", file=sys.stderr)
        return None, None, ""


def snapshot_line(label, symbol, price, pct, flag, dollar):
    if price is None:
        return f"{label}: n/a"
    if symbol == "^TNX":
        val = price / 10.0 if price > 20 else price
        base = f"{label}: {val:.2f}%"
    else:
        p = f"${price:,.2f}" if dollar else f"{price:,.2f}"
        dot = "\U0001F7E2" if (pct or 0) >= 0 else "\U0001F534"
        base = f"{label}: {p} {dot} {pct:+.2f}%"
    return f"{base} — {flag}" if flag else base


# --------------------------------------------------------- calendar feeds

def fetch_econ_calendar():
    try:
        events = requests.get(ECON_CALENDAR_URL, headers=HEADERS, timeout=30).json()
    except Exception as exc:
        print(f"warning: econ calendar failed: {exc}", file=sys.stderr)
        return []
    today_et = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=-4))).strftime("%Y-%m-%d")
    lines = []
    for ev in events:
        if ev.get("country") != "USD" or not ev.get("date", "").startswith(today_et):
            continue
        title, impact = ev.get("title", ""), ev.get("impact", "")
        fed_related = "fed" in title.lower() or "fomc" in title.lower()
        if impact not in ("High", "Medium") and not fed_related:
            continue
        details = f" (consensus {ev['forecast']}, prev {ev.get('previous', '?')})" if ev.get("forecast") else ""
        lines.append(f"{ev['date'][11:16]} ET [{impact}] {title}{details}")
    return lines


def fetch_earnings():
    """Today's notable earnings from Nasdaq's calendar (biggest by market cap)."""
    today = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=-4))).strftime("%Y-%m-%d")
    try:
        r = requests.get(
            EARNINGS_URL, params={"date": today},
            headers={**HEADERS, "Accept": "application/json"}, timeout=30,
        )
        rows = (r.json().get("data") or {}).get("rows") or []
    except Exception as exc:
        print(f"warning: earnings calendar failed: {exc}", file=sys.stderr)
        return []

    def cap(row):
        digits = re.sub(r"[^\d]", "", row.get("marketCap") or "")
        return int(digits) if digits else 0

    rows.sort(key=cap, reverse=True)
    out = []
    for row in rows[:8]:
        sym = row.get("symbol", "?")
        eps = row.get("epsForecast") or ""
        when = {"time-pre-market": "AM", "time-after-hours": "PM"}.get(row.get("time", ""), "")
        piece = sym + (f" (est {eps})" if eps else "") + (f" {when}" if when else "")
        out.append(piece)
    return out


def fetch_headlines():
    try:
        import feedparser
    except ImportError:
        return []
    cutoff = time.time() - 24 * 3600
    headlines, seen = [], set()
    for source, url in RSS_FEEDS.items():
        try:
            feed = feedparser.parse(url)
        except Exception:
            continue
        for entry in feed.entries[:25]:
            title = entry.get("title", "").strip()
            published = entry.get("published_parsed") or entry.get("updated_parsed")
            if not title or title.lower() in seen:
                continue
            if published and time.mktime(published) < cutoff:
                continue
            seen.add(title.lower())
            headlines.append(f"[{source}] {title}")
    return headlines[:MAX_HEADLINES]


# ---------------------------------------------------------------- the LLM

MARKERS = ["REGIME", "TOP3", "WATCH", "SOUNDSMART", "NUGGET"]


def llm_narrative(snapshot_text, econ_lines, earnings, headlines, watchlist_text):
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return None
    briefing = (
        f"Market snapshot:\n{snapshot_text}\n\n"
        f"Owner's watchlist moves:\n{watchlist_text}\n\n"
        "Today's US economic calendar:\n"
        + ("\n".join(econ_lines) if econ_lines else "(nothing scheduled)")
        + "\n\nToday's notable earnings:\n"
        + (", ".join(earnings) if earnings else "(none found)")
        + "\n\nHeadlines from the last 24 hours:\n"
        + ("\n".join(headlines) if headlines else "(none)")
    )
    system_prompt = (
        "You write the narrative for a pre-market briefing aimed at a young "
        "day trader. Plain text only, no markdown. Output EXACTLY these five "
        "blocks, each starting with its marker on its own line:\n"
        "REGIME: one line, 'RISK-ON:' or 'RISK-OFF:' or 'MIXED:' plus a "
        "3-8 word reason (e.g. 'RISK-OFF: AI capex jitters + oil shock').\n"
        "TOP3: the three things that matter most today, numbered 1. 2. 3. — "
        "each a bold-worthy one-line title, then 1-2 sentences, then "
        "'Why it matters:' and 1-2 sentences connecting it to positioning. "
        "Reference specific tickers, numbers, and moves from the data.\n"
        "WATCH: 1-2 lines on what's coming (next Fed meeting, key data or "
        "earnings in the days ahead) inferred from the calendar and headlines.\n"
        "SOUNDSMART: a mini deep-dive (4-6 sentences) on ONE theme from "
        "today's news that makes the reader sound smart — start with a "
        "punchy one-line thesis, then explain with specific numbers.\n"
        "NUGGET: one finance concept (2-3 sentences) explained simply and "
        "explicitly tied to something in today's news.\n"
        "Total under 2400 characters. Terse, specific, no filler."
    )
    try:
        response = requests.post(
            "https://models.github.ai/inference/chat/completions",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "model": LLM_MODEL,
                "max_tokens": 1100,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": briefing},
                ],
            },
            timeout=90,
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        print(f"warning: LLM failed: {exc}", file=sys.stderr)
        return None

    sections = {}
    current = None
    for line in text.splitlines():
        match = re.match(r"^\s*(REGIME|TOP3|WATCH|SOUNDSMART|NUGGET)\s*:?\s*(.*)", line)
        if match:
            current = match.group(1)
            sections[current] = [match.group(2)] if match.group(2) else []
        elif current:
            sections[current].append(line)
    parsed = {k: "\n".join(v).strip() for k, v in sections.items() if v}
    return parsed if "TOP3" in parsed else None


# -------------------------------------------------------------------- main

def esc(text):
    return html.escape(text, quote=False)


def main():
    dry_run = os.environ.get("DRY_RUN") == "1"
    if not dry_run and (not BOT_TOKEN or not CHAT_ID):
        sys.exit("ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set.")

    today = datetime.date.today()

    print("Fetching market snapshot...")
    quotes = {sym: get(sym) for sym, _, _ in MARKETS}
    watch_quotes = {sym: get(sym) for sym in WATCHLIST}

    print("Fetching calendars and headlines...")
    econ_lines = fetch_econ_calendar()
    earnings = fetch_earnings()
    headlines = fetch_headlines()
    print(f"Got {len(econ_lines)} econ events, {len(earnings)} earnings, "
          f"{len(headlines)} headlines.")

    snapshot_lines = [
        snapshot_line(label, sym, *quotes[sym], dollar)
        for sym, label, dollar in MARKETS
    ]
    watchlist_text = "\n".join(
        f"{sym}: {q[0]:,.2f} ({q[1]:+.2f}%)" if q[0] is not None else f"{sym}: n/a"
        for sym, q in watch_quotes.items()
    )

    print(f"Writing narrative with {LLM_MODEL}...")
    ai = llm_narrative("\n".join(snapshot_lines), econ_lines, earnings,
                       headlines, watchlist_text)

    L = []
    regime = esc(ai["REGIME"]) if ai and ai.get("REGIME") else ""
    L.append("\U0001F4CA <b>Daily Market Brief</b>")
    L.append(f"<i>{today.strftime('%A, %B %d, %Y')} · pre-market"
             + (f" · {regime}" if regime else "") + "</i>")
    L.append("")

    L.append("<b>MARKET SNAPSHOT</b>")
    L.extend(esc(line) for line in snapshot_lines)
    L.append("")

    if ai:
        L.append("\U0001F525 <b>TOP 3 THINGS THAT MATTER TODAY</b>")
        L.append(esc(ai["TOP3"]))
        L.append("")
        L.append("\U0001F4C5 <b>ON THE CALENDAR TODAY</b>")
        if econ_lines:
            L.append("DATA: " + esc(" · ".join(econ_lines)))
        if earnings:
            L.append("EARNINGS: " + esc(" · ".join(earnings)))
        if ai.get("WATCH"):
            L.append("WATCH: " + esc(ai["WATCH"]))
        if not (econ_lines or earnings or ai.get("WATCH")):
            L.append("Quiet calendar today.")
        L.append("")
        if ai.get("SOUNDSMART"):
            L.append("\U0001F9E0 <b>ONE THING TO SOUND SMART ABOUT</b>")
            L.append(esc(ai["SOUNDSMART"]))
            L.append("")
        nugget = ai.get("NUGGET") or FALLBACK_NUGGETS[today.toordinal() % len(FALLBACK_NUGGETS)]
        L.append("\U0001F4A1 <b>LEARNING NUGGET</b>")
        L.append(esc(nugget))
    else:
        # LLM unavailable: numbers-only brief so the message still arrives.
        print("Using deterministic fallback.")
        L.append("\U0001F4C5 <b>ON THE CALENDAR TODAY</b>")
        for line in (econ_lines or ["Quiet calendar today."]):
            L.append(esc(line))
        if earnings:
            L.append("EARNINGS: " + esc(" · ".join(earnings)))
        L.append("")
        L.append("\U0001F4A1 <b>LEARNING NUGGET</b>")
        L.append(esc(FALLBACK_NUGGETS[today.toordinal() % len(FALLBACK_NUGGETS)]))

    L.append("")
    L.append("<i>Index levels reflect the last close; yields, commodities and "
             "crypto move continuously. Data: Yahoo Finance, ForexFactory, Nasdaq.</i>")

    text = "\n".join(L)
    if len(text) > 4050:  # Telegram hard cap is 4096
        text = text[:4047] + "..."

    if dry_run:
        print("\n----- brief -----")
        print(text)
        print(f"----- {len(text)} chars -----")
        print("DRY_RUN=1, skipping Telegram send.")
        return

    resp = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data={"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML",
              "disable_web_page_preview": True},
        timeout=20,
    )
    print("Telegram status:", resp.status_code, resp.text[:200])
    resp.raise_for_status()


if __name__ == "__main__":
    main()
