const body = document.querySelector('#dashboard-body');
const head = document.querySelector('#dashboard-head');
const connectionStatus = document.querySelector('#connection-status');
const modePill = document.querySelector('#mode-pill');
const updatedAt = document.querySelector('#updated-at');

let marketColumns = [];

function fmt(value, digits = 4) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function marketLabelFromConfig(market) {
  if (market.platform !== 'hyperliquid') {
    return market.platform.charAt(0).toUpperCase() + market.platform.slice(1);
  }
  return `Hyperliquid:${String(market.builder || 'default').toUpperCase()}`;
}

function hydrateColumns(watchlist) {
  const seen = new Set();
  const cols = [];

  for (const row of watchlist) {
    for (const market of row.markets) {
      if (seen.has(market.id)) continue;
      seen.add(market.id);
      cols.push({
        id: market.id,
        title: marketLabelFromConfig(market)
      });
    }
  }

  marketColumns = cols;

  const tr = document.createElement('tr');
  tr.innerHTML = '<th>Ticker</th><th>Best Combo</th>';

  for (const col of cols) {
    const th = document.createElement('th');
    th.textContent = col.title;
    tr.appendChild(th);
  }

  head.innerHTML = '';
  head.appendChild(tr);
}

fetch('/api/config')
  .then((r) => r.json())
  .then((config) => {
    modePill.textContent = config.useMock
      ? `Mode MOCK (${config.refreshMs}ms)`
      : `Mode LIVE (${config.refreshMs}ms)`;
    modePill.className = `pill ${config.useMock ? 'bad' : 'good'}`;
    hydrateColumns(config.watchlist || []);
  })
  .catch(() => {
    modePill.textContent = 'Mode inconnu';
  });

const events = new EventSource('/events');

events.onopen = () => {
  connectionStatus.textContent = 'Flux SSE connecté';
  connectionStatus.className = 'pill good';
};

events.onerror = () => {
  connectionStatus.textContent = 'Flux SSE en reconnexion';
  connectionStatus.className = 'pill bad';
};

events.addEventListener('snapshot', (event) => {
  const data = JSON.parse(event.data);
  renderTable(data.rows);
  updatedAt.textContent = `Dernière maj: ${new Date(data.ts).toLocaleTimeString()}`;
});

function renderTable(rows) {
  body.innerHTML = '';

  for (const row of rows) {
    const tr = document.createElement('tr');

    const tickerTd = document.createElement('td');
    tickerTd.className = 'ticker';
    tickerTd.textContent = row.ticker;
    tr.appendChild(tickerTd);

    const comboTd = document.createElement('td');
    comboTd.className = 'combo';

    if (row.bestCombo.longOn && row.bestCombo.shortOn) {
      const spreadClass = row.bestCombo.spreadUsd >= 0 ? 'pos' : 'neg';
      comboTd.innerHTML = `
        <div><span class="dim">${row.bestCombo.shortOn}</span> (short) & ${row.bestCombo.longOn} (long)</div>
        <div class="${spreadClass}">Spread $ ${fmt(row.bestCombo.spreadUsd, 6)} / ${fmt(row.bestCombo.spreadPct, 4)}%</div>
      `;
    } else {
      comboTd.innerHTML = '<span class="off">Pas assez de prix live</span>';
    }

    tr.appendChild(comboTd);

    const quoteById = new Map(row.quotes.map((q) => [q.marketId, q]));

    for (const market of marketColumns) {
      const td = document.createElement('td');
      const q = quoteById.get(market.id);

      if (!q || q.status !== 'LIVE') {
        td.innerHTML = '<span class="off">NOT LIVE</span>';
      } else {
        td.innerHTML = `
          <div>Mark ${fmt(q.mark, 6)}</div>
          <div>Index ${fmt(q.index, 6)}</div>
          <div>Bid ${fmt(q.bid, 6)}</div>
          <div>Ask ${fmt(q.ask, 6)}</div>
        `;
      }

      tr.appendChild(td);
    }

    body.appendChild(tr);
  }
}
