# TradeSim Pro — Virtual Stock Trading Terminal

A polished, mobile-responsive virtual stock trading platform built for the Internshala software-development assignment.

## What the MVP demonstrates

- 10 synthetic stocks with 15 trading days of data.
- 30-minute historical price snapshots (13 per day; 1,950 total records).
- Exact date + time price lookup from CSV-backed market data.
- Intraday SVG price visualization with session OHLC summary.
- Market watchlist with search and live dataset snapshot changes.
- One-click market replay through the intraday timestamps.
- Virtual BUY/SELL execution using the selected timestamp price.
- Weighted-average cost basis.
- Realized and unrealized P/L.
- Portfolio exposure, return percentage and cash/equity metrics.
- Transaction audit trail.
- Validation for insufficient cash and insufficient holdings.
- Resettable predefined demo account.
- No registration/authentication and no real-money transactions, as required.
- Zero external runtime dependencies: Node.js built-ins + vanilla HTML/CSS/JS.

## Architecture

```text
CSV market dataset
      |
      v
Node.js HTTP API  ---> in-memory market store
      |                     |
      |                     +--> exact price lookup
      |                     +--> intraday series
      |                     +--> market snapshot
      |
      +--> demo account state
              |
              +--> order engine
              +--> weighted-average cost
              +--> realized P/L
              +--> unrealized P/L
              +--> transaction ledger
      |
      v
Responsive TradeSim Pro terminal
```

## Run

Requires Node.js 18+.

```bash
npm start
```

Open `http://127.0.0.1:5000`.

No `npm install` is required because the project uses only Node.js built-in modules.

## Test

```bash
npm test
```

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/stocks` | Instruments, dataset dates/times and record count |
| GET | `/api/market?symbol=RELIANCE&date=2026-09-21&time=15:15` | Exact selected market snapshot |
| GET | `/api/series?symbol=RELIANCE&date=2026-09-21` | Intraday price series |
| GET | `/api/portfolio` | Cash, equity, exposure and P/L |
| GET | `/api/transactions` | Audit trail |
| POST | `/api/orders` | Virtual BUY/SELL |
| POST | `/api/reset` | Restore the predefined demo account |

## Trading model

Starting virtual capital is ₹10,00,000. Orders execute at the exact selected CSV price. BUY reduces cash and increases the position; additional buys update weighted-average cost. SELL requires sufficient holdings and increases cash. Realized P/L is calculated against the weighted-average cost of sold shares. Unrealized P/L is current market value minus open-position cost basis.

There are deliberately no brokerage, tax, slippage, authentication, or real-money flows because this is an educational simulation.

## Demo sequence

1. Open the terminal and show the market watchlist.
2. Select a stock.
3. Select a historical date and exact 30-minute timestamp.
4. Show the price, change, OHLC summary and intraday chart.
5. Start Replay and demonstrate the timestamp moving through the session.
6. Place a BUY order.
7. Show updated cash, portfolio exposure, position return and P/L.
8. SELL part of the position.
9. Show the transaction audit trail.
10. Reset the demo account.

## Submission

Push the complete repository to GitHub and include the GitHub URL plus a short demo-video URL in the Internshala submission. Upload the ZIP as the assignment file.
