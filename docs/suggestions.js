/* CLU v2.0 — passive add-on.
 * Renders the daily "Watchlist Suggestions" + "Watchlists" cards into the Live
 * Report from latest.json. Kept as a separate, self-contained file so the main
 * renderer (app.js) stays untouched; it re-injects after every report render.
 * Reads: latest.json `suggestions[]` and `watchlists[]` (CLU.md §7). */
(function () {
  'use strict';

  function esc(s) {
    if (s === 0) return '0';
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Mirror app.js sec()/card() so the add-on matches the site's look.
  function sec(id, title, meta) {
    return '<div class="sec"><span class="id">' + id + '</span><h3>' + title +
      '</h3><span class="rule"></span><span class="meta">' + (meta || '') + '</span></div>';
  }
  function card(inner) {
    return '<div class="card"><span class="bk tl"></span><span class="bk br"></span>' + inner + '</div>';
  }
  function bdgClass(sig) {
    return /bull/i.test(sig) ? 'g' : /bear/i.test(sig) ? 'r' : '';
  }

  function build(d) {
    if (!d) return '';
    var html = '';

    // --- Watchlist Suggestions ---
    var sug = d.suggestions;
    if (Array.isArray(sug) && sug.length) {
      var rows = sug.map(function (s) {
        var sig = s.signal
          ? ' <span class="bdg ' + bdgClass(s.signal) + '">' + esc(String(s.signal).replace(/-/g, ' ')) + '</span>'
          : '';
        return '<tr><td><span class="bdg">' + esc((s.type || 'note').replace(/_/g, ' ')) +
          '</span></td><td class="dsym">' + esc(s.symbol || '—') + '</td><td>' + esc(s.list || '') +
          '</td><td class="note">' + esc(s.rationale || '') + sig + '</td></tr>';
      }).join('');
      html += sec('S1', 'Watchlist Suggestions', sug.length + ' today') +
        card('<div class="dwrap"><table class="dtable"><thead><tr><th>Type</th><th>Ticker</th>' +
          '<th>List</th><th>Rationale</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
    } else if (sug) {
      html += sec('S1', 'Watchlist Suggestions', 'none today') +
        card('<div class="cb"><div class="empty-sub" style="text-align:left">No suggestions today — a quiet watchlist is a healthy one.</div></div>');
    }

    // --- Watchlists ---
    var wls = d.watchlists;
    if (Array.isArray(wls) && wls.length) {
      var blocks = wls.map(function (w) {
        var syms = (w.symbols || []).map(esc).join(' &middot; ') || '—';
        var note = w.note ? ' <span class="bdg" style="margin-left:6px">' + esc(w.note) + '</span>' : '';
        return '<div class="intel"><span class="tag">' + esc(w.list || '') + '</span><p>' + syms + note + '</p></div>';
      }).join('');
      html += sec('S2', 'Watchlists', 'CORE &middot; DRIP &middot; LAB') + blocks;
    }

    if (!html) return '';
    return '<div id="clu-suggestions">' + html + '</div>';
  }

  var data = null;

  function inject() {
    var main = document.querySelector('#report-root .main');
    if (!main || document.getElementById('clu-suggestions')) return;
    var html = build(data);
    if (!html) return;
    // Place suggestions right after any alert banners, before the Account block.
    var anchor = main.querySelector('.sec');
    var frag = document.createElement('div');
    frag.innerHTML = html;
    var node = frag.firstChild;
    if (anchor) main.insertBefore(node, anchor);
    else main.insertBefore(node, main.firstChild);
  }

  function watch() {
    var root = document.getElementById('report-root');
    if (!root) return;
    inject();
    // app.js rebuilds #report-root on load / refresh / tab return — re-inject then.
    new MutationObserver(function () { inject(); }).observe(root, { childList: true, subtree: true });
  }

  function start() {
    fetch('data/latest.json?cb=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { data = j; watch(); })
      .catch(function () { /* silent — add-on is non-critical */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
