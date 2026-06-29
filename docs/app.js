/* ============================================================
   C.L.U. — Cognitive Logic Unit — Renderer v5.0 "HUD"
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
    mid = sbCell('SYS','NOMINAL') + clock + sbCell('SESSION', m.date ? formatDate(m.date) : '—') + sbCell('NEXT', m.next_session || '—');
  } else if (tab === 'journey'){
    const m = (journeyData && journeyData.meta) || {}; const gc = (journeyData && journeyData.growth_chart) || {};
    mid = sbCell('MODEL','CLU v0.54') + sbCell('UPDATED', m.updated_at ? formatTimeShort(m.updated_at) : '—') + sbCell('NEXT', m.next_update || '—') + sbCell('CONFIDENCE', (gc.projection_confidence || 'medium').toUpperCase());
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
  const perf = card(`<div class="cb"><div class="stats">
    <div class="kpi"><div class="l">Total Value</div><div class="v">${fmtDollar(p.total_value)}</div></div>
    <div class="kpi"><div class="l">Day P&amp;L</div><div class="v ${pnlCls}">${sign}${fmtDollar(p.day_pnl_dollars)} (${sign}${(p.day_pnl_pct||0).toFixed(1)}%)</div></div>
    <div class="kpi"><div class="l">Cash / Buying Power</div><div class="v sm">${fmtDollar(p.cash)}</div></div>
    <div class="kpi"><div class="l">Deployed · Slots ${open}/${cap}</div><div class="v sm">${fmtDollar(deployed)}</div><div class="barseg">${bars}</div></div>
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
}

function svgAllocRing(segs,total){
  const r=42, C=2*Math.PI*r; let off=0;
  const arcs = segs.map(s=>{ const len=(s.value/total)*C; const a=`<circle cx="60" cy="60" r="${r}" fill="none" stroke="${s.color}" stroke-width="13" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"/>`; off+=len; return a; }).join('');
  return `<svg viewBox="0 0 120 120" width="96"><circle cx="60" cy="60" r="${r}" fill="none" stroke="#01101f" stroke-width="13"/>${arcs}</svg>`;
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
  return `<svg viewBox="0 0 ${VW} ${VH}" width="100%" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${grid}${nowLine}
    ${projected.length?`<polyline points="${pPts}" fill="none" stroke="#cf6fe8" stroke-width="1.6" stroke-dasharray="6 4" opacity=".65"/>`:''}
    ${actual.length?`<polyline points="${aPts}" fill="none" stroke="#cf6fe8" stroke-width="2.5"/>`:''}
    ${dots}${la}${lp}${xl}</svg>`;
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
  }catch(e){ out.innerHTML=engMsg('Analysis Unavailable',(e&&e.message)||'Could not analyze this ticker.'); }
  engineBusy=false;
}
function engMsg(t,s){ return `<div class="empty-state"><div class="empty-icon" style="color:#ff8800">⚠</div><p class="empty-title" style="color:#ff8800">${escHtml(t)}</p><p class="empty-sub">${escHtml(s)}</p></div>`; }

function renderEngine(a){
  const m=a.metrics; const dc=a.dayChgPct>=0;
  const facs=a.factors.map(f=>{ const cls=f.state>0.15?'':f.state<-0.15?'n':''; const icon=f.state>0.15?'✓':f.state<-0.15?'✕':'–';
    const segs=Math.max(1,Math.round(Math.abs(f.state)*4)); let w=''; for(let i=0;i<4;i++) w+=`<i class="${i<segs?(f.state<0?'neg':'on'):''}"></i>`;
    return `<div class="fac"><span class="fic ${cls}">${icon}</span> ${escHtml(f.label)} <span class="det">${escHtml(f.detail)}</span><span class="w">${w}</span></div>`; }).join('');
  const met=[['1-Mo',pct(m.ret1m),pc(m.ret1m)],['3-Mo',pct(m.ret3m),pc(m.ret3m)],['6-Mo',pct(m.ret6m),pc(m.ret6m)],['RSI 14',m.rsi==null?'—':m.rsi.toFixed(0),''],['Volatility',m.vol==null?'—':m.vol.toFixed(0)+'%',''],['52-Wk Pos',m.pos52.toFixed(0)+'%',''],['50-D SMA',m.sma50==null?'—':fmtDollar(m.sma50),''],['200-D SMA',m.sma200==null?'—':fmtDollar(m.sma200),'']]
    .map(x=>`<div class="m"><div class="l">${x[0]}</div><div class="v ${x[2]}">${x[1]}</div></div>`).join('');
  const mkt=a.marketOpen===false?' · market closed':a.marketOpen===true?' · market open':'';
  const sigColor={'sig-strong-buy':'#37e08a','sig-buy':'#6fb8ef','sig-hold':'#ffdd00','sig-reduce':'#f2a73d','sig-sell':'#ff5a7a'}[a.rec.cls]||'#37e08a';
  return card(`<div class="vh"><div><div class="sym">${escHtml(a.symbol)}</div><div class="nm2">${escHtml(a.name)}</div><div class="ex">${escHtml(a.exchange)} · ${escHtml(a.type)}${mkt}</div></div><div class="rt"><div class="price">${fmtDollar(a.price)}</div><div class="chg" style="${dc?'':'color:var(--red)'}">${dc?'+':''}${a.dayChgPct.toFixed(2)}% today</div><div class="asof">as of ${escHtml(a.asOf)}</div></div></div>
    <div class="verdict"><div class="gauge">${engineGauge(a.conviction,sigColor)}</div><div><div class="sig" style="color:${sigColor};text-shadow:0 0 18px ${sigColor}66">${a.rec.label}</div><div class="chips"><span class="chip" style="color:${sigColor};border-color:${sigColor}">${escHtml(a.style.label)}</span><span class="chip amb">RISK: ${a.risk.label}</span></div><div class="vnote">${escHtml(a.style.note)}</div></div></div>
    <div class="met">${met}</div>
    <div class="fwrap"><div class="fh">Signal Breakdown</div>${facs}</div>
    <p class="disc" style="margin:12px 14px 14px"><b>BETA · Not financial advice.</b> Deterministic quant model (no AI) from historical price data — a research starting point, not a recommendation.</p>`);
}
function engineGauge(score,color){
  const R=59,cx=75,cy=80; const ang=Math.PI-(score/100)*Math.PI; const x=(cx+R*Math.cos(ang)).toFixed(1), y=(cy-R*Math.sin(ang)).toFixed(1);
  return `<svg viewBox="0 0 150 92" width="150" xmlns="http://www.w3.org/2000/svg"><path d="M16,80 A${R},${R} 0 0,1 134,80" fill="none" stroke="rgba(90,130,160,.18)" stroke-width="12"/><path d="M16,80 A${R},${R} 0 0,1 ${x},${y}" fill="none" stroke="${color}" stroke-width="12" style="filter:drop-shadow(0 0 5px ${color})"/><text x="75" y="70" text-anchor="middle" font-size="30" font-weight="700" fill="${color}" font-family="'Orbitron',monospace">${score}</text><text x="75" y="84" text-anchor="middle" font-size="7" fill="#9bc0e0" letter-spacing="2" font-family="monospace">CONVICTION</text></svg>`;
}
const pct=v=>v==null?'—':`${v>=0?'+':''}${v.toFixed(1)}%`; const pc=v=>v==null?'':(v>=0?'up':'dn');

function emaS(a,n){const k=2/(n+1);const o=[a[0]];for(let i=1;i<a.length;i++)o.push(a[i]*k+o[i-1]*(1-k));return o;}
function smaC(a,n){if(a.length<n)return null;let s=0;for(let i=a.length-n;i<a.length;i++)s+=a[i];return s/n;}
function retC(a,n){if(a.length<=n)return null;const p=a[a.length-1-n];return p?(a[a.length-1]/p-1)*100:null;}
function rsiC(a,p){p=p||14;if(a.length<p+1)return null;let g=0,l=0;for(let i=a.length-p;i<a.length;i++){const d=a[i]-a[i-1];if(d>=0)g+=d;else l-=d;}const ag=g/p,al=l/p;if(al===0)return 100;return 100-100/(1+ag/al);}
function volC(a,w){w=w||30;if(a.length<w+1)w=a.length-1;if(w<2)return null;const r=[];for(let i=a.length-w;i<a.length;i++)r.push(a[i]/a[i-1]-1);const m=r.reduce((x,y)=>x+y,0)/r.length;const v=r.reduce((x,y)=>x+(y-m)*(y-m),0)/r.length;return Math.sqrt(v)*Math.sqrt(252)*100;}
function macdH(a){if(a.length<35)return null;const e12=emaS(a,12),e26=emaS(a,26);const md=a.map((_,i)=>e12[i]-e26[i]);const sg=emaS(md,9);return md[md.length-1]-sg[sg.length-1];}
function styleOf(conv,vol,rsi,a200,c50200){ if(conv<45)return{label:'Avoid / Reduce',note:'Signals are weak — trend and momentum favor staying out until the chart repairs.'};
  if(conv<60)return{label:'Hold / Watch',note:'Mixed signals — hold existing exposure and wait for confirmation before adding.'};
  if(a200&&c50200&&vol<40){ if(vol<22)return{label:'Long-Term Buy / DRIP',note:'Steady, low-volatility uptrend — suits long-horizon accumulation and dividend reinvestment.'}; return{label:'Long-Term Buy',note:'Established uptrend above the 200-day — favorable for longer-horizon holds.'}; }
  if(vol>=40||rsi>72)return{label:'Short-Term / Swing',note:'Momentum strong but volatile/extended — better as a shorter-term trade with tight risk.'};
  return{label:'Position Buy',note:'Constructive setup — reasonable to scale in with a defined stop.'}; }
function analyzeTicker(symbol,q,ts){
  if(!ts||!ts.values||!ts.values.length)return null;
  const type=(q&&q.type)||(ts.meta&&ts.meta.type)||'';
  if(/digital currency|physical currency|crypto/i.test(type))return{blocked:'CLU does not analyze crypto or currencies.'};
  const rows=ts.values.slice().reverse(); const closes=rows.map(r=>parseFloat(r.close)).filter(v=>!isNaN(v)); if(closes.length<30)return null;
  const price=q&&q.close?parseFloat(q.close):closes[closes.length-1]; const pv=q&&q.previous_close?parseFloat(q.previous_close):closes[closes.length-2];
  const day=q&&q.percent_change!=null?parseFloat(q.percent_change):(pv?(price/pv-1)*100:0);
  const s20=smaC(closes,20),s50=smaC(closes,50),s200=smaC(closes,200);
  const r1=retC(closes,21),r3=retC(closes,63),r6=retC(closes,126),rsi=rsiC(closes,14),vol=volC(closes,30),mh=macdH(closes);
  const tail=closes.slice(-252); const hi=q&&q.fifty_two_week&&q.fifty_two_week.high?parseFloat(q.fifty_two_week.high):Math.max.apply(null,tail); const lo=q&&q.fifty_two_week&&q.fifty_two_week.low?parseFloat(q.fifty_two_week.low):Math.min.apply(null,tail);
  const pos52=hi>lo?((price-lo)/(hi-lo))*100:50;
  const cl=x=>Math.max(-1,Math.min(1,x)); const F=[];
  if(s200!=null)F.push({label:'Price vs 200-day trend',state:price>=s200?1:-1,detail:price>=s200?`above ${fmtDollar(s200)}`:`below ${fmtDollar(s200)}`,w:2});
  if(s50!=null&&s200!=null)F.push({label:'50 / 200 cross',state:s50>=s200?1:-1,detail:s50>=s200?'golden cross':'death cross',w:1.5});
  if(s50!=null)F.push({label:'Price vs 50-day',state:price>=s50?1:-1,detail:price>=s50?`above ${fmtDollar(s50)}`:`below ${fmtDollar(s50)}`,w:1.5});
  if(r3!=null)F.push({label:'3-month momentum',state:cl(r3/15),detail:`${r3>=0?'+':''}${r3.toFixed(1)}%`,w:2});
  if(r6!=null)F.push({label:'6-month momentum',state:cl(r6/30),detail:`${r6>=0?'+':''}${r6.toFixed(1)}%`,w:1.5});
  if(r1!=null)F.push({label:'1-month momentum',state:cl(r1/10),detail:`${r1>=0?'+':''}${r1.toFixed(1)}%`,w:1});
  if(rsi!=null){let st,dt; if(rsi>=80){st=-0.6;dt=`RSI ${rsi.toFixed(0)} — overbought`;}else if(rsi>=70){st=0.1;dt=`RSI ${rsi.toFixed(0)} — extended`;}else if(rsi>=55){st=0.7;dt=`RSI ${rsi.toFixed(0)} — healthy`;}else if(rsi>=45){st=0;dt=`RSI ${rsi.toFixed(0)} — neutral`;}else if(rsi>=30){st=-0.4;dt=`RSI ${rsi.toFixed(0)} — weak`;}else{st=-0.4;dt=`RSI ${rsi.toFixed(0)} — oversold`;} F.push({label:'RSI (14)',state:st,detail:dt,w:1.2});}
  if(mh!=null)F.push({label:'MACD histogram',state:mh>=0?0.7:-0.7,detail:mh>=0?'bullish':'bearish',w:1});
  let ws=0,w=0; F.forEach(f=>{ws+=f.state*f.w;w+=Math.abs(f.w);}); const raw=w?ws/w:0; const conv=Math.round((raw+1)/2*100);
  let rec; if(conv>=72)rec={label:'STRONG BUY',cls:'sig-strong-buy'};else if(conv>=60)rec={label:'BUY',cls:'sig-buy'};else if(conv>=45)rec={label:'HOLD',cls:'sig-hold'};else if(conv>=33)rec={label:'REDUCE',cls:'sig-reduce'};else rec={label:'SELL / AVOID',cls:'sig-sell'};
  let risk; if(vol==null)risk={label:'N/A'};else if(vol<22)risk={label:'LOW'};else if(vol<40)risk={label:'MODERATE'};else if(vol<60)risk={label:'HIGH'};else risk={label:'VERY HIGH'};
  const a200=s200!=null&&price>=s200, c50200=s50!=null&&s200!=null&&s50>=s200;
  return { symbol, name:(q&&q.name)||symbol, exchange:(q&&q.exchange)||(ts.meta&&ts.meta.exchange)||'', type:type||'Equity', asOf:(q&&q.datetime)||(rows.length?rows[rows.length-1].datetime:''), marketOpen:q?q.is_market_open:null, price, dayChgPct:day, metrics:{sma20:s20,sma50:s50,sma200:s200,ret1m:r1,ret3m:r3,ret6m:r6,rsi,vol,pos52}, factors:F.map(f=>({label:f.label,state:f.state,detail:f.detail})), conviction:conv, rec, risk, style:styleOf(conv,vol==null?30:vol,rsi==null?50:rsi,a200,c50200) };
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
    list.querySelectorAll('.arow').forEach(r=>r.addEventListener('click',()=>{ list.querySelectorAll('.arow').forEach(x=>x.classList.remove('on')); r.classList.add('on'); archiveSel=r.dataset.date; setStatusBar('archive'); loadArchiveReport(r.dataset.date); }));
    if(document.body.dataset.tab==='archive') setStatusBar('archive');
  }catch{ const list=document.getElementById('arch-list'); if(list) list.innerHTML='<div class="empty-sub" style="padding:16px;color:#ff5a4a">Failed to load archive.</div>'; }
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

/* UTILS */
function fmtDollar(n){ if(n===null||n===undefined)return '—'; return '$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function formatDate(s){ const [y,m,d]=s.split('-'); return `${m}/${d}/${y}`; }
function formatDateLong(s){ const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const [y,m,d]=s.split('-'); return `${M[+m-1]} ${+d}, ${y}`; }
function formatTimeShort(iso){ try{ return new Date(iso).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}); }catch{ return iso; } }
function fmtMonthsLabel(m){ if(m<12)return m+' mo'; const y=Math.floor(m/12),r=m%12; return r===0?y+' yr':y+' yr '+r+' mo'; }
function escHtml(s){ if(s===0)return '0'; if(!s)return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
