/* ============================================================
   C.L.U. — Cognitive Logic Unit — Report Renderer v3.0
   ============================================================ */

const DATA_URL          = './data/latest.json';
const ARCHIVE_INDEX_URL = './data/archive/index.json';
const ARCHIVE_REPORT    = (d) => `./data/archive/${d}.json`;
const REFRESH_SECS      = 60;

let countdownVal  = REFRESH_SECS;
let countdownTick = null;
let currentTab    = 'today';

/* ─── INIT ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  startClock();
  initTabs();
  loadReport();
});

/* ─── CLOCK ───────────────────────────────────────────────── */

function startClock() {
  const el = document.getElementById('live-clock');
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit'
    }) + ' PDT';
  }
  tick();
  setInterval(tick, 1000);
}

/* ─── TABS ────────────────────────────────────────────────── */

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('refresh-chip').addEventListener('click', () => {
    resetCountdown();
    loadReport();
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tab}`);
    p.classList.toggle('hidden', p.id !== `tab-${tab}`);
  });
  if (tab === 'archive') loadArchive();
}

/* ─── AUTO-REFRESH ────────────────────────────────────────── */

function resetCountdown() {
  countdownVal = REFRESH_SECS;
  clearInterval(countdownTick);
  countdownTick = setInterval(() => {
    countdownVal--;
    const el = document.getElementById('countdown');
    if (el) el.textContent = countdownVal;
    if (countdownVal <= 0) {
      resetCountdown();
      loadReport();
    }
  }, 1000);
}

/* ─── DATA LOADING ────────────────────────────────────────── */

async function loadReport() {
  showState('loading');
  try {
    const res = await fetch(DATA_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    renderReport(data);
    showState('report');
    resetCountdown();
  } catch {
    showState('error');
  }
}

function showState(state) {
  document.getElementById('state-loading').classList.toggle('hidden', state !== 'loading');
  document.getElementById('state-error').classList.toggle('hidden',   state !== 'error');
  document.getElementById('report-root').classList.toggle('hidden',   state !== 'report');
}

/* ─── REPORT RENDERER ────────────────────────────────────── */

function renderReport(d) {
  const { meta, portfolio, positions, ah_movers, earnings,
          stop_loss_alerts, trades_executed, watchlist_changes,
          alerts, top_opportunities, thoughts } = d;

  // Title — strip "after-hours" language, always show as live
  const rawLabel = (meta.session_label || 'Live Report').replace(/after[- ]?hours/i, 'Live Report');
  document.getElementById('rpt-title').textContent =
    `C.L.U. ${rawLabel.toUpperCase()} — ${formatDate(meta.date)}`;
  document.getElementById('rpt-date').textContent = formatDateLong(meta.date);
  document.getElementById('rpt-generated').textContent = formatTime(meta.generated_at);
  document.getElementById('rpt-next-session').textContent = meta.next_session;

  renderThoughts(thoughts || []);
  renderAlerts(alerts || []);
  renderPortfolio(portfolio);
  renderPositions(positions || []);
  renderMovers(ah_movers || []);
  renderEarnings(earnings || []);
  renderStopLoss(stop_loss_alerts || []);
  renderTrades(trades_executed || []);
  renderWatchlistChanges(watchlist_changes || []);
  renderOpportunities(top_opportunities || []);
}

/* ─── CLU'S THOUGHTS ─────────────────────────────────────── */

function renderThoughts(thoughts) {
  const el = document.getElementById('rpt-thoughts');
  if (!el) return;
  if (!thoughts || !thoughts.length) { el.innerHTML = ''; return; }
  const items = thoughts.map(t => {
    const typeClass = t.type === 'plan' ? 'thought-plan'
                    : t.type === 'concern' ? 'thought-concern'
                    : 'thought-obs';
    const label = t.label ||
      (t.type === 'plan' ? 'PLAN' : t.type === 'concern' ? 'FLAG' : 'OBSERVE');
    return `<div class="thought-item ${typeClass}">
      <div class="thought-label">${escHtml(label)}</div>
      <div class="thought-text">${escHtml(t.text)}</div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="thoughts-card">
      <div class="thoughts-header">
        <span class="thoughts-header-icon">◈</span>
        CLU's Active Intelligence
        <span class="thoughts-header-right">SYSTEM CONSCIOUSNESS LOG</span>
      </div>
      ${items}
    </div>`;
}

/* ─── ALERTS ─────────────────────────────────────────────── */

function renderAlerts(alerts) {
  const el = document.getElementById('rpt-alerts');
  if (!alerts.length) { el.innerHTML = ''; return; }
  el.innerHTML = alerts.map(a => `
    <div class="alert-banner ${a.level}">
      <div class="alert-title">⚠ ${escHtml(a.title)}</div>
      <div class="alert-msg">${escHtml(a.message)}</div>
    </div>
  `).join('');
}

/* ─── PORTFOLIO ──────────────────────────────────────────── */

function renderPortfolio(p) {
  const pnlClass = p.day_pnl_dollars >= 0 ? 'pf-pnl-positive' : 'pf-pnl-negative';
  const pnlSign  = p.day_pnl_dollars >= 0 ? '+' : '';
  document.getElementById('rpt-portfolio').innerHTML = `
    <div class="card-title"><span class="card-title-icon">◈</span> Portfolio</div>
    <div class="portfolio-grid">
      <div class="pf-item">
        <div class="pf-label">Total Value</div>
        <div class="pf-value">${fmtDollar(p.total_value)}</div>
      </div>
      <div class="pf-item">
        <div class="pf-label">Cash / BP</div>
        <div class="pf-value small">${fmtDollar(p.cash)}</div>
      </div>
      <div class="pf-item">
        <div class="pf-label">Day P&amp;L</div>
        <div class="pf-value small ${pnlClass}">${pnlSign}${fmtDollar(p.day_pnl_dollars)} (${pnlSign}${p.day_pnl_pct.toFixed(2)}%)</div>
      </div>
      <div class="pf-item">
        <div class="pf-label">Positions</div>
        <div class="pf-value small">${p.open_positions} / ${p.positions_cap}</div>
      </div>
      ${p.pending_deposits > 0 ? `
      <div class="pf-item">
        <div class="pf-label">Pending Deposit</div>
        <div class="pf-value small" style="color:var(--text-secondary)">${fmtDollar(p.pending_deposits)}</div>
      </div>` : ''}
    </div>
  `;
}

/* ─── POSITIONS ──────────────────────────────────────────── */

function renderPositions(positions) {
  const el = document.getElementById('rpt-positions');
  if (!positions.length) {
    el.innerHTML = `<div class="card-title"><span class="card-title-icon">◉</span> Open Positions</div>
      <p class="no-data">No open positions.</p>`;
    return;
  }
  const rows = positions.map(pos => {
    const pnl = pos.total_pnl_pct >= 0;
    const pnlClass = pnl ? 'pos-pnl-pos' : 'pos-pnl-neg';
    const pnlSign  = pnl ? '+' : '';
    return `
      <div class="pos-row">
        <div class="pos-left">
          <span class="pos-ticker">${escHtml(pos.symbol)}</span>
          <span class="pos-detail">${pos.shares} sh · entry ${fmtDollar(pos.entry_price)} · stop ${fmtDollar(pos.stop_level)} (manual)</span>
        </div>
        <div class="pos-right">
          <div class="pos-pnl ${pnlClass}">${pnlSign}${pos.total_pnl_pct.toFixed(2)}%</div>
          <div class="pos-price">${fmtDollar(pos.current_price)}</div>
        </div>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="card-title"><span class="card-title-icon">◉</span> Open Positions</div>${rows}`;
}

/* ─── AH MOVERS ──────────────────────────────────────────── */

function renderMovers(movers) {
  const el = document.getElementById('rpt-movers');
  if (!movers.length) { el.innerHTML = ''; return; }
  const rows = movers.map(m => {
    const chg    = m.change_pct;
    const chgCls = chg > 0 ? 'col-change-pos' : (chg < 0 ? 'col-change-neg' : 'col-change-neu');
    const sign   = chg > 0 ? '+' : '';
    return `<tr>
      <td class="col-symbol">${escHtml(m.symbol)}</td>
      <td class="col-price">${fmtDollar(m.ah_price)}</td>
      <td class="${chgCls}">${sign}${chg.toFixed(1)}%</td>
      <td><span class="badge badge-${m.signal}">${m.signal}</span></td>
      <td class="wl-tag">${escHtml(m.watchlist)}</td>
      <td style="color:var(--text-secondary);font-size:11px">${escHtml(m.note)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div class="card-title"><span class="card-title-icon">▲</span> After-Hours Movers (±3%)</div>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>Ticker</th><th>AH Price</th><th>Change</th><th>Signal</th><th>Watchlist</th><th>Note</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/* ─── EARNINGS ───────────────────────────────────────────── */

function renderEarnings(earnings) {
  const el = document.getElementById('rpt-earnings');
  if (!earnings.length) { el.innerHTML = ''; return; }
  const rows = earnings.map(e => {
    const sign    = e.beat_pct >= 0 ? '+' : '';
    const pctCls  = e.beat_pct >= 0 ? 'col-change-pos' : 'col-change-neg';
    const badgeCls = e.result === 'beat' ? 'beat' : (e.result === 'miss' ? 'miss' : 'inline');
    return `<tr>
      <td class="col-symbol">${escHtml(e.symbol)}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${escHtml(e.event)}</td>
      <td><span class="badge badge-${badgeCls}">${e.result.toUpperCase()}</span></td>
      <td class="${pctCls}">${sign}${e.beat_pct.toFixed(1)}%</td>
      <td style="font-size:11px">${fmtDollar(e.actual)} <span style="color:var(--text-dim)">vs ${fmtDollar(e.estimate)} est</span></td>
      <td style="font-size:11px;color:var(--text-secondary)">${escHtml(e.impact)}</td>
      <td style="font-size:11px;color:var(--text-dim)">${escHtml(e.action)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div class="card-title"><span class="card-title-icon">◎</span> Earnings &amp; News</div>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>Ticker</th><th>Event</th><th>Result</th><th>Beat%</th><th>EPS</th><th>Impact</th><th>Action</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/* ─── STOP-LOSS ──────────────────────────────────────────── */

function renderStopLoss(alerts) {
  const el = document.getElementById('rpt-stoploss');
  if (!alerts.length) {
    el.innerHTML = `<div class="card-title"><span class="card-title-icon">⬡</span> Stop-Loss Alerts</div>
      <div class="none-label">None — all positions within threshold.</div>`;
    return;
  }
  const rows = alerts.map(a => `<tr>
    <td class="col-symbol">${escHtml(a.symbol)}</td>
    <td class="col-change-neg">${a.pnl_pct.toFixed(2)}%</td>
    <td>${fmtDollar(a.current_price)}</td>
    <td>${fmtDollar(a.stop_level)}</td>
    <td style="font-size:11px;color:var(--neon-red);text-shadow:0 0 8px rgba(255,58,0,0.4)">${escHtml(a.action)}</td>
  </tr>`).join('');
  el.innerHTML = `
    <div class="card-title" style="color:var(--neon-red);text-shadow:0 0 12px rgba(255,58,0,0.4)"><span class="card-title-icon">⚠</span> Stop-Loss Alerts</div>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>Ticker</th><th>P&L%</th><th>Price</th><th>Stop</th><th>Action</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/* ─── TRADES ─────────────────────────────────────────────── */

function renderTrades(trades) {
  const el = document.getElementById('rpt-trades');
  if (!trades.length) {
    el.innerHTML = `<div class="card-title"><span class="card-title-icon">⇄</span> Trades Executed</div>
      <div class="none-label">None this session.</div>`;
    return;
  }
  const rows = trades.map(t => {
    const sideCls = t.side === 'BUY' ? 'col-change-pos' : 'col-change-neg';
    return `<tr>
      <td class="col-symbol">${escHtml(t.symbol)}</td>
      <td class="${sideCls}" style="font-weight:700">${escHtml(t.side)}</td>
      <td>${t.shares} sh</td>
      <td>${fmtDollar(t.price)}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${escHtml(t.reason)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div class="card-title"><span class="card-title-icon">⇄</span> Trades Executed</div>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>Ticker</th><th>Side</th><th>Shares</th><th>Price</th><th>Reason</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/* ─── WATCHLIST CHANGES ──────────────────────────────────── */

function renderWatchlistChanges(changes) {
  const el = document.getElementById('rpt-watchlist');
  if (!changes.length) {
    el.innerHTML = `<div class="card-title"><span class="card-title-icon">◫</span> Watchlist Changes</div>
      <div class="none-label">No changes this session.</div>`;
    return;
  }
  const rows = changes.map(c => `<tr>
    <td class="col-symbol">${escHtml(c.symbol)}</td>
    <td style="font-size:11px">${escHtml(c.change)}</td>
    <td style="font-size:11px;color:var(--text-secondary)">${escHtml(c.reason)}</td>
  </tr>`).join('');
  el.innerHTML = `
    <div class="card-title"><span class="card-title-icon">◫</span> Watchlist Changes</div>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>Ticker</th><th>Change</th><th>Reason</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/* ─── OPPORTUNITIES ──────────────────────────────────────── */

function renderOpportunities(opps) {
  const el = document.getElementById('rpt-opportunities');
  if (!opps.length) { el.innerHTML = ''; return; }
  const cards = opps.map(o => `
    <div class="opp-card">
      <div class="opp-rank">#${o.rank} Opportunity</div>
      <div class="opp-ticker">${escHtml(o.symbol)}</div>
      <div class="opp-thesis">${escHtml(o.thesis)}</div>
      <div class="opp-footer">
        <div class="opp-entry">Entry: ${escHtml(o.entry_target)}</div>
        <div class="opp-action">${escHtml(o.action)}</div>
      </div>
    </div>
  `).join('');
  el.innerHTML = `
    <div class="card-title"><span class="card-title-icon">◆</span> Tomorrow's Top Opportunities</div>
    <div class="opp-grid">${cards}</div>`;
}

/* ─── ARCHIVE ─────────────────────────────────────────────── */

let archiveLoaded = false;

async function loadArchive() {
  if (archiveLoaded) return;
  archiveLoaded = true;
  const el = document.getElementById('archive-list');
  try {
    const res = await fetch(ARCHIVE_INDEX_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error();
    const index = await res.json();
    if (!index.length) {
      el.innerHTML = '<p class="no-data" style="padding:16px">No archived reports yet.</p>';
      return;
    }
    el.innerHTML = index.sort((a, b) => b.date.localeCompare(a.date)).map(entry => `
      <div class="archive-entry" data-date="${entry.date}" data-session="${escHtml(entry.session)}">
        <span class="archive-entry-date">${formatDateLong(entry.date)}</span>
        <span class="archive-entry-session">${escHtml(entry.session_label || entry.session)}</span>
      </div>
    `).join('');
    el.querySelectorAll('.archive-entry').forEach(row => {
      row.addEventListener('click', () => {
        el.querySelectorAll('.archive-entry').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        loadArchiveReport(row.dataset.date);
      });
    });
  } catch {
    el.innerHTML = '<p class="no-data" style="padding:16px;color:var(--neon-red)">Failed to load archive.</p>';
  }
}

async function loadArchiveReport(date) {
  const empty = document.getElementById('archive-empty');
  const root  = document.getElementById('archive-report-root');
  empty.classList.add('hidden');
  root.classList.remove('hidden');
  root.innerHTML = '<div class="empty-state small"><div class="loader"></div><p>Loading…</p></div>';
  try {
    const res = await fetch(ARCHIVE_REPORT(date) + '?t=' + Date.now());
    if (!res.ok) throw new Error();
    const data = await res.json();
    root.innerHTML = buildReportHTML(data);
  } catch {
    root.innerHTML = '<p class="empty-sub" style="padding:20px;color:var(--neon-red)">Failed to load report.</p>';
  }
}

function buildReportHTML(d) {
  const { meta, portfolio, positions, ah_movers, earnings,
          stop_loss_alerts, trades_executed, watchlist_changes,
          alerts, top_opportunities } = d;
  return `
    <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
      <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:4px">
        C.L.U. ${escHtml((meta.session_label || 'Report').toUpperCase())} — ${formatDate(meta.date)}
      </div>
      <div style="font-size:11px;color:var(--text-secondary)">
        ${formatDateLong(meta.date)} · Updated ${formatTime(meta.generated_at)} · Next: ${escHtml(meta.next_session)}
      </div>
    </div>
    ${buildAlertsHTML(alerts || [])}
    ${buildPortfolioHTML(portfolio)}
    ${buildMoversHTML(ah_movers || [])}
    ${buildEarningsHTML(earnings || [])}
    ${buildTradesHTML(trades_executed || [])}
    ${buildOpportunitiesHTML(top_opportunities || [])}
  `;
}

function buildAlertsHTML(alerts) {
  return alerts.map(a => `
    <div class="alert-banner ${a.level}" style="margin-bottom:10px">
      <div class="alert-title">⚠ ${escHtml(a.title)}</div>
      <div class="alert-msg">${escHtml(a.message)}</div>
    </div>`).join('');
}

function buildPortfolioHTML(p) {
  const sign = p.day_pnl_dollars >= 0 ? '+' : '';
  const pnlCls = p.day_pnl_dollars >= 0 ? 'pf-pnl-positive' : 'pf-pnl-negative';
  return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div class="card-title">◈ Portfolio</div>
    <div class="portfolio-grid">
      <div class="pf-item"><div class="pf-label">Total Value</div><div class="pf-value">${fmtDollar(p.total_value)}</div></div>
      <div class="pf-item"><div class="pf-label">Cash / BP</div><div class="pf-value small">${fmtDollar(p.cash)}</div></div>
      <div class="pf-item"><div class="pf-label">Day P&L</div><div class="pf-value small ${pnlCls}">${sign}${fmtDollar(p.day_pnl_dollars)} (${sign}${p.day_pnl_pct.toFixed(2)}%)</div></div>
      <div class="pf-item"><div class="pf-label">Positions</div><div class="pf-value small">${p.open_positions} / ${p.positions_cap}</div></div>
    </div>
  </div>`;
}

function buildMoversHTML(movers) {
  if (!movers.length) return '';
  return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div class="card-title">▲ After-Hours Movers</div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Ticker</th><th>AH Price</th><th>Change</th><th>Signal</th><th>Note</th></tr></thead>
    <tbody>${movers.map(m => {
      const sign = m.change_pct >= 0 ? '+' : '';
      const cls  = m.change_pct >= 0 ? 'col-change-pos' : 'col-change-neg';
      return `<tr><td class="col-symbol">${escHtml(m.symbol)}</td><td>${fmtDollar(m.ah_price)}</td>
        <td class="${cls}">${sign}${m.change_pct.toFixed(1)}%</td>
        <td><span class="badge badge-${m.signal}">${m.signal}</span></td>
        <td style="font-size:11px;color:var(--text-secondary)">${escHtml(m.note)}</td></tr>`;
    }).join('')}</tbody></table></div>
  </div>`;
}

function buildEarningsHTML(earnings) {
  if (!earnings.length) return '';
  return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div class="card-title">◎ Earnings &amp; News</div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Ticker</th><th>Event</th><th>Result</th><th>Beat%</th><th>Impact</th></tr></thead>
    <tbody>${earnings.map(e => {
      const sign = e.beat_pct >= 0 ? '+' : '';
      const cls  = e.beat_pct >= 0 ? 'col-change-pos' : 'col-change-neg';
      const badge = e.result === 'beat' ? 'beat' : (e.result === 'miss' ? 'miss' : 'inline');
      return `<tr><td class="col-symbol">${escHtml(e.symbol)}</td>
        <td style="font-size:11px;color:var(--text-secondary)">${escHtml(e.event)}</td>
        <td><span class="badge badge-${badge}">${e.result.toUpperCase()}</span></td>
        <td class="${cls}">${sign}${e.beat_pct.toFixed(1)}%</td>
        <td style="font-size:11px;color:var(--text-secondary)">${escHtml(e.impact)}</td></tr>`;
    }).join('')}</tbody></table></div>
  </div>`;
}

function buildTradesHTML(trades) {
  if (!trades.length) return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div class="card-title">⇄ Trades Executed</div><div class="none-label">None this session.</div></div>`;
  return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div class="card-title">⇄ Trades Executed</div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Ticker</th><th>Side</th><th>Shares</th><th>Price</th><th>Reason</th></tr></thead>
    <tbody>${trades.map(t => {
      const cls = t.side === 'BUY' ? 'col-change-pos' : 'col-change-neg';
      return `<tr><td class="col-symbol">${escHtml(t.symbol)}</td><td class="${cls}">${escHtml(t.side)}</td>
        <td>${t.shares}</td><td>${fmtDollar(t.price)}</td>
        <td style="font-size:11px;color:var(--text-secondary)">${escHtml(t.reason)}</td></tr>`;
    }).join('')}</tbody></table></div>
  </div>`;
}

function buildOpportunitiesHTML(opps) {
  if (!opps.length) return '';
  return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div class="card-title">◆ Tomorrow's Top Opportunities</div>
    <div class="opp-grid">${opps.map(o => `
      <div class="opp-card">
        <div class="opp-rank">#${o.rank}</div>
        <div class="opp-ticker">${escHtml(o.symbol)}</div>
        <div class="opp-thesis">${escHtml(o.thesis)}</div>
        <div class="opp-footer">
          <div class="opp-entry">Entry: ${escHtml(o.entry_target)}</div>
          <div class="opp-action">${escHtml(o.action)}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

/* ─── UTILS ──────────────────────────────────────────────── */

function fmtDollar(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

function formatDateLong(dateStr) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, d] = dateStr.split('-');
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function formatTime(isoStr) {
  try {
    return new Date(isoStr).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }) + ' PDT';
  } catch { return isoStr; }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
