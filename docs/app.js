/* ============================================================
   C.L.U. — Cognitive Logic Unit — Renderer v5.1 "HUD"
   ============================================================ */
const DATA_URL          = './data/latest.json';
const ARCHIVE_INDEX_URL = './data/archive/index.json';
const ARCHIVE_REPORT    = (d) => `./data/archive/${d}.json`;
const JOURNEY_URL       = './data/projected_journey.json';
const POS_COLORS = ['#6fb8ef','#cf6fe8','#f2a73d','#37e08a','#ff5a7a','#80ff9a','#b388ff','#40e0d0'];

const TD_API_KEY = '87d9ba92240d465fb2500e093b78b10a';
const TD_BASE    = 'https://api.twelvedata.com';
const ENGINE_TTL = 10 * 60 * 1000;
const ENGINE_CACHE = {};

let lastMeta = null, journeyData = null, archiveIndex = [], archiveSel = null;
let journeyLoaded = false, archiveLoaded = false, engineReady = false, engineBusy = false;

document.addEventListener('DOMContentLoaded', () => {
  startClock(); initTabs(); buildEngineShell();
  setStatusBar('today'); loadReport();
  window.addEventListener('hashchange', onArchiveHashChange);
  // shared deep-link (#YYYY-MM-DD) → jump straight to the Archive tab on load
  if(/^\d{4}-\d{2}-\d{2}/.test((location.hash||'').replace(/^#/,''))) switchTab('archive');
});

function startClock(){ updateClock(); setInterval(updateClock, 1000); }
function updateClock(){
  const el = document.getElementById('live-clock'); if (!el) return;
  el.textContent = new Date().toLocaleTimeString('en-US',{ timeZone:'America/Los_Angeles', hour12:true, hour:'numeric', minute:'2-digit', second:'2-digit' }) + ' PDT';
}

function initTabs(){
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.body.addEventListener('click', e => { if (e.target.closest('#refresh-chip')) refreshActive(); });
}
function refreshActive(){
  const t = document.body.dataset.tab;
  if (t === 'today') loadReport();
  else if (t === 'journey'){ journeyLoaded=false; loadJourney(); }
  else if (t === 'archive'){ archiveLoaded=false; loadArchive(); }
}
function switchTab(tab){
  document.body.dataset.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  setStatusBar(tab);
  if (tab === 'journey') loadJourney();
  if (tab === 'archive') loadArchive();
  if (tab === 'engine'){ const i = document.getElementById('engine-input'); if (i) i.focus(); }
}

function sbCell(label, val){ return `<div class="sb">${label} <b>${escHtml(val)}</b></div>`; }
function setStatusBar(tab){
  const live = `<div class="sb"><span class="dotlive"></span><span class="live">Live</span></div>`;
  const clock = `<div class="sb">CLOCK <b id="live-clock"></b></div>`;
  const refresh = `<div class="sb r" id="refresh-chip"><span>↻</span> REFRESH</div>`;
  const grow = `<div class="sb" style="flex:1;border-right:none"></div>`;
  let mid = '';
  if (tab === 'today'){
    const m = lastMeta || {};
    mid = sbCell('SYS', m.status || 'NOMINAL') + clock + sbCell('SESSION', m.date ? formatDate(m.date) : '—') + sbCell('NEXT', m.next_session || '—');
  } else if (tab === 'journey'){
    const m = (journeyData && journeyData.meta) || {}; const gc = (journeyData && journeyData.growth_chart) || {};
    mid = sbCell('MODEL', m.model || 'CLU v0.54') + sbCell('UPDATED', m.updated_at ? formatTimeShort(m.updated_at) : '—') + sbCell('NEXT', m.next_update || '—') + sbCell('CONFIDENCE', (gc.projection_confidence || 'medium').toUpperCase());
  } else if (tab === 'engine'){
    mid = sbCell('FEED','TWELVE DATA') + clock + sbCell('CACHE','10 MIN');
  } else if (tab === 'archive'){
    const span = archiveIndex.length ? `${formatDate(archiveIndex[archiveIndex.length-1].date.slice(0,10))} — ${formatDate(archiveIndex[0].date.slice(0,10))}` : '—';
    mid = sbCell('ARCHIVE', (archiveIndex.length||0)+' ENTRIES') + sbCell('SPAN', span) + sbCell('SELECTED', archiveSel ? formatDate(archiveSel.slice(0,10)) : '—');
  }
  document.getElementById('statusbar').innerHTML = live + mid + grow + refresh;
  updateClock();
}

function rail(label){ return `<div class="rail"><span>${label}</span></div>`; }
function sec(id, title, meta, extra){ return `<div class="sec"><span class="id">${id}</span><h3>${title}${extra||''}</h3><span class="rule"></span><span class="meta">${meta||''}</span></div>`; }
function card(inner, idlabel, name){
  const head = name ? `<div class="ch"><span class="d"></span><span class="nm">${name}</span><span class="id">${idlabel||''}</span></div>` : '';
  return `<div class="card"><span class="bk tl"></span><span class="bk br"></span>${head}${inner}</div>`;
}
function stateLoading(msg){ return `<div class="empty-state"><div class="loader"></div><p>${msg}</p></div>`; }

/* LIVE REPORT */
async function loadReport(){
  const root = document.getElementById('report-root');
  root.innerHTML = stateLoading('Fetching CLU intelligence data…');
  try{
    const res = await fetch(DATA_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error();
    const d = await res.json();
    lastMeta = d.meta || {};
    renderReport(d);
    if (document.body.dataset.tab === 'today') setStatusBar('today');
  } catch {
    root.innerHTML = `<div class="empty-state"><div class="empty-icon neon-red">◌</div><p class="empty-title neon-red">System Offline</p><p class="empty-sub">CLU has not published a report for this session. Standing by for next transmission.</p></div>`;
  }
}

function renderReport(d){
  const p = d.portfolio || {}; const positions = d.positions || [];
  const movers = d.watchlist_movers || d.ah_movers || [];
  let m = '';

  (d.alerts || []).forEach(a => {
    const cls = a.level === 'critical' ? 'crit' : a.level === 'warning' ? 'warn' : '';
    m += `<div class="alertb ${cls}"><div class="at">⚠ ${escHtml(a.title)}</div><div class="am">${escHtml(a.message)}</div></div>`;
  });

  m += sec('A1','Account','USD · live');
  const segs = positions.map((pos,i)=>({label:pos.symbol, value:pos.notional||0, color:POS_COLORS[i%POS_COLORS.length]}))
                        .concat([{label:'CASH', value:p.cash||0, color:'#37e08a'}]).filter(s=>s.value>0);
  const total = p.total_value || segs.reduce((a,b)=>a+b.value,0) || 1;
  const legend = segs.map(s=>`<div class="li"><span class="sw" style="background:${s.color}"></span><b>${escHtml(s.label)}</b><i>${fmtDollar(s.value)} · ${Math.round(s.value/total*100)}%</i></div>`).join('');
  const alloc = card(`<div class="cb"><div class="acct">${svgAllocRing(segs,total)}<div class="legend">${legend}</div></div></div>`, 'A1.1','Allocation');
  const sign = (p.day_pnl_dollars||0) >= 0 ? '+' : '';
  const pnlCls = (p.day_pnl_dollars||0) >= 0 ? 'g' : 'r';
  const deployed = Math.max(0, (p.total_value||0) - (p.cash||0));
  const cap = p.positions_cap || 4, open = p.open_positions || positions.length;
  let bars=''; for(let i=0;i<cap;i++) bars += `<i class="${i<open?'on':''}"></i>`;
  const dlt = (p.day_pnl_pct||0); const dCls = dlt>=0?'up':'dn'; const dSign = dlt>=0?'+':'';
  const buffer = Math.round((p.cash||0)/(p.total_value||1)*100);
  const perf = card(`<div class="cb">
    <div class="perf-hero"><div class="l">Total Value</div><div class="perf-val">${fmtDollar(p.total_value)} <span class="perf-delta ${dCls}">${dSign}${dlt.toFixed(1)}%</span></div></div>
    <div class="stats" style="margin-top:14px">
    <div class="kpi"><div class="l">Day P&amp;L</div><div class="v ${pnlCls}">${sign}${fmtDollar(p.day_pnl_dollars)}</div></div>
    <div class="kpi"><div class="l">Cash / Buying Power</div><div class="v sm">${fmtDollar(p.cash)}</div></div>
    <div class="kpi"><div class="l">Deployed · Slots ${open}/${cap}</div><div class="v sm">${fmtDollar(deployed)}</div><div class="barseg">${bars}</div></div>
    <div class="kpi"><div class="l">Cash Buffer</div><div class="v sm">${buffer}%</div></div>
  </div></div>`, 'A1.2','Performance');
  m += `<div class="grid">${alloc}${perf}</div>`;

  m += sec('A2','Active Positions', positions.length+' open');
  if (positions.length){
    const rows = positions.map((pos,i)=>{
      const up = (pos.total_pnl_pct||0) >= 0; const du = (pos.day_pnl_pct||0) >= 0;
      const stop = pos.stop_type === 'manual' ? `stop ${fmtDollar(pos.stop_level)} ⚡ manual` : `stop ${fmtDollar(pos.stop_level)} GTC`;
      return `<div class="pos" style="--rc:${POS_COLORS[i%POS_COLORS.length]}"><div><div class="tk">${escHtml(pos.symbol)}</div><div class="sub">${pos.shares} sh · entry ${fmtDollar(pos.entry_price)} · ${stop}</div></div><div class="rt"><div class="pnl ${up?'up':'dn'}">${up?'+':''}${(pos.total_pnl_pct||0).toFixed(1)}%</div><div class="px">${fmtDollar(pos.current_price)} · day ${du?'+':''}${(pos.day_pnl_pct||0).toFixed(1)}%</div></div></div>`;
    }).join('');
    m += card(rows);
  } else { m += card(`<div class="cb"><div class="empty-sub" style="text-align:left">No active positions.</div></div>`); }

  const thoughts = d.thoughts || [];
  if (thoughts.length){
    m += sec('A3','Active Intelligence','consciousness log');
    m += thoughts.map(t=>{
      const tag = t.label || (t.type==='plan'?'PLAN':t.type==='concern'?'FLAG':'OBSERVE');
      return `<div class="intel"><span class="tag">${escHtml(tag)}</span><p>${escHtml(t.text)}</p></div>`;
    }).join('');
  }

  let n = 4;
  if ((d.learned_patterns||[]).length){
    m += sec('A'+(n++),'Learned Patterns','cross-session');
    m += d.learned_patterns.map(pt=>`<div class="intel"><span class="tag">${escHtml(pt.category)}</span><p>${escHtml(pt.pattern)} <span class="bdg ${pt.confidence==='high'?'g':''}" style="margin-left:6px">${escHtml(pt.confidence)}</span></p></div>`).join('');
  }
  if (movers.length){
    const rows = movers.map(mv=>{ const c=mv.change_pct>=0; const price=mv.price!==undefined?mv.price:mv.ah_price;
      return `<tr><td class="dsym">${escHtml(mv.symbol)}</td><td>${fmtDollar(price)}</td><td class="${c?'up':'dn'}">${c?'+':''}${(mv.change_pct||0).toFixed(1)}%</td><td><span class="bdg ${/bull/i.test(mv.signal)?'g':/bear/i.test(mv.signal)?'r':''}">${escHtml((mv.signal||'').replace(/-/g,' '))}</span></td><td class="note">${escHtml(mv.note||'')}</td></tr>`;}).join('');
    m += sec('A'+(n++),'Watchlist Movers', movers.length+' tracked') + card(`<div class="dwrap"><table class="dtable"><thead><tr><th>Ticker</th><th>Price</th><th>Change</th><th>Signal</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  if ((d.earnings||[]).length){
    const rows = d.earnings.map(e=>{const c=e.beat_pct>=0; const b=e.result==='beat'?'g':e.result==='miss'?'r':'';
      return `<tr><td class="dsym">${escHtml(e.symbol)}</td><td class="note">${escHtml(e.event||'')}</td><td><span class="bdg ${b}">${escHtml((e.result||'').toUpperCase())}</span></td><td class="${c?'up':'dn'}">${c?'+':''}${(e.beat_pct||0).toFixed(1)}%</td><td class="note">${escHtml(e.impact||'')}</td></tr>`;}).join('');
    m += sec('A'+(n++),'Earnings & News') + card(`<div class="dwrap"><table class="dtable"><thead><tr><th>Ticker</th><th>Event</th><th>Result</th><th>Beat%</th><th>Impact</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  if ((d.stop_loss_alerts||[]).length){
    const rows = d.stop_loss_alerts.map(a=>`<tr><td class="dsym">${escHtml(a.symbol)}</td><td class="dn">${(a.pnl_pct||0).toFixed(1)}%</td><td>${fmtDollar(a.current_price)}</td><td>${fmtDollar(a.stop_level)}</td><td class="note">${escHtml(a.action||'')}</td></tr>`).join('');
    m += sec('A'+(n++),'Stop-Loss Alerts','risk') + card(`<div class="dwrap"><table class="dtable"><thead><tr><th>Ticker</th><th>P&amp;L%</th><th>Price</th><th>Stop</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  if ((d.trades_executed||[]).length){
    const rows = d.trades_executed.map(t=>`<tr><td class="dsym">${escHtml(t.symbol)}</td><td class="${t.side==='BUY'?'up':'dn'}">${escHtml(t.side)}</td><td>${t.shares}</td><td>${fmtDollar(t.price)}</td><td class="note">${escHtml(t.reason||'')}</td></tr>`).join('');
    m += sec('A'+(n++),'Trades Executed') + card(`<div class="dwrap"><table class="dtable"><thead><tr><th>Ticker</th><th>Side</th><th>Shares</th><th>Price</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  if ((d.top_opportunities||[]).length){
    const cards = d.top_opportunities.map(o=>`<div class="opp"><div class="rk">#${o.rank} Opportunity</div><div class="sy">${escHtml(o.symbol)}</div><div class="th">${escHtml(o.thesis)}</div><div class="ft"><span class="e">Entry: ${escHtml(o.entry_target)}</span><span>${escHtml(o.action)}</span></div></div>`).join('');
    m += sec('A'+(n++),"Tomorrow's Opportunities") + card(`<div class="oppg">${cards}</div>`);
  }

  document.getElementById('report-root').innerHTML = `<div class="wrap">${rail('LIVE&nbsp;REPORT&nbsp;//&nbsp;01')}<div class="main">${m}</div></div>`;
  const ring = document.querySelector('#report-root .allocring');
  if (ring) requestAnimationFrame(()=>initAllocRing(ring));
}

function svgAllocRing(segs,total){
  const r=42, C=2*Math.PI*r; let off=0;
  const arcs = segs.map(s=>{ const len=(s.value/total)*C; const pct=Math.round(s.value/total*100);
    const a=`<circle class="aslice" cx="60" cy="60" r="${r}" fill="none" stroke="${s.color}" stroke-width="13" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)" data-label="${escHtml(s.label)}" data-val="${fmtDollar(s.value)}" data-pct="${pct}" data-color="${s.color}" data-len="${len.toFixed(2)}"/>`;
    off+=len; return a; }).join('');
  return `<svg class="allocring" viewBox="0 0 120 120" width="96" data-c="${C.toFixed(2)}"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#01101f" stroke-width="13"/>${arcs}</svg>`;
}
function initAllocRing(svg){
  const host = svg.closest('.acct'); if(!host) return;
  let tip = host.querySelector('.ring-tip');
  if(!tip){ tip = document.createElement('div'); tip.className='ring-tip'; host.appendChild(tip); }
  svg.querySelectorAll('.aslice').forEach(el=>{
    el.addEventListener('mousemove', ev=>{
      tip.innerHTML = `<b style="color:${el.dataset.color}">${el.getAttribute('data-label')}</b> ${el.getAttribute('data-val')} · ${el.getAttribute('data-pct')}%`;
      const r = host.getBoundingClientRect();
      tip.style.left = (ev.clientX - r.left + 12) + 'px';
      tip.style.top  = (ev.clientY - r.top + 10) + 'px';
      tip.classList.add('on');
    });
    el.addEventListener('mouseleave', ()=> tip.classList.remove('on'));
  });
  if(!prefersReducedMotion()) animateAllocRing(svg);
}
function animateAllocRing(svg){
  const slices = [...svg.querySelectorAll('.aslice')];
  const C = parseFloat(svg.dataset.c) || 0;
  const totalLen = slices.reduce((s,el)=> s + (parseFloat(el.dataset.len)||0), 0) || 1;
  const DUR = 950; let acc = 0;
  slices.forEach(el=>{
    const len = parseFloat(el.dataset.len) || 0;
    const segDur = Math.max(140, DUR * (len / totalLen));
    const delay = acc; acc += segDur;
    el.setAttribute('stroke-dasharray', `0 ${C.toFixed(2)}`); // start hidden
    setTimeout(()=> rafAnim(segDur, easeOutCubic,
      e => el.setAttribute('stroke-dasharray', `${(len*e).toFixed(2)} ${(C-len*e).toFixed(2)}`),
      () => el.setAttribute('stroke-dasharray', `${len.toFixed(2)} ${(C-len).toFixed(2)}`)
    ), delay);
  });
}

/* PROJECTED JOURNEY */
async function loadJourney(){
  if (journeyLoaded) return; journeyLoaded = true;
  const root = document.getElementById('journey-root');
  root.innerHTML = stateLoading('Loading journey data…');
  try{
    const res = await fetch(JOURNEY_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error();
    journeyData = await res.json();
    renderJourney(journeyData);
    if (document.body.dataset.tab === 'journey') setStatusBar('journey');
  } catch {
    root.innerHTML = `<div class="empty-state"><div class="empty-icon">↗</div><p class="empty-title">No Journey Data Yet</p><p class="empty-sub">CLU will generate the first Projected Journey report on Friday.</p></div>`;
  }
}
function renderJourney(d){
  const gc = d.growth_chart || {}; const actual = gc.actual||[], projected = gc.projected||[];
  const lastVal = actual.length ? actual[actual.length-1].value : null;
  let m = '';
  m += sec('J1','Growth Trajectory', `actual vs projected${gc.weekly_target_pct?` · +${gc.weekly_target_pct}%/wk target`:''}`);
  m += card(`<div class="jchart">${svgEquity(actual,projected)}</div><div class="jlegend"><span><i style="background:#cf6fe8"></i>Actual</span><span><i style="background:#cf6fe8;opacity:.5"></i>Projected</span><span style="margin-left:auto;color:var(--t4)">${escHtml(gc.projection_basis||'')}</span></div>`,'J1.1','Equity Curve');

  const mile = (d.milestones||[]).map(mil=>{
    const done = lastVal!=null && mil.target!=null && lastVal>=mil.target;
    return `<div class="mile ${done?'done':''}"><span class="mnode">${done?'✓':'○'}</span><div><div class="mtar">${fmtDollar(mil.target)}${done?' <span class="tagd">REACHED</span>':''}</div><div class="mlab">${escHtml(mil.label||'')}</div></div><div class="meta2">${done?('cleared '+fmtDollar(lastVal)) : escHtml(mil.projected_date||'')}</div></div>`;
  }).join('');
  const mcard = card(mile || `<div class="cb"><div class="empty-sub" style="text-align:left">No milestones set.</div></div>`, 'J2.1','Milestone Ladder');
  const fcard = card(`<div class="jf" id="jf-ctrls">
      <div class="f"><label>Contribution</label><div class="inp"><span>$</span><input type="number" id="jf-amt" value="100" min="0" step="10"></div></div>
      <div class="f grow"><label>Frequency</label><div class="freq" id="jf-freq">
        <button class="fb" data-f="once">Once</button><button class="fb" data-f="weekly">Weekly</button><button class="fb" data-f="biweekly">Bi-wk</button><button class="fb on" data-f="monthly">Monthly</button></div></div>
      <div class="f grow" style="width:100%"><label>Timeline — <span class="hzlabel" id="jf-hz">1 yr</span></label><input type="range" id="jf-range" class="slider" min="3" max="60" value="12"></div>
    </div><div id="jf-out"></div>`, 'J3.1','Added-Funds Sim');
  m += `<div class="grid" style="grid-template-columns:1.25fr 1fr">${mcard}${fcard}</div>`;

  if ((d.next_decisions||[]).length){
    m += sec('J4','Next Likely Decisions');
    m += d.next_decisions.map(dec=>`<div class="intel"><span class="tag">${escHtml((dec.type||'').toUpperCase())}</span><p><b style="color:var(--ac)">${escHtml(dec.ticker)}</b> — ${escHtml(dec.thesis)} <span style="color:var(--t4)">· trigger: ${escHtml(dec.trigger)}</span></p></div>`).join('');
  }
  if (d.weekly_recap){
    const rc=d.weekly_recap; const c=(rc.change_dollars||0)>=0;
    m += sec('J5','Weekly Recap', escHtml(rc.week||''));
    m += card(`<div class="met"><div class="m"><div class="l">Week Start</div><div class="v">${fmtDollar(rc.start_value)}</div></div><div class="m"><div class="l">Week End</div><div class="v">${fmtDollar(rc.end_value)}</div></div><div class="m"><div class="l">Change</div><div class="v ${c?'up':'dn'}">${c?'+':''}${fmtDollar(rc.change_dollars)}</div></div><div class="m"><div class="l">Trades W/L</div><div class="v">${rc.trades||0} · ${rc.wins||0}/${rc.losses||0}</div></div></div>${rc.summary?`<div class="cb"><div class="empty-sub" style="text-align:left;max-width:none">${escHtml(rc.summary)}</div></div>`:''}`);
  }

  document.getElementById('journey-root').innerHTML = `<div class="wrap">${rail('PROJECTED&nbsp;JOURNEY&nbsp;//&nbsp;02')}<div class="main">${m}</div></div>`;
  initFundsSim(gc, d.milestones||[]);
  const eq = document.querySelector('#journey-root .jchart svg');
  if (eq && !prefersReducedMotion()) requestAnimationFrame(()=>animateEquity(eq));
}

function svgEquity(actual, projected){
  const VW=900, VH=210, padL=50, padR=24, padT=22, padB=26;
  const pts = [...actual, ...projected];
  if (pts.length < 2) return '<div class="empty-sub" style="padding:30px">Not enough data to chart.</div>';
  const dayMs = s => new Date(s+'T00:00:00Z').getTime();
  const dates = [...new Set(pts.map(p=>p.date))].sort();
  const vals = pts.map(p=>p.value);
  const minT=dayMs(dates[0]), maxT=dayMs(dates[dates.length-1]);
  const minV=Math.min(...vals)*0.96, maxV=Math.max(...vals)*1.04;
  const xf=s=> padL + (maxT===minT?0:(dayMs(s)-minT)/(maxT-minT))*(VW-padL-padR);
  const yf=v=> padT + (VH-padT-padB) - ((v-minV)/(maxV-minV))*(VH-padT-padB);
  let grid=''; for(let i=0;i<=3;i++){ const v=minV+i/3*(maxV-minV); const y=yf(v).toFixed(1);
    grid+=`<line x1="${padL}" y1="${y}" x2="${VW-padR}" y2="${y}" stroke="rgba(120,170,220,.08)"/><text x="${padL-6}" y="${(+y+3).toFixed(1)}" text-anchor="end" font-size="9" fill="#33526b" font-family="monospace">$${v.toFixed(0)}</text>`; }
  const today = actual.length ? actual[actual.length-1].date : null;
  const aPts = actual.map(p=>`${xf(p.date).toFixed(1)},${yf(p.value).toFixed(1)}`).join(' ');
  const pPts = projected.map(p=>`${xf(p.date).toFixed(1)},${yf(p.value).toFixed(1)}`).join(' ');
  const dots = actual.map(p=>`<circle cx="${xf(p.date).toFixed(1)}" cy="${yf(p.value).toFixed(1)}" r="3.5" fill="#cf6fe8"/>`).join('');
  const nowX = today ? xf(today).toFixed(1) : null;
  const nowLine = nowX ? `<line x1="${nowX}" y1="${padT}" x2="${nowX}" y2="${VH-padB}" stroke="rgba(207,111,232,.3)" stroke-dasharray="3 3"/><text x="${(+nowX+6).toFixed(1)}" y="${padT+10}" font-size="8" fill="#cf6fe8" font-family="monospace" letter-spacing="1">NOW</text>` : '';
  const lastA = actual[actual.length-1], lastP = projected[projected.length-1];
  const la = lastA?`<text x="${(xf(lastA.date)-8).toFixed(1)}" y="${(yf(lastA.value)-9).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="#cf6fe8" font-family="monospace">${fmtDollar(lastA.value)}</text>`:'';
  const lp = lastP?`<text x="${(xf(lastP.date)).toFixed(1)}" y="${(yf(lastP.value)-8).toFixed(1)}" text-anchor="end" font-size="9" fill="rgba(207,111,232,.7)" font-family="monospace">$${lastP.value.toFixed(0)} proj</text>`:'';
  let xl=''; const labs=[dates[0], today, dates[dates.length-1]].filter(Boolean);
  [...new Set(labs)].forEach(dt=>{ const pp=dt.split('-'); xl+=`<text x="${xf(dt).toFixed(1)}" y="${VH-8}" text-anchor="middle" font-size="9" fill="#33526b" font-family="monospace">${pp[1]}/${pp[2]}</text>`;});
  const clipW = (VW-padL-padR).toFixed(1);
  // Data (lines + dots + value labels) is wiped on left→right via an expanding clip rect.
  // Grid + axis labels stay static; the NOW marker fades in after the wipe completes.
  return `<svg viewBox="0 0 ${VW} ${VH}" width="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="eqclip"><rect class="eq-clip" x="${padL}" y="0" width="${clipW}" height="${VH}" data-x0="${padL}" data-w="${clipW}"/></clipPath></defs>
    ${grid}
    <g clip-path="url(#eqclip)">
      ${projected.length?`<polyline points="${pPts}" fill="none" stroke="#cf6fe8" stroke-width="1.6" stroke-dasharray="6 4" opacity=".65"/>`:''}
      ${actual.length?`<polyline points="${aPts}" fill="none" stroke="#cf6fe8" stroke-width="2.5"/>`:''}
      ${dots}${la}${lp}
    </g>
    <g class="eq-now">${nowLine}</g>
    ${xl}</svg>`;
}
function animateEquity(svg){
  const clip = svg.querySelector('.eq-clip'), now = svg.querySelector('.eq-now');
  if(!clip) return;
  const w = parseFloat(clip.dataset.w) || 0;
  if(now) now.style.opacity = '0';
  clip.setAttribute('width','0');
  rafAnim(1150, easeInOutSine,
    e => clip.setAttribute('width', (w*e).toFixed(1)),
    () => { clip.setAttribute('width', w.toFixed(1)); if(now){ now.style.transition='opacity .55s ease'; requestAnimationFrame(()=> now.style.opacity='1'); } }
  );
}

let CPM = { once:0, daily:30.4368, weekly:4.34812, biweekly:2.17406, monthly:1 };
function initFundsSim(gc, milestones){
  const amt=document.getElementById('jf-amt'), freqEl=document.getElementById('jf-freq'), range=document.getElementById('jf-range'), hz=document.getElementById('jf-hz'), out=document.getElementById('jf-out');
  if (!amt||!range||!out) return;
  const actual=(gc.actual||[]); const V0 = actual.length?actual[actual.length-1].value : ((gc.projected&&gc.projected.length)?gc.projected[gc.projected.length-1].value:0);
  const g = deriveMonthlyRate(gc); let freq='monthly';
  function recompute(){
    const a=Math.max(0,parseFloat(amt.value)||0); const months=parseInt(range.value,10)||12; hz.textContent=fmtMonthsLabel(months);
    const sim=computeFunds(V0,g,a,freq,months); const delta=sim.boost-sim.base;
    let mrow=''; (milestones||[]).filter(x=>x.target>V0).slice(0,1).forEach(x=>{
      const bm=firstMonth(sim.series,'base',x.target), om=firstMonth(sim.series,'boost',x.target);
      if(om>=0&&bm>=0&&bm>om) mrow=`<div class="kpi" style="grid-column:1/-1"><div class="l">${fmtDollar(x.target)} milestone</div><div class="v" style="color:var(--ac)">${fmtMonthsLabel(bm-om)} sooner</div></div>`;
      else if(om>=0&&bm<0) mrow=`<div class="kpi" style="grid-column:1/-1"><div class="l">${fmtDollar(x.target)} milestone</div><div class="v" style="color:var(--ac)">now reachable</div></div>`;
    });
    out.innerHTML=`<div class="cb"><div class="stats">
      <div class="kpi"><div class="l">Add</div><div class="v sm" style="color:var(--ac)">${fmtDollar(a)} / ${freq}</div></div>
      <div class="kpi"><div class="l">Horizon</div><div class="v sm">${fmtMonthsLabel(months)}</div></div>
      <div class="kpi"><div class="l">Baseline</div><div class="v sm" style="color:#6fb8ef">${fmtDollar(sim.base)}</div></div>
      <div class="kpi"><div class="l">With Funds</div><div class="v g">${fmtDollar(sim.boost)}</div></div>
      <div class="kpi"><div class="l">Difference</div><div class="v sm" style="color:var(--ac)">+${fmtDollar(delta)}</div></div>
      <div class="kpi"><div class="l">You Contribute</div><div class="v sm">${fmtDollar(sim.contrib)}</div></div>
      ${mrow}
    </div><p class="disc" style="margin-top:12px">Projection only — assumes ${(g*100).toFixed(1)}%/mo compounding. Markets vary.</p></div>`;
  }
  freqEl.querySelectorAll('.fb').forEach(b=>b.addEventListener('click',()=>{ freq=b.dataset.f; freqEl.querySelectorAll('.fb').forEach(x=>x.classList.toggle('on',x===b)); recompute(); }));
  amt.addEventListener('input',recompute); range.addEventListener('input',recompute); recompute();
}
function deriveMonthlyRate(gc){ if(gc&&gc.monthly_target_pct) return gc.monthly_target_pct/100;
  const pj=(gc&&gc.projected)||[]; if(pj.length>=2&&pj[0].value>0){ const days=(new Date(pj[pj.length-1].date)-new Date(pj[0].date))/86400000; const mo=days/30.4368; if(mo>0) return Math.pow(pj[pj.length-1].value/pj[0].value,1/mo)-1; }
  if(gc&&gc.weekly_target_pct) return Math.pow(1+gc.weekly_target_pct/100,4.34812)-1; return 0.05; }
function computeFunds(V0,g,a,freq,months){ let base=V0,boost=V0,contrib=0; if(freq==='once'){boost+=a;contrib=a;} const series=[{m:0,base,boost}]; const per=CPM[freq]||0;
  for(let i=1;i<=months;i++){ base*=(1+g); boost*=(1+g); if(freq!=='once'&&a>0){const add=a*per;boost+=add;contrib+=add;} series.push({m:i,base,boost}); } return {series,contrib,base,boost}; }
function firstMonth(series,key,t){ for(let i=0;i<series.length;i++) if(series[i][key]>=t) return series[i].m; return -1; }

/* TICKER ENGINE */
function buildEngineShell(){
  if (engineReady) return; engineReady = true;
  const root = document.getElementById('engine-root');
  root.innerHTML = `<div class="wrap">${rail('TICKER&nbsp;ENGINE&nbsp;//&nbsp;03')}<div class="main">
    ${sec('Q1','Quant Core','deterministic · no AI','<span class="beta">BETA</span>')}
    <div class="search"><div class="sin"><span class="ic">⌕</span><input id="engine-input" style="background:none;border:none;outline:none;color:var(--t1);font-family:var(--disp);letter-spacing:3px;font-size:15px;text-transform:uppercase;width:100%" placeholder="ENTER TICKER — AAPL, SPY, QQQ" maxlength="12" autocomplete="off" spellcheck="false"></div><button class="go" id="engine-go">ANALYZE</button></div>
    <p class="disc"><b>BETA — not financial advice.</b> Automated quant signal (trend · momentum · RSI · volatility). Not a buy/sell recommendation. Stocks, ETFs &amp; indexes only · no crypto.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">${['AAPL','MSFT','SPY','QQQ','NVDA'].map(s=>`<button class="fb" data-sym="${s}" style="font-family:var(--disp);font-size:10px;letter-spacing:1px;padding:6px 12px;background:var(--bg2);border:1px solid var(--line);color:var(--t3);cursor:pointer">${s}</button>`).join('')}</div>
    <div id="engine-result"><div class="empty-state"><div class="empty-icon">⚙</div><p class="empty-title">Enter a Ticker to Begin</p><p class="empty-sub">CLU pulls recent price history and returns a quant read — signal, conviction, suggested style, and the factors behind it. Stocks, ETFs &amp; indexes only.</p></div></div>
  </div></div>`;
  const input=document.getElementById('engine-input'), go=document.getElementById('engine-go');
  const run=()=>runEngine(input.value);
  go.addEventListener('click',run); input.addEventListener('keydown',e=>{if(e.key==='Enter')run();});
  root.querySelectorAll('[data-sym]').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.sym;runEngine(b.dataset.sym);}));
}
async function tdFetch(path){ const sep=path.includes('?')?'&':'?'; const res=await fetch(`${TD_BASE}/${path}${sep}apikey=${encodeURIComponent(TD_API_KEY)}`);
  let j; try{ j=await res.json(); }catch{ throw new Error('Bad response from data provider.'); }
  if(j&&(j.status==='error'||(typeof j.code==='number'&&j.code>=400))){ if(j.code===429) throw new Error('Rate limit reached — wait a moment.'); throw new Error(j.message||'Data provider error.'); } return j; }
async function runEngine(raw){
  const symbol=(raw||'').trim().toUpperCase(); const out=document.getElementById('engine-result'); if(!symbol||!out||engineBusy) return;
  if(symbol.includes('/')||/^(BTC|ETH|DOGE|XRP|SOL|ADA|USDT|USDC|SHIB|LTC|BNB)([-/]|$)/.test(symbol)){ out.innerHTML=engMsg('— No Crypto / FX',"CLU's mandate excludes crypto and forex. Enter a stock, ETF, or index."); return; }
  engineBusy=true; out.innerHTML=`<div class="empty-state"><div class="loader"></div><p>Analyzing <b style="color:var(--ac)">${escHtml(symbol)}</b>…</p></div>`;
  try{
    let data=ENGINE_CACHE[symbol];
    if(!data||Date.now()-data.t>ENGINE_TTL){ const [q,ts]=await Promise.all([tdFetch(`quote?symbol=${encodeURIComponent(symbol)}`).catch(()=>null), tdFetch(`time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=260`)]); data={t:Date.now(),q,ts}; ENGINE_CACHE[symbol]=data; }
    const a=analyzeTicker(symbol,data.q,data.ts); if(!a) throw new Error('Not enough price history.');
    if(a.blocked){ out.innerHTML=engMsg('— Unsupported',a.blocked); engineBusy=false; return; }
    out.innerHTML=renderEngine(a);
    requestAnimationFrame(()=>animateEngineCard(out));
  }catch(e){ out.innerHTML=engMsg('Analysis Unavailable',(e&&e.message)||'Could not analyze this ticker.'); }
  engineBusy=false;
}
function engMsg(t,s){ return `<div class="empty-state"><div class="empty-icon" style="color:#ff8800">⚠</div><p class="empty-title" style="color:#ff8800">${escHtml(t)}</p><p class="empty-sub">${escHtml(s)}</p></div>`; }

const TONE_COLOR={bull:'#37e08a',bear:'#ff5a7a',caution:'#f2a73d',neutral:'#6fb8ef'};
const BIAS_LABEL={short:'short-term',intermediate:'intermediate',long:'long-term'};
function renderEngine(a){
  const m=a.metrics; const dc=a.dayChgPct>=0;
  const hz=a.horizons.map(h=>{ const tc=TONE_COLOR[h.verdict.tone]||'#6fb8ef';
    const ev=h.evidence.map(x=>`<li>${escHtml(x)}</li>`).join('');
    return `<div class="hz"><div class="hzh"><span class="hzl">${escHtml(h.label)}</span><span class="hzw">${escHtml(h.window)}</span></div><div class="hzv" style="color:${tc};border-color:${tc}66">${escHtml(h.verdict.label)} <i>${Math.round(h.score)}</i></div><ul class="hze">${ev}</ul></div>`;
  }).join('');
  const met=[['1-Mo',m.ret1m,'pctSigned',pc(m.ret1m)],['3-Mo',m.ret3m,'pctSigned',pc(m.ret3m)],['6-Mo',m.ret6m,'pctSigned',pc(m.ret6m)],['RSI 14',m.rsi,'int',''],['Volatility',m.vol,'intPct',''],['ATR %',m.atr,'dec1Pct',''],['vs 50-day',m.distFrom50,'pctSigned',pc(m.distFrom50)],['vs 200-day',m.distFrom200,'pctSigned',pc(m.distFrom200)]]
    .map(x=>{ const raw=x[1], f=x[2]; const disp=(raw==null||!isFinite(raw))?'—':fmtCU(raw,f); const cu=(raw==null||!isFinite(raw))?'':` data-cu="${raw}" data-cuf="${f}"`;
      return `<div class="m"><div class="l">${x[0]}</div><div class="v ${x[3]}"${cu}>${disp}</div></div>`; }).join('');
  const facs=a.evidence.map(f=>{ const cls=f.state>0.15?'':f.state<-0.15?'n':'z'; const icon=f.state>0.15?'✓':f.state<-0.15?'✕':'–';
    return `<div class="fac"><span class="fic ${cls}">${icon}</span><span class="flab">${escHtml(f.label)}</span><span class="det">${escHtml(f.detail)}</span></div>`; }).join('');
  const mkt=a.marketOpen===false?' · market closed':a.marketOpen===true?' · market open':'';
  const sigColor={'sig-strong-buy':'#37e08a','sig-buy':'#6fb8ef','sig-hold':'#ffdd00','sig-reduce':'#f2a73d','sig-sell':'#ff5a7a'}[a.rec.cls]||'#37e08a';
  const stc=TONE_COLOR[a.setup.tone]||'#6fb8ef';
  return card(`<div class="vh"><div><div class="sym">${escHtml(a.symbol)}</div><div class="nm2">${escHtml(a.name)}</div><div class="ex">${escHtml(a.exchange)} · ${escHtml(a.type)}${mkt}</div></div><div class="rt"><div class="price" data-cu="${a.price}" data-cuf="dollar">${fmtDollar(a.price)}</div><div class="chg" style="${dc?'':'color:var(--red)'}" data-cu="${a.dayChgPct}" data-cuf="dayPct">${dc?'+':''}${a.dayChgPct.toFixed(2)}% today</div><div class="asof">as of ${escHtml(a.asOf)}</div></div></div>
    <div class="verdict"><div class="gauge">${engineGauge(a.conviction,sigColor)}</div><div><div class="sig" style="color:${sigColor};text-shadow:0 0 18px ${sigColor}66">${escHtml(a.rec.label)}</div><div class="chips"><span class="chip setup" style="color:${stc};border-color:${stc}">${escHtml(a.setup.name)}</span><span class="chip amb">RISK: ${a.risk.label}</span></div><div class="vnote">${escHtml(a.setup.action)} <span style="color:var(--t4)">· best fit: ${escHtml(BIAS_LABEL[a.setup.horizonBias]||a.setup.horizonBias)}</span></div></div></div>
    <div class="hzwrap"><div class="fh">Horizon Outlook — by holding window</div><div class="hzmx">${hz}</div></div>
    <div class="met">${met}</div>
    <div class="fwrap"><div class="fh">Evidence &amp; Logic</div>${facs}</div>
    <p class="disc" style="margin:12px 14px 14px"><b>BETA · Not financial advice.</b> Deterministic quant model (no AI) from price &amp; volume history — horizon windows and the setup label are rules-based reads, not recommendations.</p>`);
}
function engineGauge(score,color){
  const R=59; const L=Math.PI*R; // semicircle arc length
  const f=Math.max(0,Math.min(100,score))/100; const off=(L*(1-f));
  const dash=L.toFixed(2), offT=off.toFixed(2);
  // Markup renders the FINAL state (reduced-motion / no-JS safe); animateGauge() resets→sweeps.
  return `<svg class="cgauge" viewBox="0 0 150 92" width="150" xmlns="http://www.w3.org/2000/svg" data-score="${score}" data-len="${dash}" data-off="${offT}">
    <path d="M16,80 A${R},${R} 0 0,1 134,80" fill="none" stroke="rgba(90,130,160,.18)" stroke-width="12"/>
    <path class="cgauge-arc" d="M16,80 A${R},${R} 0 0,1 134,80" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${offT}" style="filter:drop-shadow(0 0 5px ${color})"/>
    <text class="cgauge-num" x="75" y="70" text-anchor="middle" font-size="30" font-weight="700" fill="${color}" font-family="'Orbitron',monospace">${score}</text>
    <text x="75" y="84" text-anchor="middle" font-size="7" fill="#9bc0e0" letter-spacing="2" font-family="monospace">CONVICTION</text>
  </svg>`;
}
function animateGauge(svg){
  const arc=svg.querySelector('.cgauge-arc'), num=svg.querySelector('.cgauge-num');
  if(!arc||!num) return;
  const len=parseFloat(svg.dataset.len), offT=parseFloat(svg.dataset.off), score=parseInt(svg.dataset.score,10)||0;
  arc.setAttribute('stroke-dashoffset', len.toFixed(2)); num.textContent='0';
  rafAnim(1150, easeOutBackMild, e => {
    arc.setAttribute('stroke-dashoffset', (len - (len - offT) * e).toFixed(2));
    num.textContent = Math.max(0, Math.min(score, Math.round(score * e)));
  }, () => { arc.setAttribute('stroke-dashoffset', offT.toFixed(2)); num.textContent = score; svg.classList.add('lit'); });
}
function animateEngineCard(scope){
  if(!scope) return;
  if(prefersReducedMotion()) return; // final values already in markup
  const g=scope.querySelector('.cgauge'); if(g) animateGauge(g);
  animateCounts(scope, 1000);
}
const pct=v=>v==null?'—':`${v>=0?'+':''}${v.toFixed(1)}%`; const pc=v=>v==null?'':(v>=0?'up':'dn');

function emaS(a,n){const k=2/(n+1);const o=[a[0]];for(let i=1;i<a.length;i++)o.push(a[i]*k+o[i-1]*(1-k));return o;}
function smaC(a,n){if(a.length<n)return null;let s=0;for(let i=a.length-n;i<a.length;i++)s+=a[i];return s/n;}
function retC(a,n){if(a.length<=n)return null;const p=a[a.length-1-n];return p?(a[a.length-1]/p-1)*100:null;}
function rsiC(a,p){p=p||14;if(a.length<p+1)return null;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>=0)g+=d;else l-=d;}const ag=g/p,al=l/p;if(al===0)return 100;return 100-100/(1+ag/al);}
function volC(a,w){w=w||30;if(a.length<w+1)w=a.length-1;if(w<2)return null;const r=[];for(let i=a.length-w;i<a.length;i++)r.push(a[i]/a[i-1]-1);const m=r.reduce((x,y)=>x+y,0)/r.length;const v=r.reduce((x,y)=>x+(y-m)*(y-m),0)/r.length;return Math.sqrt(v)*Math.sqrt(252)*100;}
function macdH(a){if(a.length<35)return null;const e12=emaS(a,12),e26=emaS(a,26);const md=a.map((_,i)=>e12[i]-e26[i]);const sg=emaS(md,9);return md[md.length-1]-sg[sg.length-1];}
/* ---- enriched engine: extra indicators, horizon scoring, setup classification ---- */
function smaAt(a,n,back){ const end=a.length-back; if(end<n||end<=0) return null; let s=0; for(let i=end-n;i<end;i++) s+=a[i]; return s/n; }
function slopePct(a,n,back){ const cur=smaC(a,n), prev=smaAt(a,n,back); return (cur!=null&&prev!=null&&prev!==0)?(cur/prev-1)*100:null; }
function atrPct(h,l,c,p){ p=p||14; if(c.length<p+1) return null; let s=0; for(let i=c.length-p;i<c.length;i++){ const tr=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])); s+=tr; } const atr=s/p, px=c[c.length-1]; return px?atr/px*100:null; }
function volStats(c,v,w){ w=w||20; if(v.length<w+1) w=v.length-1; if(w<2) return {avg:null,ratio:null,bias:null}; let sum=0,up=0,dn=0; for(let i=v.length-w;i<v.length;i++){ sum+=v[i]; const ch=c[i]-c[i-1]; if(ch>=0) up+=v[i]; else dn+=v[i]; } const avg=sum/w, last=v[v.length-1]; return {avg, ratio:avg>0?last/avg:null, bias:(up+dn)>0?(up-dn)/(up+dn):null}; }
const clampN=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const clamp100=x=>Math.max(0,Math.min(100,x));
function scoreShort(M){ let s=50;
  if(M.sma20!=null) s+= M.price>=M.sma20?11:-11;
  if(M.macdHist!=null) s+= M.macdHist>=0?9:-9;
  if(M.rsi!=null){ if(M.rsi>=80)s-=20; else if(M.rsi>=72)s-=6; else if(M.rsi>=55)s+=12; else if(M.rsi>=45)s+=2; else if(M.rsi>=30)s-=10; else s-=2; }
  if(M.ret2w!=null) s+=clampN(M.ret2w*1.4,-12,12);
  if(M.distFrom20!=null&&M.distFrom20>10) s-=clampN(M.distFrom20-10,0,12);
  return clamp100(s); }
function scoreInt(M){ let s=50;
  if(M.sma50!=null) s+= M.price>=M.sma50?13:-13;
  if(M.slope50!=null) s+=clampN(M.slope50*4,-10,10);
  if(M.ret3m!=null) s+=clampN(M.ret3m*0.7,-14,14);
  if(M.ret1m!=null) s+=clampN(M.ret1m*0.9,-8,8);
  return clamp100(s); }
function scoreLong(M){ let s=50;
  if(M.sma200!=null) s+= M.price>=M.sma200?16:-16;
  if(M.slope200!=null) s+=clampN(M.slope200*5,-10,10);
  if(M.cross!=null) s+= M.cross>=0?8:-8;
  if(M.ret6m!=null) s+=clampN(M.ret6m*0.4,-12,12);
  if(M.pos52!=null) s+=clampN((M.pos52-50)*0.16,-8,8);
  return clamp100(s); }
function hzVerdict(score){ if(score>=66)return{label:'BULLISH',tone:'bull'}; if(score>=55)return{label:'CONSTRUCTIVE',tone:'bull'}; if(score>=45)return{label:'NEUTRAL',tone:'neutral'}; if(score>=34)return{label:'CAUTIOUS',tone:'bear'}; return{label:'BEARISH',tone:'bear'}; }
function fmtPm(v,dec){ if(v==null||!isFinite(v))return '—'; return (v>=0?'+':'')+v.toFixed(dec==null?1:dec)+'%'; }
function rsiWord(r){ return r>=72?'overbought':r>=55?'healthy':r>=45?'neutral':r>=30?'weak':'oversold'; }
function evShort(M){ const e=[];
  if(M.rsi!=null) e.push(`RSI ${M.rsi.toFixed(0)} — ${rsiWord(M.rsi)}`);
  if(M.macdHist!=null) e.push(`MACD ${M.macdHist>=0?'bullish':'bearish'}`);
  if(M.sma20!=null) e.push(`${fmtPm(M.distFrom20)} vs 20-day`);
  if(M.ret2w!=null) e.push(`2-wk ${fmtPm(M.ret2w)}`);
  return e.slice(0,3); }
function evInt(M){ const e=[];
  if(M.sma50!=null) e.push(`${fmtPm(M.distFrom50)} vs 50-day`);
  if(M.slope50!=null) e.push(`50-day ${M.slope50>=0?'rising':'falling'}`);
  if(M.ret3m!=null) e.push(`3-mo ${fmtPm(M.ret3m)}`);
  return e.slice(0,3); }
function evLong(M){ const e=[];
  if(M.sma200!=null) e.push(`${fmtPm(M.distFrom200)} vs 200-day`);
  if(M.cross!=null) e.push(M.cross>=0?'golden cross':'death cross');
  if(M.ret6m!=null) e.push(`6-mo ${fmtPm(M.ret6m)}`);
  return e.slice(0,3); }
function setupObj(name,tone,bias,action){ return {name,tone,horizonBias:bias,action}; }
function classifySetup(M){
  const up200=M.sma200!=null&&M.price>=M.sma200, below200=M.sma200!=null&&M.price<M.sma200;
  const bullStack=M.sma20!=null&&M.sma50!=null&&M.sma200!=null&&M.price>=M.sma20&&M.sma20>=M.sma50&&M.sma50>=M.sma200;
  const bearStack=M.sma20!=null&&M.sma50!=null&&M.sma200!=null&&M.price<M.sma20&&M.sma20<M.sma50&&M.sma50<M.sma200;
  const rsi=M.rsi==null?50:M.rsi;
  if(below200&&M.ret1m!=null&&M.ret1m<=-12&&M.dd!=null&&M.dd<=-25&&M.vol!=null&&M.vol>=45) return setupObj('Falling Knife','bear','long','Sharp decline below every moving average — wait for a base; do not try to catch it.');
  if(below200&&rsi<30) return setupObj('Oversold Bounce','caution','short','Counter-trend bounce candidate only — the primary trend is still down. High risk, tight leash.');
  if(bearStack&&(M.slope200==null||M.slope200<0)) return setupObj('Confirmed Downtrend','bear','long','Price stacked below 20<50<200 with a falling long-term trend — avoid new longs until structure repairs.');
  if(below200&&M.slope50!=null&&M.slope50>0&&rsi>=45) return setupObj('Basing / Recovery','neutral','long','Carving a base under the 200-day with the 50-day turning up — early accumulation watch; needs to reclaim the 200-day.');
  if(rsi>=78||(M.distFrom50!=null&&M.distFrom50>=22)) return setupObj('Overextended','caution','short','Stretched far above trend — wait for a pullback rather than chase strength.');
  if(up200&&M.pos52!=null&&M.pos52>=92&&M.ret3m!=null&&M.ret3m>5&&rsi>=58) return setupObj('Breakout / Momentum','bull','short','Pressing 52-week highs with momentum — trend-trade it but manage risk into strength.');
  if(up200&&bullStack&&rsi>=50&&rsi<72&&(M.slope200==null||M.slope200>=0)) return setupObj('Confirmed Uptrend','bull','long','Cleanly stacked uptrend (price>20>50>200) — favor buying pullbacks; trend-following bias.');
  if(up200&&((M.sma20!=null&&M.price<M.sma20)||(M.sma50!=null&&M.price<M.sma50)||rsi<50)&&(M.slope200==null||M.slope200>=-0.5)) return setupObj('Pullback in Uptrend','bull','intermediate','Long-term trend intact but short-term soft — a potential buyable dip if it reclaims the 20/50-day.');
  if(up200&&M.slope50!=null&&M.slope50<0&&rsi<50) return setupObj('Distribution / Topping','caution','intermediate','Momentum rolling over while still above the 200-day — trim into strength and tighten stops.');
  if((M.slope50==null||Math.abs(M.slope50)<1.5)&&(M.slope200==null||Math.abs(M.slope200)<1.2)) return setupObj('Range / Consolidation','neutral','intermediate','Flat moving averages — range conditions; trade the edges and wait for a decisive break.');
  return up200?setupObj('Constructive','bull','intermediate','Mildly positive structure — be selective and confirm strength before adding.'):setupObj('Weak / Avoid','bear','long','Below the long-term trend with no clear base — stay patient until it stabilizes.');
}
function buildEvidence(M){
  const E=[]; const cl=x=>Math.max(-1,Math.min(1,x));
  const stack = (M.sma20!=null&&M.sma50!=null&&M.sma200!=null)
    ? (M.price>=M.sma20&&M.sma20>=M.sma50&&M.sma50>=M.sma200) ? 1
    : (M.price<M.sma20&&M.sma20<M.sma50&&M.sma50<M.sma200) ? -1 : 0 : 0;
  if(M.sma200!=null) E.push({label:'Long-term trend (200-day)',state:M.price>=M.sma200?1:-1,detail:`${fmtPm(M.distFrom200)} · ${fmtDollar(M.sma200)}`});
  E.push({label:'Trend structure',state:stack,detail:stack>0?'20>50>200 stacked (bullish)':stack<0?'price under all MAs (bearish)':'mixed / transitioning'});
  if(M.slope200!=null) E.push({label:'200-day slope',state:cl(M.slope200*3),detail:`${M.slope200>=0?'rising':'falling'} (${fmtPm(M.slope200)})`});
  if(M.cross!=null) E.push({label:'50 / 200 cross',state:M.cross>=0?1:-1,detail:M.cross>=0?'golden cross':'death cross'});
  if(M.sma50!=null) E.push({label:'Intermediate trend (50-day)',state:M.price>=M.sma50?1:-1,detail:`${fmtPm(M.distFrom50)} · ${fmtDollar(M.sma50)}`});
  if(M.ret3m!=null) E.push({label:'3-month momentum',state:cl(M.ret3m/15),detail:fmtPm(M.ret3m)});
  if(M.ret1m!=null) E.push({label:'1-month momentum',state:cl(M.ret1m/10),detail:fmtPm(M.ret1m)});
  if(M.rsi!=null){ let st; if(M.rsi>=80)st=-0.6;else if(M.rsi>=72)st=0.05;else if(M.rsi>=55)st=0.7;else if(M.rsi>=45)st=0;else if(M.rsi>=30)st=-0.4;else st=-0.5; E.push({label:'RSI (14)',state:st,detail:`${M.rsi.toFixed(0)} — ${rsiWord(M.rsi)}`}); }
  if(M.macdHist!=null) E.push({label:'MACD histogram',state:M.macdHist>=0?0.7:-0.7,detail:M.macdHist>=0?'bullish':'bearish'});
  if(M.volBias!=null) E.push({label:'Volume bias (20-day)',state:cl(M.volBias*1.5),detail:`${M.volBias>=0?'accumulation':'distribution'}${M.volRatio!=null?` · last ${M.volRatio.toFixed(1)}× avg`:''}`});
  if(M.dd!=null) E.push({label:'From 52-week high',state:cl((M.dd+12)/12),detail:`${fmtPm(M.dd)}${M.pos52!=null?` · ${M.pos52.toFixed(0)}% of 52-wk range`:''}`});
  if(M.vol!=null) E.push({label:'Volatility regime',state:M.vol<22?0.4:M.vol<40?0:M.vol<60?-0.4:-0.7,detail:`${M.vol.toFixed(0)}% ann${M.atr!=null?` · ATR ${M.atr.toFixed(1)}%`:''}`});
  return E;
}
function analyzeTicker(symbol,q,ts){
  if(!ts||!ts.values||!ts.values.length)return null;
  const type=(q&&q.type)||(ts.meta&&ts.meta.type)||'';
  if(/digital currency|physical currency|crypto/i.test(type))return{blocked:'CLU does not analyze crypto or currencies.'};
  const series=ts.values.slice().reverse().map(r=>({c:parseFloat(r.close),h:parseFloat(r.high),l:parseFloat(r.low),v:parseFloat(r.volume)||0,d:r.datetime})).filter(x=>!isNaN(x.c));
  if(series.length<30)return null;
  const closes=series.map(x=>x.c), highs=series.map(x=>x.h), lows=series.map(x=>x.l), volumes=series.map(x=>x.v);
  const price=q&&q.close?parseFloat(q.close):closes[closes.length-1]; const pv=q&&q.previous_close?parseFloat(q.previous_close):closes[closes.length-2];
  const day=q&&q.percent_change!=null?parseFloat(q.percent_change):(pv?(price/pv-1)*100:0);
  const sma20=smaC(closes,20),sma50=smaC(closes,50),sma200=smaC(closes,200);
  const slope20=slopePct(closes,20,5),slope50=slopePct(closes,50,10),slope200=slopePct(closes,200,20);
  const ret2w=retC(closes,10),ret1m=retC(closes,21),ret3m=retC(closes,63),ret6m=retC(closes,126);
  const rsi=rsiC(closes,14),vol=volC(closes,30),macdHist=macdH(closes),atr=atrPct(highs,lows,closes,14);
  const vS=volStats(closes,volumes,20);
  const tail=closes.slice(-252); const hi=q&&q.fifty_two_week&&q.fifty_two_week.high?parseFloat(q.fifty_two_week.high):Math.max.apply(null,tail); const lo=q&&q.fifty_two_week&&q.fifty_two_week.low?parseFloat(q.fifty_two_week.low):Math.min.apply(null,tail);
  const pos52=hi>lo?((price-lo)/(hi-lo))*100:50;
  const dd=hi?((price/hi)-1)*100:null, fromLow=lo?((price/lo)-1)*100:null;
  const distFrom20=sma20?(price/sma20-1)*100:null, distFrom50=sma50?(price/sma50-1)*100:null, distFrom200=sma200?(price/sma200-1)*100:null;
  const cross=(sma50!=null&&sma200!=null)?(sma50>=sma200?1:-1):null;
  const M={price,sma20,sma50,sma200,slope20,slope50,slope200,ret2w,ret1m,ret3m,ret6m,rsi,vol,atr,macdHist,distFrom20,distFrom50,distFrom200,cross,pos52,dd,fromLow,hi,lo,volRatio:vS.ratio,volBias:vS.bias};
  const sShort=scoreShort(M),sInt=scoreInt(M),sLong=scoreLong(M);
  const horizons=[
    {key:'short',label:'Short-Term',window:'~1–10 trading days',score:sShort,verdict:hzVerdict(sShort),evidence:evShort(M)},
    {key:'intermediate',label:'Intermediate',window:'~1–3 months',score:sInt,verdict:hzVerdict(sInt),evidence:evInt(M)},
    {key:'long',label:'Long-Term',window:'~6–18 months',score:sLong,verdict:hzVerdict(sLong),evidence:evLong(M)},
  ];
  const conviction=Math.round(0.25*sShort+0.35*sInt+0.40*sLong);
  let rec; if(conviction>=72)rec={label:'STRONG BUY',cls:'sig-strong-buy'};else if(conviction>=60)rec={label:'BUY',cls:'sig-buy'};else if(conviction>=45)rec={label:'HOLD / NEUTRAL',cls:'sig-hold'};else if(conviction>=33)rec={label:'REDUCE',cls:'sig-reduce'};else rec={label:'AVOID',cls:'sig-sell'};
  let risk; if(vol==null)risk={label:'N/A'};else if(vol<22)risk={label:'LOW'};else if(vol<40)risk={label:'MODERATE'};else if(vol<60)risk={label:'HIGH'};else risk={label:'VERY HIGH'};
  const setup=classifySetup(M);
  return { symbol, name:(q&&q.name)||symbol, exchange:(q&&q.exchange)||(ts.meta&&ts.meta.exchange)||'', type:type||'Equity', asOf:(q&&q.datetime)||(series.length?series[series.length-1].d:''), marketOpen:q?q.is_market_open:null, price, dayChgPct:day, metrics:M, horizons, conviction, rec, risk, setup, evidence:buildEvidence(M) };
}

/* ARCHIVE */
async function loadArchive(){
  if (archiveLoaded) return; archiveLoaded = true;
  const root=document.getElementById('archive-root');
  root.innerHTML=`<div class="wrap">${rail('PAST&nbsp;REPORTS&nbsp;//&nbsp;04')}<div class="main">${sec('R1','Filed Reports','final daily · newest first')}<div class="archlay"><div class="alist" id="arch-list">${stateLoading('Loading…')}</div><div id="arch-detail"><div class="empty-state"><div class="empty-icon">◷</div><p class="empty-title">Select a Report</p><p class="empty-sub">Choose a date to view the full session brief.</p></div></div></div></div></div>`;
  try{
    const res=await fetch(ARCHIVE_INDEX_URL+'?t='+Date.now()); if(!res.ok) throw new Error();
    archiveIndex=(await res.json()).sort((a,b)=>b.date.localeCompare(a.date));
    const list=document.getElementById('arch-list');
    if(!archiveIndex.length){ list.innerHTML='<div class="empty-sub" style="padding:16px">No archived reports yet.</div>'; return; }
    list.innerHTML=archiveIndex.map(e=>{ const pc=e.day_pct; const has=typeof pc==='number'; const up=has&&pc>=0;
      return `<div class="arow" data-date="${e.date}"><span class="ad">${formatDateLong(e.date.slice(0,10))}</span><span class="as">${escHtml(e.session_label||e.session||'')}${has?` · <b class="${up?'':'dn'}">${up?'+':''}${pc.toFixed(1)}%</b>`:''}</span></div>`;
    }).join('');
    list.querySelectorAll('.arow').forEach(r=>r.addEventListener('click',()=>selectArchive(r.dataset.date,true)));
    if(document.body.dataset.tab==='archive') setStatusBar('archive');
    // deep-link: open the report named in the URL hash (#YYYY-MM-DD or full key) on load
    const initial = resolveArchiveKey((location.hash||'').replace(/^#/,''));
    if(initial) selectArchive(initial,false);
  }catch{ const list=document.getElementById('arch-list'); if(list) list.innerHTML='<div class="empty-sub" style="padding:16px;color:#ff5a4a">Failed to load archive.</div>'; }
}
function resolveArchiveKey(h){
  if(!h || !archiveIndex.length) return null;
  if(archiveIndex.some(e=>e.date===h)) return h;
  const pre = archiveIndex.find(e=>e.date.slice(0,10)===h.slice(0,10));
  return pre ? pre.date : null;
}
function selectArchive(date, updateHash){
  const list=document.getElementById('arch-list'); if(!list) return;
  const row=list.querySelector(`.arow[data-date="${date}"]`); if(!row) return;
  list.querySelectorAll('.arow').forEach(x=>x.classList.toggle('on', x===row));
  archiveSel=date; setStatusBar('archive'); loadArchiveReport(date);
  // replaceState keeps the URL shareable without spamming history or firing hashchange
  if(updateHash && (location.hash||'').replace(/^#/,'')!==date) history.replaceState(null,'',`#${date}`);
  row.scrollIntoView({block:'nearest'});
}
function onArchiveHashChange(){
  const key=resolveArchiveKey((location.hash||'').replace(/^#/,'')); if(!key) return;
  if(document.body.dataset.tab!=='archive'){ switchTab('archive'); return; } // loadArchive will pick up the hash
  if(archiveLoaded && key!==archiveSel) selectArchive(key,false);
}
async function loadArchiveReport(date){
  const det=document.getElementById('arch-detail'); det.innerHTML=stateLoading('Loading…');
  try{
    const res=await fetch(ARCHIVE_REPORT(date)+'?t='+Date.now()); if(!res.ok) throw new Error(); const d=await res.json();
    const p=d.portfolio||{}; const pos=d.positions||[]; const c=(p.day_pnl_dollars||0)>=0;
    const best=pos.slice().sort((a,b)=>(b.total_pnl_pct||0)-(a.total_pnl_pct||0))[0];
    const trades=d.trades_executed||[];
    const kpi=[['Close Value',fmtDollar(p.total_value),''],['Day P&L',(c?'+':'')+fmtDollar(p.day_pnl_dollars),c?'up':'dn'],['Day %',(c?'+':'')+(p.day_pnl_pct||0).toFixed(1)+'%',c?'up':'dn'],['Trades',String(trades.length),''],['Best',best?`${escHtml(best.symbol)} ${(best.total_pnl_pct||0)>=0?'+':''}${(best.total_pnl_pct||0).toFixed(1)}%`:'—','up'],['Cash',fmtDollar(p.cash),''],['Positions',`${p.open_positions||pos.length} / ${p.positions_cap||4}`,''],['Session',formatDate((d.meta&&d.meta.date)||date),'']]
      .map(x=>`<div class="m"><div class="l">${x[0]}</div><div class="v ${x[2]}">${x[1]}</div></div>`).join('');
    const log=trades.length?trades.map(t=>`<div class="fac"><span class="fic">⇄</span> ${escHtml(t.side)} ${escHtml(t.symbol)} ×${t.shares} <span class="det">@ ${fmtDollar(t.price)} — ${escHtml(t.reason||'')}</span></div>`).join(''):'<div class="fac"><span class="fic">–</span> No trades this session.</div>';
    const recap=(d.thoughts&&d.thoughts.length)?`<div class="intel"><span class="tag">RECAP</span><p>${escHtml(d.thoughts[0].text)}</p></div>`:'';
    det.innerHTML=card(`<div class="met">${kpi}</div><div class="fwrap"><div class="fh">Session Log</div>${log}</div>${recap?`<div style="padding:0 14px 14px">${recap}</div>`:''}`, 'REC', `Final Daily — ${formatDate((d.meta&&d.meta.date)||date)}`);
  }catch{ det.innerHTML='<div class="empty-sub" style="padding:20px;color:#ff5a4a">Failed to load report.</div>'; }
}

/* ANIMATION — shared "power-on" motion helpers (80s/retro feel) */
function prefersReducedMotion(){ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
function rafAnim(dur, ease, onFrame, onDone){
  let t0 = null;
  requestAnimationFrame(function step(now){
    if (t0 === null) t0 = now;
    const p = Math.min(1, (now - t0) / dur); const e = ease(p);
    onFrame(e, p);
    if (p < 1) requestAnimationFrame(step); else if (onDone) onDone();
  });
}
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutBackMild = t => { const c1 = 0.9, c3 = c1 + 1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); };
const easeInOutSine = t => -(Math.cos(Math.PI*t) - 1) / 2;
function fmtCU(v, f){
  if (f === 'dollar') return fmtDollar(v);
  if (f === 'pctSigned') return `${v>=0?'+':''}${v.toFixed(1)}%`;
  if (f === 'dayPct') return `${v>=0?'+':''}${v.toFixed(2)}% today`;
  if (f === 'dec1Pct') return v.toFixed(1) + '%';
  if (f === 'intPct') return Math.round(v) + '%';
  if (f === 'int') return String(Math.round(v));
  return String(Math.round(v));
}
function animateCounts(scope, dur){
  scope.querySelectorAll('[data-cu]').forEach(el => {
    const to = parseFloat(el.dataset.cu); const f = el.dataset.cuf || 'int';
    if (!isFinite(to)) return;
    el.textContent = fmtCU(0, f);
    rafAnim(dur || 900, easeOutCubic, t => { el.textContent = fmtCU(to * t, f); }, () => { el.textContent = fmtCU(to, f); });
  });
}

/* UTILS */
function fmtDollar(n){ if(n===null||n===undefined)return '—'; return '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatDate(s){ const [y,m,d]=s.split('-'); return `${m}/${d}/${y}`; }
function formatDateLong(s){ const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const [y,m,d]=s.split('-'); return `${M[+m-1]} ${+d}, ${y}`; }
function formatTimeShort(iso){ try{ return new Date(iso).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}); }catch{ return iso; } }
function fmtMonthsLabel(m){ if(m<12)return m+' mo'; const y=Math.floor(m/12),r=m%12; return r===0?y+' yr':y+' yr '+r+' mo'; }
function escHtml(s){ if(s===0)return '0'; if(!s)return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
