import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const PORT = Number(process.env.PORT || 3000);
const REFRESH_MS = Number(process.env.REFRESH_MS || 1000);
const USE_MOCK = String(process.env.USE_MOCK || 'true').toLowerCase() !== 'false';

const WATCHLIST = [
  {
    ticker: 'TSLA',
    markets: [
      { id: 'hyperliquid:hyna:TSLA-USDC', platform: 'hyperliquid', symbol: 'TSLA-USDC', builder: 'hyna', coin: 'TSLA' },
      { id: 'hyperliquid:xyz:TSLA-USDC', platform: 'hyperliquid', symbol: 'TSLA-USDC', builder: 'xyz', coin: 'TSLA' },
      { id: 'hyperliquid:flx:TSLA-USDH', platform: 'hyperliquid', symbol: 'TSLA-USDH', builder: 'flx', coin: 'TSLA-USDH' },
      { id: 'hyperliquid:km:TSLA-USDK', platform: 'hyperliquid', symbol: 'TSLA-USDK', builder: 'km', coin: 'TSLA-USDK' },
      { id: 'extended:DEFAULT:TSLA-PERP', platform: 'extended', symbol: 'TSLA-PERP' },
      { id: 'lighter:DEFAULT:TSLA-PERP', platform: 'lighter', symbol: 'TSLA-PERP' },
      { id: 'aster:DEFAULT:TSLA-PERP', platform: 'aster', symbol: 'TSLA-PERP' }
    ]
  },
  {
    ticker: 'COPPER',
    markets: [
      { id: 'hyperliquid:hyna:COPPER-USDB', platform: 'hyperliquid', symbol: 'COPPER-USDB', builder: 'hyna', coin: 'COPPER-USDB' },
      { id: 'hyperliquid:xyz:COPPER-USDC', platform: 'hyperliquid', symbol: 'COPPER-USDC', builder: 'xyz', coin: 'COPPER-USD' },
      { id: 'hyperliquid:flx:COPPER-USDH', platform: 'hyperliquid', symbol: 'COPPER-USDH', builder: 'flx', coin: 'COPPER-USDH' },
      { id: 'hyperliquid:km:COPPER-USDK', platform: 'hyperliquid', symbol: 'COPPER-USDK', builder: 'km', coin: 'COPPER-USDK' },
      { id: 'extended:DEFAULT:COPPER-PERP', platform: 'extended', symbol: 'COPPER-PERP' },
      { id: 'lighter:DEFAULT:COPPER-PERP', platform: 'lighter', symbol: 'COPPER-PERP' },
      { id: 'aster:DEFAULT:COPPER-PERP', platform: 'aster', symbol: 'COPPER-PERP' }
    ]
  },
  {
    ticker: 'GOLD',
    markets: [
      { id: 'hyperliquid:hyna:GOLD-USDB', platform: 'hyperliquid', symbol: 'GOLD-USDB', builder: 'hyna', coin: 'GOLD-USDB' },
      { id: 'hyperliquid:xyz:GOLD-USDC', platform: 'hyperliquid', symbol: 'GOLD-USDC', builder: 'xyz', coin: 'GOLD-USD' },
      { id: 'hyperliquid:flx:GOLD-USDH', platform: 'hyperliquid', symbol: 'GOLD-USDH', builder: 'flx', coin: 'GOLD-USDH' },
      { id: 'hyperliquid:km:GOLD-USDK', platform: 'hyperliquid', symbol: 'GOLD-USDK', builder: 'km', coin: 'GOLD-USDK' },
      { id: 'lighter:DEFAULT:GOLD-PERP', platform: 'lighter', symbol: 'GOLD-PERP' }
    ]
  }
];

const sseClients = new Set();
const marketState = new Map();

function round(value, digits = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getPlatformLabel(market) {
  if (market.platform !== 'hyperliquid') return capitalize(market.platform);
  return `Hyperliquid:${String(market.builder || 'default').toUpperCase()}`;
}

function computeBestCombo(quotes) {
  const validAsks = quotes.filter((q) => typeof q.ask === 'number');
  const validBids = quotes.filter((q) => typeof q.bid === 'number');

  if (!validAsks.length || !validBids.length) {
    return { status: 'NOT LIVE', longOn: null, shortOn: null, spreadUsd: null, spreadPct: null };
  }

  const bestLong = validAsks.reduce((a, b) => (b.ask < a.ask ? b : a));
  const bestShort = validBids.reduce((a, b) => (b.bid > a.bid ? b : a));
  const spreadUsd = bestShort.bid - bestLong.ask;
  const spreadPct = bestLong.ask > 0 ? ((bestShort.bid / bestLong.ask) - 1) * 100 : null;

  return {
    status: 'LIVE',
    longOn: bestLong.marketLabel,
    shortOn: bestShort.marketLabel,
    spreadUsd: round(spreadUsd, 6),
    spreadPct: round(spreadPct, 4)
  };
}

function buildPayload(timestamp) {
  const rows = WATCHLIST.map((entry) => {
    const quotes = entry.markets.map((market) => {
      const state = marketState.get(market.id) || {};
      return {
        marketId: market.id,
        marketLabel: getPlatformLabel(market),
        platform: market.platform,
        symbol: market.symbol,
        builder: market.builder || null,
        status: state.status || 'NOT LIVE',
        bid: state.bid ?? null,
        ask: state.ask ?? null,
        mark: state.mark ?? null,
        index: state.index ?? null,
        funding: state.funding ?? null,
        lastUpdateTs: state.lastUpdateTs ?? null
      };
    });

    return { ticker: entry.ticker, bestCombo: computeBestCombo(quotes), quotes };
  });

  return { ts: timestamp, refreshMs: REFRESH_MS, rows };
}

function pushSse(payload) {
  const block = `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    res.write(block);
  }
}

function hashCode(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateMockQuotes(now) {
  for (const item of WATCHLIST) {
    const anchor = 10 + (hashCode(item.ticker) % 500) / 10;
    for (const market of item.markets) {
      const platformShift = (hashCode(market.id) % 40) / 100;
      const noise = (Math.sin(now / 7000 + hashCode(market.id)) + 1) * 0.03;
      const mid = anchor + platformShift + noise;
      const spread = 0.02 + ((hashCode(market.id) % 7) / 1000);
      const bid = mid - spread / 2;
      const ask = mid + spread / 2;

      marketState.set(market.id, {
        status: 'LIVE',
        bid: round(bid, 5),
        ask: round(ask, 5),
        mark: round(mid, 5),
        index: round(mid - 0.005, 5),
        funding: round(((hashCode(market.id) % 20) - 10) / 10000, 6),
        lastUpdateTs: now
      });
    }
  }
}

async function fetchLiveQuotes(now) {
  const hyperMarkets = WATCHLIST.flatMap((w) => w.markets).filter((m) => m.platform === 'hyperliquid');

  await Promise.all(
    hyperMarkets.map(async (market) => {
      try {
        const bookRes = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'l2Book', coin: market.coin || market.symbol })
        });

        if (!bookRes.ok) throw new Error(`HTTP ${bookRes.status}`);

        const book = await bookRes.json();
        const levels = Array.isArray(book?.levels) ? book.levels : null;
        const bestBid = levels?.[0]?.[0] ? Number(levels[0][0].px ?? levels[0][0].price ?? levels[0][0][0]) : null;
        const bestAsk = levels?.[1]?.[0] ? Number(levels[1][0].px ?? levels[1][0].price ?? levels[1][0][0]) : null;
        const mark = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk || null;

        marketState.set(market.id, {
          status: bestBid && bestAsk ? 'LIVE' : 'NOT LIVE',
          bid: bestBid,
          ask: bestAsk,
          mark,
          index: null,
          funding: null,
          lastUpdateTs: now
        });
      } catch {
        marketState.set(market.id, {
          status: 'NOT LIVE', bid: null, ask: null, mark: null, index: null, funding: null, lastUpdateTs: now
        });
      }
    })
  );

  const nonLiveMarkets = WATCHLIST.flatMap((w) => w.markets).filter((m) => m.platform !== 'hyperliquid');
  for (const market of nonLiveMarkets) {
    marketState.set(market.id, {
      status: 'NOT LIVE', bid: null, ask: null, mark: null, index: null, funding: null, lastUpdateTs: now
    });
  }
}

async function refreshQuotes() {
  const now = Date.now();
  if (USE_MOCK) generateMockQuotes(now);
  else await fetchLiveQuotes(now);
  pushSse(buildPayload(now));
}

function contentType(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('\n');
    sseClients.add(res);
    res.write(`event: snapshot\ndata: ${JSON.stringify(buildPayload(Date.now()))}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (url === '/api/config') {
    const payload = JSON.stringify({ refreshMs: REFRESH_MS, useMock: USE_MOCK, watchlist: WATCHLIST });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  const filePath = url === '/' ? join('public', 'index.html') : join('public', url.replace(/^\//, ''));

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

setInterval(() => {
  refreshQuotes().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('refreshQuotes failed:', error.message);
  });
}, REFRESH_MS);

refreshQuotes();

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Monitoring dashboard started on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`USE_MOCK=${USE_MOCK} REFRESH_MS=${REFRESH_MS}`);
});
