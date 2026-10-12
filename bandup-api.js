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
  const ENDPOINT = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/api';

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
})();
