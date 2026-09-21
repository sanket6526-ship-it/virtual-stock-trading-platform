const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const CSV_PATH = path.join(ROOT, 'data', 'market_data.csv');
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '127.0.0.1';
const INITIAL_CASH = 1_000_000;

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.map(line => {
    const values = line.split(',');
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    row.price = Number(row.price);
    return row;
  });
}

const marketData = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
const symbols = [...new Set(marketData.map(r => r.symbol))];
const stocks = symbols.map(symbol => {
  const rows = marketData.filter(r => r.symbol === symbol);
  const latest = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : latest;
  return {
    symbol,
    company_name: latest.company_name,
    latest_price: latest.price,
    latest_date: latest.trading_date,
    latest_time: latest.trading_time,
    change: +(latest.price - previous.price).toFixed(2),
    change_pct: +((latest.price - previous.price) / previous.price * 100).toFixed(2),
    min_price: Math.min(...rows.map(r => r.price)),
    max_price: Math.max(...rows.map(r => r.price))
  };
}).sort((a,b) => a.symbol.localeCompare(b.symbol));

const dates = [...new Set(marketData.map(r => r.trading_date))].sort();
const times = [...new Set(marketData.map(r => r.trading_time))].sort();
const state = { cash: INITIAL_CASH, positions: new Map(), transactions: [] };

function round2(v) { return Number(Number(v).toFixed(2)); }
function moneyNumber(v) { return round2(v); }
function resetState() { state.cash = INITIAL_CASH; state.positions.clear(); state.transactions.length = 0; }
function rowsFor(symbol) { return marketData.filter(r => r.symbol === symbol); }
function getMarket(symbol, date, time) { return marketData.find(r => r.symbol === symbol && r.trading_date === date && r.trading_time === time) || null; }
function latest(symbol) { const rows = rowsFor(symbol); return rows[rows.length - 1] || null; }
function previous(symbol) { const rows = rowsFor(symbol); return rows.length > 1 ? rows[rows.length - 2] : null; }
function marketSeries(symbol, date) { return marketData.filter(r => r.symbol === symbol && r.trading_date === date).sort((a,b) => a.trading_time.localeCompare(b.trading_time)); }
function realizedPnL() {
  const basis = new Map(); let realized = 0;
  for (const t of state.transactions) {
    const s = basis.get(t.symbol) || { qty: 0, cost: 0 };
    if (t.side === 'BUY') {
      s.qty += t.quantity; s.cost += t.quantity * t.price;
    } else {
      const avg = s.qty ? s.cost / s.qty : 0;
      realized += (t.price - avg) * t.quantity;
      s.qty -= t.quantity; s.cost -= avg * t.quantity;
    }
    basis.set(t.symbol, s);
  }
  return realized;
}
function portfolio() {
  const positions = []; let marketValue = 0, invested = 0;
  for (const [symbol, p] of state.positions) {
    if (p.quantity <= 0) continue;
    const row = latest(symbol);
    const current = row ? row.price : p.avgCost;
    const value = p.quantity * current;
    const cost = p.quantity * p.avgCost;
    marketValue += value; invested += cost;
    positions.push({
      symbol,
      company_name: row?.company_name || symbol,
      quantity: p.quantity,
      avg_cost: round2(p.avgCost),
      current_price: round2(current),
      market_value: round2(value),
      unrealized_pnl: round2(value - cost),
      return_pct: round2(cost ? (value - cost) / cost * 100 : 0)
    });
  }
  const realized = realizedPnL();
  const unrealized = marketValue - invested;
  return {
    cash: round2(state.cash),
    market_value: round2(marketValue),
    total_value: round2(state.cash + marketValue),
    invested_cost: round2(invested),
    realized_pnl: round2(realized),
    unrealized_pnl: round2(unrealized),
    total_pnl: round2(realized + unrealized),
    return_pct: round2((realized + unrealized) / INITIAL_CASH * 100),
    positions
  };
}
function marketSnapshot(symbol, date, time) {
  const row = getMarket(symbol, date, time) || latest(symbol);
  if (!row) return null;
  const rows = rowsFor(symbol);
  const idx = marketData.indexOf(row);
  let previous = null;
  for (let i = idx - 1; i >= 0; i--) if (marketData[i].symbol === symbol) { previous = marketData[i]; break; }
  previous = previous || row;
  const change = row.price - previous.price;
  const dayRows = marketSeries(symbol, row.trading_date);
  const dayOpen = dayRows[0]?.price ?? row.price;
  const dayHigh = Math.max(...dayRows.map(r => r.price));
  const dayLow = Math.min(...dayRows.map(r => r.price));
  return {
    symbol: row.symbol, company_name: row.company_name, date: row.trading_date, time: row.trading_time,
    price: round2(row.price), change: round2(change), change_pct: round2(previous.price ? change / previous.price * 100 : 0),
    day_open: round2(dayOpen), day_high: round2(dayHigh), day_low: round2(dayLow),
    session_points: dayRows.length
  };
}
function send(res, status, data, contentType='application/json') {
  const body = contentType === 'application/json' ? JSON.stringify(data) : data;
  res.writeHead(status, {'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml'};
function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? 'templates/index.html' : url.pathname.slice(1);
  if (requested.includes('..')) return send(res, 403, {error:'Forbidden'});
  const full = path.join(ROOT, requested);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return send(res, 404, {error:'Not found'});
  send(res, 200, fs.readFileSync(full), MIME[path.extname(full)] || 'application/octet-stream');
}
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    if (p === '/api/stocks' && req.method === 'GET') {
      return send(res, 200, { stocks, dates, times, initial_cash: INITIAL_CASH, record_count: marketData.length });
    }
    if (p === '/api/market' && req.method === 'GET') {
      const symbol = (url.searchParams.get('symbol') || 'RELIANCE').toUpperCase();
      const date = url.searchParams.get('date') || dates[dates.length - 1];
      const time = url.searchParams.get('time') || times[0];
      const snapshot = marketSnapshot(symbol, date, time);
      if (!snapshot) return send(res, 404, {error:'No market data for the selected instrument and timestamp.'});
      return send(res, 200, snapshot);
    }
    if (p === '/api/series' && req.method === 'GET') {
      const symbol = (url.searchParams.get('symbol') || 'RELIANCE').toUpperCase();
      const date = url.searchParams.get('date') || dates[dates.length - 1];
      const points = marketSeries(symbol, date);
      if (!points.length) return send(res, 404, {error:'No intraday data for the selected instrument/date.'});
      return send(res, 200, {symbol, date, points: points.map(r => ({trading_time:r.trading_time, price:r.price}))});
    }
    if (p === '/api/portfolio' && req.method === 'GET') return send(res, 200, portfolio());
    if (p === '/api/transactions' && req.method === 'GET') return send(res, 200, {transactions:[...state.transactions].reverse()});
    if (p === '/api/reset' && req.method === 'POST') { resetState(); return send(res, 200, {message:'Demo account reset successfully.'}); }
    if (p === '/api/orders' && req.method === 'POST') {
      const d = await readBody(req);
      const symbol = String(d.symbol || '').toUpperCase();
      const side = String(d.side || '').toUpperCase();
      const date = String(d.date || ''); const time = String(d.time || '');
      const quantity = Number(d.quantity);
      if (!['BUY','SELL'].includes(side) || !symbol || !date || !time || !Number.isInteger(quantity) || quantity <= 0) {
        return send(res, 400, {error:'Enter a valid side, stock, date, time and positive whole-share quantity.'});
      }
      const row = getMarket(symbol, date, time);
      if (!row) return send(res, 404, {error:'The selected market price is unavailable.'});
      const price = row.price;
      const pos = state.positions.get(symbol) || {quantity:0, avgCost:0};
      const value = quantity * price;
      if (side === 'BUY') {
        if (value > state.cash) return send(res, 400, {error:`Insufficient virtual cash. Required ₹${value.toLocaleString('en-IN',{minimumFractionDigits:2})}; available ₹${state.cash.toLocaleString('en-IN',{minimumFractionDigits:2})}.`});
        pos.avgCost = ((pos.quantity * pos.avgCost) + value) / (pos.quantity + quantity);
        pos.quantity += quantity; state.cash -= value;
      } else {
        if (quantity > pos.quantity) return send(res, 400, {error:`Insufficient holdings. You own ${pos.quantity} share(s) of ${symbol}.`});
        pos.quantity -= quantity; state.cash += value;
      }
      if (pos.quantity > 0) state.positions.set(symbol, pos); else state.positions.delete(symbol);
      state.transactions.push({id: state.transactions.length + 1, symbol, company_name:row.company_name, side, quantity, price:round2(price), trading_date:date, trading_time:time, value:round2(value), created_at:new Date().toISOString()});
      return send(res, 200, {message:`${side === 'BUY' ? 'Bought' : 'Sold'} ${quantity} × ${symbol} at ₹${price.toLocaleString('en-IN',{minimumFractionDigits:2})}.`, portfolio:portfolio()});
    }
    if (p.startsWith('/api/')) return send(res, 404, {error:'API endpoint not found'});
    return serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    return send(res, 500, {error:'Internal server error'});
  }
}
function createServer() { return http.createServer(handle); }
if (require.main === module) createServer().listen(PORT, HOST, () => console.log(`TradeSim Pro running at http://${HOST}:${PORT}`));
module.exports = {createServer, handle, marketData, stocks, dates, times, state, portfolio, resetState, getMarket, marketSeries, realizedPnL, marketSnapshot, INITIAL_CASH};
