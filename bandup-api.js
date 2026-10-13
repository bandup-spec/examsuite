/* ============================================================================
   BandUp — backend connector (Supabase).  Replaces the old Apps Script code
   that used to be pasted into every page.

   1. Fill in the two values below (Supabase → Project Settings → API).
        • Project URL
        • the "anon" / "publishable" key  — it is SAFE to be public.
          NEVER put the "service_role" / "secret" key here.
   2. Put this file next to index.html, and load it BEFORE the page's own script:
        <script src="bandup-api.js"></script>

   It defines the same  callSheets(payload)  function every page already uses, so
   the rest of each page keeps working unchanged.
   ============================================================================ */
const SUPABASE_URL      = 'https://wvqaznclijycptpuxjni.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZVEYRaWmtQKFTiBQJhbpig_LUCt6vNH';

(function () {
  // Only the host matters: if the pasted URL has extra path text (e.g. ".../rest/v1/"), drop it.
  let BASE = String(SUPABASE_URL).trim();
  try { BASE = new URL(BASE).origin; } catch (e) { BASE = BASE.replace(/\/+$/, ''); }
  const ENDPOINT = BASE + '/rest/v1/rpc/api';

  function readJSON(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  // Adds the logged-in candidate's session token / the admin token automatically,
  // so no page has to remember to send them.
  function withAuth(payload) {
    const p = Object.assign({}, payload);
    if (p.sessionToken === undefined) {
      const cd = readJSON('candidateData');
      if (cd && cd.sessionToken) p.sessionToken = cd.sessionToken;
    }
    if (p.adminToken === undefined) {
      const t = sessionStorage.getItem('adminToken');
      if (t) p.adminToken = t;
    }
    return p;
  }


  // ══════════════════════════════════════════════════════════════════════════
  //  ADMIN PREVIEW MODE
  //  Lets a signed-in admin / sub-admin look at the candidate pages (tests, profile,
  //  simulations) without a candidate account. admin.html opens them in a NEW tab with
  //  "?preview=1". Every request the candidate pages make goes through callSheets(), so this
  //  is the one place where anything that would save or change data is blocked — real
  //  candidate data can never be touched from a preview.
  //  (The server never sees a preview candidate: it only receives the same read-only
  //  requests admin.html itself already makes.)
  // ══════════════════════════════════════════════════════════════════════════
  const PV_FLAG = 'bandupPreview';

  function pvOn() {
    try { return sessionStorage.getItem(PV_FLAG) === '1' && !!sessionStorage.getItem('adminToken'); }
    catch (e) { return false; }
  }

  // The candidate pages refuse to open without candidate data, so a preview gets a made-up one.
  function pvEnsureStub() {
    try {
      if (sessionStorage.getItem('candidateData')) return;
      const who = sessionStorage.getItem('adminName');
      const name = 'Admin preview' + (who ? ' · ' + who : '');
      sessionStorage.setItem('candidateData', JSON.stringify({
        candidateID: 'PREVIEW', fullName: name, dob: '', gender: '', nationality: '', email: '',
        photoBase64: '', sessionToken: 'preview', course: 'ALL'
      }));
      sessionStorage.setItem('candidateName', name);
      sessionStorage.setItem('candidateID', 'PREVIEW');
    } catch (e) {}
  }

  function pvPurgeLocal() {          // timers / autosaves / photo cache of earlier previews
    try { Object.keys(localStorage).forEach(k => { if (k.indexOf('PREVIEW') !== -1) localStorage.removeItem(k); }); }
    catch (e) {}
  }

  (function pvInit() {
    try {
      if (new URLSearchParams(location.search).get('preview') === '1') {
        // admin.html leaves the admin session in localStorage for a few seconds (this tab has its own sessionStorage)
        let h = null;
        try { h = JSON.parse(localStorage.getItem('bandupPreviewHandoff') || 'null'); localStorage.removeItem('bandupPreviewHandoff'); } catch (e) {}
        if (h && h.s && h.s.adminToken && Date.now() - (h.t || 0) < 60000) {
          Object.keys(h.s).forEach(k => sessionStorage.setItem(k, String(h.s[k])));
        }
        if (sessionStorage.getItem('adminToken')) {     // not an admin → nothing happens, the page sends you to sign in
          pvPurgeLocal();                               // each "Preview" click starts from a clean slate
          sessionStorage.setItem(PV_FLAG, '1');
          history.replaceState(null, '', location.pathname + location.hash);
        }
      }
      if (pvOn()) pvEnsureStub();
    } catch (e) {}
  })();

  // The IELTS simulation caches the test it loads under the same localStorage keys the Question Maker uses
  // for an admin's unsaved work. In a preview those two keys must never be written, or previewing a test
  // would wipe out questions someone is still editing in another tab.
  if (pvOn()) {
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (this === window.localStorage && (k === 'ielts_admin_config' || k === 'ielts_drive_url')) return;
      return nativeSet.apply(this, arguments);
    };
  }

  function pvExit() {
    try {
      ['candidateData', 'candidateID', 'candidateName', 'selectedTestSet', PV_FLAG].forEach(k => sessionStorage.removeItem(k));
      sessionStorage.setItem('userRole', 'Admin');
      pvPurgeLocal();
    } catch (e) {}
    window.close();                                               // works for the tab admin.html opened
    setTimeout(() => { location.href = 'admin.html'; }, 300);     // …otherwise this tab simply becomes the admin panel again
  }

  // Shown instead of submitting a test.
  function pvFinish() {
    if (document.getElementById('pv-finish')) return;
    const el = document.createElement('div');
    el.id = 'pv-finish';
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,47,95,0.93);display:flex;align-items:center;justify-content:center;padding:20px;font-family:"DM Sans",sans-serif';
    el.innerHTML = '<div style="background:#fff;color:#1a1a2e;border-radius:14px;padding:30px 34px;max-width:420px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,0.35)">' +
      '<div style="font-size:2rem;margin-bottom:6px">👁</div>' +
      '<h2 style="font-family:\'Source Serif 4\',serif;color:#002f5f;margin-bottom:8px">Preview finished</h2>' +
      '<p style="font-size:0.9rem;line-height:1.6;color:#4a4a6a;margin-bottom:18px">Nothing was submitted, saved or graded.</p>' +
      '<button id="pv-finish-btn" style="padding:10px 22px;border:none;border-radius:8px;background:#002f5f;color:#fff;font:600 0.9rem \'DM Sans\',sans-serif;cursor:pointer">Back to the admin panel</button></div>';
    document.body.appendChild(el);
    document.getElementById('pv-finish-btn').onclick = pvExit;
  }

  function pvBanner() {
    if (!pvOn() || document.getElementById('pv-banner')) return;
    const b = document.createElement('div');
    b.id = 'pv-banner';
    b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147482000;display:flex;align-items:center;gap:10px;background:#002f5f;color:#fff;border:1px solid #c8a84b;border-radius:999px;padding:6px 6px 6px 14px;font:600 12px "DM Sans",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,0.3)';
    b.innerHTML = '<span>👁 Admin preview — nothing is saved</span>' +
      '<button id="pv-exit" style="border:none;border-radius:999px;background:#c8a84b;color:#002f5f;font:700 12px \'DM Sans\',sans-serif;padding:5px 12px;cursor:pointer">Exit</button>';
    document.body.appendChild(b);
    document.getElementById('pv-exit').onclick = pvExit;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pvBanner); else pvBanner();

  // What a preview is allowed to do. Reads are answered with "nothing here yet" (an admin has no
  // scores or drafts); everything else is refused.
  async function pvHandle(payload) {
    const a = payload.action;
    if (a === 'getTestSets') {                       // exactly the request admin.html makes: the full list
      const p = Object.assign({}, payload, { sessionToken: '' }); delete p.candidateID;   // '' stops withAuth adding the placeholder token
      return realCall(p);
    }
    if (a === 'getSettings' || a === 'getAnnouncements') {     // the public view
      return realCall(Object.assign({}, payload, { adminToken: '' }));
    }
    if (a === 'ping') return realCall(payload);
    if (a === 'getDraft')          return { success: true, found: false };
    if (a === 'getCandidateScores') return { success: true, rows: [] };
    if (a === 'checkSession')      return { success: true, valid: true };
    if (a === 'saveDraft')         return { success: true, savedAt: new Date().toISOString() };    // background autosave: pretend
    return { success: false, preview: true, message: 'This is an admin preview — nothing is saved or changed.' };
  }

  async function once(payload, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY };
    if (/^eyJ/.test(SUPABASE_ANON_KEY)) headers['Authorization'] = 'Bearer ' + SUPABASE_ANON_KEY;   // legacy JWT-style anon key
    let res;
    try {
      res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ p: payload }), signal: ctrl.signal });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON body */ }
    if (!res.ok) {
      if (res.status >= 500) throw new Error('NETWORK_ERROR');                       // transient — worth one retry
      const msg = (data && (data.message || data.hint)) || ('Server error (HTTP ' + res.status + ')');
      return { success: false, message: /api key|apikey|JWT/i.test(msg) ? 'Server rejected the request — check SUPABASE_ANON_KEY in bandup-api.js.' : msg };
    }
    return data;
  }

  // Same behaviour as the old callSheets: 25 s timeout, one automatic retry on network trouble.
  async function callSheets(payload) {
    if (pvOn()) return pvHandle(payload || {});
    return realCall(payload);
  }

  async function realCall(payload) {
    const p = withAuth(payload || {});
    let result;
    try {
      result = await once(p, 25000);
    } catch (e) {
      if (e.message === 'TIMEOUT' || e.message === 'NETWORK_ERROR') {
        try { result = await once(p, 25000); }
        catch (e2) { throw new Error('Could not reach the server after 2 attempts. Please check your internet connection and try again.'); }
      } else { throw e; }
    }
    // The admin session expired (tokens last 12 hours) → back to the login page.
    if (result && result.adminRequired) {
      sessionStorage.removeItem('adminToken');
      if (/admin/i.test(location.pathname) || sessionStorage.getItem('userRole') === 'Admin') {
        sessionStorage.removeItem('userRole');
        alert('Your admin session has expired. Please sign in again.');
        location.href = 'index.html';
      }
    }
    // Candidate pages: the account was logged in somewhere else (or the session ended) → back to sign-in.
    // (simulation.html has its own handler so it can stop the clock and keep the local backup first.)
    if (result && result.sessionInvalid && !/simulation/i.test(location.pathname)) {
      sessionStorage.clear();
      alert(result.message || 'Your session has ended. Please sign in again.');
      location.href = 'index.html';
    }
    return result;
  }

  window.callSheets     = callSheets;
  window.callSheetsPost = callSheets;      // profile.html used a separate POST helper for photos — same thing now
  window.BANDUP_API     = { url: ENDPOINT };
  window.BANDUP_PREVIEW = { on: pvOn, finish: pvFinish, exit: pvExit };   // used by the simulation pages
})();
