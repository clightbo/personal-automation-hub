#!/usr/bin/env python3
"""
Daily market brief -> Telegram.
Runs on GitHub Actions (which can reach the internet + Telegram).
Needs two repo secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
Optional secret WATCHLIST (comma-separated tickers, e.g. "AAPL,NVDA,MSFT").
No API key required — uses Yahoo Finance's free chart endpoint, with a Stooq fallback.
"""

import os
import sys
import datetime
import urllib.parse
import requests

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
WATCHLIST = [t.strip().upper() for t in os.environ.get("WATCHLIST", "AAPL,NVDA,MSFT").split(",") if t.strip()]

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MarketBrief/1.0)"}

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


def build_insight(data):
    """Deterministic 'what stands out' from the live numbers — no LLM needed."""
    bits = []
    spx = data.get("^GSPC", (None, None))[1]
    if spx is not None:
        if spx > 0.3:
            bits.append("Stocks are risk-on — the S&P is climbing.")
        elif spx < -0.3:
            bits.append("Risk-off tone — the S&P is under pressure.")
        else:
            bits.append("Markets are mixed and roughly flat.")
    # biggest watchlist mover
    movers = [(s, data[s][1]) for s in WATCHLIST if data.get(s, (None, None))[1] is not None]
    if movers:
        s, p = max(movers, key=lambda x: abs(x[1]))
        bits.append(f"{s} is your biggest mover ({p:+.1f}%).")
    # yields
    ten = data.get("^TNX", (None, None))[0]
    if ten:
        ten = ten / 10.0 if ten > 20 else ten
        if ten > 4.5:
            bits.append(f"The 10-yr yield is elevated at {ten:.2f}% — headwind for long-duration tech.")
    # oil
    oil_pct = data.get("CL=F", (None, None))[1]
    if oil_pct is not None and abs(oil_pct) > 2:
        bits.append(f"Oil is {'jumping' if oil_pct > 0 else 'sliding'} ({oil_pct:+.1f}%) — watch it feed inflation.")
    return " ".join(bits)


def main():
    if not BOT_TOKEN or not CHAT_ID:
        print("ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set.", file=sys.stderr)
        sys.exit(1)

    today = datetime.date.today()
    data = {}
    for sym in ["^GSPC", "^IXIC", "^DJI", "^TNX", "CL=F", "GC=F", "BTC-USD"] + WATCHLIST:
        data[sym] = get(sym)

    L = [f"<b>\U0001F4C8 Morning Market Brief</b>", f"<i>{today.strftime('%A, %B %d, %Y')}</i>", ""]

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

    insight = build_insight(data)
    if insight:
        L.append("<b>\U0001F50D What stands out</b>")
        L.append(insight)
        L.append("")

    title, body = NUGGETS[today.timetuple().tm_yday % len(NUGGETS)]
    L.append(f"<b>\U0001F4A1 Learning nugget — {title}</b>")
    L.append(body)
    L.append("")
    L.append("<i>Data: Yahoo Finance. Auto-sent by your GitHub market-brief job.</i>")

    text = "\n".join(L)
    resp = requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data={"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
        timeout=20,
    )
    print("Telegram status:", resp.status_code, resp.text[:200])
    resp.raise_for_status()


if __name__ == "__main__":
    main()
