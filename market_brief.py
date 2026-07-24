#!/usr/bin/env python3
"""
Daily market brief -> Telegram.

Numbers (markets + watchlist) are fetched and formatted in code so they are
always accurate; the analysis sections (what stands out, trading watch, M&A,
world, macro) are written by an LLM via GitHub Models from live headlines and
the day's economic calendar, with a deterministic fallback if the LLM is
unavailable.

Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
Env (optional): WATCHLIST, LLM_MODEL, GITHUB_TOKEN (enables AI sections),
DRY_RUN=1 (print instead of send).
"""

import html
import os
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

ECON_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

RSS_FEEDS = {
    "CNBC Markets": "https://www.cnbc.com/id/20910258/device/rss/rss.html",
    "CNBC World": "https://www.cnbc.com/id/100727362/device/rss/rss.html",
    "CNBC Deals": "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    "MarketWatch": "https://feeds.content.dowjones.io/public/rss/mw_topstories",
}
MAX_HEADLINES = 30

NUGGETS = [
    ("Duration", "How sensitive a price is to interest-rate moves. Long bonds and high-growth tech fall hardest when yields rise."),
    ("Free cash flow", "Cash left after a company funds operations and capital spending. It's what actually pays dividends and buybacks."),
    ("P/E ratio", "Price divided by earnings per share — what you pay for $1 of profit. A high P/E means the market expects fast growth."),
    ("Yield curve", "The gap between long and short Treasury yields. When it inverts (short > long), a recession has often followed."),
    ("ROIC", "Return on invested capital — profit per dollar of capital. Above the cost of capital = real value creation."),
    ("Beta", "How much a stock moves relative to the market. Beta > 1 means it swings harder than the index, both ways."),
    ("Gross margin", "Revenue minus cost of goods, as a %. Higher margins signal pricing power and a stronger moat."),
    ("The Fed's dual mandate", "The Fed targets both stable prices (~2% inflation) and maximum employment — the two can conflict."),
    ("Multiple expansion", "When a stock rises because investors pay a higher P/E, not because earnings grew. Sentiment, not fundamentals."),
    ("Short interest", "The % of shares sold short. Very high short interest can fuel a 'short squeeze' if the stock rallies."),
]


# ------------------------------------------------------------------ quotes

def yahoo_quote(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range=5d&interval=1d"
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    closes = [c for c in res["indicators"]["quote"][0]["close"] if c is not None]
    if len(closes) < 2:
        raise ValueError("not enough data")
    price, prev = closes[-1], closes[-2]
    return price, (price - prev) / prev * 100


def stooq_quote(symbol):
    smap = {"^GSPC": "^spx", "^IXIC": "^ndq", "^DJI": "^dji", "CL=F": "cl.f", "GC=F": "gc.f"}
    s = smap.get(symbol, symbol.lower() + ".us")
    url = f"https://stooq.com/q/l/?s={s}&f=sd2t2ohlcv&h&e=csv"
    r = requests.get(url, headers=HEADERS, timeout=15)
    vals = r.text.strip().splitlines()[1].split(",")
    return float(vals[6]), None


def get(symbol):
    for fn in (yahoo_quote, stooq_quote):
        try:
            return fn(symbol)
        except Exception:
            continue
    return None, None


def fmt(price, pct, money=True):
    if price is None:
        return "n/a"
    p = f"${price:,.2f}" if money else f"{price:,.2f}"
    if pct is None:
        return p
    arrow = "\U0001F7E2" if pct >= 0 else "\U0001F534"
    return f"{p} {arrow} {pct:+.1f}%"


# ------------------------------------------------------------ news + calendar

def fetch_econ_calendar():
    """Today's high/medium-impact + Fed-related US events, with ET times."""
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
        details = f" (forecast {ev['forecast']}, prev {ev.get('previous', '?')})" if ev.get("forecast") else ""
        lines.append(f"{ev['date'][11:16]} ET [{impact}] {title}{details}")
    return lines


def fetch_headlines():
    try:
        import feedparser
    except ImportError:
        print("warning: feedparser not installed; skipping headlines", file=sys.stderr)
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


# ---------------------------------------------------------------- AI section

AI_HEADERS = {
    "What stands out:": "\U0001F50D <b>What stands out</b>",
    "Trading watch:": "\U0001F4C5 <b>Trading watch</b>",
    "Deals:": "\U0001F91D <b>Deals</b>",
    "World:": "\U0001F30D <b>World</b>",
    "Macro:": "\U0001F4F0 <b>Macro</b>",
}


def ai_sections(quotes_text, econ_events, headlines):
    """LLM-written analysis. Returns HTML-safe text, or None on any failure."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return None
    briefing = (
        f"Market data:\n{quotes_text}\n\n"
        "Today's US economic calendar:\n"
        + ("\n".join(econ_events) if econ_events else "(nothing scheduled)")
        + "\n\nHeadlines from the last 24 hours:\n"
        + ("\n".join(headlines) if headlines else "(none)")
    )
    system_prompt = (
        "You write the analysis part of a pre-market Telegram brief for a "
        "young day trader. Plain text only, no markdown, max 1800 characters "
        "total. Output these sections, each starting with its exact header "
        "on its own line, omitting any section with nothing notable:\n"
        "What stands out: 2-3 sentences tying today's price moves to the news.\n"
        "Trading watch: today's econ calendar items that can move SPY, with "
        "ET times; flag Fed events and high-impact releases clearly.\n"
        "Deals: M&A/buyouts from the headlines with companies and amounts.\n"
        "World: geopolitical events that matter for markets.\n"
        "Macro: 1-2 sentences on other market-moving news.\n"
        "Terse, specific, no filler, no greetings."
    )
    try:
        response = requests.post(
            "https://models.github.ai/inference/chat/completions",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "model": LLM_MODEL,
                "max_tokens": 800,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": briefing},
                ],
            },
            timeout=60,
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        print(f"warning: LLM failed: {exc}", file=sys.stderr)
        return None

    safe = html.escape(text, quote=False)
    for plain, rich in AI_HEADERS.items():
        safe = safe.replace(plain, rich + "\n")
    return safe.replace("\n\n\n", "\n\n")


def fallback_insight(data, econ_events):
    """Deterministic analysis when the LLM is unavailable."""
    bits = []
    spx = data.get("^GSPC", (None, None))[1]
    if spx is not None:
        bits.append("Risk-on — the S&P is climbing." if spx > 0.3
                    else "Risk-off — the S&P is under pressure." if spx < -0.3
                    else "Markets are mixed and roughly flat.")
    movers = [(s, data[s][1]) for s in WATCHLIST if data.get(s, (None, None))[1] is not None]
    if movers:
        s, p = max(movers, key=lambda x: abs(x[1]))
        bits.append(f"{s} is your biggest mover ({p:+.1f}%).")
    ten = data.get("^TNX", (None, None))[0]
    if ten:
        ten = ten / 10.0 if ten > 20 else ten
        if ten > 4.5:
            bits.append(f"10-yr yield elevated at {ten:.2f}% — headwind for tech.")
    oil_pct = data.get("CL=F", (None, None))[1]
    if oil_pct is not None and abs(oil_pct) > 2:
        bits.append(f"Oil is {'jumping' if oil_pct > 0 else 'sliding'} ({oil_pct:+.1f}%).")

    out = ["\U0001F50D <b>What stands out</b>", " ".join(bits)]
    if econ_events:
        out += ["", "\U0001F4C5 <b>Trading watch</b>"] + [html.escape(e, quote=False) for e in econ_events]
    return "\n".join(out)


# -------------------------------------------------------------------- main

def main():
    dry_run = os.environ.get("DRY_RUN") == "1"
    if not dry_run and (not BOT_TOKEN or not CHAT_ID):
        print("ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set.", file=sys.stderr)
        sys.exit(1)

    today = datetime.date.today()
    symbols = ["^GSPC", "^IXIC", "^DJI", "^TNX", "CL=F", "GC=F", "BTC-USD"] + WATCHLIST
    print(f"Fetching {len(symbols)} quotes...")
    data = {sym: get(sym) for sym in symbols}

    print("Fetching econ calendar and headlines...")
    econ_events = fetch_econ_calendar()
    headlines = fetch_headlines()
    print(f"Got {len(econ_events)} econ events, {len(headlines)} headlines.")

    L = ["<b>\U0001F4C8 Morning Market Brief</b>", f"<i>{today.strftime('%A, %B %d, %Y')}</i>", ""]

    L.append("<b>Markets</b>")
    L.append(f"S&P 500: {fmt(*data['^GSPC'], money=False)}")
    L.append(f"Nasdaq: {fmt(*data['^IXIC'], money=False)}")
    L.append(f"Dow: {fmt(*data['^DJI'], money=False)}")
    ten = data["^TNX"][0]
    ten = (ten / 10.0 if ten and ten > 20 else ten)
    L.append(f"10-Yr yield: {ten:.2f}%" if ten else "10-Yr yield: n/a")
    L.append(f"Oil (WTI): {fmt(*data['CL=F'])}")
    L.append(f"Gold: {fmt(*data['GC=F'])}")
    L.append(f"Bitcoin: {fmt(*data['BTC-USD'])}")
    L.append("")

    L.append("<b>Your watchlist</b>")
    for sym in WATCHLIST:
        L.append(f"{sym}: {fmt(*data[sym])}")
    L.append("")

    quotes_text = "\n".join(
        f"{sym}: {data[sym][0]} ({data[sym][1]:+.2f}%)" if data[sym][0] is not None and data[sym][1] is not None
        else f"{sym}: n/a"
        for sym in symbols
    )
    print(f"Building AI analysis with {LLM_MODEL}...")
    analysis = ai_sections(quotes_text, econ_events, headlines)
    if analysis is None:
        print("Using deterministic fallback analysis.")
        analysis = fallback_insight(data, econ_events)
    L.append(analysis)
    L.append("")

    title, body = NUGGETS[today.timetuple().tm_yday % len(NUGGETS)]
    L.append(f"\U0001F4A1 <b>Learning nugget — {html.escape(title, quote=False)}</b>")
    L.append(html.escape(body, quote=False))

    text = "\n".join(L)
    if len(text) > 3900:  # Telegram caps messages at 4096 chars
        text = text[:3897] + "..."

    if dry_run:
        print("\n----- brief -----")
        print(text)
        print(f"----- {len(text)} chars -----")
        print("DRY_RUN=1, skipping Telegram send.")
        return

    resp = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data={"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
        timeout=20,
    )
    print("Telegram status:", resp.status_code, resp.text[:200])
    resp.raise_for_status()


if __name__ == "__main__":
    main()
