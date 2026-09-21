const assert = require('assert');
const {marketData,stocks,dates,times,portfolio,resetState,getMarket,marketSeries,marketSnapshot,INITIAL_CASH} = require('../server');

assert.strictEqual(stocks.length,10,'must contain 10 stocks');
assert.strictEqual(dates.length,15,'must contain 15 trading days');
assert.strictEqual(times.length,13,'must contain 13 intraday snapshots');
assert.strictEqual(marketData.length,1950,'must contain 1,950 market records');
assert.ok(getMarket('RELIANCE', dates[0], times[0]),'exact historical lookup must work');
assert.strictEqual(marketSeries('RELIANCE',dates[0]).length,13,'intraday series must contain 13 points');
const snap=marketSnapshot('RELIANCE',dates[dates.length-1],times[times.length-1]);
assert.ok(snap && snap.price>0,'market snapshot must be populated');
resetState();
assert.strictEqual(portfolio().cash,INITIAL_CASH,'reset should restore cash');
assert.strictEqual(portfolio().positions.length,0,'reset should clear positions');
console.log('TradeSim Pro tests: all assertions passed.');
