// CANDIDATES — load from Sheets
// ═══════════════════════════════════════
let _candidateRows = [];
let _scoreRows = [];
let _setPolicies = {};   // setID -> maxAttempts (0 = unlimited)

async function loadCandidates() {
  const wrap = document.getElementById('cand-table-wrap');
  const status = document.getElementById('cand-status');
  wrap.innerHTML = '<div class="tbl-empty">⏳ Loading...</div>';
  status.className = 'sheets-status';
  status.textContent = 'Fetching...';
  try {
    const data = await callSheets({ action: 'getCandidates' });
    if (!data.success) throw new Error(data.message || 'Failed');
    _candidateRows = data.rows || [];
    status.className = 'sheets-status ok';
    status.textContent = `✅ ${_candidateRows.length} candidates`;
    document.getElementById('cand-search').value = '';
    renderCandidateTable(_candidateRows);
    updatePendingBadge();
  } catch(e) {
    status.className = 'sheets-status err';
    status.textContent = '❌ Error';
    wrap.innerHTML = `<div class="tbl-empty">❌ ${e.message}<br><br>Check your internet connection and the Supabase setup.</div>`;
  }
}

function updatePendingBadge() {
  const pendingCount = _candidateRows.filter(r => (r[8]||'Approved') === 'Pending').length;
  const badge = document.getElementById('pending-badge');
  if (pendingCount > 0) { badge.style.display = 'inline-block'; badge.textContent = pendingCount; }
  else badge.style.display = 'none';
}

function filterCandidates() {
  const q = document.getElementById('cand-search').value.trim().toLowerCase();
  const filtered = q
    ? _candidateRows.filter(r => String(r[0]||'').toLowerCase().includes(q) || String(r[1]||'').toLowerCase().includes(q))
    : _candidateRows;
  renderCandidateTable(filtered, q);
}

function renderCandidateTable(rows, highlight) {
  const wrap = document.getElementById('cand-table-wrap');
  const label = document.getElementById('cand-count-label');
  label.textContent = _candidateRows.length ? `${rows.length} of ${_candidateRows.length} shown` : '';

  if (!rows.length) {
    wrap.innerHTML = `<div class="tbl-empty">${_candidateRows.length ? '🔍 No candidates match your search.' : 'No candidates registered yet.'}</div>`;
    return;
  }

  const hl = v => {
    if (!highlight) return escH(v);
    const s = String(v||'');
    const idx = s.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx < 0) return escH(s);
    return escH(s.slice(0,idx)) + `<mark>${escH(s.slice(idx,idx+highlight.length))}</mark>` + escH(s.slice(idx+highlight.length));
  };

  let html = `<div><table class="sheets-table">
    <thead><tr>
      <th>Candidate ID</th><th>Full Name</th><th>Date of Birth</th>
      <th>Gender</th><th>Nationality</th><th>Course</th><th>Status</th><th>Registered</th><th>Last Login</th><th>Actions</th>
    </tr></thead><tbody>`;
  rows.forEach(r => {
    const status = r[8] || 'Approved';
    const statusBadge = status === 'Pending'
      ? '<span class="band-badge">⏳ Pending</span>'
      : status === 'Rejected'
      ? '<span class="band-badge">✕ Rejected</span>'
      : '<span class="band-badge band-high">✓ Approved</span>';
    const actions = status === 'Pending'
      ? `<button class="btn btn-green" data-id="${escH(r[0])}" data-click="approveCand(this.dataset.id)">✓ Approve</button>
         <button class="btn btn-red" data-id="${escH(r[0])}" data-click="rejectCand(this.dataset.id)">✕ Reject</button>`
      : status === 'Rejected'
      ? `<button class="btn btn-green" data-id="${escH(r[0])}" data-click="approveCand(this.dataset.id)">✓ Approve</button>`
      : `<button class="btn btn-ghost" data-id="${escH(r[0])}" data-click="rejectCand(this.dataset.id)">✕ Revoke</button>`;
    const actionsAll = actions + ` <button class="btn btn-red" data-id="${escH(r[0])}" data-name="${escH(r[1])}" data-click="deleteCand(this.dataset.id,this.dataset.name)">🗑️ Delete</button>`
      + (isOwner() ? ` <button class="btn btn-ghost" title="Delete this candidate's test score history" data-id="${escH(r[0])}" data-click="openClearHistory(this.dataset.id)">🧹 Scores</button>` : '');
    html += `<tr>
      <td><b>${hl(r[0])}</b></td>
      <td>${hl(r[1])}</td>
      <td>${escH(r[2])}</td>
      <td>${escH(r[3])}</td>
      <td>${escH(r[4])}</td>
      <td>
        <select data-id="${escH(r[0])}" data-change="setCandCourse(this.dataset.id,this.value)">
          ${['IELTS','TOEIC','TOEFL','ESL','ALL'].map(c => `<option value="${c}" ${((r[9]||'IELTS')===c)?'selected':''}>${c==='ALL'?'⭐ ALL (special)':c}</option>`).join('')}
        </select>
      </td>
      <td>${statusBadge}</td>
      <td>${formatDate(r[6])}</td>
      <td>${formatDate(r[7])}</td>
      <td>${actionsAll}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

async function approveCand(candidateID) {
  if (!confirm(`Approve ${candidateID}? They will be able to log in immediately.`)) return;
  try {
    const data = await callSheets({ action:'approveCandidate', candidateID });
    if (data.success) { toast('✅ Approved.'); loadCandidates(); }
    else alert(data.message || 'Failed to approve.');
  } catch(e) { alert('Error: ' + e.message); }
}

async function setCandCourse(candidateID, course) {
  try {
    const data = await callSheets({ action:'setCandidateCourse', candidateID, course });
    if (data.success) toast(`✅ ${candidateID} set to ${course}.`);
    else { alert(data.message || 'Failed to update course.'); loadCandidates(); }
  } catch(e) { alert('Error: ' + e.message); loadCandidates(); }
}

async function deleteCand(candidateID, name) {
  if (!confirm(`DELETE ${candidateID} (${name})?\n\nThis removes their account entirely so they can register again with the same ID. Their past scores are NOT deleted. This cannot be undone.`)) return;
  try {
    const data = await callSheets({ action:'deleteCandidate', candidateID });
    if (data.success) { toast('🗑️ Deleted — they can register again.'); loadCandidates(); }
    else alert(data.message || 'Failed to delete.');
  } catch(e) { alert('Error: ' + e.message); }
}

async function rejectCand(candidateID) {
  if (!confirm(`Reject ${candidateID}? They will not be able to log in until re-approved.`)) return;
  try {
    const data = await callSheets({ action:'rejectCandidate', candidateID });
    if (data.success) { toast('Rejected.'); loadCandidates(); }
    else alert(data.message || 'Failed to reject.');
  } catch(e) { alert('Error: ' + e.message); }
}


// SCORES — load from Sheets
// ═══════════════════════════════════════
async function loadScores() {
  const wrap = document.getElementById('scores-table-wrap');
  const status = document.getElementById('scores-status');
  wrap.innerHTML = '<div class="tbl-empty">⏳ Loading...</div>';
  status.className = 'sheets-status';
  status.textContent = 'Fetching...';
  try {
    const data = await callSheets({ action: 'getScores' });
    if (!data.success) throw new Error(data.message || 'Failed');
    _scoreRows = data.rows || [];
    try {
      const ts = await callSheets({ action:'getTestSets' });
      _setPolicies = {};
      (ts.sets || []).forEach(x => { _setPolicies[x.setID] = +x.maxAttempts || 0; });
    } catch(e) { _setPolicies = {}; }
    status.className = 'sheets-status ok';
    status.textContent = `✅ ${_scoreRows.length} submissions`;
    document.getElementById('scores-search').value = '';
    renderScoresTable(_scoreRows);
  } catch(e) {
    status.className = 'sheets-status err';
    status.textContent = '❌ Error';
    wrap.innerHTML = `<div class="tbl-empty">❌ ${e.message}<br><br>Check your internet connection and the Supabase setup.</div>`;
  }
}

function filterScores() {
  const q = document.getElementById('scores-search').value.trim().toLowerCase();
  const filtered = q
    ? _scoreRows.filter(r => String(r[2]||'').toLowerCase().includes(q) || String(r[3]||'').toLowerCase().includes(q))
    : _scoreRows;
  renderScoresTable(filtered, q);
}

function allowBtn(r) {
  if (!(_setPolicies[r[4]] > 0)) return '';   // only tests with an attempt limit need this
  return ` <button class="btn btn-ghost" title="Let this candidate take this test one more time" data-cid="${escH(r[2])}" data-set="${escH(r[4])}" data-name="${escH(r[3])}" data-click="allowAnotherAttempt()">➕ Attempt</button>`;
}

async function allowAnotherAttempt() {
  const btn = this, cid = btn.dataset.cid, setID = btn.dataset.set, nm = btn.dataset.name || cid;
  if (!confirm('Allow ' + nm + ' (' + cid + ') one more attempt at this test?')) return;
  btn.disabled = true;
  try {
    const res = await callSheets({ action:'grantAttempt', candidateID: cid, setID, delta: 1 });
    toast(res && res.success ? '✅ ' + nm + ': ' + res.message : '⚠️ ' + ((res && res.message) || 'Could not allow another attempt'));
  } catch(e) { toast('⚠️ ' + (e.message || 'Could not allow another attempt')); }
  btn.disabled = false;
}

function renderScoresTable(rows, highlight) {
  const wrap = document.getElementById('scores-table-wrap');
  const label = document.getElementById('scores-count-label');
  label.textContent = _scoreRows.length ? `${rows.length} of ${_scoreRows.length} shown` : '';

  if (!rows.length) {
    wrap.innerHTML = `<div class="tbl-empty">${_scoreRows.length ? '🔍 No scores match your search.' : 'No scores submitted yet.'}</div>`;
    return;
  }

  const hl = v => {
    if (!highlight) return escH(v);
    const s = String(v||'');
    const idx = s.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx < 0) return escH(s);
    return escH(s.slice(0,idx)) + `<mark>${escH(s.slice(idx,idx+highlight.length))}</mark>` + escH(s.slice(idx+highlight.length));
  };

  const bandClass = b => b>=7?'band-high':b>=5.5?'band-mid':'band-low';

  let html = `<div><table class="sheets-table" id="scores-tbl">
    <thead><tr>
      <th>Date</th><th>Candidate ID</th><th>Full Name</th>
      <th>L Score</th><th>L Band</th>
      <th>R Score</th><th>R Band</th>
      <th>Writing</th><th>Speaking</th><th>Overall</th><th>Answers</th>${isOwner() ? '<th>Delete</th>' : ''}
    </tr></thead><tbody>`;
  const delCell = r => isOwner()
    ? `<td><button class="btn btn-red" title="Delete this attempt permanently" data-id="${escH(r[0])}" data-click="deleteScoreRow(this.dataset.id)">🗑️</button></td>` : '';
  rows.forEach(r => {
    // [1]=Timestamp [2]=CandidateID [3]=FullName
    // [6]=LScore [7]=LBand [8]=RScore [9]=RBand
    // [12]=WritingBand [13]=SpeakingBand [14]=OverallBand
    // [24]=ExamType [25]=ListeningScaled [26]=ReadingScaled [27]=TOEICTotal
    const examType = String(r[24]||'IELTS').toUpperCase() === 'TOEIC' ? 'TOEIC' : 'IELTS';

    if (examType === 'TOEIC') {
      html += `<tr>
        <td>${formatDate(r[1])}</td>
        <td><b>${hl(r[2])}</b></td>
        <td>${hl(r[3])}</td>
        <td><b>${escH(String(r[6]||'—'))}</b>/100</td>
        <td><span class="band-badge">${escH(String(r[25]||'—'))}</span></td>
        <td><b>${escH(String(r[8]||'—'))}</b>/100</td>
        <td><span class="band-badge">${escH(String(r[26]||'—'))}</span></td>
        <td colspan="2">— (TOEIC has no Writing/Speaking) —</td>
        <td><span class="band-badge band-high">${escH(String(r[27]||'—'))} / 990</span></td>
        <td><button class="btn btn-ghost" data-id="${escH(r[0])}" data-click="viewCandidateAnswers(this.dataset.id)">👁 Answers</button>${allowBtn(r)}</td>${delCell(r)}
      </tr>`;
      return;
    }

    const lBand   = parseFloat(r[7])||0;
    const rBand   = parseFloat(r[9])||0;
    const overall = parseFloat(r[14])||0;
    html += `<tr>
      <td>${formatDate(r[1])}</td>
      <td><b>${hl(r[2])}</b></td>
      <td>${hl(r[3])}</td>
      <td><b>${escH(String(r[6]||'—'))}</b></td>
      <td><span class="band-badge ${bandClass(lBand)}">${lBand||'—'}</span></td>
      <td><b>${escH(String(r[8]||'—'))}</b></td>
      <td><span class="band-badge ${bandClass(rBand)}">${rBand||'—'}</span></td>
      <td><span class="band-badge">${escH(String(r[12]||'—'))}</span></td>
      <td><span class="band-badge">${escH(String(r[13]||'—'))}</span></td>
      <td><span class="band-badge ${bandClass(overall)}">${overall||'—'}</span></td>
      <td><button class="btn btn-ghost" data-id="${escH(r[0])}" data-click="viewCandidateAnswers(this.dataset.id)">👁 Answers</button>${allowBtn(r)}</td>${delCell(r)}
    </tr>`;
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

function formatDate(val) {
  if (!val) return '—';
  try { return new Date(val).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}); }
  catch(e){ return String(val); }
}

function exportScoresPDF() {
  const tbl = document.getElementById('scores-tbl');
  if (!tbl) { alert('Load scores first.'); return; }
  const title = 'BandUp Scores';
  printInPage(`<h2>${escH(title)} — Scores</h2>${tbl.outerHTML}`);
}


// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
window.onload = async () => {
  if (sessionStorage.getItem('userRole') !== 'Admin' || !sessionStorage.getItem('adminToken')) {
    window.location.href = 'index.html'; return;
  }
  loadMe();
  applyRoleUI();                 // first paint from the login session
  await refreshMeFromServer();   // then trust the server's answer
  applyRoleUI();
  renderPermGrid('new-sub-perms', DEFAULT_SUB_PERMS);
  if (isOwner()) { initOwnerData(); loadAdmins(true); }
  if (can('candidates')) loadCandidates(); // silent — populates the pending-approval badge on load
  if (!canOpenPanel('p-monitor')) {
    const first = firstAllowedPanel();
    if (first) showPanel(first);
    else document.querySelector('#page').innerHTML = '<div class="card"><div class="tbl-empty">🔒 No sections have been assigned to your account yet.<br>Ask the Owner to grant you access.</div></div>';
  }
};

// ═══════════════════════════════════════
// ROLES & PERMISSIONS
// Owner = full access + manages admins. SubAdmin = only the sections the Owner ticked.
// NOTE: this only controls what the page SHOWS. The server must enforce the same rules.
// ═══════════════════════════════════════
const PERM_DEFS = [
  ['monitor','🟢 Live Monitor'], ['candidates','👥 Candidates'], ['scores','📊 Scores'],
  ['trf','📄 TRF Viewer'], ['grading','✏️ Grade Writing'], ['testsets','📚 Test Sets'],
  ['answerkey','🔑 Answer Keys'], ['questionmaker','🧠 Question Makers']
];
const DEFAULT_SUB_PERMS = ['monitor','candidates','scores','trf','grading'];
const PANEL_PERM = {
  'p-monitor':'monitor', 'p-candidates':'candidates', 'p-scores':'scores', 'p-trf':'trf',
  'p-grading':'grading', 'p-testsets':'testsets', 'p-answerkey':'answerkey'
};
const OWNER_ONLY_PANELS = ['p-settings','p-admins'];
const SUB_ONLY_PANELS = ['p-account'];
const PANEL_ORDER = ['p-monitor','p-candidates','p-scores','p-trf','p-grading','p-testsets','p-answerkey','p-settings','p-admins','p-account'];

let ME = { role:'Owner', name:'', perms:[] };

function isOwner() { return ME.role === 'Owner'; }
function can(perm) { return isOwner() || (ME.perms || []).includes(perm); }
function canOpenPanel(id) {
  if (OWNER_ONLY_PANELS.includes(id)) return isOwner();
  if (SUB_ONLY_PANELS.includes(id)) return !isOwner();
  const p = PANEL_PERM[id];
  return !p || can(p);
}
function firstAllowedPanel() { return PANEL_ORDER.find(canOpenPanel) || null; }

function loadMe() {
  // Sessions created before sub-admins existed have no adminRole — that was the single Owner account.
  const role = sessionStorage.getItem('adminRole') === 'SubAdmin' ? 'SubAdmin' : 'Owner';
  let perms = [];
  try { perms = JSON.parse(sessionStorage.getItem('adminPerms') || '[]') || []; } catch(e) {}
  ME = { role, name: sessionStorage.getItem('adminName') || '', perms };
}

async function refreshMeFromServer() {
  try {
    const d = await callSheets({ action:'getMyAdminProfile' });
    if (d && d.code === 'REVOKED') {
      sessionStorage.clear();
      alert('Your admin access has been removed or is no longer approved.');
      window.location.href = 'index.html';
      return;
    }
    if (d && d.success && d.admin) {
      sessionStorage.setItem('adminRole', d.admin.role === 'Owner' ? 'Owner' : 'SubAdmin');
      sessionStorage.setItem('adminName', d.admin.fullName || '');
      sessionStorage.setItem('adminPerms', JSON.stringify(d.admin.permissions || []));
      loadMe();
    }
  } catch(e) { /* server not updated yet — keep what the login session says */ }
}

function applyRoleUI() {
  document.querySelectorAll('[data-owner-only]').forEach(el => el.classList.toggle('hidden', !isOwner()));
  document.querySelectorAll('[data-sub-only]').forEach(el => el.classList.toggle('hidden', isOwner()));
  document.querySelectorAll('[data-perm]').forEach(el => el.classList.toggle('hidden', !can(el.dataset.perm)));
  // hide sidebar section titles that have nothing left under them
  document.querySelectorAll('.sidebar .nav-group').forEach(sec => {
    let n = sec.nextElementSibling, any = false;
    while (n && !n.classList.contains('nav-group')) {
      if (n.classList.contains('nav-item') && !n.classList.contains('hidden')) any = true;
      n = n.nextElementSibling;
    }
    sec.classList.toggle('hidden', !any);
  });
  const badge = document.getElementById('admin-badge');
  if (badge) badge.textContent = isOwner() ? 'Owner' : ('Sub-admin' + (ME.name ? ' · ' + ME.name : ''));
}


// ═══════════════════════════════════════
// ANSWER KEYS (stored privately in Supabase; graded server-side)
// ═══════════════════════════════════════
let _akPreselect = '';
function akOpen(setID) { _akPreselect = setID; showPanel('p-answerkey'); }

async function akLoadSets() {
  const sel = document.getElementById('ak-set');
  const keep = sel.value;
  let sets = [];
  try { const d = await callSheets({ action:'getTestSets' }); if (d.success) sets = d.sets || []; } catch(e) {}
  sel.innerHTML = '<option value="">— select a test set —</option>' +
    sets.map(x => `<option value="${escH(x.setID)}">${escH(x.setName || x.setID)} (${escH((x.examType||'IELTS').toUpperCase())})</option>`).join('');
  if (_akPreselect) { sel.value = _akPreselect; _akPreselect = ''; akLoad(); }
  else if (keep) sel.value = keep;
}

// "1: B" / "6: MOVIE | FILM" / bare lines (auto-numbered) → {"1":"B","6":["MOVIE","FILM"]}
function akParse(text) {
  const obj = {}; let next = 1;
  String(text || '').split(/\r?\n/).forEach(line => {
    line = line.trim(); if (!line) return;
    let num, ans;
    const m = line.match(/^(\d+)\s*(?:[:)=\t]|\.\s|-\s)\s*(.*)$/);
    if (m) { num = parseInt(m[1], 10); ans = m[2]; } else { num = next; ans = line; }
    next = num + 1;
    const alts = ans.split('|').map(x => x.trim()).filter(Boolean);
    if (!alts.length) return;
    obj[String(num)] = alts.length > 1 ? alts : alts[0];
  });
  return obj;
}
function akFormat(key) {
  return Object.keys(key || {}).sort((a, b) => a - b)
    .map(n => n + ': ' + (Array.isArray(key[n]) ? key[n].join(' | ') : key[n])).join('\n');
}
function akCount() {
  document.getElementById('ak-lcount').textContent = '(' + Object.keys(akParse(document.getElementById('ak-l').value)).length + ' answers)';
  document.getElementById('ak-rcount').textContent = '(' + Object.keys(akParse(document.getElementById('ak-r').value)).length + ' answers)';
}
function akStatus(msg, color) { const el = document.getElementById('ak-status'); el.style.color = color || 'var(--ink3)'; el.textContent = msg; }

async function akLoad() {
  const setID = document.getElementById('ak-set').value;
  document.getElementById('ak-l').value = ''; document.getElementById('ak-r').value = '';
  akCount();
  if (!setID) { akStatus(''); return; }
  akStatus('⏳ Loading saved key…');
  try {
    const d = await callSheets({ action:'getAnswerKey', testSetID:setID });
    if (d.success) {
      document.getElementById('ak-l').value = akFormat(d.listeningKey);
      document.getElementById('ak-r').value = akFormat(d.readingKey);
      akCount();
      akStatus('✅ Saved key loaded — last updated ' + formatDate(d.updatedAt), 'var(--green)');
    } else akStatus('No answer key saved for this set yet — enter it below.', 'var(--ink3)');
  } catch(e) { akStatus('❌ ' + e.message, 'var(--red)'); }
}

async function akSave() {
  const setID = document.getElementById('ak-set').value;
  if (!setID) { alert('Please choose a test set first.'); return; }
  const lk = akParse(document.getElementById('ak-l').value);
  const rk = akParse(document.getElementById('ak-r').value);
  if (!Object.keys(lk).length && !Object.keys(rk).length) { alert('Enter at least one answer.'); return; }
  if (!confirm(`Save answer key?\n\nListening: ${Object.keys(lk).length} answers\nReading: ${Object.keys(rk).length} answers\n\nThis replaces any key already saved for this test set.`)) return;
  akStatus('⏳ Saving…');
  try {
    const d = await callSheets({ action:'saveAnswerKey', testSetID:setID, listeningKey:lk, readingKey:rk, updatedBy:'Admin' });
    if (d.success) { akStatus('✅ ' + d.message, 'var(--green)'); toast('✅ Answer key saved.'); }
    else akStatus('❌ ' + (d.message || 'Could not save.'), 'var(--red)');
  } catch(e) { akStatus('❌ ' + e.message, 'var(--red)'); }
}


// PANEL NAVIGATION
// ═══════════════════════════════════════
function showPanel(id) {
  if (!canOpenPanel(id)) { toast('🔒 You do not have access to that section.'); return; }
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b => b.removeAttribute('aria-current'));
  document.getElementById(id).classList.remove('hidden');
  {const sb=document.getElementById('sb-'+id); if(sb) sb.setAttribute('aria-current','page'); if(window.closeSidebar) closeSidebar(); const t=document.querySelector('#'+id+' .page-title'); if(t) document.getElementById('topbar-title').textContent=t.textContent;}
  if (id === 'p-answerkey') akLoadSets();
  if (id === 'p-admins') loadAdmins();
  // Auto-load monitor
  if (id === 'p-monitor' && !document.querySelector('#monitor-wrap table')) loadMonitor();
  // Auto-load candidates
  if (id === 'p-candidates' && !document.querySelector('#cand-table-wrap table')) loadCandidates();
  // Auto-load scores
  if (id === 'p-scores' && !document.querySelector('#scores-table-wrap table')) loadScores();
  // Auto-load TRF candidates
  if (id === 'p-trf' && document.getElementById('trf-cand-sel').options.length <= 1) loadTRFCandidates();
}

// GRADE WRITING
// ═══════════════════════════════════════
let currentGradeRow = null;

async function loadUngraded() {
  const wrap = document.getElementById('ungraded-wrap');
  wrap.innerHTML = '<div class="tbl-empty">⏳ Loading...</div>';
  try {
    const data = await callSheets({ action:'getScores' });
    if (!data.success) throw new Error(data.message);
    const rows = (data.rows||[]).filter(r => !r[14] || r[14]===''); // no overall band = ungraded
    if (!rows.length) { wrap.innerHTML='<div class="tbl-empty">✅ All submissions graded!</div>'; return; }
    let html = '<div><table class="sheets-table"><thead><tr><th>Date</th><th>Candidate</th><th>Test Set</th><th>L Band</th><th>R Band</th><th>W1 WC</th><th>W2 WC</th><th>Action</th></tr></thead><tbody>';
    rows.forEach((r,i) => {
      html += `<tr>
        <td>${formatDate(r[1])}</td>
        <td><b>${escH(r[3])}</b><br><span>${escH(r[2])}</span></td>
        <td>${escH(r[5]||'—')}</td>
        <td><span class="band-badge ${bandClass(r[7])}">${r[7]||'—'}</span></td>
        <td><span class="band-badge ${bandClass(r[9])}">${r[9]||'—'}</span></td>
        <td>${r[15]||0}</td>
        <td>${r[16]||0}</td>
        <td><button class="btn btn-blue" data-click="openGradeForm(this.dataset.row)" data-row="${escH(JSON.stringify(r))}">✏️ Grade</button></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  } catch(e) {
    wrap.innerHTML = `<div class="tbl-empty">❌ ${e.message}</div>`;
  }
}

function openGradeForm(row) {
  if (typeof row === 'string') row = JSON.parse(row);
  currentGradeRow = row;
  document.getElementById('grade-sub-id').value = row[0];
  document.getElementById('grade-form-card').style.display = 'block';
  document.getElementById('grade-candidate-info').innerHTML =
    `<b>${escH(row[3])}</b> &nbsp;|&nbsp; ID: ${escH(row[2])} &nbsp;|&nbsp; Test Set: ${escH(row[5]||'—')}<br>
     Submitted: ${formatDate(row[1])} &nbsp;|&nbsp; L: ${row[7]||'—'} &nbsp;|&nbsp; R: ${row[9]||'—'}`;
  // Show writing texts
  const w1 = row[17]||''; const w2 = row[18]||'';
  document.getElementById('writing-texts-wrap').innerHTML = `
    ${w1?`<div class="field"><label>Task 1 Response (${row[15]||0} words)</label><textarea readonly>${escH(w1)}</textarea></div>`:''}
    ${w2?`<div class="field"><label>Task 2 Response (${row[16]||0} words)</label><textarea readonly>${escH(w2)}</textarea></div>`:''}
  `;
  // Auto-preview overall
  updateGradePreview();
  document.getElementById('grade-form-card').scrollIntoView({behavior:'smooth'});
}

function updateGradePreview() {
  const w1 = parseFloat(document.getElementById('grade-w1').value)||0;
  const w2 = parseFloat(document.getElementById('grade-w2').value)||0;
  const s  = parseFloat(document.getElementById('grade-s').value)||0;
  if (!currentGradeRow||(!w1&&!w2)) { document.getElementById('grade-preview').style.display='none'; return; }
  const lBand = parseFloat(currentGradeRow[7])||0;
  const rBand = parseFloat(currentGradeRow[9])||0;
  const wBand = ((w1+w2)/2);
  const components = [lBand, rBand, wBand];
  if (s) components.push(s);
  const avg = components.reduce((a,b)=>a+b,0)/components.length;
  const overall = Math.round(avg*2)/2;
  document.getElementById('grade-overall').textContent = overall.toFixed(1);
  document.getElementById('grade-preview').style.display = 'block';
}

async function submitGrade() {
  const subID = document.getElementById('grade-sub-id').value;
  const w1    = document.getElementById('grade-w1').value;
  const w2    = document.getElementById('grade-w2').value;
  if (!w1||!w2) { alert('Please set both Writing Task 1 and Task 2 bands.'); return; }
  try {
    const data = await callSheets({
      action:'gradeWriting', submissionID:subID,
      writingTask1Band:w1, writingTask2Band:w2,
      speakingBand: document.getElementById('grade-s').value||'',
      gradedBy:     document.getElementById('grade-by').value||'Admin',
      examinerNotes:document.getElementById('grade-notes').value||''
    });
    if (data.success) {
      toast(`✅ Graded! Overall Band: ${data.overallBand}`);
      document.getElementById('grade-form-card').style.display='none';
      loadUngraded();
    } else { alert('Error: '+data.message); }
  } catch(e) { alert('Error: '+e.message); }
}

function bandClass(b) {
  const n=parseFloat(b)||0;
  return n>=7?'band-high':n>=5.5?'band-mid':'band-low';
}

// ═══════════════════════════════════════

// TEST SETS
// ═══════════════════════════════════════
let editingSetID = null;

async function loadTestSets() {
  const wrap = document.getElementById('testsets-wrap');
  wrap.innerHTML = '<div class="tbl-empty">⏳ Loading...</div>';

  // Get from localStorage first (always available)
  let sets = JSON.parse(localStorage.getItem('ielts_test_sets') || '[]');
  const activeSet = JSON.parse(localStorage.getItem('ielts_active_set') || 'null');
  const activeID  = activeSet ? activeSet.setID : '';

  // Try to merge with Sheets data (optional)
  try {
    const data = await Promise.race([
      callSheets({ action:'getTestSets' }),
      new Promise((_,rej) => setTimeout(()=>rej(new Error('timeout')), 5000))
    ]);
    if (data.success && data.sets && data.sets.length) {
      // Merge — Sheets is source of truth if available
      sets = data.sets;
    }
  } catch(e) { /* Sheets unavailable — use localStorage */ }

  if (!sets.length) {
    wrap.innerHTML = '<div class="tbl-empty">No test sets yet. Click + New Set to create one.</div>';
    return;
  }

  let html = '<div><table class="sheets-table"><thead><tr><th>Set Name</th><th>Type</th><th>Status</th><th>Answer Key</th><th>Retakes / Review</th><th>Config URL</th><th>Created</th><th>Actions</th></tr></thead><tbody>';
  sets.forEach(s => {
    const isActive = s.setID === activeID || s.status === 'Active';
    const examType = ['IELTS','TOEIC','TOEFL','ESL'].includes((s.examType||'IELTS').toUpperCase()) ? (s.examType||'IELTS').toUpperCase() : 'IELTS';
    html += `<tr>
      <td><b>${escH(s.setName)}</b>${s.description?`<br><span>${escH(s.description)}</span>`:''}</td>
      <td>${examType==='TOEIC'?'<span class="band-badge">💼 TOEIC</span>':(examType==='IELTS'?'<span class="band-badge">🎓 IELTS</span>':'<span class="band-badge">📘 '+escH(examType)+'</span>')}</td>
      <td>${isActive?'<span class="band-badge band-high">⚡ ACTIVE</span>':`<span class="band-badge">${escH(s.status||'')}</span>`}</td>
      <td id="ak-status-${escH(s.setID)}">⏳ checking...</td>
      <td>${(+s.maxAttempts||0)===0?'♾️ Unlimited':'🔒 '+(+s.maxAttempts)+(+s.maxAttempts===1?' attempt':' attempts')}<br><span>Review: ${({off:'off',full:'with answers'})[s.reviewMode]||'✓/✗ marks'}</span></td>
      <td>${s.configURL?`<a href="${escH(s.configURL)}" target="_blank">View ↗</a>`:'—'}</td>
      <td>${formatDate(s.createdAt)}</td>
      <td>
        <button class="btn btn-ghost" data-click="akOpen('${escH(s.setID)}')">🔑 Key</button>
        <button class="btn btn-ghost" data-click="editSet(this.dataset.row)" data-row="${escH(JSON.stringify(s))}">✏️ Edit</button>
        ${!isActive?`<button class="btn btn-green" data-click="activateSet('${s.setID}')">⚡ Activate</button>`:''}
        <button class="btn btn-red" data-setid="${escH(s.setID)}" data-setname="${escH(s.setName)}" data-click="deleteSet(this.dataset.setid,this.dataset.setname)">🗑️ Delete</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;

  // Check answer-key status per set in the background — don't block the table render
  sets.forEach(s => checkAnswerKeyStatus(s.setID));
}

async function checkAnswerKeyStatus(setID) {
  const cell = document.getElementById('ak-status-' + setID);
  if (!cell) return;
  try {
    const data = await callSheets({ action: 'getAnswerKey', testSetID: setID });
    if (data.success) {
      const lCount = Object.keys(data.listeningKey || {}).length;
      const rCount = Object.keys(data.readingKey || {}).length;
      cell.innerHTML = `<span class="band-badge band-high">✅ Saved</span> <span>(L:${lCount} R:${rCount})</span>`;
    } else {
      cell.innerHTML = '<span class="band-badge band-low">⚠️ Missing</span>';
    }
  } catch (e) {
    cell.innerHTML = '<span>—</span>';
  }
}

async function deleteSet(setID, setName) {
  if (!confirm(`Delete "${setName}"?\n\nThis cannot be undone. Candidates who already took this test will keep their scores, but the test will no longer be selectable.`)) return;

  // Remove from localStorage
  let sets = JSON.parse(localStorage.getItem('ielts_test_sets') || '[]');
  sets = sets.filter(s => s.setID !== setID);
  localStorage.setItem('ielts_test_sets', JSON.stringify(sets));

  // If this was the active set, clear it
  const activeSet = JSON.parse(localStorage.getItem('ielts_active_set') || 'null');
  if (activeSet && activeSet.setID === setID) {
    localStorage.removeItem('ielts_active_set');
    localStorage.removeItem('ielts_drive_url');
  }

  // Try Sheets too (optional)
  try { await callSheets({ action:'deleteTestSet', setID }); } catch(e) { /* optional */ }

  toast('🗑️ Test set deleted.');
  loadTestSets();
}

function showNewSetForm() {
  editingSetID=null;
  document.getElementById('set-id').value='';
  document.getElementById('set-name').value='';
  document.getElementById('set-desc').value='';
  document.getElementById('set-url').value='';
  document.getElementById('set-status').value='Active';
  document.getElementById('set-exam-type').value='IELTS';
  document.getElementById('set-attempts').value='0';
  document.getElementById('set-review').value='marks';
  document.getElementById('set-form-title').textContent='New Test Set';
  document.getElementById('activate-btn').style.display='none';
  document.getElementById('set-form-card').style.display='block';
  document.getElementById('set-form-card').scrollIntoView({behavior:'smooth'});
}

function _setAttemptsValue(n) {
  const sel = document.getElementById('set-attempts');
  if (![...sel.options].some(o => +o.value === n)) sel.add(new Option(n + ' attempts', String(n)));
  sel.value = String(n);
}

function editSet(s) {
  if (typeof s === 'string') s = JSON.parse(s);
  editingSetID=s.setID;
  document.getElementById('set-id').value=s.setID;
  document.getElementById('set-name').value=s.setName;
  document.getElementById('set-desc').value=s.description||'';
  document.getElementById('set-url').value=s.configURL||'';
  document.getElementById('set-status').value=s.status||'Active';
  document.getElementById('set-exam-type').value=['IELTS','TOEIC','TOEFL','ESL'].includes((s.examType||'IELTS').toUpperCase())?(s.examType||'IELTS').toUpperCase():'IELTS';
  _setAttemptsValue(+s.maxAttempts||0);
  document.getElementById('set-review').value=['off','marks','full'].includes(s.reviewMode)?s.reviewMode:'marks';
  document.getElementById('set-form-title').textContent='Edit: '+s.setName;
  document.getElementById('activate-btn').style.display='inline-flex';
  document.getElementById('set-form-card').style.display='block';
  document.getElementById('set-form-card').scrollIntoView({behavior:'smooth'});
}

async function activateSet(setID) {
  // Save locally
  const sets = JSON.parse(localStorage.getItem('ielts_test_sets') || '[]');
  const found = sets.find(s => s.setID === setID);
  if (found) {
    localStorage.setItem('ielts_active_set', JSON.stringify(found));
    localStorage.setItem('ielts_drive_url', found.configURL || '');
  }
  // Try Sheets optionally
  try { await callSheets({ action:'setActiveSet', setID }); } catch(e) {}
  toast('⚡ Test set activated!');
  loadTestSets();
}
async function activateSetForm() { await activateSet(document.getElementById('set-id').value); }

// ═══════════════════════════════════════

async function saveTestSetForm() {
  const name   = document.getElementById('set-name').value.trim();
  const url    = document.getElementById('set-url').value.trim();
  const desc   = document.getElementById('set-desc').value.trim();
  const status = document.getElementById('set-status').value;
  const examType = document.getElementById('set-exam-type').value || 'IELTS';
  const setID  = document.getElementById('set-id').value || ('SET-'+Date.now());
  if (!name) { alert('Please enter a set name.'); return; }
  if (examType === 'TOEIC' && !/toeic/i.test(name)) {
    if (!confirm('The test set name doesn\'t contain "TOEIC" — candidates will be routed to the IELTS test screen instead of TOEIC unless you add it. Save anyway?')) return;
  }

  // Save locally
  const localSets = JSON.parse(localStorage.getItem('ielts_test_sets') || '[]');
  const existing  = localSets.findIndex(s => s.setID === setID);
  const setObj    = { setID, setName:name, configURL:url, status, createdAt:new Date().toISOString(), description:desc, examType };
  if (existing >= 0) localSets[existing] = setObj; else localSets.push(setObj);
  localStorage.setItem('ielts_test_sets', JSON.stringify(localSets));

  // Try Sheets optionally
  try {
    await callSheets({ action:'saveTestSet', setID, setName:name, configURL:url, status, description:desc, examType });
  } catch(e) { /* optional */ }

  // Retake / review policy (stored on the server so it cannot be bypassed from the browser)
  const maxAttempts = parseInt(document.getElementById('set-attempts').value, 10) || 0;
  const reviewMode  = document.getElementById('set-review').value || 'marks';
  let policyMsg = '';
  try {
    const pr = await callSheets({ action:'setSetPolicy', setID, maxAttempts, reviewMode });
    if (!pr || !pr.success) policyMsg = (pr && pr.message) || 'not saved';
  } catch(e) { policyMsg = e.message || 'not saved'; }

  if (policyMsg) toast('⚠️ Set saved, but the retake/review setting was not: ' + policyMsg);
  else toast('✅ Test set saved!');
  document.getElementById('set-form-card').style.display='none';
  loadTestSets();
}

// ═══════════════════════════════════════

// SETTINGS
// ═══════════════════════════════════════
async function loadSettingsForm() {
  try {
    const data = await callSheets({ action:'getSettings' });
    if (data.success && data.settings) {
      const s = data.settings;
      document.getElementById('inst-name').value   = s.institution_name||'';
      document.getElementById('inst-addr').value   = s.institution_address||'';
      document.getElementById('trf-note').value    = s.trf_footer_note||'';
      document.getElementById('notify-email').value = s.notify_email||'';
    }
  } catch(e) { console.warn('Settings load failed:', e); }
}

async function saveSettingsForm() {
  try {
    const data = await callSheets({
      action:'saveSettings',
      institution_name:    document.getElementById('inst-name').value,
      institution_address: document.getElementById('inst-addr').value,
      trf_footer_note:     document.getElementById('trf-note').value
    });
    if (data.success) {
      const el = document.getElementById('settings-status');
      el.style.display='block';
      setTimeout(()=>el.style.display='none', 3000);
      toast('✅ Settings saved!');
    }
  } catch(e) { alert('Error: '+e.message); }
}

async function changeAdminPasswordForm() {
  const cur = document.getElementById('cur-admin-pass').value;
  const neu = document.getElementById('new-admin-pass').value;
  const statusEl = document.getElementById('pw-change-status');
  statusEl.style.display = 'none';

  if (!cur || !neu) {
    statusEl.style.display='block'; statusEl.style.color='var(--red)';
    statusEl.textContent = 'Please fill in both fields.';
    return;
  }
  if (neu.length < 6) {
    statusEl.style.display='block'; statusEl.style.color='var(--red)';
    statusEl.textContent = 'New password must be at least 6 characters.';
    return;
  }

  try {
    const data = await callSheets({ action:'changeAdminPassword', currentPassword:cur, newPassword:neu });
    statusEl.style.display = 'block';
    if (data.success) {
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = '✅ Password changed! Use the new password next time you log in.';
      document.getElementById('cur-admin-pass').value = '';
      document.getElementById('new-admin-pass').value = '';
      toast('🔑 Admin password changed');
    } else {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = '❌ ' + (data.message || 'Could not change password.');
    }
  } catch(e) {
    statusEl.style.display = 'block'; statusEl.style.color='var(--red)';
    statusEl.textContent = '❌ ' + e.message;
  }
}

async function saveNotifyEmail() {
  const email = document.getElementById('notify-email').value.trim();
  const statusEl = document.getElementById('email-save-status');
  if (!email) { statusEl.style.display='block'; statusEl.style.color='var(--red)'; statusEl.textContent='Please enter an email.'; return; }
  try {
    await callSheets({ action:'saveSettings', notify_email: email });
    statusEl.style.display = 'block'; statusEl.style.color='var(--green)';
    statusEl.textContent = '✅ Notification email saved.';
    toast('📧 Notification email updated');
  } catch(e) {
    statusEl.style.display = 'block'; statusEl.style.color='var(--red)';
    statusEl.textContent = '❌ ' + e.message;
  }
}

async function testConnection() {
  const wrap = document.getElementById('conn-status');
  wrap.textContent='⏳ Testing...'; wrap.style.color='var(--ink3)';
  try {
    const data = await callSheets({ action:'ping' });
    if (data.success) { wrap.textContent='✅ Connected! Server: '+data.time; wrap.style.color='var(--green)'; }
    else { wrap.textContent='❌ '+data.message; wrap.style.color='var(--red)'; }
  } catch(e) { wrap.textContent='❌ '+e.message; wrap.style.color='var(--red)'; }
}

function initOwnerData() {
  loadSettingsForm();
  // Load active set info
  callSheets({action:'getActiveSet'}).then(d=>{
    if(d.success&&d.set) toast('Active test set: '+d.set.setName);
  }).catch(()=>{});
}

// ═══════════════════════════════════════

// LIVE MONITOR
// ═══════════════════════════════════════
let _monitorCands = [];
let _monitorScores = [];
let _monitorDrafts = [];
let monitorInterval = null;
let allCandidatesList = [];
let allCandidateScores = [];

function toggleAutoRefresh(on) {
  if (on) { monitorInterval = setInterval(loadMonitor, 10000); }
  else { clearInterval(monitorInterval); monitorInterval = null; }
}

async function loadMonitor() {
  const wrap = document.getElementById('monitor-wrap');
  const status = document.getElementById('monitor-status');
  status.className = 'sheets-status';
  status.textContent = 'Fetching...';

  try {
    const [candData, scoresData, draftsData] = await Promise.all([
      callSheets({ action: 'getCandidates' }),
      callSheets({ action: 'getScores' }),
      callSheets({ action: 'getDrafts' })
    ]);

    _monitorCands  = (candData.success  && candData.rows)   ? candData.rows   : [];
    _monitorScores = (scoresData.success && scoresData.rows) ? scoresData.rows : [];
    _monitorDrafts = (draftsData.success && draftsData.rows) ? draftsData.rows : [];
    allCandidatesList  = _monitorCands;
    allCandidateScores = _monitorScores;

    const liveCount = _monitorDrafts.filter(r => r[8] === 'in_progress').length;
    status.className = 'sheets-status ok';
    status.textContent = `✅ ${_monitorCands.length} candidates` + (liveCount ? ` · 🟢 ${liveCount} testing now` : '');

    document.getElementById('monitor-search').value = '';
    renderMonitorTable(_monitorCands);
  } catch(e) {
    status.className = 'sheets-status err';
    status.textContent = '❌ Error';
    wrap.innerHTML = `<div class="tbl-empty">❌ ${e.message}</div>`;
  }
}

// Draft row layout (getDrafts): [CandidateID, TestSetID, FullName, ExamType,
// CurrentSection, ListeningAnswered, ReadingAnswered, WritingWordCount, Status, UpdatedAt]
function getLiveDraft_(cid) {
  const target = String(cid||'').trim().toUpperCase();
  return _monitorDrafts.find(r => String(r[0]||'').trim().toUpperCase() === target && r[8] === 'in_progress') || null;
}
function secondsAgo_(iso) {
  if (!iso) return null;
  const s = Math.round((Date.now() - new Date(iso).getTime())/1000);
  return s >= 0 ? s : null;
}
function agoLabel_(secs) {
  if (secs === null) return '';
  if (secs < 90) return `${secs}s ago`;
  return `${Math.round(secs/60)}m ago`;
}

function filterMonitor() {
  const q = document.getElementById('monitor-search').value.trim().toLowerCase();
  const filtered = q
    ? _monitorCands.filter(r => String(r[0]||'').toLowerCase().includes(q) || String(r[1]||'').toLowerCase().includes(q))
    : _monitorCands;
  renderMonitorTable(filtered, q);
}

function renderMonitorTable(cands, highlight) {
  const wrap = document.getElementById('monitor-wrap');
  const label = document.getElementById('monitor-count-label');
  label.textContent = _monitorCands.length ? `${cands.length} of ${_monitorCands.length} shown` : '';

  if (!cands.length) {
    wrap.innerHTML = `<div class="tbl-empty">${_monitorCands.length ? '🔍 No candidates match your search.' : 'No candidates registered yet.'}</div>`;
    return;
  }

  const hl = v => {
    if (!highlight) return escH(v);
    const s = String(v||'');
    const idx = s.toLowerCase().indexOf(highlight.toLowerCase());
    if (idx < 0) return escH(s);
    return escH(s.slice(0,idx)) + `<mark>${escH(s.slice(idx,idx+highlight.length))}</mark>` + escH(s.slice(idx+highlight.length));
  };

  const now = Date.now();
  const scores = _monitorScores;

  const latestScore = {};
  scores.forEach(r => {
    const cid = r[1];
    if (!latestScore[cid] || new Date(r[0]) > new Date(latestScore[cid][0])) latestScore[cid] = r;
  });

  function getStatus(lastLoginStr) {
    if (!lastLoginStr) return 'offline';
    const diff = (now - new Date(lastLoginStr).getTime()) / 60000;
    if (diff < 5) return 'online';
    if (diff < 30) return 'recent';
    return 'offline';
  }

  const sorted = [...cands].sort((a,b) => {
    const liveRank = (getLiveDraft_(b[0])?1:0) - (getLiveDraft_(a[0])?1:0);
    if (liveRank !== 0) return liveRank; // live-testing candidates float to the top
    const rank = {online:0,recent:1,offline:2};
    return rank[getStatus(a[7])] - rank[getStatus(b[7])];
  });

  let html = `<div><table class="sheets-table">
    <thead><tr>
      <th></th>
      <th>Candidate</th>
      <th>Last Active</th>
      <th>Tests Taken</th>
      <th>Best Band</th>
      <th>Current Status</th>
      <th></th>
    </tr></thead><tbody>`;

  sorted.forEach(r => {
    const cid = r[0];
    const st = getStatus(r[7]);
    const dotCls = st==='online'?'dot-online':st==='recent'?'dot-recent':'dot-offline';
    const stLabel = st==='online'
      ? '<span>● Online</span>'
      : st==='recent'
        ? '<span>◑ Recent</span>'
        : '<span>○ Offline</span>';
    const candScores = scores.filter(s => s[2] === cid);  // [2] = CandidateID
    const bestBand = candScores.reduce((max,s) => { const b=parseFloat(s[14]||0); return b>max?b:max; }, 0); // [14] = OverallBand

    // Real live status, from the Drafts sheet — synced every ~90s by the
    // exam client itself — instead of guessing from login recency.
    const live = getLiveDraft_(cid);
    const bandCls = bestBand>=7?'band-high':bestBand>=5.5?'band-mid':bestBand>0?'band-low':'';
    const secAgo = live ? secondsAgo_(live[9]) : null;
    const staleLive = live && secAgo !== null && secAgo > 240; // no sync in 4min — likely closed tab/lost connection
    const liveBadge = live
      ? `<span>${staleLive?'⚠️ stalled':'🟢 live'} · ${escH(live[4]||'—')} · L ${live[5]}/40 R ${live[6]}/40${live[7]>0?` · ${live[7]}w`:''} · ${agoLabel_(secAgo)}</span>`
      : '';

    html += `<tr class="monitor-row" data-click="openMonitorDetail('${escH(cid)}')">
      <td><span class="online-dot ${dotCls}"></span></td>
      <td><b>${hl(r[1])}</b><br><span>${hl(cid)}</span></td>
      <td>${r[7] ? new Date(r[7]).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
      <td>${candScores.length}</td>
      <td><span class="band-badge ${bandCls}">${bestBand>0?bestBand:'—'}</span></td>
      <td>${stLabel}${liveBadge}</td>
      <td><button class="refresh-btn" data-click="openMonitorDetail('${escH(cid)}')">View →</button></td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

function openMonitorDetail(cid) {
  const card = document.getElementById('monitor-detail-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const cand = allCandidatesList.find(r => r[0] === cid);
  const candScores = allCandidateScores.filter(r => r[2] === cid);  // [2] = CandidateID

  document.getElementById('monitor-detail-name').textContent = cand ? cand[1] + ' — Detail' : cid;

  // Meta info
  const meta = document.getElementById('monitor-detail-meta');
  if (cand) {
    meta.innerHTML = [
      ['Candidate ID', cand[0]], ['Full Name', cand[1]], ['DOB', cand[2]],
      ['Gender', cand[3]], ['Nationality', cand[4]], ['Registered', formatDate(cand[6])],
      ['Last Active', cand[7] ? new Date(cand[7]).toLocaleString('en-PH') : '—']
    ].map(([l,v]) => `<div>
      <div>${l}</div>
      <div>${escH(String(v||'—'))}</div>
    </div>`).join('');
  }

  // Progress bars per section from latest submission — using correct Code.gs columns
  const latest = candScores[candScores.length - 1];
  const progWrap = document.getElementById('monitor-progress-bars');

  // Live in-progress draft (if the candidate is testing right now) takes
  // priority over the last completed submission's bars.
  const live = getLiveDraft_(cid);
  if (live) {
    const secAgo = secondsAgo_(live[9]);
    const stale = secAgo !== null && secAgo > 240;
    progWrap.innerHTML = `
      <div>
        ${stale?'⚠️ No sync in a while — may have lost connection or closed the tab':'🟢 Currently testing'} · Section: ${escH(live[4]||'—')} · Last synced ${agoLabel_(secAgo)}
      </div>
      <div class="prog-row"><span class="prog-label">Listening</span><div class="prog-bar-wrap"><div class="prog-bar-fill" data-w="${(live[5]/40)*100}" data-bg="var(--blue2)">${live[5]}/40</div></div></div>
      <div class="prog-row"><span class="prog-label">Reading</span><div class="prog-bar-wrap"><div class="prog-bar-fill" data-w="${(live[6]/40)*100}" data-bg="var(--green)">${live[6]}/40</div></div></div>
      ${live[7]>0 ? `<div class="prog-row"><span class="prog-label">Writing</span><div class="prog-bar-wrap"><div class="prog-bar-fill" data-w="${Math.min((live[7]/400)*100,100)}" data-bg="var(--gold)">${live[7]} words</div></div></div>` : ''}
    `;
  } else if (latest) {
    const lScore = parseInt(latest[6])||0;   // [6] ListeningScore
    const rScore = parseInt(latest[8])||0;   // [8] ReadingScore
    const w1wc   = parseInt(latest[15])||0;  // [15] WritingTask1WC
    const w2wc   = parseInt(latest[16])||0;  // [16] WritingTask2WC
    progWrap.innerHTML = `
      <div class="prog-row"><span class="prog-label">Listening</span><div class="prog-bar-wrap"><div class="prog-bar-fill" data-w="${(lScore/40)*100}" data-bg="var(--blue2)">${lScore}/40</div></div></div>
      <div class="prog-row"><span class="prog-label">Reading</span><div class="prog-bar-wrap"><div class="prog-bar-fill" data-w="${(rScore/40)*100}" data-bg="var(--green)">${rScore}/40</div></div></div>
      <div class="prog-row"><span class="prog-label">Writing T1</span><div class="prog-bar-wrap"><div class="prog-bar-fill" data-w="${Math.min((w1wc/150)*100,100)}" data-bg="var(--gold)">${w1wc} words</div></div></div>
      <div class="prog-row"><span class="prog-label">Writing T2</span><div class="prog-bar-wrap"><div class="prog-bar-fill" data-w="${Math.min((w2wc/250)*100,100)}" data-bg="var(--gold)">${w2wc} words</div></div></div>
    `;
  } else {
    progWrap.innerHTML = '<div>No completed attempts yet.</div>';
  }

  // Answers table — all submissions
  const ansWrap = document.getElementById('monitor-answers-wrap');
  if (!candScores.length) {
    ansWrap.innerHTML = '<div class="tbl-empty">No answers submitted yet.</div>';
    return;
  }
  let html = `<div><table class="sheets-table">
    <thead><tr><th>Date</th><th>Test Set</th><th>L Score</th><th>L Band</th><th>R Score</th><th>R Band</th><th>Writing</th><th>Overall</th></tr></thead><tbody>`;
  candScores.forEach(r => {
    const ob = parseFloat(r[14]||0);
    const obCls = ob>=7?'band-high':ob>=5.5?'band-mid':ob>0?'band-low':'';
    html += `<tr>
      <td>${formatDate(r[1])}</td>
      <td>${escH(r[5]||'—')}</td>
      <td>${escH(String(r[6]||'—'))}</td>
      <td><span class="band-badge">${escH(String(r[7]||'—'))}</span></td>
      <td>${escH(String(r[8]||'—'))}</td>
      <td><span class="band-badge">${escH(String(r[9]||'—'))}</span></td>
      <td><span class="band-badge">${escH(String(r[12]||'—'))}</span></td>
      <td><span class="band-badge ${obCls}">${ob||'Pending'}</span></td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  ansWrap.innerHTML = html;
}

// ═══════════════════════════════════════

// TRF VIEWER (Admin)
// ═══════════════════════════════════════
let trfScoresData = [];

let trfCandRows = [];

async function loadTRFCandidates() {
  const sel = document.getElementById('trf-cand-sel');
  sel.innerHTML = '<option value="">⏳ Loading...</option>';
  try {
    const data = await callSheets({ action: 'getCandidates' });
    trfCandRows = (data.success && data.rows) ? data.rows : [];
    document.getElementById('trf-search').value = '';
    renderTRFCandOptions(trfCandRows);

    // Pre-load all scores
    const sd = await callSheets({ action: 'getScores' });
    trfScoresData = (sd.success && sd.rows) ? sd.rows : [];

    // DEBUG: show raw column headers of first score row in console
    if (trfScoresData.length) {
      console.log('📊 First score row (raw):', trfScoresData[0]);
      console.log('📊 All score rows:', trfScoresData);
    } else {
      console.warn('⚠️ trfScoresData is empty — getScores returned no rows');
    }

    toast('✅ Loaded ' + trfCandRows.length + ' candidates · ' + trfScoresData.length + ' score rows');
  } catch(e) {
    console.error('❌ loadTRFCandidates error:', e);
    sel.innerHTML = '<option value="">❌ Error loading — check connection</option>';
    toast('❌ Error: ' + e.message);
  }
}

function renderTRFCandOptions(rows) {
  const sel = document.getElementById('trf-cand-sel');
  const label = document.getElementById('trf-count-label');
  label.textContent = trfCandRows.length ? `${rows.length} of ${trfCandRows.length} shown` : '';
  sel.innerHTML = '<option value="">— Select candidate —</option>' +
    rows.map(r => `<option value="${escH(r[0])}">${escH(r[1])} (${escH(r[0])})</option>`).join('');
}

function filterTRFCandidates() {
  const q = document.getElementById('trf-search').value.trim().toLowerCase();
  const filtered = q
    ? trfCandRows.filter(r => String(r[0]||'').toLowerCase().includes(q) || String(r[1]||'').toLowerCase().includes(q))
    : trfCandRows;
  renderTRFCandOptions(filtered);
}

function loadTRFAttempts() {
  const cid = document.getElementById('trf-cand-sel').value;
  const sel = document.getElementById('trf-attempt-sel');
  const wrap = document.getElementById('admin-trf-wrap');
  sel.innerHTML = '<option value="">— Select attempt —</option>';
  if (!cid) { wrap.innerHTML = '<div class="tbl-empty">Select a candidate first.</div>'; return; }

  // Scores columns (0-based) per Code.gs:
  // [0] SubmissionID  [1] Timestamp  [2] CandidateID  [3] FullName
  // [4] TestSetID     [5] TestSetName
  // [6] ListeningScore [7] ListeningBand
  // [8] ReadingScore  [9] ReadingBand
  // [10] W1Band [11] W2Band [12] WritingBand [13] SpeakingBand [14] OverallBand
  // [15] W1WC  [16] W2WC   [17] W1Text      [18] W2Text
  const candScores = trfScoresData.filter(r => String(r[2]||'').trim().toLowerCase() === cid.trim().toLowerCase());

  wrap.innerHTML = candScores.length === 0
    ? `<div class="tbl-empty">No score records found for <b>${escH(cid)}</b>.<br>
        Make sure the candidate has completed and submitted a test.</div>`
    : '';

  candScores.forEach((r, i) => {
    const overall = r[14] || 'Pending';
    const date    = formatDate(r[1]); // [1] = Timestamp
    const opt     = document.createElement('option');
    opt.value     = i;
    opt.textContent = `Attempt ${i+1} — ${date} — Overall: ${overall}`;
    sel.appendChild(opt);
  });

  // Cache matched rows
  sel.dataset.matchedRows = JSON.stringify(candScores);
}

// Build the TRF HTML string (standalone, self-contained)
function buildTRFHtml(row, candidateRows, photoBase64) {
  // only ever inject a real image data-URL (never arbitrary text) into the report
  photoBase64 = (typeof photoBase64 === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(photoBase64)) ? photoBase64 : '';
  // Scores columns per Code.gs:
  // [0]=SubmissionID [1]=Timestamp  [2]=CandidateID [3]=FullName
  // [4]=TestSetID    [5]=TestSetName
  // [6]=ListeningScore [7]=ListeningBand
  // [8]=ReadingScore   [9]=ReadingBand
  // [10]=W1Band [11]=W2Band [12]=WritingBand [13]=SpeakingBand [14]=OverallBand
  const cid      = row[2]  || '—';
  const fname    = row[3]  || '—';
  const testSet  = row[5]  || '—';
  const dateStr  = formatDate(row[1]);
  const lScore   = row[6]  || '—';
  const lBand    = row[7]  || '—';
  const rScore   = row[8]  || '—';
  const rBand    = row[9]  || '—';
  const wBand    = row[12] || '—';
  const sBand    = row[13] || '—';
  const overall  = row[14] || '—';

  // Pull extra candidate details from roster if available
  const candRow     = (candidateRows||[]).find(r => r[0]===cid) || [];
  const dob         = candRow[2]||'—';
  const gender      = candRow[3]||'—';
  const nationality = candRow[4]||'—';
  const trfNum      = row[0] || `SIM-${cid}-${(row[1]||'').replace(/\D/g,'').slice(0,8)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>BandUp Test Result Form — ${fname}</title>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',Arial,sans-serif;background:#fff;color:#111;font-size:10pt}
  @page{size:A4 portrait;margin:14mm 14mm 14mm 14mm}
  @media print{body{background:#fff}.no-print{display:none!important}}

  .page{width:100%;max-width:720px;margin:0 auto;background:#fff;padding:10px 0}

  /* TOP BAR */
  .top-bar{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:6px}
  .ielts-logo{font-family:'DM Sans',sans-serif;font-size:28pt;font-weight:900;letter-spacing:-1px;line-height:1}
  .ielts-logo sup{font-size:10pt;vertical-align:super}
  .trf-label{font-size:12pt;font-weight:700;margin-top:4px}
  .note-box{font-size:6.5pt;color:#333;max-width:340px;line-height:1.4;margin-top:4px}
  .note-box i{font-style:italic}
  .academic-box{border:1.5px solid #000;padding:4px 18px;font-weight:700;font-size:10pt;letter-spacing:1px;align-self:flex-start;margin-top:4px}

  /* META ROW */
  .meta-row{display:flex;gap:0;border:1px solid #ccc;margin-bottom:10px}
  .meta-cell{flex:1;padding:4px 10px;border-right:1px solid #ccc;font-size:8.5pt}
  .meta-cell:last-child{border-right:none}
  .meta-cell .lbl{font-size:7pt;color:#555;margin-bottom:1px}
  .meta-cell .val{font-weight:600}

  /* SECTION TITLE */
  .sec-title{font-weight:700;font-size:10pt;border-bottom:1.5px solid #000;padding-bottom:3px;margin:10px 0 6px;text-transform:uppercase;letter-spacing:0.05em}

  /* CANDIDATE DETAILS TABLE */
  .cand-table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:9pt}
  .cand-table td{padding:4px 8px;border:1px solid #ccc;vertical-align:top}
  .cand-table .lbl-col{width:130px;font-weight:600;background:#f8f8f8;color:#444;font-size:8pt}
  .cand-table .val-col{font-weight:500}
  .photo-cell{border:1px solid #ccc;width:90px;text-align:center;vertical-align:middle;font-size:7pt;color:#aaa;padding:6px}

  /* TEST RESULTS BAND ROW */
  .results-section{margin:10px 0}
  .band-row{display:flex;align-items:stretch;border:1.5px solid #000;border-radius:0;overflow:hidden;margin-bottom:0}
  .band-cell{flex:1;padding:8px 6px;text-align:center;border-right:1px solid #ccc;background:#fff}
  .band-cell:last-child{border-right:none}
  .band-cell .blbl{font-size:7pt;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#666;margin-bottom:6px}
  .band-cell .bval{font-family:'Source Serif 4',serif;font-size:22pt;font-weight:700;color:#002f5f;line-height:1}
  .band-cell .bsub{font-size:7pt;color:#888;margin-top:3px}
  .band-cell.overall-cell{background:#002f5f;border-right:none}
  .band-cell.overall-cell .blbl{color:rgba(255,255,255,0.65)}
  .band-cell.overall-cell .bval{font-size:28pt;color:#c8a84b}
  .cefr-cell{width:90px;background:#002f5f;border-left:1px solid rgba(255,255,255,0.2);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px}
  .cefr-cell .clbl{font-size:7pt;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px}
  .cefr-cell .cval{font-family:'Source Serif 4',serif;font-size:22pt;font-weight:700;color:#fff}

  /* BOTTOM SECTION */
  .bottom-grid{display:grid;grid-template-columns:1fr 1fr 130px;gap:10px;margin-top:12px;align-items:start}
  .admin-comments{border:1px solid #ccc;min-height:70px;padding:8px;font-size:8pt;color:#aaa}
  .stamp-box{border:1px solid #ccc;min-height:70px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:7.5pt;color:#aaa;flex-direction:column;gap:4px;padding:6px}
  .stamp-circle{width:54px;height:54px;border-radius:50%;border:1.5px dashed #ccc;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#bbb;text-align:center;padding:4px;margin:0 auto 4px}

  /* SIGNATURE ROW */
  .sig-row{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:12px;padding-top:6px}
  .sig-field{border-top:1px solid #888;padding-top:4px;font-size:7.5pt;color:#666;text-align:center}

  /* DATE + TRF NUM */
  .footer-row{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:8px;border-top:1px solid #ccc;font-size:8pt;color:#555}
  .footer-row .trf-num{font-weight:700;color:#111;font-family:monospace;font-size:9pt;background:#f0f0f0;padding:2px 10px;border:1px solid #ccc}

  /* LOGOS */
  .logos-row{display:flex;align-items:center;justify-content:center;gap:24px;margin-top:12px;padding-top:8px;border-top:1px solid #eee;font-size:7.5pt;color:#555;font-weight:600}

  /* VALIDITY NOTE */
  .validity-note{text-align:center;font-size:7pt;color:#777;margin-top:6px;border-top:1px solid #eee;padding-top:6px;font-style:italic}

  /* PRINT BUTTON (hidden on print) */
  .print-toolbar{text-align:center;padding:14px;background:#f5f5f5;border-bottom:1px solid #ddd;display:flex;gap:10px;justify-content:center;align-items:center}
  .btn-print{padding:10px 28px;background:#002f5f;color:#fff;border:none;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:700;cursor:pointer}
  .btn-print:hover{background:#1a5fa8}
  .btn-close{padding:10px 18px;background:#eee;color:#333;border:none;border-radius:6px;font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:600;cursor:pointer}
  .sim-watermark{font-size:7pt;color:#b00;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:3px 10px;border:1px solid #e88;border-radius:3px;display:inline-block}
</style>
</head>
<body>

<div class="print-toolbar no-print">
  <button class="btn-print" onclick="window.print()">🖨 Print / Save as PDF</button>
  <button class="btn-close" onclick="window.close()">✕ Close</button>
  <span class="sim-watermark">⚠ Simulation — Not an official IELTS document</span>
</div>

<div class="page">

  <!-- TOP BAR -->
  <div class="top-bar">
    <div>
      <div class="ielts-logo">IELTS<sup>™</sup></div>
      <div class="trf-label">Test Result Form</div>
      <div class="note-box" style="margin-top:5px">
        <i>NOTE &nbsp;Admission to undergraduate and post graduate courses should be based on the ACADEMIC Reading and Writing Modules.<br>
        GENERAL TRAINING Reading and Writing Modules are not designed to test the full range of language skills required for academic purposes.<br>
        It is recommended that the candidate's language ability as indicated in this Test Result Form be re-assessed <b>after two years</b> from the date of the test.</i>
      </div>
    </div>
    <div class="academic-box">ACADEMIC</div>
  </div>

  <!-- META ROW: Centre / Date / Candidate Number -->
  <div class="meta-row">
    <div class="meta-cell"><div class="lbl">Centre Number</div><div class="val">SIM-001</div></div>
    <div class="meta-cell"><div class="lbl">Date</div><div class="val">${dateStr}</div></div>
    <div class="meta-cell" style="flex:2"><div class="lbl">Candidate Number</div><div class="val">${cid}</div></div>
  </div>

  <!-- CANDIDATE DETAILS -->
  <div class="sec-title">Candidate Details</div>
  <table class="cand-table">
    <tr>
      <td class="lbl-col">Family Name</td>
      <td class="val-col" colspan="2" style="text-transform:uppercase;font-weight:700;font-size:10pt">${(fname.split(' ').pop()||fname).toUpperCase()}</td>
      <td class="photo-cell" rowspan="4">
        ${photoBase64
          ? `<img src="${photoBase64}" style="width:68px;height:80px;object-fit:cover;border:1px solid #ccc;display:block;margin:0 auto">`
          : `<div style="width:68px;height:80px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;margin:0 auto;color:#bbb;font-size:7pt">No Photo</div>`}
      </td>
    </tr>
    <tr>
      <td class="lbl-col">First Name</td>
      <td class="val-col" colspan="2" style="text-transform:uppercase;font-weight:700;font-size:10pt">${(fname.split(' ')[0]||'').toUpperCase()}</td>
    </tr>
    <tr>
      <td class="lbl-col">Candidate ID</td>
      <td class="val-col" colspan="2" style="font-family:monospace">${cid}</td>
    </tr>
    <tr>
      <td class="lbl-col">Date of Birth</td>
      <td class="val-col">${dob}</td>
    </tr>
    <tr>
      <td class="lbl-col">Gender</td>
      <td class="val-col" colspan="3">${gender}</td>
    </tr>
    <tr>
      <td class="lbl-col">Country of Nationality</td>
      <td class="val-col" colspan="3">${nationality}</td>
    </tr>
    <tr>
      <td class="lbl-col">Test Set</td>
      <td class="val-col" colspan="3">${testSet}</td>
    </tr>
  </table>

  <!-- TEST RESULTS -->
  <div class="sec-title">Test Results</div>
  <div class="results-section">
    <div class="band-row">
      <div class="band-cell">
        <div class="blbl">Listening</div>
        <div class="bval">${lBand}</div>
        <div class="bsub">${lScore}/40</div>
      </div>
      <div class="band-cell">
        <div class="blbl">Reading</div>
        <div class="bval">${rBand}</div>
        <div class="bsub">${rScore}/40</div>
      </div>
      <div class="band-cell">
        <div class="blbl">Writing</div>
        <div class="bval">${wBand}</div>
        <div class="bsub">&nbsp;</div>
      </div>
      <div class="band-cell">
        <div class="blbl">Speaking</div>
        <div class="bval">${sBand}</div>
        <div class="bsub">&nbsp;</div>
      </div>
      <div class="band-cell overall-cell">
        <div class="blbl">Overall<br>Band Score</div>
        <div class="bval">${overall}</div>
      </div>
      <div class="cefr-cell">
        <div class="clbl">CEFR<br>Level</div>
        <div class="cval">${overallToCEFR(parseFloat(overall)||0)}</div>
      </div>
    </div>
  </div>

  <!-- BOTTOM GRID: Admin Comments + Stamps -->
  <div class="bottom-grid">
    <div>
      <div style="font-size:8pt;font-weight:700;margin-bottom:4px">Administrator's Comments</div>
      <div class="admin-comments"></div>
    </div>
    <div>
      <div style="font-size:8pt;font-weight:700;margin-bottom:4px">Centre stamp</div>
      <div class="stamp-box">
        <div class="stamp-circle">Centre<br>Stamp</div>
      </div>
    </div>
    <div>
      <div style="font-size:8pt;font-weight:700;margin-bottom:4px">Validation stamp</div>
      <div class="stamp-box">
        <div class="stamp-circle" style="border-color:#002f5f;color:#002f5f;font-weight:700">IELTS<br>Sim</div>
      </div>
    </div>
  </div>

  <!-- SIGNATURE ROW -->
  <div class="sig-row">
    <div class="sig-field">Administrator's Signature</div>
    <div class="sig-field">Candidate's Signature</div>
  </div>

  <!-- DATE + TRF NUMBER -->
  <div class="footer-row">
    <div>Date &nbsp; <b>${dateStr}</b></div>
    <div>Test Report Form Number &nbsp; <span class="trf-num">${trfNum}</span></div>
  </div>

  <!-- LOGOS ROW -->
  <div class="logos-row">
    <span>🇬🇧 BRITISH COUNCIL</span>
    <span>✦ IDP</span>
    <span>🏛 CAMBRIDGE ENGLISH — Language Assessment</span>
  </div>

  <!-- VALIDITY NOTE -->
  <div class="validity-note">
    This is a SIMULATION result for preparation purposes only and is NOT an official IELTS Test Result Form.<br>
    The validity of an official IELTS Test Report Form can be verified at <u>https://ielts.ucles.org.uk</u>
  </div>

</div><!-- end .page -->

<script>
function overallToCEFR(b){
  if(b>=8.5)return'C2';
  if(b>=7)return'C1';
  if(b>=5.5)return'B2';
  if(b>=4)return'B1';
  if(b>=3)return'A2';
  return'A1';
}
// Run overallToCEFR inline — it's called from the template literal above via string injection
<\/script>
</body>
</html>`;
}

// Called inline — needed when building the HTML string before the popup opens
function overallToCEFR(b){
  if(b>=8.5)return'C2';
  if(b>=7)return'C1';
  if(b>=5.5)return'B2';
  if(b>=4)return'B1';
  if(b>=3)return'A2';
  return'A1';
}

function getMatchedCandScores() {
  const sel = document.getElementById('trf-attempt-sel');
  if (sel.dataset.matchedRows) {
    try { return JSON.parse(sel.dataset.matchedRows); } catch(e) {}
  }
  const cid = document.getElementById('trf-cand-sel').value;
  return trfScoresData.filter(r => r.some(cell => String(cell||'').trim() === cid.trim()));
}

function renderAdminTRF() {
  const idx  = document.getElementById('trf-attempt-sel').value;
  const wrap = document.getElementById('admin-trf-wrap');
  if (idx === '') return;
  const candScores = getMatchedCandScores();
  const row = candScores[parseInt(idx)];
  if (!row) { wrap.innerHTML += '<div class="tbl-empty">Attempt not found.</div>'; return; }

  const lBand  = row[7]  || '—';
  const rBand  = row[9]  || '—';
  const wBand  = row[12] || '—';
  const sBand  = row[13] || '—';
  const overall = row[14] || '—';

  const preview = document.createElement('div');
  preview.style.cssText = 'background:var(--paper2);border-radius:10px;padding:18px 20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-top:8px';
  preview.innerHTML = `
    <div>
      <div>${escH(row[2]||'—')} · ${formatDate(row[0])}</div>
      <div>
        ${[['L',lBand],['R',rBand],['W',wBand],['S',sBand]].map(([l,v])=>`
          <div>
            <div>${l}</div>
            <div>${escH(String(v))}</div>
          </div>`).join('')}
        <div>
          <div>Overall</div>
          <div>${escH(String(overall))}</div>
        </div>
      </div>
    </div>
    <div>
      <button class="btn btn-blue" data-click="openTRFPopup()">
        <span>🖨</span> Open &amp; Print TRF
      </button>
      <button class="btn btn-ghost" data-click="openAnswerSheetPopup()">
        <span>📝</span> Print Answers
      </button>
      <div>Opens in new window</div>
    </div>`;
  wrap.appendChild(preview);
}

// The popup is opened FIRST (inside the click) so browsers don't block it, then filled in once the data is ready.
async function openTRFPopup() {
  const idx = document.getElementById('trf-attempt-sel').value;
  if (idx === '') { toast('⚠️ Please select an attempt first.'); return; }
  const candScores = getMatchedCandScores();
  const row = candScores[parseInt(idx)];
  if (!row) { toast('❌ Row not found.'); return; }
  const popup = window.open('', '_blank', 'width=820,height=1080,scrollbars=yes,resizable=yes');
  if (!popup) { alert('Popup blocked! Please allow popups for this site.'); return; }
  popup.document.write('<p>⏳ Preparing report…</p>');
  let photo = '';
  try { const d = await callSheets({ action:'getCandidatePhoto', candidateID: row[2] }); if (d.success) photo = d.photoBase64 || ''; } catch (e) { /* prints without a photo */ }
  const html = buildTRFHtml(row, _candidateRows.length ? _candidateRows : [], photo);
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

async function openAnswerSheetPopup() {
  const idx = document.getElementById('trf-attempt-sel').value;
  if (idx === '') { toast('⚠️ Please select an attempt first.'); return; }
  const candScores = getMatchedCandScores();
  const row = candScores[parseInt(idx)];
  if (!row) { toast('❌ Row not found.'); return; }
  const popup = window.open('', '_blank', 'width=820,height=1080,scrollbars=yes,resizable=yes');
  if (!popup) { alert('Popup blocked! Please allow popups for this site.'); return; }
  popup.document.write('<p>⏳ Building answer sheet…</p>');
  let listeningKey = {}, readingKey = {};
  try {
    const data = await callSheets({ action:'getAnswerKey', testSetID: row[4] || '' });
    if (data.success) { listeningKey = data.listeningKey || {}; readingKey = data.readingKey || {}; }
  } catch (e) { /* prints with the candidate's answers only if the key can't be reached */ }
  const html = buildAnswerSheetHtml(row, listeningKey, readingKey);
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

// ═══════════════════════════════════════

// PREVIEW AS CANDIDATE
// Opens the real candidate pages in a new tab, read-only (nothing is saved — see bandup-api.js).
// ═══════════════════════════════════════
function openPreview(page) {
  try {   // the new tab has its own sessionStorage, so hand the admin session over for a few seconds
    const keep = {};
    ['adminToken','userRole','adminRole','adminName','adminPerms'].forEach(k => { const v = sessionStorage.getItem(k); if (v !== null) keep[k] = v; });
    localStorage.setItem('bandupPreviewHandoff', JSON.stringify({ t: Date.now(), s: keep }));
  } catch(e) {}
  const w = window.open(page + '?preview=1', '_blank');
  if (!w) toast('⚠️ Pop-up blocked — allow pop-ups for this site, then try again.');
}

// ═══════════════════════════════════════
// MY ACCOUNT (sub-admins)
// ═══════════════════════════════════════
async function changeMyPassword() {
  const cur = document.getElementById('my-cur-pass').value;
  const neu = document.getElementById('my-new-pass').value;
  const cf  = document.getElementById('my-conf-pass').value;
  const st  = document.getElementById('my-pw-status');
  const say = (msg, color) => { st.style.display = 'block'; st.style.color = color; st.textContent = msg; };
  if (!cur || !neu) return say('Please fill in all fields.', 'var(--red)');
  if (neu.length < 8) return say('New password must be at least 8 characters.', 'var(--red)');
  if (neu !== cf) return say('New passwords do not match.', 'var(--red)');
  try {
    const d = await callSheets({ action:'changeMyAdminPassword', currentPassword:cur, newPassword:neu });
    if (d.success) {
      say('✅ Password changed.', 'var(--green)');
      ['my-cur-pass','my-new-pass','my-conf-pass'].forEach(id => document.getElementById(id).value = '');
      toast('🔑 Password changed');
    } else say('❌ ' + (d.message || 'Could not change password.'), 'var(--red)');
  } catch(e) { say('❌ ' + e.message, 'var(--red)'); }
}

// ═══════════════════════════════════════
// ADMIN ACCOUNTS (Owner only)
// ═══════════════════════════════════════
let _admins = [];
let _permEdit = null; // { id, mode:'approve'|'edit' }

function renderPermGrid(containerId, selected) {
  const sel = new Set(selected || []);
  document.getElementById(containerId).innerHTML = PERM_DEFS.map(([k, label]) =>
    `<label class="perm-item"><input type="checkbox" value="${k}" ${sel.has(k) ? 'checked' : ''}> ${escH(label)}</label>`).join('');
}
function collectPerms(containerId) {
  return Array.from(document.querySelectorAll('#' + containerId + ' input:checked')).map(i => i.value);
}

async function loadAdmins(silent) {
  const wrap = document.getElementById('admins-table-wrap');
  const status = document.getElementById('admins-status');
  if (!silent) { wrap.innerHTML = '<div class="tbl-empty">⏳ Loading...</div>'; status.className = 'sheets-status'; status.textContent = 'Fetching...'; }
  try {
    const d = await callSheets({ action:'getAdmins' });
    if (!d.success) throw new Error(d.message || 'Failed');
    _admins = d.admins || [];
    status.className = 'sheets-status ok';
    status.textContent = `✅ ${_admins.length} account${_admins.length === 1 ? '' : 's'}`;
    renderAdminsTable();
    updateAdminBadge();
  } catch(e) {
    if (silent) return;
    status.className = 'sheets-status err'; status.textContent = '❌ Error';
    wrap.innerHTML = `<div class="tbl-empty">❌ ${escH(e.message)}<br><br>The server needs the admin-management actions added (see the backend spec).</div>`;
  }
}

function updateAdminBadge() {
  const n = _admins.filter(a => a.status === 'Pending').length;
  const b = document.getElementById('admin-pending-badge');
  if (!b) return;
  if (n > 0) { b.style.display = 'inline-block'; b.textContent = n; } else b.style.display = 'none';
}

function adminStatusBadge(s) {
  if (s === 'Pending')  return '<span class="band-badge">⏳ Pending</span>';
  if (s === 'Rejected') return '<span class="band-badge">✕ Rejected</span>';
  return '<span class="band-badge band-high">✓ Approved</span>';
}
function permSummary(a) {
  if (a.role === 'Owner') return '<span class="band-badge band-high">Full access</span>';
  const p = a.permissions || [];
  if (!p.length) return '<span>No access yet</span>';
  return p.map(k => { const d = PERM_DEFS.find(x => x[0] === k); return d ? `<span class="perm-chip">${escH(d[1])}</span>` : ''; }).join('');
}

function renderAdminsTable() {
  const wrap = document.getElementById('admins-table-wrap');
  if (!_admins.length) { wrap.innerHTML = '<div class="tbl-empty">No admin accounts found.</div>'; return; }
  const rank = { Pending:0, Approved:1, Rejected:2 };
  const rows = [..._admins].sort((a, b) => (a.role === 'Owner' ? -1 : 0) - (b.role === 'Owner' ? -1 : 0) || (rank[a.status] ?? 1) - (rank[b.status] ?? 1));
  let html = `<div><table class="sheets-table"><thead><tr>
    <th>Name</th><th>Role</th><th>Status</th><th>Access</th><th>Requested</th><th>Last Login</th><th>Actions</th>
  </tr></thead><tbody>`;
  rows.forEach(a => {
    const id = escH(a.adminID);
    const btn = (cls, act, label) => `<button class="btn ${cls}" data-id="${id}" data-click="adminAct('${act}',this.dataset.id)">${label}</button>`;
    let actions = '<span>—</span>';
    if (a.role !== 'Owner') {
      if (a.status === 'Pending')       actions = btn('btn-green','approve','✓ Approve') + btn('btn-red','reject','✕ Reject') + btn('btn-red','delete','🗑️');
      else if (a.status === 'Rejected') actions = btn('btn-green','approve','✓ Approve') + btn('btn-red','delete','🗑️ Delete');
      else actions = btn('btn-blue','edit','✏️ Access') + btn('btn-ghost','resetpw','🔑 Password') + btn('btn-ghost','reject','✕ Revoke') + btn('btn-red','delete','🗑️ Delete');
    }
    html += `<tr>
      <td><b>${escH(a.fullName)}</b><br><span>${escH(a.email)}</span></td>
      <td>${a.role === 'Owner' ? '<span class="band-badge role-owner">👑 Owner</span>' : '<span class="band-badge">Sub-admin</span>'}</td>
      <td>${adminStatusBadge(a.status)}</td>
      <td>${permSummary(a)}</td>
      <td>${formatDate(a.createdAt)}</td>
      <td>${formatDate(a.lastLogin)}</td>
      <td>${actions}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

function adminAct(kind, id) {
  const a = _admins.find(x => x.adminID === id);
  if (!a) { toast('❌ Admin not found — refresh the list.'); return; }
  if (kind === 'approve' || kind === 'edit') return openPermEditor(a, kind === 'approve' ? 'approve' : 'edit');
  if (kind === 'reject')  return adminSimple('rejectAdmin', a, `${a.status === 'Approved' ? 'Revoke access for' : 'Reject'} ${a.fullName}? They will not be able to log in to the admin panel.`, 'Updated.');
  if (kind === 'delete')  return adminSimple('deleteAdmin', a, `DELETE the account for ${a.fullName} (${a.email})?\n\nThis cannot be undone.`, '🗑️ Deleted.');
  if (kind === 'resetpw') return resetAdminPw(a);
}

async function adminSimple(action, a, confirmMsg, doneMsg) {
  if (!confirm(confirmMsg)) return;
  try {
    const d = await callSheets({ action, adminID: a.adminID });
    if (d.success) { toast(doneMsg); loadAdmins(); } else alert(d.message || 'Failed.');
  } catch(e) { alert('Error: ' + e.message); }
}

function openPermEditor(a, mode) {
  _permEdit = { id: a.adminID, mode };
  const hasPerms = (a.permissions || []).length > 0;
  document.getElementById('admin-perm-title').textContent = (mode === 'approve' ? 'Approve — ' : 'Edit access — ') + a.fullName;
  document.getElementById('admin-perm-info').textContent = mode === 'approve'
    ? 'Choose which sections they can open, then approve. You can change this later.'
    : 'Tick the sections this sub-admin can open. Changes apply the next time their page loads.';
  document.getElementById('admin-perm-save').textContent = mode === 'approve' ? '✅ Approve with this access' : '💾 Save access';
  renderPermGrid('admin-perm-grid', mode === 'approve' && !hasPerms ? DEFAULT_SUB_PERMS : a.permissions);
  const card = document.getElementById('admin-perm-card');
  card.style.display = 'block';
  card.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function closePermEditor() { _permEdit = null; document.getElementById('admin-perm-card').style.display = 'none'; }

async function savePermEditor() {
  if (!_permEdit) return;
  const permissions = collectPerms('admin-perm-grid');
  if (_permEdit.mode === 'approve' && !permissions.length && !confirm('No sections ticked — they will be able to log in but see nothing. Approve anyway?')) return;
  try {
    const d = await callSheets({ action: _permEdit.mode === 'approve' ? 'approveAdmin' : 'setAdminPermissions', adminID: _permEdit.id, permissions });
    if (d.success) { toast(_permEdit.mode === 'approve' ? '✅ Approved.' : '✅ Access updated.'); closePermEditor(); loadAdmins(); }
    else alert(d.message || 'Failed.');
  } catch(e) { alert('Error: ' + e.message); }
}

async function resetAdminPw(a) {
  const pw = prompt(`Set a new password for ${a.fullName} (min. 8 characters).\nShare it with them privately.`);
  if (pw === null) return;
  if (pw.length < 8) { alert('Password must be at least 8 characters.'); return; }
  try {
    const d = await callSheets({ action:'resetAdminPassword', adminID: a.adminID, newPassword: pw });
    if (d.success) toast('🔑 Password reset.'); else alert(d.message || 'Failed.');
  } catch(e) { alert('Error: ' + e.message); }
}

async function createSubAdmin() {
  const fullName = document.getElementById('new-sub-name').value.trim();
  const email    = document.getElementById('new-sub-email').value.trim().toLowerCase();
  const password = document.getElementById('new-sub-pass').value;
  const permissions = collectPerms('new-sub-perms');
  if (!fullName) { alert('Please enter a full name.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Please enter a valid email address.'); return; }
  if (password.length < 8) { alert('Password must be at least 8 characters.'); return; }
  if (!confirm(`Create sub-admin ${fullName} (${email}) with access to ${permissions.length} section(s)?`)) return;
  try {
    const d = await callSheets({ action:'createAdmin', fullName, email, password, permissions });
    if (d.success) {
      toast('✅ Sub-admin created.');
      ['new-sub-name','new-sub-email','new-sub-pass'].forEach(id => document.getElementById(id).value = '');
      renderPermGrid('new-sub-perms', DEFAULT_SUB_PERMS);
      loadAdmins();
    } else alert(d.message || 'Failed.');
  } catch(e) { alert('Error: ' + e.message); }
}

// ═══════════════════════════════════════

// UTILS

// ═══════════════════════════════════════
function escH(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.getElementById('toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
}

// ═══════════════════════════════════════


function buildAnswerSheetHtml(row, listeningKey, readingKey) {
  const cid       = row[2]  || '—';
  const fname     = row[3]  || '—';
  const testSet   = row[5]  || '—';
  const dateStr   = formatDate(row[1]);
  const examType  = row[24] || 'IELTS';
  let lAnswers = {}, rAnswers = {};
  try { lAnswers = JSON.parse(row[22] || '{}'); } catch(e) {}
  try { rAnswers = JSON.parse(row[23] || '{}'); } catch(e) {}
  const w1Text = row[17] || '';
  const w2Text = row[18] || '';
  const w1WC   = row[15] || 0;
  const w2WC   = row[16] || 0;

  const answerTable = (given, key, label) => {
    const allQ = new Set([...Object.keys(given||{}), ...Object.keys(key||{})]);
    const nums = Array.from(allQ).map(Number).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
    if (!nums.length) return `<p style="color:#999;font-size:9pt">No ${label} answers submitted.</p>`;
    let correctCount = 0;
    let rows = nums.map(n => {
      const a = String(given[n]||'—');
      const rawKey = key[n];
      const k = rawKey !== undefined ? rawKey : null;
      const alternates = Array.isArray(k) ? k : (k===null?[]:[k]);
      const correct = k !== null && alternates.some(alt => String(alt||'').trim().toLowerCase() === a.trim().toLowerCase());
      if (correct) correctCount++;
      const kDisplay = k===null ? '—' : (Array.isArray(k) ? k.join(' / ') : String(k));
      const markColor = k === null ? '#999' : (correct ? '#2e7d4f' : '#c0392b');
      const mark = k === null ? '' : (correct ? '✓' : '✗');
      return `<td class="as-q">${n}</td><td class="as-a">${escH(a)}</td><td class="as-k">${escH(kDisplay)}</td><td class="as-m" style="color:${markColor}">${mark}</td>`;
    });
    // 2 questions per printed row, side by side, to keep this compact on paper
    let out = `<div class="as-section-head">${label} <span class="as-score">${key && Object.keys(key).length ? correctCount + ' / ' + nums.length + ' correct' : ''}</span></div><table class="as-table"><thead><tr><th colspan="4">Q#</th><th colspan="4">Q#</th></tr></thead><tbody>`;
    for (let i = 0; i < rows.length; i += 2) {
      out += `<tr>${rows[i]}${rows[i+1] || '<td></td><td></td><td></td><td></td>'}</tr>`;
    }
    out += '</tbody></table>';
    return out;
  };

  const writingBlock = (text, wc, label) => `
    <div class="as-section-head">${label} <span class="as-score">${wc ? wc + ' words' : ''}</span></div>
    <div class="as-writing-box">${text ? escH(text).replace(/\n/g,'<br>') : '<span style="color:#999">No response submitted.</span>'}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Answer Sheet — ${fname}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans',Arial,sans-serif;background:#fff;color:#111;font-size:10pt}
  @page{size:A4 portrait;margin:14mm}
  @media print{.no-print{display:none!important}}
  .page{max-width:720px;margin:0 auto}
  .hdr{border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
  .hdr h1{font-size:15pt}
  .hdr .meta{font-size:8.5pt;color:#555;text-align:right;line-height:1.5}
  .as-section-head{font-weight:700;font-size:10pt;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1.5px solid #000;padding-bottom:4px;margin:16px 0 8px;display:flex;justify-content:space-between;align-items:baseline}
  .as-score{font-weight:600;font-size:9pt;color:#002f5f}
  .as-table{width:100%;border-collapse:collapse;font-size:8.5pt}
  .as-table th{font-size:7pt;color:#888;text-transform:uppercase;text-align:left;padding:3px 6px;border-bottom:1px solid #ccc}
  .as-table td{padding:4px 6px;border-bottom:1px solid #eee}
  .as-q{font-weight:700;width:26px;color:#555}
  .as-a{width:70px}
  .as-k{width:70px;color:#555}
  .as-m{width:22px;font-weight:700;text-align:center}
  .as-writing-box{border:1px solid #ccc;border-radius:4px;padding:10px 12px;font-size:9pt;line-height:1.6;min-height:60px;white-space:pre-wrap}
  .print-btn{position:fixed;top:14px;right:14px;padding:9px 16px;background:#002f5f;color:#fff;border:none;border-radius:7px;font-size:0.85rem;cursor:pointer}
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 Print</button>
<div class="page">
  <div class="hdr">
    <h1>Answer Sheet</h1>
    <div class="meta">
      <div><b>${escH(fname)}</b> (${escH(cid)})</div>
      <div>${escH(testSet)} · ${examType} · ${dateStr}</div>
    </div>
  </div>
  ${answerTable(lAnswers, listeningKey, 'Listening')}
  ${answerTable(rAnswers, readingKey, 'Reading')}
  ${examType === 'IELTS' ? writingBlock(w1Text, w1WC, 'Writing — Task 1') + writingBlock(w2Text, w2WC, 'Writing — Task 2') : ''}
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════
// ANSWER REVIEW (👁 Answers on the Scores table)
// ═══════════════════════════════════════
function ensureAnswerModal() {
  if (document.getElementById('answer-modal')) return;
  const div = document.createElement('div');
  div.id = 'answer-modal';
  div.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:99999;align-items:center;justify-content:center;padding:24px';
  div.innerHTML = `<div>
    <div>
      <h3 id="answer-modal-title"></h3>
      <button class="btn btn-ghost" data-click="document.getElementById('answer-modal').style.display='none'">✕ Close</button>
    </div>
    <div id="answer-modal-body"></div>
  </div>`;
  document.body.appendChild(div);
}
function showAnswerModal(title, bodyHtml) {
  ensureAnswerModal();
  document.getElementById('answer-modal-title').textContent = title;
  document.getElementById('answer-modal-body').innerHTML = bodyHtml;
  document.getElementById('answer-modal').style.display = 'flex';
}

// Compares one candidate's submitted answers with the saved key, question by question (same rules as the server's grader).
async function viewCandidateAnswers(submissionID) {
  const row = _scoreRows.find(r => r[0] === submissionID);
  if (!row) { toast('❌ Submission not found.'); return; }
  const candidateName = row[3] || row[2] || 'Candidate';
  showAnswerModal('Answers — ' + candidateName, '⏳ Loading...');
  let lAnswers = {}, rAnswers = {};
  try { lAnswers = JSON.parse(row[22] || '{}'); } catch(e) {}
  try { rAnswers = JSON.parse(row[23] || '{}'); } catch(e) {}

  let listeningKey = {}, readingKey = {}, keyMsg = '';
  try {
    const data = await callSheets({ action:'getAnswerKey', testSetID: row[4] || '' });
    if (data.success) { listeningKey = data.listeningKey || {}; readingKey = data.readingKey || {}; }
    else keyMsg = '<p>No saved answer key to compare against — showing submitted answers only.</p>';
  } catch (e) {
    keyMsg = '<p>Could not load the answer key to compare: ' + escH(e.message) + '</p>';
  }

  const cell = 'padding:4px 8px;border:1px solid var(--paper3)';
  const compareTable = (given, key, label) => {
    const allQ = new Set([...Object.keys(given||{}), ...Object.keys(key||{})]);
    const nums = Array.from(allQ).map(Number).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
    if (!nums.length) return `<p>No ${label} answers submitted.</p>`;
    let correctCount = 0;
    const body = nums.map(n => {
      const a = String(given[n]||'—');
      const k = key[n] !== undefined ? key[n] : null;
      const alternates = Array.isArray(k) ? k : (k===null?[]:[k]);
      const correct = k !== null && a.trim() !== '' && alternates.some(alt => String(alt||'').trim().toLowerCase() === a.trim().toLowerCase());
      if (correct) correctCount++;
      const kDisplay = k===null ? '—' : (Array.isArray(k) ? k.join(' / ') : String(k));
      const color = k === null ? 'var(--ink3)' : (correct ? '#1a7a4c' : 'var(--red)');
      const mark = k === null ? '' : (correct ? '✓' : '✗');
      return `<tr><td>${n}</td><td>${escH(a)}</td><td>${escH(kDisplay)}</td><td>${mark}</td></tr>`;
    }).join('');
    const hasKey = key && Object.keys(key).length;
    return `<h4>${label}${hasKey ? ` <span>— ${correctCount} / ${nums.length} correct</span>` : ''}</h4>
      <table><thead><tr>
        <th>Q#</th><th>Candidate's Answer</th><th>Correct Answer</th><th></th>
      </tr></thead><tbody>${body}</tbody></table>`;
  };

  showAnswerModal('Answers — ' + candidateName,
    keyMsg + `<div>${compareTable(lAnswers, listeningKey, 'Listening')}${compareTable(rAnswers, readingKey, 'Reading')}</div>`);
}


// ═══════════════════════════════════════
// DELETE SCORE HISTORY (owner only, permanent — the server also writes every deletion to its audit log)
// ═══════════════════════════════════════
async function deleteScoreRow(submissionID) {
  const r = _scoreRows.find(x => x[0] === submissionID);
  if (!r) { toast('❌ Submission not found — refresh the list.'); return; }
  if (!confirm(`Delete this score PERMANENTLY?\n\nCandidate: ${r[3] || ''} (${r[2] || ''})\nTest: ${r[5] || r[4] || '—'}\nSubmitted: ${formatDate(r[1])}\n\nThis cannot be undone.`)) return;
  try {
    const d = await callSheets({ action: 'deleteScore', submissionID });
    if (d.success) {
      _scoreRows = _scoreRows.filter(x => x[0] !== submissionID);
      const st = document.getElementById('scores-status'); if (st) st.textContent = `✅ ${_scoreRows.length} submissions`;
      filterScores();
      toast('🗑️ Score deleted.');
    } else alert(d.message || 'Could not delete.');
  } catch (e) { alert('Error: ' + e.message); }
}

// Dialog: pick a candidate (and optionally one test), see exactly what will go, type DELETE to confirm.
async function openClearHistory(candidateID) {
  if (!_scoreRows.length) { try { await loadScores(); } catch (e) {} }
  const old = document.getElementById('clear-history-modal'); if (old) old.remove();
  const ids = [...new Set(_scoreRows.map(r => r[2]).filter(Boolean))].sort();
  const ov = document.createElement('div');
  ov.id = 'clear-history-modal';
  ov.className = 'overlay';
  ov.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">
    <div class="dialog-head"><div class="dialog-icon bad">🗑️</div><div class="dialog-title">Delete score history</div></div>
    <div class="dialog-body stack">
      <p class="muted">Permanently removes test results. The candidate's account is not touched. <b>Tip:</b> use “Export PDF” on the Scores page first if you may need a copy.</p>
      <div class="field"><label>Candidate ID</label>
        <input class="input" type="text" id="ch-cid" list="ch-cid-list" placeholder="e.g. CWA-01234" autocomplete="off">
        <datalist id="ch-cid-list">${ids.map(i => `<option value="${escH(i)}">`).join('')}</datalist></div>
      <div class="field"><label>Which results?</label><select class="select" id="ch-set"><option value="">All of this candidate's tests</option></select></div>
      <div id="ch-preview" class="muted"></div>
      <div class="field"><label>Type <b>DELETE</b> to confirm</label><input class="input" type="text" id="ch-confirm" autocomplete="off" placeholder="DELETE"></div>
      <div id="ch-msg"></div>
    </div>
    <div class="dialog-foot">
      <button class="btn btn-ghost" id="ch-cancel">Cancel</button>
      <button class="btn btn-danger" id="ch-go" disabled>🗑️ Delete permanently</button></div></div>`;
  document.body.appendChild(ov);
  const $ = id => ov.querySelector('#' + id);
  const matching = () => {
    const cid = $('ch-cid').value.trim().toUpperCase(), sid = $('ch-set').value;
    return _scoreRows.filter(r => String(r[2]).toUpperCase() === cid && (!sid || r[4] === sid));
  };
  const refresh = (rebuildSets) => {
    const cid = $('ch-cid').value.trim().toUpperCase();
    if (rebuildSets) {
      const sets = new Map(); _scoreRows.filter(r => String(r[2]).toUpperCase() === cid).forEach(r => sets.set(r[4], r[5] || r[4]));
      const keep = $('ch-set').value;
      $('ch-set').innerHTML = '<option value="">All of this candidate\'s tests</option>' + [...sets].map(([id, n]) => `<option value="${escH(id)}">${escH(n)}</option>`).join('');
      if (sets.has(keep)) $('ch-set').value = keep;
    }
    const rows = matching();
    $('ch-preview').innerHTML = !cid ? 'Enter a candidate ID.'
      : !rows.length ? `No score history found for <b>${escH(cid)}</b>${$('ch-set').value ? ' in that test' : ''}.`
      : `<b>${rows.length}</b> submission${rows.length === 1 ? '' : 's'} for <b>${escH(rows[0][3] || cid)}</b> will be deleted:<br>` +
        rows.slice(0, 8).map(r => `• ${escH(r[5] || r[4] || 'Test')} — ${escH(formatDate(r[1]))}`).join('<br>') + (rows.length > 8 ? `<br>…and ${rows.length - 8} more` : '');
    $('ch-go').disabled = !(rows.length && $('ch-confirm').value.trim() === 'DELETE');
  };
  $('ch-cid').value = (candidateID || '').toUpperCase();
  $('ch-cid').oninput = () => refresh(true); $('ch-set').onchange = () => refresh(false); $('ch-confirm').oninput = () => refresh(false);
  $('ch-cancel').onclick = () => ov.remove();
  $('ch-go').onclick = async () => {
    const cid = $('ch-cid').value.trim().toUpperCase(), sid = $('ch-set').value;
    $('ch-go').disabled = true; $('ch-go').textContent = 'Deleting…'; $('ch-msg').textContent = '';
    try {
      const d = await callSheets({ action: 'deleteCandidateScores', candidateID: cid, testSetID: sid || undefined });
      if (d.success) {
        ov.remove();
        toast('🗑️ ' + (d.message || 'Deleted.'));
        try { await loadScores(); } catch (e) {}
      } else { $('ch-msg').textContent = d.message || 'Could not delete.'; $('ch-go').textContent = '🗑️ Delete permanently'; refresh(false); }
    } catch (e) { $('ch-msg').textContent = e.message; $('ch-go').textContent = '🗑️ Delete permanently'; refresh(false); }
  };
  refresh(true);
  (candidateID ? $('ch-confirm') : $('ch-cid')).focus();
}
