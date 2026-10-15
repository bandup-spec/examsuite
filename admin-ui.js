/* Glue for admin.css markup: delegated handlers (no inline onclick), sidebar drawer, CSSOM-applied widths/colours. */
(function () {
  'use strict';
  function parseArg(a, el) {
    a = a.trim();
    if (a === '') return undefined;
    if (/^'.*'$|^".*"$/.test(a)) return a.slice(1, -1);
    if (a === 'this.value') return el.value;
    if (a === 'this.checked') return el.checked;
    var m = a.match(/^this\.dataset\.(\w+)$/);
    if (m) { var v = el.dataset[m[1]]; return /^[\[{]/.test(v) ? JSON.parse(v) : v; }
    if (a === 'true') return true; if (a === 'false') return false;
    return isNaN(a) ? a : Number(a);
  }
  function run(el, attr) {
    var src = el.getAttribute(attr), m = src && src.match(/^\s*(\w+)\((.*)\)\s*;?\s*$/s);
    if (!m || typeof window[m[1]] !== 'function') return;
    var args = m[2].split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map(function (x) { return parseArg(x, el); });
    window[m[1]].apply(el, args);
  }
  ['click', 'input', 'change'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var el = e.target.closest('[data-' + ev + ']');
      if (el) run(el, 'data-' + ev);
    });
  });

  window.goto = function (u) { window.location.href = u; };
  window.logout = function () { if (confirm('Logout?')) { sessionStorage.clear(); window.location.href = 'index.html'; } };
  window.hide = function (id) { document.getElementById(id).style.display = 'none'; };
  window.trfAttemptChange = function (v) { renderAdminTRF(); if (v !== '') openTRFPopup(); };

  /* in-page printing (no popups; matches the #print-root / body.printing rules in admin.css) */
  window.printInPage = function (html) {
    var r = document.getElementById('print-root');
    r.innerHTML = html; document.body.classList.add('printing'); window.print();
  };
  window.addEventListener('afterprint', function () { document.body.classList.remove('printing'); document.getElementById('print-root').innerHTML = ''; });

  /* sidebar drawer */
  var sb = document.getElementById('sidebar'), sc = document.getElementById('scrim');
  window.closeSidebar = function () { sb.classList.remove('open'); sc.classList.remove('open'); };
  document.getElementById('menu-btn').addEventListener('click', function () { sb.classList.add('open'); sc.classList.add('open'); });
  sc.addEventListener('click', window.closeSidebar);

  /* progress bars etc.: values arrive as data-w / data-bg and are applied through the CSSOM (CSP-safe) */
  function paint(root) {
    root.querySelectorAll('[data-w]').forEach(function (n) { n.style.width = n.dataset.w + '%'; });
    root.querySelectorAll('[data-bg]').forEach(function (n) { n.style.background = n.dataset.bg; });
  }
  new MutationObserver(function () { paint(document); }).observe(document.getElementById('page'), { childList: true, subtree: true });
  paint(document);
})();
