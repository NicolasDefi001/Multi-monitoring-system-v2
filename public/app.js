const body = document.querySelector('#dashboard-body');
const rowTemplate = document.querySelector('#row-template');
const connectionStatus = document.querySelector('#connection-status');
const modePill = document.querySelector('#mode-pill');
const updatedAt = document.querySelector('#updated-at');

fetch('/api/config')
  .then((r) => r.json())
  .then((config) => {
    modePill.textContent = config.useMock
      ? `Mode MOCK (${config.refreshMs}ms)`
      : `Mode LIVE (${config.refreshMs}ms)`;
    modePill.className = `pill ${config.useMock ? 'bad' : 'good'}`;
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

function fmt(value, digits = 4) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function renderTable(rows) {
  body.innerHTML = '';

  for (const row of rows) {
    const tr = rowTemplate.content.firstElementChild.cloneNode(true);

    tr.querySelector('.ticker').textContent = row.ticker;

    const comboEl = tr.querySelector('.combo');
    if (row.bestCombo.longOn && row.bestCombo.shortOn) {
      comboEl.innerHTML = `<div class="buy">Long: ${row.bestCombo.longOn}</div>
      <div class="sell">Short: ${row.bestCombo.shortOn}</div>`;
    } else {
      comboEl.textContent = 'Pas assez de données live';
    }

    const spreadEl = tr.querySelector('.spread');
    if (row.bestCombo.spreadUsd !== null) {
      const spreadClass = row.bestCombo.spreadUsd >= 0 ? 'pos' : 'neg';
      spreadEl.innerHTML = `<div class="${spreadClass}">$ ${fmt(row.bestCombo.spreadUsd, 6)}</div>
      <div class="${spreadClass}">${fmt(row.bestCombo.spreadPct, 4)}%</div>`;
    } else {
      spreadEl.textContent = '—';
    }

    const marketsWrap = tr.querySelector('.markets');
    const grid = document.createElement('div');
    grid.className = 'market-grid';

    for (const q of row.quotes) {
      const card = document.createElement('div');
      card.className = 'market-card';
      card.innerHTML = `
        <div class="market-title">${q.marketLabel}</div>
        <div class="${q.status === 'LIVE' ? 'market-live' : 'market-off'}">${q.status} · ${q.symbol}</div>
        <div class="kv">
          <span>Bid</span><b>${fmt(q.bid, 6)}</b>
          <span>Ask</span><b>${fmt(q.ask, 6)}</b>
          <span>Mark</span><b>${fmt(q.mark, 6)}</b>
          <span>Index</span><b>${fmt(q.index, 6)}</b>
        </div>
      `;
      grid.appendChild(card);
    }

    marketsWrap.appendChild(grid);
    body.appendChild(tr);
  }
}
