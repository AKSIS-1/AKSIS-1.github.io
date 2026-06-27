/* ============================================================
   C.L.U. — Cognitive Logic Unit — Report Renderer v4.4
   "Blade Runner Transmission"
   ============================================================ */

const DATA_URL          = './data/latest.json';
const ARCHIVE_INDEX_URL = './data/archive/index.json';
const ARCHIVE_REPORT    = (d) => `./data/archive/${d}.json`;
const JOURNEY_URL       = './data/projected_journey.json';
const REFRESH_SECS      = 300;

/* Per-position slice colors: icy blue, magenta, orange, yellow, red, lime, violet, teal */
const POS_COLORS = ['#7EC8FF','#e040fb','#ff9a44','#ffdd00','#ff5a7a','#80ff9a','#b388ff','#40e0d0'];

let countdownVal  = REFRESH_SECS;
let countdownTick = null;
let currentTab    = 'today';
let journeyLoaded = false;
let cachedAccuracy = null;

/* ─── INIT ───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  startClock();
  initTabs();
  loadReport();
});

/* ─── CLOCK ───────────────────────────────────────────── */

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

/* ─── TABS ───────────────────────────────────────────── */

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
  if (tab === 'journey') loadJourney();
}

/* ─── AUTO-REFRESH ─────────────────────────────────────────── */

function resetCountdown() {
  countdownVal = REFRESH_SECS;
  clearInterval(countdownTick);
  countdownTick = setInterval(() => {
    countdownVal--;
    const el = document.getElementById('countdown');
    if (el) el.textContent = countdownVal;
    if (countdownVal <= 0) { resetCountdown(); loadReport(); }
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

/* ─── REPORT RENDERER ────────────────────────────────────────── */

function renderReport(d) {
  const { meta, portfolio, positions, earnings,
          stop_loss_alerts, stop_audit, trades_executed, watchlist_changes,
          alerts, top_opportunities, thoughts, learned_patterns,
          signal_matrix, dividend_matrix, accuracy } = d;

  const movers = d.watchlist_movers || d.ah_movers || [];

  const rawLabel = (meta.session_label || 'Live Report').replace(/after[- ]?hours/i, 'Live Report');
  document.getElementById('rpt-title').textContent =
    `C.L.U. ${rawLabel.toUpperCase()} — ${formatDate(meta.date)}`;
  document.getElementById('rpt-date').textContent      = formatDateLong(meta.date);
  document.getElementById('rpt-generated').textContent = formatTime(meta.generated_at);
  document.getElementById('rpt-next-session').textContent = meta.next_session;

  cachedAccuracy = accuracy || null;

  renderThoughts(thoughts || []);
  renderAlerts(alerts || []);
  renderAccountOverview(portfolio, positions || []);
  renderPositions(positions || []);
  renderSignalMatrix(signal_matrix || [], meta);
  renderDividendMatrix(dividend_matrix || []);
  renderMovers(movers);
  renderLearnedPatterns(learned_patterns || []);
  renderAccuracy(cachedAccuracy);
  renderEarnings(earnings || []);
  renderStopAudit(stop_audit || null);
  renderStopLoss(stop_loss_alerts || []);
  renderTrades(trades_executed || []);
  renderWatchlistChanges(watchlist_changes || []);
  renderOpportunities(top_opportunities || []);
}

/* ─── COMPOSITE SCORE HELPERS ─────────────────────────────────────────── */

/* Signal class for a composite score in [-1, +1] */
function compositeClass(score) {
  if (score === null || score === undefined) return 'neutral';
  if (score >  0.3) return 'bullish';
  if (score < -0.3) return 'bearish';
  return 'neutral';
}

/* A horizontal -1..+1 gauge with a center axis; fill grows right (green) or left (red). */
function compositeBar(score) {
  if (score === null || score === undefined) return '';
  const s = Math.max(-1, Math.min(1, Number(score)));
  const cls = compositeClass(s);
  const halfPct = Math.abs(s) * 50;          // 0..50% of the bar width
  const side = s >= 0
    ? `left:50%;width:${halfPct}%`
    : `right:50%;width:${halfPct}%`;
  return `<span class="cscore-bar cscore-${cls}" title="Composite score ${s.toFixed(2)}">
    <span class="cscore-fill" style="${side}"></span>
    <span class="cscore-axis"></span>
  </span>`;
}

/* Inline chip: score number + BULLISH/NEUTRAL/BEARISH badge */
function compositeChip(score, signal) {
  if (score === null || score === undefined) return '';
  const cls = compositeClass(score);
  const sig = signal || cls.toUpperCase();
  const sign = score >= 0 ? '+' : '';
  return `<span class="cscore-chip cscore-${cls}">
    <span class="cscore-num">S ${sign}${Number(score).toFixed(2)}</span>
    <span class="badge badge-${cls}">${escHtml(sig)}</span>
  </span>`;
}

/* ─── PIE CHART (SVG donut) ────────────────────────────────────────── */

function svgDonut(segments, total, size) {
  size = size || 96;
  if (!total) return '';
  const cx = size / 2, cy = size / 2;
  const outerR = size / 2 - 3;
  const innerR = outerR * 0.50;
  let startAngle = -Math.PI / 2;
  let paths = '';

  segments.forEach(function(seg) {
    if (seg.value <= 0) return;
    const angle = (seg.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const ox1 = cx + outerR * Math.cos(startAngle);
    const oy1 = cy + outerR * Math.sin(startAngle);
    const ox2 = cx + outerR * Math.cos(endAngle);
    const oy2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    paths += `<path d="M${ox1.toFixed(2)},${oy1.toFixed(2)} A${outerR},${outerR} 0 ${large},1 ${ox2.toFixed(2)},${oy2.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${innerR},${innerR} 0 ${large},0 ${ix2.toFixed(2)},${iy2.toFixed(2)} Z" fill="${seg.color}" opacity="0.88"/>`;
    startAngle = endAngle;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${outerR + 2}" fill="rgba(0,0,24,0.6)" stroke="rgba(126,200,255,0.10)" stroke-width="1"/>
    ${paths}
    <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="rgba(0,0,20,0.95)" stroke="rgba(126,200,255,0.18)" stroke-width="1"/>
  </svg>`;
}

/* ─── ACCOUNT OVERVIEW ────────────────────────────────────────── */

function renderAccountOverview(p, positions) {
  const pending = p.pending_deposits || 0;

  const posSegments = (positions || []).map(function(pos, i) {
    return { label: pos.symbol, value: pos.notional || 0, color: POS_COLORS[i % POS_COLORS.length] };
  });

  const cashSegment = { label: 'Cash', value: p.cash, color: '#00ff88' };
  const segments = posSegments.concat([cashSegment]).filter(function(s) { return s.value > 0; });

  const pie = svgDonut(segments, p.total_value, 96);

  const pnlSign  = p.day_pnl_dollars >= 0 ? '+' : '';
  const pnlClass = p.day_pnl_dollars >= 0 ? 'pf-pnl-positive' : 'pf-pnl-negative';
  const invested = Math.max(0, p.total_value - p.cash);
  const slotPct  = Math.round((p.open_positions / p.positions_cap) * 100);

  const legend = segments.map(s =>
    `<div class="acct-legend-item"><div class="acct-legend-dot" style="background:${s.color};box-shadow:0 0 5px ${s.color}55"></div><span style="font-family:var(--display);font-size:9px;color:var(--t2);letter-spacing:1px">${escHtml(s.label)}</span> <span style="color:var(--t4)">${fmtDollar(s.value)}</span></div>`
  ).join('');

  document.getElementById('rpt-account').innerHTML = `
    <div class="card-title"><span class="card-title-icon">◈</span> Account Overview</div>
    <div class="acct-inner">
      <div class="acct-chart">
        ${pie}
        <div class="acct-legend">${legend}</div>
      </div>
      <div class="acct-stats">
        <div class="pf-item">
          <div class="pf-label">Total Value</div>
          <div class="pf-value">${fmtDollar(p.total_value)}</div>
        </div>
        <div class="pf-item">
          <div class="pf-label">Day P&amp;L</div>
          <div class="pf-value small ${pnlClass}">${pnlSign}${fmtDollar(p.day_pnl_dollars)} <span style="font-size:12px">(${pnlSign}${p.day_pnl_pct.toFixed(2)}%)</span></div>
        </div>
        <div class="pf-item">
          <div class="pf-label">Cash / Buying Power</div>
          <div class="pf-value small">${fmtDollar(p.cash)}</div>
        </div>
        <div class="pf-item">
          <div class="pf-label">Slots ${p.open_positions}/${p.positions_cap}</div>
          <div class="pf-value small">${fmtDollar(invested)} deployed</div>
          <div class="slot-bar"><div class="slot-fill" style="width:${slotPct}%"></div></div>
        </div>
        ${pending > 0 ? `<div class="pf-item" style="grid-column:1/-1">
          <div class="pf-label">Pending Deposit</div>
          <div class="pf-value small" style="color:var(--yellow)">${fmtDollar(pending)}</div>
        </div>` : ''}
      </div>
    </div>`;
}

/* ─── CLU'S THOUGHTS ─────────────────────────────────────────── */

function renderThoughts(thoughts) {
  const el = document.getElementById('rpt-thoughts');
  if (!el) return;
  if (!thoughts.length) { el.innerHTML = ''; return; }
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

/* ─── LEARNED PATTERNS ─────────────────────────────────────────── */

function renderLearnedPatterns(patterns) {
  const el = document.getElementById('rpt-patterns');
  if (!el) return;
  if (!patterns.length) { el.innerHTML = ''; return; }
  const items = patterns.map(p => {
    const confClass = p.confidence === 'high' ? 'conf-high'
                    : p.confidence === 'medium' ? 'conf-medium'
                    : 'conf-low';
    return `<div class="pattern-item">
      <div class="pattern-meta">
        <span class="pattern-cat">${escHtml(p.category)}</span>
        <span class="conf-badge ${confClass}">${escHtml(p.confidence)}</span>
      </div>
      <div class="pattern-text">${escHtml(p.pattern)}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="patterns-card">
    <div class="patterns-header">
      <span class="patterns-header-icon">◑</span>
      CLU's Learned Patterns
      <span class="patterns-header-right">CROSS-SESSION INTELLIGENCE</span>
    </div>
    ${items}
  </div>`;
}

/* ─── ALERTS ────────────────────────────────────────────── */

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

/* ─── ACTIVE POSITIONS ─────────────────────────────────────────── */

function renderPositions(positions) {
  const el = document.getElementById('rpt-positions');
  if (!positions.length) {
    el.innerHTML = `<div class="card-title"><span class="card-title-icon">◉</span> Active Positions</div>
      <p class="no-data">No active positions.</p>`;
    return;
  }
  const rows = positions.map(function(pos, i) {
    const pnl      = pos.total_pnl_pct >= 0;
    const pnlClass = pnl ? 'pos-pnl-pos' : 'pos-pnl-neg';
    const pnlSign  = pnl ? '+' : '';
    const dayPos   = pos.day_pnl_pct >= 0;
    const dayColor = dayPos ? 'var(--green)' : 'var(--red)';
    const daySign  = dayPos ? '+' : '';
    const accentColor = POS_COLORS[i % POS_COLORS.length];
    const tierKey   = (pos.tier || 'stock').toLowerCase();
    const tierLabel = tierKey === 'drip' ? 'DRIP' : tierKey === 'etf' ? 'ETF' : 'STOCK';
    const stopLabel = pos.stop_type === 'none' || tierKey === 'drip'
      ? 'stop: none (DRIP — hold forever)'
      : pos.stop_type === 'manual'
        ? `stop ${fmtDollar(pos.stop_level)} ⚡ manual${pos.stop_trail_pct ? ' trail ' + pos.stop_trail_pct + '%' : ''}`
        : `stop ${fmtDollar(pos.stop_level)} GTC trailing ${pos.stop_trail_pct || 5}%`;
    return `
      <div class="pos-row" style="animation-delay:${i * 0.12}s">
        <div class="pos-left">
          <div class="pos-ticker-row">
            <span class="pos-ticker" style="color:${accentColor};text-shadow:0 0 16px ${accentColor}88">${escHtml(pos.symbol)}</span>
            <span class="tier-badge tier-${tierKey}">${tierLabel}</span>
          </div>
          ${pos.full_name ? `<span class="pos-name">${escHtml(pos.full_name)}</span>` : ''}
          ${pos.desc      ? `<span class="pos-desc">${escHtml(pos.desc)}</span>` : ''}
          <span class="pos-detail">${pos.shares} sh &middot; entry ${fmtDollar(pos.entry_price)} &middot; notional ${fmtDollar(pos.notional)}</span>
          <span class="pos-stop">${stopLabel}</span>
          ${pos.composite_score !== undefined ? `<span class="pos-cscore">${compositeChip(pos.composite_score, pos.composite_signal)}</span>` : ''}
        </div>
        <div class="pos-right">
          <div class="pos-pnl ${pnlClass}">${pnlSign}${pos.total_pnl_pct.toFixed(2)}%</div>
          <div class="pos-price">${fmtDollar(pos.current_price)}</div>
          <div class="pos-day" style="color:${dayColor}">day ${daySign}${pos.day_pnl_pct.toFixed(2)}%</div>
        </div>
      </div>`;
  }).join('');
  el.innerHTML = `<div class="card-title"><span class="card-title-icon">◉</span> Active Positions</div>${rows}`;
}

/* ─── SIGNAL MATRIX (quant engine output) ─────────────────────────────── */

function renderSignalMatrix(matrix, meta) {
  const el = document.getElementById('rpt-signal-matrix');
  if (!el) return;
  if (!matrix || !matrix.length) { el.innerHTML = ''; return; }

  const computedAt = (meta && meta.signal_computed_at)
    ? formatTime(meta.signal_computed_at) : null;

  const rows = matrix.map(s => {
    const cls     = compositeClass(s.composite_score);
    const sign    = s.composite_score >= 0 ? '+' : '';
    const rsiCls  = s.rsi_signal === 'Oversold' ? 'col-change-pos'
                  : s.rsi_signal === 'Overbought' ? 'col-change-neg' : '';
    const zCls    = s.z_signal === 'OVERSOLD' ? 'col-change-pos'
                  : s.z_signal === 'OVERBOUGHT' ? 'col-change-neg' : '';
    const macdCls = s.macd === 'Bullish' ? 'col-change-pos' : 'col-change-neg';
    const trendCls = s.trend_50d === 'Up' ? 'col-change-pos'
                   : s.trend_50d === 'Down' ? 'col-change-neg' : '';
    const divgTag  = s.rsi_divergence && s.rsi_divergence !== 'None'
      ? `<span class="sm-divg sm-divg-${s.rsi_divergence.toLowerCase()}">${escHtml(s.rsi_divergence)}</span>` : '';
    const bbVal    = s.bb_pct !== undefined && s.bb_pct !== null
      ? `<span class="sm-bb" title="Bollinger %B">${Number(s.bb_pct).toFixed(2)}</span>` : '—';
    const macdHistVal = s.macd_hist !== undefined
      ? `<span class="sm-sub">${s.macd_hist > 0 ? '+' : ''}${Number(s.macd_hist).toFixed(3)}</span>` : '';
    const atrVal   = s.atr_pct !== undefined && s.atr_pct !== null
      ? `<span class="sm-atr" title="ATR as % of price">${s.atr_pct}%</span>` : '—';
    return `<tr>
      <td class="col-symbol">${escHtml(s.symbol)}</td>
      <td class="${rsiCls}">${s.rsi_14 ?? '—'}<span class="sm-sub">${escHtml(s.rsi_signal || '')}</span>${divgTag}</td>
      <td class="${macdCls}">${escHtml(s.macd || '—')}${macdHistVal}</td>
      <td>${bbVal}</td>
      <td class="${zCls}">${s.z_score ?? '—'}<span class="sm-sub">${escHtml(s.z_signal || '')}</span></td>
      <td>${escHtml(s.vol_signal || '—')}</td>
      <td class="${trendCls}">${escHtml(s.trend_50d || '—')}</td>
      <td>${atrVal}</td>
      <td class="sm-score-cell">
        <div class="sm-score-row">${compositeBar(s.composite_score)}<span class="sm-score-num cscore-${cls}">${sign}${Number(s.composite_score).toFixed(2)}</span></div>
      </td>
      <td><span class="badge badge-${cls}">${escHtml(s.composite_signal || cls.toUpperCase())}</span></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="card-title">
      <span class="card-title-icon">⚙</span> Quant Signal Matrix
      <span class="card-title-right">${computedAt ? 'COMPUTED ' + computedAt : 'LOCAL PYTHON ENGINE'}</span>
    </div>
    <p class="sm-caption">Computed locally before each session — RSI, MACD, BB%B, Z-score, volume, trend &amp; ATR collapse into one composite score S ∈ [−1,+1]. Claude reads only this output.</p>
    <div class="table-scroll">
    <table class="data-table sm-table">
      <thead><tr>
        <th>Ticker</th><th>RSI</th><th>MACD</th><th>BB%B</th><th>Z-Score</th><th>Vol</th><th>Trend50</th><th>ATR%</th><th>Composite S</th><th>Signal</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/* ─── DIVIDEND MATRIX (DRIP tier) ─────────────────────────────────────── */

function renderDividendMatrix(matrix) {
  const el = document.getElementById('rpt-dividend-matrix');
  if (!el) return;
  if (!matrix || !matrix.length) { el.innerHTML = ''; return; }

  const rows = matrix.map(d => {
    const yieldVal  = d.dividend_yield_pct !== null && d.dividend_yield_pct !== undefined
      ? `${Number(d.dividend_yield_pct).toFixed(2)}%` : '—';
    const yieldCls  = d.dividend_yield_pct >= 4 ? 'col-change-pos' : d.dividend_yield_pct >= 2 ? '' : 'col-change-neg';
    const payoutVal = d.payout_ratio_pct !== null && d.payout_ratio_pct !== undefined
      ? `${Number(d.payout_ratio_pct).toFixed(0)}%` : '—';
    const payoutCls = d.payout_ratio_pct > 80 ? 'col-change-neg' : d.payout_ratio_pct < 60 ? 'col-change-pos' : '';
    const annDiv    = d.annual_dividend ? `$${Number(d.annual_dividend).toFixed(2)}` : '—';
    const exDate    = d.ex_dividend_date ? escHtml(d.ex_dividend_date) : '—';
    const streak    = d.dividend_growth_streak ?? 0;
    const streakCls = streak >= 10 ? 'col-change-pos' : streak >= 5 ? '' : 'col-change-neg';
    const safety    = d.dividend_safety_score;
    const safetyCls = safety >= 70 ? 'col-change-pos' : safety >= 50 ? '' : 'col-change-neg';
    const safetyBar = safety !== null && safety !== undefined
      ? `<div class="div-safety-bar"><div class="div-safety-fill" style="width:${safety}%;background:${safety >= 70 ? 'var(--green)' : safety >= 50 ? 'var(--yellow)' : 'var(--red)'}"></div></div>`
      : '';
    return `<tr>
      <td class="col-symbol">${escHtml(d.symbol)}</td>
      <td class="${yieldCls}" style="font-weight:700">${yieldVal}</td>
      <td class="${payoutCls}">${payoutVal}</td>
      <td style="color:var(--t2)">${annDiv}</td>
      <td style="font-size:11px;color:var(--t3)">${exDate}</td>
      <td class="${streakCls}">${streak}yr</td>
      <td><div style="display:flex;align-items:center;gap:8px"><span class="${safetyCls}">${safety ?? '—'}</span>${safetyBar}</div></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="card-title">
      <span class="card-title-icon">◈</span> Dividend Matrix
      <span class="card-title-right">DRIP TIER · HOLD FOREVER · NO STOP-LOSS</span>
    </div>
    <p class="sm-caption">DRIP tier assets held indefinitely — dividends auto-reinvest. Safety score combines yield, payout ratio, and dividend growth streak.</p>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>Ticker</th><th>Yield</th><th>Payout%</th><th>Ann. Div</th><th>Ex-Date</th><th>Growth Streak</th><th>Safety (0–100)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/* ─── ACCURACY & SELF-CORRECTION (learning loop) ──────────────────────── */

function renderAccuracy(acc) {
  const el = document.getElementById('rpt-accuracy');
  if (!el) return;
  if (!acc) { el.innerHTML = ''; return; }

  const wr      = (acc.win_rate_pct !== undefined && acc.win_rate_pct !== null)
                  ? acc.win_rate_pct : null;
  const wrColor = wr === null ? 'var(--t3)'
                : wr >= 60 ? 'var(--green)'
                : wr >= 45 ? 'var(--yellow)' : 'var(--red)';
  const evaluated = acc.trades_evaluated ?? 0;
  const pending   = acc.trades_pending ?? 0;
  const phase     = acc.phase || null;

  const blocked = (acc.do_not_trade || []).map(c =>
    `<div class="dnt-chip" title="${escHtml(c.notes || '')}">
       <span class="dnt-x">⛔</span>
       <span class="dnt-cond">${escHtml(c.condition)}</span>
       <span class="dnt-delta">${c.cumulative_delta}</span>
     </div>`).join('');

  const ledger = (acc.recent_ledger || []).map(r => {
    const d = r.accuracy_delta;
    const dCls = (d === null || d === undefined || d === 'TBD') ? 'col-change-neu'
               : Number(d) > 0 ? 'col-change-pos' : 'col-change-neg';
    const dVal = (d === null || d === undefined) ? 'TBD' : d;
    return `<tr>
      <td class="col-symbol">${escHtml(r.ticker)}</td>
      <td>${escHtml(r.action || 'BUY')}</td>
      <td>${escHtml(r.outcome || 'TBD')}</td>
      <td class="${dCls}">${escHtml(String(dVal))}</td>
      <td style="font-size:10px;color:var(--text-dim)">${escHtml(r.conditions || '')}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="acc-card">
      <div class="acc-header">
        <span class="acc-header-icon">◎</span>
        Accuracy &amp; Self-Correction
        <span class="acc-header-right">CLOSED-LOOP LEARNING</span>
      </div>
      <div class="acc-stats">
        <div class="acc-stat">
          <div class="acc-stat-val" style="color:${wrColor}">${wr === null ? '—' : wr + '%'}</div>
          <div class="acc-stat-label">Win Rate</div>
        </div>
        <div class="acc-stat">
          <div class="acc-stat-val">${evaluated}</div>
          <div class="acc-stat-label">Trades Graded</div>
        </div>
        <div class="acc-stat">
          <div class="acc-stat-val" style="color:var(--yellow)">${pending}</div>
          <div class="acc-stat-label">Awaiting 5-Day</div>
        </div>
        ${phase ? `<div class="acc-stat">
          <div class="acc-stat-val" style="color:var(--blue);font-size:13px">${escHtml(phase)}</div>
          <div class="acc-stat-label">Intel Phase</div>
        </div>` : ''}
      </div>
      ${blocked ? `<div class="dnt-block">
        <div class="dnt-title">⛔ DO-NOT-TRADE CONDITIONS <span class="dnt-sub">auto-learned from losing setups</span></div>
        <div class="dnt-list">${blocked}</div>
      </div>` : `<div class="dnt-block"><div class="dnt-title" style="color:var(--green)">✓ No blocked conditions — no losing pattern has crossed the −1.5 threshold.</div></div>`}
      ${ledger ? `<div class="table-scroll" style="margin-top:12px">
        <table class="data-table">
          <thead><tr><th>Ticker</th><th>Action</th><th>5-Day Outcome</th><th>Δ</th><th>Entry Conditions</th></tr></thead>
          <tbody>${ledger}</tbody>
        </table>
      </div>` : ''}
    </div>`;
}

/* ─── WATCHLIST MOVERS ─────────────────────────────────────────── */

function renderMovers(movers) {
  const el = document.getElementById('rpt-movers');
  if (!movers.length) { el.innerHTML = ''; return; }
  const rows = movers.map(m => {
    const price  = m.price !== undefined ? m.price : m.ah_price;
    const chg    = m.change_pct;
    const chgCls = chg > 0 ? 'col-change-pos' : (chg < 0 ? 'col-change-neg' : 'col-change-neu');
    const sign   = chg > 0 ? '+' : '';
    const sigKey = (m.signal || 'neutral').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const sigLabel = (m.signal || 'neutral').replace(/-/g, ' ').toUpperCase();
    const cScore = (m.composite_score !== undefined && m.composite_score !== null)
      ? `<span class="cscore-num cscore-${compositeClass(m.composite_score)}">${m.composite_score >= 0 ? '+' : ''}${Number(m.composite_score).toFixed(2)}</span>`
      : '<span style="color:var(--t4)">—</span>';
    return `<tr>
      <td class="col-symbol">${escHtml(m.symbol)}</td>
      <td class="col-price">${fmtDollar(price)}</td>
      <td class="${chgCls}">${sign}${chg.toFixed(1)}%</td>
      <td>${cScore}</td>
      <td><span class="badge badge-${sigKey}">${sigLabel}</span></td>
      <td class="wl-tag">${escHtml(m.watchlist)}</td>
      <td style="color:var(--text-secondary);font-size:11px">${escHtml(m.note)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div class="card-title"><span class="card-title-icon">▲</span> Watchlist Movers</div>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr>
        <th>Ticker</th><th>Price</th><th>Change</th><th>S</th><th>Signal</th><th>Watchlist</th><th>Note</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
}

/* ─── EARNINGS ────────────────────────────────────────────── */

function renderEarnings(earnings) {
  const el = document.getElementById('rpt-earnings');
  if (!earnings.length) { el.innerHTML = ''; return; }
  const rows = earnings.map(e => {
    const sign     = e.beat_pct >= 0 ? '+' : '';
    const pctCls   = e.beat_pct >= 0 ? 'col-change-pos' : 'col-change-neg';
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

/* ─── STOP-LOSS ────────────────────────────────────────────── */

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

/* ─── STOP AUDIT ─────────────────────────────────────────────── */

function renderStopAudit(audit) {
  const el = document.getElementById('rpt-stop-audit');
  if (!audit || !audit.summary) {
    el.innerHTML = `<div class="card-title"><span class="card-title-icon">⬡</span> Stop Protection Audit</div>
      <div class="none-label">Not yet audited this session.</div>`;
    return;
  }

  const s = audit.summary;
  const ok = audit.all_protected;
  const bannerCls = ok ? 'audit-banner audit-ok' : 'audit-banner audit-bad';
  const bannerTxt = ok
    ? `All ${s.whole_share_positions} whole-share position${s.whole_share_positions === 1 ? '' : 's'} protected by live stops`
    : `${s.unprotected} unprotected · ${s.partial} partial · ${s.drip_violations} DRIP violation${s.drip_violations === 1 ? '' : 's'}`;

  const STATUS = {
    protected:          ['PROTECTED', 'audit-pill-ok'],
    unprotected:        ['UNPROTECTED', 'audit-pill-bad'],
    partial:            ['PARTIAL', 'audit-pill-warn'],
    drip_ok:            ['DRIP · NO STOP', 'audit-pill-muted'],
    drip_violation:     ['DRIP VIOLATION', 'audit-pill-bad'],
    skipped_fractional: ['FRACTIONAL · MONITOR', 'audit-pill-muted'],
  };

  const rows = (audit.positions || []).map(p => {
    const [label, cls] = STATUS[p.status] || [p.status, 'audit-pill-muted'];
    const trail = (p.trail_pct !== null && p.trail_pct !== undefined)
      ? `${p.trail_pct}%` : '—';
    return `<tr>
      <td class="col-symbol">${escHtml(p.symbol)}</td>
      <td><span class="tier-badge tier-${escHtml((p.tier || 'stock').toLowerCase())}">${escHtml(p.tier || 'stock')}</span></td>
      <td>${p.quantity}</td>
      <td>${trail}</td>
      <td><span class="audit-pill ${cls}">${escHtml(label)}</span></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="card-title"><span class="card-title-icon">⬡</span> Stop Protection Audit</div>
    <div class="${bannerCls}">${escHtml(bannerTxt)}</div>
    <div class="table-scroll">
    <table class="data-table">
      <thead><tr><th>Ticker</th><th>Tier</th><th>Shares</th><th>Trail</th><th>Status</th></tr></thead>
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

/* ─── WATCHLIST CHANGES ─────────────────────────────────────────── */

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

/* ─── OPPORTUNITIES ────────────────────────────────────────────── */

function renderOpportunities(opps) {
  const el = document.getElementById('rpt-opportunities');
  if (!opps.length) { el.innerHTML = ''; return; }
  const cards = opps.map(o => `
    <div class="opp-card">
      <div class="opp-rank">#${o.rank} Opportunity</div>
      <div class="opp-ticker-row">
        <span class="opp-ticker">${escHtml(o.symbol)}</span>
        ${o.composite_score !== undefined ? compositeChip(o.composite_score, o.composite_signal) : ''}
      </div>
      <div class="opp-thesis">${escHtml(o.thesis)}</div>
      ${o.quant_gate_status ? `<div class="opp-gate"><span class="opp-gate-label">QUANT GATE</span> ${escHtml(o.quant_gate_status)}</div>` : ''}
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

/* ============================================================
   PROJECTED JOURNEY
   ============================================================ */

async function loadJourney() {
  if (journeyLoaded) return;
  journeyLoaded = true;
  const loading = document.getElementById('journey-loading');
  const error   = document.getElementById('journey-error');
  const root    = document.getElementById('journey-root');
  try {
    const res = await fetch(JOURNEY_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error();
    const data = await res.json();
    loading.classList.add('hidden');
    root.classList.remove('hidden');
    renderProjectedJourney(data);
  } catch {
    loading.classList.add('hidden');
    error.classList.remove('hidden');
  }
}

function renderProjectedJourney(d) {
  const root = document.getElementById('journey-root');
  root.innerHTML =
    buildJourneyHeader(d.meta, d.growth_chart) +
    buildJourneyIntelBanner(cachedAccuracy) +
    `<div class="card journey-chart-card">` +
      `<div class="card-title"><span class="card-title-icon">◈</span> Growth Projection</div>` +
      `<div class="journey-chart-wrap">` +
        svgLineChart(d.growth_chart.actual || [], d.growth_chart.projected || []) +
        `<div class="journey-chart-legend">` +
          `<span class="jcl-item jcl-actual"><span class="jcl-line"></span> Actual</span>` +
          `<span class="jcl-item jcl-proj"><span class="jcl-line jcl-line-dash"></span> Projected</span>` +
          `<span class="jcl-meta">${escHtml(d.growth_chart.projection_basis || '')}</span>` +
          `<span class="jcl-conf conf-${escHtml(d.growth_chart.projection_confidence || 'low')}">${escHtml((d.growth_chart.projection_confidence || 'low').toUpperCase())} CONFIDENCE</span>` +
        `</div>` +
      `</div>` +
    `</div>` +
    `<div class="journey-grid-3">` +
      buildJourneyDecisions(d.next_decisions || []) +
      buildJourneyEvolution(d.intelligence_evolution || []) +
      buildJourneyDNA(d.strategy_dna || []) +
    `</div>` +
    `<section class="card" id="rpt-accuracy"></section>` +
    `<div class="journey-grid-2">` +
      buildJourneyRisk(d.risk_profile) +
      buildJourneyMilestones(d.milestones || []) +
    `</div>` +
    buildJourneyRecap(d.weekly_recap);

  if (cachedAccuracy) renderAccuracy(cachedAccuracy);
}

function buildJourneyHeader(meta, chart) {
  const updDate   = meta.updated_at ? formatTime(meta.updated_at) : '—';
  const nextUpd   = meta.next_update || '—';
  const weeklyTgt = chart && chart.weekly_target_pct  ? `+${chart.weekly_target_pct}%/wk`  : '';
  const monthTgt  = chart && chart.monthly_target_pct ? `+${chart.monthly_target_pct}%/mo` : '';
  return `<div class="journey-header">
    <div class="journey-header-title"><span class="journey-title-icon">◆</span> CLU — Projected Journey</div>
    <div class="journey-header-meta">
      <span>Updated ${escHtml(updDate)}</span>
      <span class="meta-sep">·</span>
      <span>Next update: <strong>${escHtml(nextUpd)}</strong></span>
      <span class="meta-sep">·</span>
      <span>Target ${escHtml(weeklyTgt)} · ${escHtml(monthTgt)}</span>
      <span class="meta-sep">·</span>
      <span class="journey-cadence">${escHtml(meta.update_cadence || 'Weekly — Friday')}</span>
    </div>
  </div>`;
}

/* ─── JOURNEY INTELLIGENCE STATUS BANNER ────────────────────────────── */

function buildJourneyIntelBanner(acc) {
  if (!acc) return '';
  const phase = acc.phase || 'Phase 1 · Foundation';
  const wr = (acc.win_rate_pct !== undefined && acc.win_rate_pct !== null) ? acc.win_rate_pct : null;
  const evaluated = acc.trades_evaluated ?? 0;
  const pending   = acc.trades_pending ?? 0;
  const dnt       = (acc.do_not_trade || []).length;
  const wrColor   = wr === null ? 'var(--t3)' : wr >= 60 ? 'var(--green)' : wr >= 45 ? 'var(--yellow)' : 'var(--red)';
  const dntColor  = dnt > 0 ? 'var(--neon-orange)' : 'var(--green)';
  return `<div class="journey-intel-banner">
    <div class="jib-item">
      <div class="jib-label">INTELLIGENCE PHASE</div>
      <div class="jib-val" style="color:var(--blue)">${escHtml(phase)}</div>
    </div>
    <div class="jib-sep"></div>
    <div class="jib-item">
      <div class="jib-label">WIN RATE</div>
      <div class="jib-val" style="color:${wrColor}">${wr === null ? '—' : wr + '%'}</div>
    </div>
    <div class="jib-sep"></div>
    <div class="jib-item">
      <div class="jib-label">TRADES GRADED</div>
      <div class="jib-val">${evaluated}</div>
    </div>
    <div class="jib-sep"></div>
    <div class="jib-item">
      <div class="jib-label">AWAITING 5-DAY</div>
      <div class="jib-val" style="color:var(--yellow)">${pending}</div>
    </div>
    <div class="jib-sep"></div>
    <div class="jib-item">
      <div class="jib-label">BLOCKED CONDITIONS</div>
      <div class="jib-val" style="color:${dntColor}">${dnt > 0 ? dnt + ' active' : 'None'}</div>
    </div>
  </div>`;
}

/* ─── SVG LINE CHART (Robinhood-style) ────────────────────────────── */

function svgLineChart(actual, projected) {
  const VW = 900, VH = 200;
  const padL = 56, padR = 28, padT = 22, padB = 40;
  const plotW = VW - padL - padR;
  const plotH = VH - padT - padB;

  function dayMs(d) { return new Date(d + 'T00:00:00Z').getTime(); }

  const allDates = [...new Set([...actual.map(p => p.date), ...projected.map(p => p.date)])].sort();
  const allVals  = [...actual.map(p => p.value), ...projected.map(p => p.value)];
  if (allDates.length < 2 || allVals.length < 2) return '<p class="no-data" style="padding:20px">Not enough data to render chart.</p>';

  const minT = dayMs(allDates[0]);
  const maxT = dayMs(allDates[allDates.length - 1]);
  const minV = Math.min(...allVals) * 0.95;
  const maxV = Math.max(...allVals) * 1.03;

  const xf = d => padL + (maxT === minT ? plotW / 2 : (dayMs(d) - minT) / (maxT - minT) * plotW);
  const yf = v => padT + plotH - ((v - minV) / (maxV - minV)) * plotH;

  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = minV + (i / 4) * (maxV - minV);
    const y = yf(v).toFixed(1);
    grid += `<line x1="${padL}" y1="${y}" x2="${VW - padR}" y2="${y}" stroke="rgba(100,180,255,0.07)" stroke-width="1"/>`;
    grid += `<text x="${padL - 5}" y="${(+y + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(100,180,255,0.42)" font-family="monospace">$${v.toFixed(0)}</text>`;
  }

  const todayDate = actual.length ? actual[actual.length - 1].date : null;
  const labelSet  = new Set([allDates[0], allDates[allDates.length - 1]]);
  if (todayDate) labelSet.add(todayDate);
  if (allDates.length > 4) labelSet.add(allDates[Math.floor(allDates.length * 0.5)]);
  let xLabels = '';
  labelSet.forEach(date => {
    const x = xf(date).toFixed(1);
    const p = date.split('-');
    const isToday = date === todayDate;
    xLabels += `<text x="${x}" y="${(VH - padB + 15).toFixed(1)}" text-anchor="middle" font-size="9" fill="${isToday ? 'rgba(126,200,255,0.75)' : 'rgba(100,180,255,0.40)'}" font-family="monospace">${p[1]}/${p[2]}</text>`;
  });

  let actualSVG = '';
  if (actual.length >= 2) {
    const pts  = actual.map(p => `${xf(p.date).toFixed(1)},${yf(p.value).toFixed(1)}`);
    const area = `M${xf(actual[0].date).toFixed(1)},${(padT + plotH).toFixed(1)} L${pts.join(' L')} L${xf(actual[actual.length - 1].date).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
    actualSVG  = `<path d="${area}" fill="url(#lgAct)"/><polyline points="${pts.join(' ')}" fill="none" stroke="#7EC8FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  let projSVG = '';
  if (projected.length >= 2) {
    const pts  = projected.map(p => `${xf(p.date).toFixed(1)},${yf(p.value).toFixed(1)}`);
    const area = `M${xf(projected[0].date).toFixed(1)},${(padT + plotH).toFixed(1)} L${pts.join(' L')} L${xf(projected[projected.length - 1].date).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
    projSVG   = `<path d="${area}" fill="url(#lgProj)"/><polyline points="${pts.join(' ')}" fill="none" stroke="#3399FF" stroke-width="1.5" stroke-dasharray="5,4" stroke-linecap="round" stroke-linejoin="round" opacity="0.70"/>`;
  }

  const todayX = todayDate ? xf(todayDate).toFixed(1) : null;
  const todayLine = todayX
    ? `<line x1="${todayX}" y1="${padT}" x2="${todayX}" y2="${padT + plotH}" stroke="rgba(126,200,255,0.28)" stroke-width="1" stroke-dasharray="3,3"/><text x="${(+todayX + 5).toFixed(1)}" y="${padT + 13}" font-size="8" fill="rgba(126,200,255,0.55)" letter-spacing="1" font-family="monospace">NOW</text>`
    : '';

  const dots = actual.map(p =>
    `<circle cx="${xf(p.date).toFixed(1)}" cy="${yf(p.value).toFixed(1)}" r="3.5" fill="#7EC8FF" stroke="rgba(0,0,20,0.85)" stroke-width="1.5"/>`
  ).join('');

  const lastA = actual[actual.length - 1];
  const lastP = projected[projected.length - 1];
  const lastALabel = lastA ? `<text x="${(xf(lastA.date) - 10).toFixed(1)}" y="${(yf(lastA.value) - 9).toFixed(1)}" text-anchor="end" font-size="10" fill="#7EC8FF" font-weight="700" font-family="monospace">$${lastA.value.toFixed(2)}</text>` : '';
  const lastPLabel = lastP ? `<text x="${xf(lastP.date).toFixed(1)}" y="${(yf(lastP.value) - 8).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(51,153,255,0.70)" font-family="monospace">$${lastP.value.toFixed(0)}</text>` : '';

  return `<svg viewBox="0 0 ${VW} ${VH}" width="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lgAct" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7EC8FF" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#7EC8FF" stop-opacity="0.02"/>
    </linearGradient>
    <linearGradient id="lgProj" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3399FF" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#3399FF" stop-opacity="0.01"/>
    </linearGradient>
  </defs>
  ${grid}
  ${projSVG}
  ${actualSVG}
  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="rgba(100,180,255,0.15)" stroke-width="1"/>
  <line x1="${padL}" y1="${padT + plotH}" x2="${VW - padR}" y2="${padT + plotH}" stroke="rgba(100,180,255,0.15)" stroke-width="1"/>
  ${todayLine}
  ${dots}
  ${lastALabel}
  ${lastPLabel}
  ${xLabels}
</svg>`;
}

/* ─── JOURNEY SECTIONS ─────────────────────────────────────────── */

function buildJourneyDecisions(decisions) {
  const typeIcon  = { watch:'◎', add:'◈', hold:'◉', build:'◆', sell:'▲', rebalance:'⇄' };
  const typeColor = { watch:'var(--yellow)', add:'var(--green)', hold:'var(--blue)', build:'var(--magenta)', sell:'var(--red)', rebalance:'var(--orange)' };
  const items = decisions.map(dec => {
    const icon  = typeIcon[dec.type]  || '◎';
    const color = typeColor[dec.type] || 'var(--t3)';
    return `<div class="jd-item">
      <div class="jd-head">
        <span class="jd-icon" style="color:${color}">${icon}</span>
        <span class="jd-ticker">${escHtml(dec.ticker)}</span>
        <span class="jd-type" style="color:${color};border-color:${color}">${escHtml((dec.type || '').toUpperCase())}</span>
      </div>
      <div class="jd-thesis">${escHtml(dec.thesis)}</div>
      <div class="jd-trigger"><span class="jd-trigger-label">TRIGGER</span> ${escHtml(dec.trigger)}</div>
    </div>`;
  }).join('');
  return `<div class="card journey-section">
    <div class="card-title"><span class="card-title-icon">◎</span> Next Likely Decisions</div>
    <div class="journey-section-body">${items || '<div class="none-label">No decisions queued.</div>'}</div>
  </div>`;
}

function buildJourneyEvolution(phases) {
  const items = phases.map((ph, i) => `
    <div class="je-phase">
      <div class="je-phase-num">PHASE ${i + 1}</div>
      <div class="je-phase-title">${escHtml(ph.phase)}</div>
      <div class="je-phase-range">${escHtml(ph.date_range)} &middot; ${ph.sessions || 0} sessions</div>
      <div class="je-phase-summary">${escHtml(ph.summary)}</div>
      ${ph.key_insight ? `<div class="je-insight"><span class="je-insight-label">KEY INSIGHT</span>${escHtml(ph.key_insight)}</div>` : ''}
      <div class="je-phase-footer">
        <span class="je-stat">${ph.patterns_locked || 0} patterns locked</span>
        ${ph.next_phase ? `<span class="je-next">→ ${escHtml(ph.next_phase)}</span>` : ''}
      </div>
    </div>`).join('');
  return `<div class="card journey-section">
    <div class="card-title"><span class="card-title-icon">◑</span> Intelligence Evolution</div>
    <div class="journey-section-body">${items || '<div class="none-label">Building history…</div>'}</div>
  </div>`;
}

function buildJourneyDNA(rules) {
  const statusColor = { locked: 'var(--neon-orange)', active: 'var(--green)', learning: 'var(--blue-mid)' };
  const statusIcon  = { locked: '🔒', active: '●', learning: '◌' };
  const items = rules.map(r => {
    const color = statusColor[r.status] || 'var(--t3)';
    const icon  = statusIcon[r.status]  || '○';
    return `<div class="jdna-item">
      <div class="jdna-head">
        <span class="jdna-status" style="color:${color}">${icon} ${escHtml((r.status || '').toUpperCase())}</span>
        <span class="jdna-rule">${escHtml(r.rule)}</span>
      </div>
      <div class="jdna-note">${escHtml(r.note)}</div>
    </div>`;
  }).join('');
  return `<div class="card journey-section">
    <div class="card-title"><span class="card-title-icon">◉</span> Strategy DNA</div>
    <div class="journey-section-body">${items}</div>
  </div>`;
}

function buildJourneyRisk(risk) {
  if (!risk) return `<div class="card journey-section"><div class="card-title"><span class="card-title-icon">⬡</span> Risk Profile</div><div class="none-label">No data.</div></div>`;
  const overallColor = risk.overall === 'low' ? 'var(--green)' : risk.overall === 'moderate' ? 'var(--yellow)' : 'var(--neon-orange)';
  const concColor    = risk.concentration_risk === 'low' ? 'var(--green)' : risk.concentration_risk === 'elevated' ? 'var(--neon-orange)' : 'var(--red)';
  const divScore = risk.diversification_score || 0;
  const divMax   = risk.diversification_max   || 10;
  const divPct   = Math.round((divScore / divMax) * 100);
  const totalN   = (risk.sector_exposure || []).reduce((a, b) => a + (b.notional || 0), 0);
  const sectors  = (risk.sector_exposure || []).map(s => {
    const pct = totalN > 0 ? ((s.notional / totalN) * 100).toFixed(0) : 0;
    return `<div class="jrisk-sector">
      <div class="jrisk-sector-head"><span class="jrisk-sector-name">${escHtml(s.sector)}</span><span class="jrisk-sector-tickers">${escHtml(s.tickers)}</span></div>
      <div class="jrisk-bar-wrap"><div class="jrisk-bar" style="width:${pct}%"></div><span class="jrisk-pct">${pct}%</span></div>
    </div>`;
  }).join('');
  return `<div class="card journey-section">
    <div class="card-title"><span class="card-title-icon">⬡</span> Risk Profile</div>
    <div class="journey-section-body">
      <div class="jrisk-stats">
        <div class="jrisk-item"><div class="pf-label">Overall Risk</div><div class="jrisk-val" style="color:${overallColor}">${escHtml((risk.overall || '').toUpperCase())}</div></div>
        <div class="jrisk-item"><div class="pf-label">Concentration</div><div class="jrisk-val" style="color:${concColor}">${escHtml((risk.concentration_risk || '').toUpperCase())}</div></div>
        <div class="jrisk-item"><div class="pf-label">Cash Buffer</div><div class="jrisk-val" style="color:var(--green)">${risk.cash_buffer_pct || 0}%</div></div>
        <div class="jrisk-item"><div class="pf-label">Diversification</div><div class="jrisk-val">${divScore}/${divMax}</div><div class="slot-bar" style="margin-top:5px"><div class="slot-fill" style="width:${divPct}%"></div></div></div>
      </div>
      ${risk.notes ? `<div class="jrisk-notes">${escHtml(risk.notes)}</div>` : ''}
      <div class="jrisk-sectors">${sectors}</div>
    </div>
  </div>`;
}

function buildJourneyMilestones(milestones) {
  const statusColor = { completed: 'var(--green)', upcoming: 'var(--t4)', active: 'var(--blue)' };
  const statusIcon  = { completed: '✓', upcoming: '○', active: '◈' };
  const items = milestones.map((m, i) => {
    const color = statusColor[m.status] || 'var(--t4)';
    const icon  = statusIcon[m.status]  || '○';
    return `<div class="jmile-item">
      <div class="jmile-icon" style="color:${color};border-color:${color}">${icon}</div>
      ${i < milestones.length - 1 ? '<div class="jmile-connector"></div>' : ''}
      <div class="jmile-info">
        <div class="jmile-target" style="color:${color}">${fmtDollar(m.target)}</div>
        <div class="jmile-label">${escHtml(m.label)}</div>
        <div class="jmile-date">${escHtml(m.projected_date)}</div>
        ${m.notes ? `<div class="jmile-notes">${escHtml(m.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="card journey-section">
    <div class="card-title"><span class="card-title-icon">◆</span> Milestone Targets</div>
    <div class="journey-section-body"><div class="jmile-list">${items || '<div class="none-label">No milestones set.</div>'}</div></div>
  </div>`;
}

function buildJourneyRecap(recap) {
  if (!recap) return '';
  const sign     = recap.change_dollars >= 0 ? '+' : '';
  const pnlColor = recap.change_dollars >= 0 ? 'var(--green)' : 'var(--red)';
  const best     = recap.best_performer;
  return `<div class="card journey-recap-card">
    <div class="card-title"><span class="card-title-icon">◷</span> Week ${recap.week_num || 1} Recap — ${escHtml(recap.week)}</div>
    <div class="journey-recap-inner">
      <div class="jrecap-stats">
        <div class="pf-item"><div class="pf-label">Week Start</div><div class="pf-value small">${fmtDollar(recap.start_value)}</div></div>
        <div class="pf-item"><div class="pf-label">Week End</div><div class="pf-value small">${fmtDollar(recap.end_value)}</div></div>
        <div class="pf-item"><div class="pf-label">Change</div><div class="pf-value small" style="color:${pnlColor}">${sign}${fmtDollar(recap.change_dollars)} (${sign}${recap.change_pct.toFixed(2)}%)</div></div>
        <div class="pf-item"><div class="pf-label">Trades / W / L</div><div class="pf-value small">${recap.trades} / <span style="color:var(--green)">${recap.wins}W</span> / <span style="color:var(--red)">${recap.losses}L</span></div></div>
        ${best ? `<div class="pf-item"><div class="pf-label">Best Performer</div><div class="pf-value small" style="color:var(--green)">${escHtml(best.ticker)} +${best.pct}%</div></div>` : ''}
      </div>
      ${recap.summary ? `<div class="jrecap-summary">${escHtml(recap.summary)}</div>` : ''}
    </div>
  </div>`;
}

/* ============================================================
   ARCHIVE
   ============================================================ */

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
        <span class="archive-entry-date">${formatDateLong(entry.date.slice(0,10))}</span>
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
  const { meta, portfolio, positions, ah_movers, watchlist_movers, earnings,
          stop_loss_alerts, trades_executed, alerts, top_opportunities } = d;
  const movers = watchlist_movers || ah_movers || [];
  return `
    <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
      <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:4px">
        C.L.U. ${escHtml((meta.session_label || 'Report').replace(/after[- ]?hours/i,'Live Report').toUpperCase())} — ${formatDate(meta.date)}
      </div>
      <div style="font-size:11px;color:var(--text-secondary)">
        ${formatDateLong(meta.date)} · Updated ${formatTime(meta.generated_at)} · Next: ${escHtml(meta.next_session)}
      </div>
    </div>
    ${buildAlertsHTML(alerts || [])}
    ${buildPortfolioHTML(portfolio)}
    ${buildMoversHTML(movers)}
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
    <div class="card-title">◈ Account Overview</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 0">
      <div class="pf-item"><div class="pf-label">Total Value</div><div class="pf-value">${fmtDollar(p.total_value)}</div></div>
      <div class="pf-item"><div class="pf-label">Cash/BP</div><div class="pf-value small">${fmtDollar(p.cash)}</div></div>
      <div class="pf-item"><div class="pf-label">Day P&L</div><div class="pf-value small ${pnlCls}">${sign}${fmtDollar(p.day_pnl_dollars)} (${sign}${p.day_pnl_pct.toFixed(2)}%)</div></div>
      <div class="pf-item"><div class="pf-label">Positions</div><div class="pf-value small">${p.open_positions}/${p.positions_cap}</div></div>
    </div>
  </div>`;
}

function buildMoversHTML(movers) {
  if (!movers.length) return '';
  return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div class="card-title">▲ Watchlist Movers</div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Ticker</th><th>Price</th><th>Change</th><th>Signal</th><th>Note</th></tr></thead>
    <tbody>${movers.map(m => {
      const price = m.price !== undefined ? m.price : m.ah_price;
      const sign  = m.change_pct >= 0 ? '+' : '';
      const cls   = m.change_pct >= 0 ? 'col-change-pos' : 'col-change-neg';
      const sigKey = (m.signal||'neutral').replace(/[^a-z0-9-]/gi,'').toLowerCase();
      return `<tr><td class="col-symbol">${escHtml(m.symbol)}</td><td>${fmtDollar(price)}</td>
        <td class="${cls}">${sign}${m.change_pct.toFixed(1)}%</td>
        <td><span class="badge badge-${sigKey}">${(m.signal||'neutral').replace(/-/g,' ').toUpperCase()}</span></td>
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
      const sign  = e.beat_pct >= 0 ? '+' : '';
      const cls   = e.beat_pct >= 0 ? 'col-change-pos' : 'col-change-neg';
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
  const inner = trades.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Ticker</th><th>Side</th><th>Shares</th><th>Price</th><th>Reason</th></tr></thead>
       <tbody>${trades.map(t => {
         const cls = t.side==='BUY' ? 'col-change-pos' : 'col-change-neg';
         return `<tr><td class="col-symbol">${escHtml(t.symbol)}</td><td class="${cls}">${escHtml(t.side)}</td>
           <td>${t.shares}</td><td>${fmtDollar(t.price)}</td>
           <td style="font-size:11px;color:var(--text-secondary)">${escHtml(t.reason)}</td></tr>`;
       }).join('')}</tbody></table></div>`
    : '<div class="none-label">None this session.</div>';
  return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px">
    <div class="card-title">⇄ Trades Executed</div>${inner}</div>`;
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

/* ============================================================
   UTILS
   ============================================================ */

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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
