// Bind only controls rendered by the current page. Setting the property preserves
// handler replacement when a view is rebuilt.
function setControlHandler(id, event, handler) {
  const control = document.getElementById(id);
  if (control) control[event] = handler;
}

// Same-origin PHP API; session and CSRF checks are enforced on the server.
const SCRIPT_URL = 'api.php';
const ONLINE = true;
const POLL_MS = 30000; // refresh visible, idle tabs every 30 seconds

const KEY = 'resBooking_v1';
const COLORS = [
  '#f26a21',
  '#171717',
  '#9b4d22',
  '#d55313',
  '#745b4e',
  '#ad3f18',
  '#4b4b4b',
  '#8a6a59',
  '#e88b55',
  '#303030',
];
const DAYW = 34;
const REMOVED_NAMES = new Set(['Sameer Hussain', 'Fahad Ali Shah', 'Syed Aun Raza']);
function sanitizeState(o) {
  if (!o) return o;
  if (!Array.isArray(o.leaves)) o.leaves = [];
  if (!Array.isArray(o.entries)) o.entries = [];
  if (!Array.isArray(o.entityPricing))
    o.entityPricing = Array.isArray(o.clientPricing)
      ? o.clientPricing.map((x) => ({
          entity: x.entity || x.client,
          designation: x.designation,
          rate: x.rate,
        }))
      : [];
  if (!Array.isArray(o.crossPodEntries)) o.crossPodEntries = [];
  if (!Array.isArray(o.importLogs)) o.importLogs = [];
  if (!Array.isArray(o.configPermissions)) o.configPermissions = [];
  if (!Array.isArray(o.billingRoster))
    o.billingRoster = Array.isArray(o.roster)
      ? o.roster.map((r) => ({ id: r.id, name: r.name, pod: r.pod }))
      : [];
  o.entries.forEach((e) => {
    if (e.bookingId === undefined) e.bookingId = '';
    if (!e.billingTo) e.billingTo = e.personId;
  });
  if (!o.settings) o.settings = {};
  if (Array.isArray(o.roster)) o.roster = o.roster.filter((p) => !REMOVED_NAMES.has(p.name));
  if (Array.isArray(o.bookings)) {
    o.bookings.forEach((b) => {
      if (!b.status) b.status = 'confirmed';
      if (!b.stage) b.stage = '';
      if (!b.firm) b.firm = 'Reckoner';
    });
  }
  if (Array.isArray(o.roster)) {
    const ids = new Set(o.roster.map((p) => p.id));
    if (Array.isArray(o.bookings)) o.bookings = o.bookings.filter((b) => ids.has(b.personId));
    o.leaves = o.leaves.filter((l) => ids.has(l.personId));
    o.entries = o.entries.filter((e) => ids.has(e.personId));
  }
  return o;
}

const seedRoster = [
  ['RA-003', 'Assurance Allies', 'Muhammad Zeeshan Khan', 'Manager'],
  ['RA-018', 'Assurance Allies', 'Saqib Ali', 'Assistant Manager'],
  ['RA-079', 'Assurance Allies', 'Abid Wahab', 'Trainee'],
  ['RA-082', 'Assurance Allies', 'Mehak Mehmood', 'Semi Senior Audit Associate'],
  ['RA-002', 'Audit Guild', 'Ibrar Ghani', 'Manager'],
  ['RA-047', 'Audit Guild', 'Zaynab Javed', 'Semi Senior Audit Associate'],
  ['RA-053', 'Audit Guild', 'Ali Haider', 'Semi Senior Audit Associate'],
  ['RA-069', 'Audit Guild', 'Amna Saleem', 'Trainee'],
  ['RA-006', 'Audit Guild', 'Ahmed Akhtar', 'Senior Audit Associate'],
  ['RA-005', 'Audit Guild', 'Malik Jamal Ahmed', 'Semi Senior Audit Associate'],
  ['RA-077', 'Audit Guild', 'Zohaib Khalid', 'Trainee'],
  ['RA-014', 'Audit Mavericks', 'Danial Qureshi', 'Manager'],
  ['RA-021', 'Audit Mavericks', 'Muhammad Awais', 'Assistant Manager'],
  ['RA-063', 'Audit Mavericks', 'Syed Saqib Shah', 'Manager'],
  ['RA-040', 'Audit Mavericks', 'Arqam Shoaib', 'Assistant Manager'],
  ['RA-064', 'Audit Mavericks', 'Fatima Aamir', 'Semi Senior Audit Associate'],
  ['RA-045', 'Audit Mavericks', 'Muhammad Huzaifa', 'Trainee'],
  ['RA-055', 'Audit Mavericks', 'Farrukh', 'Manager'],
  ['RA-036', 'Audit Mavericks', 'Ali Raza', 'Semi Senior Audit Associate'],
  ['RA-087', 'Audit Mavericks', 'Kiran Batool', 'Trainee'],
  ['RA-124', 'Audit Mavericks', 'Umaar Qasim', 'Semi Senior Audit Associate'],
];

let state = null,
  modalOpen = false,
  dragging = false,
  settingsTimer = null;

/* ---------- data layer ---------- */
function defaults() {
  return {
    roster: seedRoster.map((r) => ({ id: r[0], pod: r[1], name: r[2], role: r[3] })),
    bookings: [],
    leaves: [],
    entries: [],
    settings: {
      start: '2026-06-01',
      end: '2026-07-31',
      asOf: todayISO(),
      soonDays: 3,
      adminPwd: '',
    },
  };
}
function loadLocal() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const o = sanitizeState(JSON.parse(s));
      if (o.roster) {
        localStorage.setItem(KEY, JSON.stringify(o));
        return o;
      }
    }
  } catch (e) {}
  return defaults();
}
function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}
async function api(action, payload) {
  const req = { action, payload: payload || {} };
  if (state && state.csrf) req.csrf = state.csrf;
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid API response', raw);
    throw new Error(
      'The server returned an invalid response. Check the local Apache/PHP log for details.',
    );
  }
  if (!res.ok || data.ok === false) {
    const msg = data.error || 'The server could not complete that request.';
    if (
      ![
        'bootstrap',
        'getAll',
        'login',
        'verifyMfa',
        'resendMfa',
        'requestPasswordReset',
        'resetForgottenPassword',
        'importEntries',
      ].includes(action)
    )
      alert(msg);
    const error = new Error(msg);
    if (Array.isArray(data.errors)) error.details = data.errors;
    throw error;
  }
  return data;
}
async function pullAll() {
  try {
    if (!session) return;
    const d = await api('getAll');
    if (d && d.roster) state = sanitizeState(d);
  } catch (e) {
    return;
  }
  render();
  syncInputs();
}
async function pushBooking(b) {
  if (ONLINE) await api('upsertBooking', b);
  else {
    const i = state.bookings.findIndex((x) => x.id === b.id);
    if (i >= 0) state.bookings[i] = b;
    else state.bookings.push(b);
    saveLocal();
  }
}
async function removeBooking(id) {
  if (ONLINE) await api('deleteBooking', { id });
  else {
    state.bookings = state.bookings.filter((b) => b.id !== id);
    saveLocal();
  }
}
async function pushPerson(p) {
  if (ONLINE) return await api('addPerson', p);
  state.roster.push(p);
  saveLocal();
  return { ok: true };
}
async function updatePerson(p) {
  if (ONLINE) await api('updatePerson', p);
  else {
    const i = state.roster.findIndex((x) => x.id === p.id);
    if (i >= 0) state.roster[i] = p;
    saveLocal();
  }
}
async function removePerson(id) {
  if (ONLINE) await api('deletePerson', { id });
  else {
    state.roster = state.roster.filter((p) => p.id !== id);
    state.bookings = state.bookings.filter((b) => b.personId !== id);
    state.leaves = state.leaves.filter((l) => l.personId !== id);
    saveLocal();
  }
}
async function pushLeave(l) {
  if (ONLINE) await api('upsertLeave', l);
  else {
    const i = state.leaves.findIndex((x) => x.id === l.id);
    if (i >= 0) state.leaves[i] = l;
    else state.leaves.push(l);
    saveLocal();
  }
}
async function removeLeave(id) {
  if (ONLINE) await api('deleteLeave', { id });
  else {
    state.leaves = state.leaves.filter((l) => l.id !== id);
    saveLocal();
  }
}
async function pushEntry(e) {
  const i = state.entries.findIndex((x) => x.id === e.id);
  if (i >= 0) state.entries[i] = e;
  else state.entries.push(e);
  if (ONLINE) await api('upsertEntry', e);
  else saveLocal();
}
async function removeEntry(id) {
  if (ONLINE) await api('deleteEntry', { id });
  state.entries = state.entries.filter((e) => e.id !== id);
  if (!ONLINE) saveLocal();
}
async function batchEntries(upsert = [], deleteIds = []) {
  const pending = ONLINE ? api('batchEntries', { upsert, deleteIds }) : Promise.resolve();
  pendingTimesheetSaves.add(pending);
  try {
    await pending;
  } finally {
    pendingTimesheetSaves.delete(pending);
  }
  if (deleteIds.length) {
    const removed = new Set(deleteIds);
    state.entries = state.entries.filter((e) => !removed.has(e.id));
  }
  upsert.forEach((e) => {
    const i = state.entries.findIndex((x) => x.id === e.id);
    if (i >= 0) state.entries[i] = e;
    else state.entries.push(e);
  });
  if (!ONLINE) saveLocal();
}
async function pushSettings() {
  if (ONLINE) await api('saveSettings', state.settings);
  else saveLocal();
}
async function replaceAll(o) {
  o = sanitizeState(o);
  if (ONLINE) await api('replaceAll', o);
  else {
    state = o;
    saveLocal();
  }
}

/* ---------- date helpers ---------- */
function todayISO() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
// Excel dates have no timezone. Preserve the calendar date at UTC midnight.
function excelDate(value) {
  const [y, m, d] = (value instanceof Date ? iso(value) : value).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dayDiff(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}
function isWknd(d) {
  return d.getDay() === 0 || d.getDay() === 6;
}
function fmt(s) {
  return parse(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function rangeDates() {
  const out = [],
    s = parse(state.settings.start),
    e = parse(state.settings.end);
  for (let d = new Date(s); d <= e; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}
function pods() {
  return [...new Set(state.roster.map((p) => p.pod))];
}
function clients() {
  return [...new Set(state.bookings.map((b) => b.client))].filter(Boolean).sort();
}
function clientColor(c) {
  const b = state.bookings.find((x) => x.client === c && x.color);
  return b ? b.color : COLORS[0];
}
function isPotential(b) {
  return b && b.status === 'potential';
}
function bookingLabel(b) {
  return b.client + (b.stage ? ' · ' + b.stage : '') + (b.note ? ' · ' + b.note : '');
}
function bookingTitle(b) {
  return (
    (isPotential(b) ? 'Potential booking: ' : 'Confirmed booking: ') +
    bookingLabel(b) +
    ` (${fmt(b.start)}–${fmt(b.end)})`
  );
}
function typeLabel(type) {
  return type === 'potential' ? 'POTENTIAL' : type === 'mixed' ? 'MIXED' : 'CONFIRMED';
}
function leaveLabel(l) {
  return 'LEAVE · ' + (l.type || 'Other') + (l.note ? ' · ' + l.note : '');
}
function leaveTitle(l) {
  const r = state.roster.find((x) => x.id === l.personId);
  return (
    `${r ? r.name : '?'} — ${l.type || 'Other'} leave (${fmt(l.start)}–${fmt(l.end)})` +
    (l.note ? ' · ' + l.note : '')
  );
}
function personOnLeave(pid, dateISO) {
  return state.leaves.filter((l) => l.personId === pid && l.start <= dateISO && l.end >= dateISO);
}

function personStatus(pid) {
  const as = state.settings.asOf,
    soon = +state.settings.soonDays;
  const onLv = personOnLeave(pid, as);
  if (onLv.length) {
    const maxEnd = onLv.reduce((m, l) => (l.end > m ? l.end : m), onLv[0].end);
    return {
      state: 'leave',
      until: maxEnd,
      daysLeft: dayDiff(as, maxEnd),
      client: 'On leave (' + onLv.map((l) => l.type || 'Other').join(', ') + ')',
    };
  }
  const bs = state.bookings.filter((b) => b.personId === pid);
  const active = bs.filter((b) => b.start <= as && b.end >= as);
  const confirmedActive = active.filter((b) => !isPotential(b));
  const potentialActive = active.filter(isPotential);
  if (confirmedActive.length) {
    const maxEnd = confirmedActive.reduce(
      (m, b) => (b.end > m ? b.end : m),
      confirmedActive[0].end,
    );
    const left = dayDiff(as, maxEnd);
    return {
      state: left <= soon ? 'soon' : 'busy',
      until: maxEnd,
      daysLeft: left,
      client: confirmedActive.map((a) => a.client).join(', '),
    };
  }
  if (potentialActive.length) {
    const maxEnd = potentialActive.reduce(
      (m, b) => (b.end > m ? b.end : m),
      potentialActive[0].end,
    );
    const left = dayDiff(as, maxEnd);
    return {
      state: 'potential',
      until: maxEnd,
      daysLeft: left,
      client: potentialActive.map((a) => a.client).join(', '),
    };
  }
  const future = bs.filter((b) => b.start > as).sort((a, b) => (a.start < b.start ? -1 : 1));
  return {
    state: 'free',
    until: null,
    nextStart: future[0] ? future[0].start : null,
    nextClient: future[0]
      ? future[0].client + (isPotential(future[0]) ? ' (potential)' : '')
      : null,
  };
}

/* ---------- render ---------- */
function render() {
  if (document.getElementById('gantt')?.classList.contains('show')) {
    const box = document.getElementById('ganttBox');
    const sl = box.scrollLeft,
      st = box.scrollTop;
    buildGantt();
    box.scrollLeft = sl;
    box.scrollTop = st;
  }
  if (document.getElementById('dash')?.classList.contains('show')) buildDash();
  if (document.getElementById('leaves')?.classList.contains('show')) buildAttendance();
  if (document.getElementById('weeklyhours')?.classList.contains('show')) buildWeeklyHours();
  if (
    document.getElementById('variance')?.classList.contains('show') &&
    typeof buildVariance === 'function'
  )
    buildVariance();
  if (
    ['mysheet', 'importhistory', 'bookingcontext'].some((id) =>
      document.getElementById(id)?.classList.contains('show'),
    ) &&
    typeof buildMySheet === 'function'
  )
    buildMySheet();
  if (
    document.getElementById('firms')?.classList.contains('show') &&
    typeof buildFirms === 'function'
  )
    buildFirms();
  if (
    document.getElementById('crosspod')?.classList.contains('show') &&
    typeof buildCrossPod === 'function'
  )
    buildCrossPod();
  if (
    document.getElementById('tsdashboard')?.classList.contains('show') &&
    typeof buildTimesheetDashboard === 'function'
  )
    buildTimesheetDashboard();
  if (document.getElementById('masterdata')?.classList.contains('show')) buildMasterData();
  if (document.getElementById('kpiengine')?.classList.contains('show')) buildKpiEngine();
  if (document.getElementById('clientview')?.classList.contains('show')) buildClientView();
  if (document.getElementById('auditcheck')?.classList.contains('show')) buildAuditCheck();
  if (document.getElementById('workbookdashboard')?.classList.contains('show')) {
    buildWorkbookDashboard();
    personalizeEmployeeDashboard();
  }
  if (
    document.getElementById('config')?.classList.contains('show') ||
    document.getElementById('access')?.classList.contains('show')
  )
    buildConfig();
}
function buildGantt() {
  const box = document.getElementById('ganttBox');
  const dates = rangeDates();
  const W = dates.length * DAYW;
  let h = `<div class="grow ghead"><div class="glabel">Staff (${state.roster.length})</div><div class="gtrack" style="cursor:default"><div class="gdays" style="width:${W}px">`;
  dates.forEach((d) => {
    h += `<div class="gday ${isWknd(d) ? 'wknd' : ''}" style="width:${DAYW}px">${d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}<b>${d.getDate()}</b></div>`;
  });
  h += `</div></div></div>`;
  const as = state.settings.asOf;
  const asOff =
    as >= state.settings.start && as <= state.settings.end ? dayDiff(state.settings.start, as) : -1;
  pods().forEach((p) => {
    h += `<div class="podhead">${p}</div>`;
    state.roster
      .filter((r) => r.pod === p)
      .forEach((r) => {
        const st2 = personStatus(r.id);
        h += `<div class="grow podrow"><div class="glabel person" data-pid="${r.id}" title="Click to edit / remove ${r.name}"><span class="nm"><span class="statusdot ${st2.state}"></span>${r.name}</span><span class="rl">${r.role}</span></div><div class="gtrack" data-pid="${r.id}" style="width:${W}px">`;
        dates.forEach((d, i) => {
          h += `<div class="colcell ${isWknd(d) ? 'wknd' : ''}" style="left:${i * DAYW}px;width:${DAYW}px"></div>`;
        });
        if (asOff >= 0)
          h += `<div class="todayline" style="left:${asOff * DAYW + DAYW / 2}px"></div>`;
        const lvs = state.leaves.filter((l) => l.personId === r.id);
        lvs.forEach((l) => {
          const s = l.start < state.settings.start ? state.settings.start : l.start;
          const e = l.end > state.settings.end ? state.settings.end : l.end;
          if (l.end < state.settings.start || l.start > state.settings.end) return;
          const off = dayDiff(state.settings.start, s),
            span = dayDiff(s, e) + 1;
          h += `<div class="bar-l" style="left:${off * DAYW + 2}px;width:${span * DAYW - 4}px" data-lid="${l.id}" title="${leaveTitle(l)}">${leaveLabel(l)}</div>`;
        });
        const bs = state.bookings.filter((b) => b.personId === r.id);
        bs.forEach((b) => {
          const s = b.start < state.settings.start ? state.settings.start : b.start;
          const e = b.end > state.settings.end ? state.settings.end : b.end;
          if (e < state.settings.start || s > state.settings.end) return;
          const off = dayDiff(state.settings.start, s),
            span = dayDiff(s, e) + 1;
          const conflict =
            bs.some((o) => o.id !== b.id && o.start <= b.end && o.end >= b.start) ||
            lvs.some((l) => l.start <= b.end && l.end >= b.start);
          const lbl = bookingLabel(b);
          h += `<div class="bar-b ${isPotential(b) ? 'potential' : ''} ${conflict ? 'conflict' : ''}" style="left:${off * DAYW + 2}px;width:${span * DAYW - 4}px;--bar-color:${b.color}" data-bid="${b.id}" title="${bookingTitle(b)}">${lbl}</div>`;
        });
        h += `</div></div>`;
      });
  });
  box.innerHTML = h;
  attachTrackHandlers();
  buildTopCards();
}
function countStatuses() {
  let free = 0,
    soon = 0,
    busy = 0,
    potential = 0,
    leave = 0;
  state.roster.forEach((r) => {
    const s = personStatus(r.id).state;
    if (s === 'free') free++;
    else if (s === 'soon') soon++;
    else if (s === 'potential') potential++;
    else if (s === 'leave') leave++;
    else busy++;
  });
  return { free, soon, busy, potential, leave };
}
function buildTopCards() {
  const c = countStatuses();
  document.getElementById('topCards').innerHTML = `
   <div class="card"><div class="n">${state.roster.length}</div><div class="l">Staff</div></div>
   <div class="card busy"><div class="n">${c.busy}</div><div class="l">Confirmed booked on ${fmt(state.settings.asOf)}</div></div>
   <div class="card potential"><div class="n">${c.potential}</div><div class="l">Potentially reserved</div></div>
   <div class="card leave"><div class="n">${c.leave}</div><div class="l">On leave</div></div>
   <div class="card soon"><div class="n">${c.soon}</div><div class="l">Free within ${state.settings.soonDays}d</div></div>
   <div class="card free"><div class="n">${c.free}</div><div class="l">Free now</div></div>
   <div class="card"><div class="n">${clients().length}</div><div class="l">Clients</div></div>`;
}
function attachTrackHandlers() {
  document.querySelectorAll('.glabel.person').forEach((g) => {
    g.addEventListener('click', () => openPerson(g.dataset.pid));
  });
  document.querySelectorAll('.gtrack[data-pid]').forEach((tr) => {
    let startX = null,
      sel = null,
      pid = tr.dataset.pid;
    tr.addEventListener('pointerdown', (e) => {
      if (!isManager()) return;
      if (e.target.closest('.bar-b') || e.target.closest('.bar-l')) return;
      startX = e.offsetX;
      dragging = true;
      tr.setPointerCapture(e.pointerId);
      sel = document.createElement('div');
      sel.className = 'dragsel';
      tr.appendChild(sel);
    });
    tr.addEventListener('pointermove', (e) => {
      if (startX === null) return;
      const a = Math.min(startX, e.offsetX),
        b = Math.max(startX, e.offsetX);
      sel.style.left = a + 'px';
      sel.style.width = Math.max(DAYW, b - a) + 'px';
    });
    tr.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const a = Math.min(startX, e.offsetX),
        b = Math.max(startX, e.offsetX);
      const i1 = Math.floor(a / DAYW),
        i2 = Math.floor(b / DAYW);
      sel.remove();
      sel = null;
      startX = null;
      dragging = false;
      const ds = addDays(parse(state.settings.start), i1),
        de = addDays(parse(state.settings.start), i2);
      openBooking(null, { personId: pid, start: iso(ds), end: iso(de) });
    });
    tr.querySelectorAll('.bar-b').forEach((bar) => {
      bar.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openBooking(bar.dataset.bid);
      });
      bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    });
    tr.querySelectorAll('.bar-l').forEach((bar) => {
      bar.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openLeave(bar.dataset.lid);
      });
      bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    });
  });
}

/* ---------- booking modal ---------- */
let editId = null,
  selColor = COLORS[0];
function fillFirms() {
  const el = document.getElementById('firmList');
  if (!el) return;
  const set = [
    ...new Set(TS_CFG.firmList.concat(state.bookings.map((b) => b.firm).filter(Boolean))),
  ];
  el.innerHTML = set.map((f) => `<option value="${f}">`).join('');
}
function refreshSelects() {
  fillFirms();
  document.getElementById('bPerson').innerHTML = state.roster
    .map((r) => `<option value="${safe(r.id)}">${safe(r.name)} — ${safe(r.pod)}</option>`)
    .join('');
  document.getElementById('lPerson').innerHTML = state.roster
    .map((r) => `<option value="${safe(r.id)}">${safe(r.name)} — ${safe(r.pod)}</option>`)
    .join('');
  document.getElementById('clientList').innerHTML = [
    ...new Set(refValues('client').concat(clients())),
  ]
    .map((c) => `<option value="${safe(c)}">`)
    .join('');
  document.getElementById('podList').innerHTML = [...new Set((state.pods || []).concat(pods()))]
    .sort()
    .map((p) => `<option value="${safe(p)}">`)
    .join('');
  document.getElementById('cfgEntityList').innerHTML = refValues('entity')
    .map((v) => `<option value="${safe(v)}">`)
    .join('');
}
function renderSwatches() {
  document.getElementById('bSwatches').innerHTML = COLORS.map(
    (c) =>
      `<div class="swatch ${c === selColor ? 'sel' : ''}" style="background:${c}" data-c="${c}"></div>`,
  ).join('');
  document.querySelectorAll('#bSwatches .swatch').forEach(
    (s) =>
      (s.onclick = () => {
        selColor = s.dataset.c;
        renderSwatches();
      }),
  );
}
function openBooking(bid, pre) {
  if (!isManager()) return;
  refreshSelects();
  editId = bid;
  modalOpen = true;
  document.getElementById('bWarn').classList.remove('show');
  if (bid) {
    const b = state.bookings.find((x) => x.id === bid);
    document.getElementById('bTitle').textContent = 'Edit booking';
    document.getElementById('bPerson').value = b.personId;
    document.getElementById('bClient').value = b.client;
    document.getElementById('bFirm').value = b.firm || TS_CFG.homeFirm;
    document.getElementById('bStatus').value = b.status || 'confirmed';
    document.getElementById('bStage').value = b.stage || '';
    document.getElementById('bStart').value = b.start;
    document.getElementById('bEnd').value = b.end;
    document.getElementById('bNote').value = b.note || '';
    selColor = b.color;
    document.getElementById('bDelete').style.display = 'inline-block';
  } else {
    document.getElementById('bTitle').textContent = 'Add booking';
    if (pre && pre.personId) document.getElementById('bPerson').value = pre.personId;
    document.getElementById('bClient').value = '';
    document.getElementById('bFirm').value = TS_CFG.homeFirm;
    document.getElementById('bStatus').value = 'confirmed';
    document.getElementById('bStage').value = '';
    document.getElementById('bStart').value = pre && pre.start ? pre.start : state.settings.asOf;
    document.getElementById('bEnd').value =
      pre && pre.end ? pre.end : pre && pre.start ? pre.start : state.settings.asOf;
    document.getElementById('bNote').value = '';
    selColor = COLORS[clients().length % COLORS.length];
    document.getElementById('bDelete').style.display = 'none';
  }
  renderSwatches();
  document.getElementById('bModal').classList.add('show');
}
function closeBooking() {
  document.getElementById('bModal').classList.remove('show');
  editId = null;
  modalOpen = false;
}
function flag(m) {
  const w = document.getElementById('bWarn');
  w.textContent = m;
  w.classList.add('show');
}

setControlHandler('bSave', 'onclick', async () => {
  const pid = document.getElementById('bPerson').value;
  const client = document.getElementById('bClient').value.trim();
  let s = document.getElementById('bStart').value,
    e = document.getElementById('bEnd').value;
  if (!client) {
    flag('Enter a client / assignment.');
    return;
  }
  if (!s || !e) {
    flag('Set start and end dates.');
    return;
  }
  if (e < s) {
    const t = s;
    s = e;
    e = t;
  }
  const existing = state.bookings.find((b) => b.client === client && b.color);
  const color = existing ? existing.color : selColor;
  const rec = {
    id: editId || 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
    personId: pid,
    client,
    firm: document.getElementById('bFirm').value.trim() || TS_CFG.homeFirm,
    status: document.getElementById('bStatus').value,
    stage: document.getElementById('bStage').value.trim(),
    start: s,
    end: e,
    note: document.getElementById('bNote').value.trim(),
    color,
  };
  closeBooking();
  await pushBooking(rec);
  await pullAll();
});
setControlHandler('bDelete', 'onclick', async () => {
  if (editId) {
    const id = editId;
    closeBooking();
    await removeBooking(id);
    await pullAll();
  }
});
setControlHandler('bCancel', 'onclick', closeBooking);
setControlHandler('addBookingBtn', 'onclick', () => openBooking(null, null));

/* ---------- person modal (add / edit / delete) ---------- */
let editPid = null;
function openPerson(pid) {
  if (!canConfig('employees')) return;
  refreshSelects();
  modalOpen = true;
  editPid = pid || null;
  document.getElementById('pWarn').classList.remove('show');
  if (pid) {
    const r = state.roster.find((x) => x.id === pid);
    if (!r) {
      editPid = null;
      return;
    }
    document.getElementById('pTitle').textContent = 'Edit person';
    document.getElementById('pEmpNo').value = r.id;
    document.getElementById('pEmpNo').readOnly = true;
    document.getElementById('pName').value = r.name;
    document.getElementById('pEmail').value = r.email || '';
    document.getElementById('pPod').value = r.pod;
    document.getElementById('pRole').value = r.role;
    document.getElementById('pAccess').value = r.accessRole || 'employee';
    document.getElementById('pActive').checked = !!r.active;
    document.getElementById('pEntity').value = r.entity || 'Reckoner';
    document.getElementById('pTarget').value = r.monthlyTarget || 160;
    document.getElementById('pRate').value = r.billingRate == null ? '' : r.billingRate;
    document.getElementById('pPwd').value = '';
    document.getElementById('pDelete').style.display = isAdmin() ? 'inline-block' : 'none';
    document.getElementById('pSave').textContent = 'Save';
  } else {
    document.getElementById('pTitle').textContent = 'Add person';
    document.getElementById('pEmpNo').value = '';
    document.getElementById('pEmpNo').readOnly = false;
    document.getElementById('pName').value = '';
    document.getElementById('pEmail').value = '';
    document.getElementById('pPod').value = isAdmin() ? '' : session.pod;
    document.getElementById('pRole').value = '';
    document.getElementById('pAccess').value = 'employee';
    document.getElementById('pActive').checked = false;
    document.getElementById('pEntity').value = 'Reckoner';
    document.getElementById('pTarget').value = state.settings.defaultMonthlyTarget || 160;
    document.getElementById('pRate').value = '';
    document.getElementById('pPwd').value = '';
    document.getElementById('pDelete').style.display = 'none';
    document.getElementById('pSave').textContent = 'Add';
  }
  document.getElementById('pPod').readOnly = !isAdmin();
  document.getElementById('pAccess').disabled = !isAdmin();
  document.getElementById('pActive').disabled = !isAdmin();
  document.getElementById('pEmail').readOnly = !isAdmin() && !!pid;
  document.getElementById('pModal').classList.add('show');
}
function closePerson() {
  document.getElementById('pModal').classList.remove('show');
  modalOpen = false;
  editPid = null;
}
setControlHandler('addPersonBtn', 'onclick', () => openPerson(null));
setControlHandler('pCancel', 'onclick', closePerson);
setControlHandler('pSave', 'onclick', async () => {
  const creating = !editPid;
  const name = document.getElementById('pName').value.trim();
  if (!name) {
    const w = document.getElementById('pWarn');
    w.textContent = 'Enter a name.';
    w.classList.add('show');
    return;
  }
  const email = document.getElementById('pEmail').value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    const w = document.getElementById('pWarn');
    w.textContent = 'Enter a valid email address.';
    w.classList.add('show');
    return;
  }
  const pod = document.getElementById('pPod').value.trim() || 'Unassigned';
  const role = document.getElementById('pRole').value.trim() || '—';
  const accessRole = document.getElementById('pAccess').value;
  const entity = document.getElementById('pEntity').value.trim() || 'Reckoner',
    monthlyTarget = Math.max(0, +document.getElementById('pTarget').value || 0),
    billingRate =
      document.getElementById('pRate').value === ''
        ? null
        : Math.max(0, +document.getElementById('pRate').value);
  const pid = editPid || document.getElementById('pEmpNo').value.trim().toUpperCase();
  if (!pid) {
    const w = document.getElementById('pWarn');
    w.textContent = 'Enter an employee number.';
    w.classList.add('show');
    return;
  }
  const pw = document.getElementById('pPwd').value.trim();
  if (pw && pw.length < 8) {
    const w = document.getElementById('pWarn');
    w.textContent = 'The password needs at least 8 characters.';
    w.classList.add('show');
    return;
  }
  const button = document.getElementById('pSave'),
    oldLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    if (!creating) {
      const rec = {
        id: pid,
        pod,
        name,
        email,
        role,
        accessRole,
        entity,
        monthlyTarget,
        billingRate,
        active: isAdmin() && document.getElementById('pActive').checked,
      };
      if (pw) rec.newPassword = pw;
      await updatePerson(rec);
    } else {
      const rec = {
        id: pid,
        pod,
        name,
        email,
        role,
        accessRole,
        entity,
        monthlyTarget,
        billingRate,
        active: isAdmin() && document.getElementById('pActive').checked,
      };
      if (pw) rec.newPassword = pw;
      const result = await pushPerson(rec);
      if (result && result.temporaryPassword)
        alert(
          `User created successfully.\n\nTemporary password: ${result.temporaryPassword}\n\nCopy this now and give it securely to ${name}. They will be required to change it after email verification.`,
        );
    }
    closePerson();
    await pullAll();
  } catch (error) {
    const w = document.getElementById('pWarn');
    w.textContent = error.message;
    w.classList.add('show');
  } finally {
    button.disabled = false;
    button.textContent = oldLabel;
  }
});
setControlHandler('pDelete', 'onclick', async () => {
  if (!editPid) return;
  const r = state.roster.find((x) => x.id === editPid);
  const nb = state.bookings.filter((b) => b.personId === editPid).length;
  const nl = state.leaves.filter((l) => l.personId === editPid).length;
  if (
    !confirm(
      `Remove ${r ? r.name : 'this person'} from the tracker? This also deletes their ${nb} booking(s) and ${nl} leave(s).`,
    )
  )
    return;
  const pid = editPid;
  closePerson();
  await removePerson(pid);
  await pullAll();
});

/* ---------- leave modal ---------- */
let editLid = null;
function openLeave(lid, pre) {
  if (!isManager()) return;
  refreshSelects();
  modalOpen = true;
  editLid = lid || null;
  document.getElementById('lWarn').classList.remove('show');
  if (lid) {
    const l = state.leaves.find((x) => x.id === lid);
    if (!l) {
      editLid = null;
      return;
    }
    document.getElementById('lTitle').textContent = 'Edit leave';
    document.getElementById('lPerson').value = l.personId;
    document.getElementById('lType').value = l.type || 'Other';
    document.getElementById('lStart').value = l.start;
    document.getElementById('lEnd').value = l.end;
    document.getElementById('lNote').value = l.note || '';
    document.getElementById('lDelete').style.display = 'inline-block';
  } else {
    document.getElementById('lTitle').textContent = 'Add leave';
    if (pre && pre.personId) document.getElementById('lPerson').value = pre.personId;
    document.getElementById('lType').value = 'Annual';
    document.getElementById('lStart').value = pre && pre.start ? pre.start : state.settings.asOf;
    document.getElementById('lEnd').value = pre && pre.end ? pre.end : state.settings.asOf;
    document.getElementById('lNote').value = '';
    document.getElementById('lDelete').style.display = 'none';
  }
  document.getElementById('lModal').classList.add('show');
}
function closeLeave() {
  document.getElementById('lModal').classList.remove('show');
  modalOpen = false;
  editLid = null;
}
function lflag(m) {
  const w = document.getElementById('lWarn');
  w.textContent = m;
  w.classList.add('show');
}
setControlHandler('addLeaveBtn', 'onclick', () => openLeave(null, null));
setControlHandler('lCancel', 'onclick', closeLeave);
setControlHandler('lSave', 'onclick', async () => {
  const pid = document.getElementById('lPerson').value;
  let s = document.getElementById('lStart').value,
    e = document.getElementById('lEnd').value;
  if (!pid) {
    lflag('Choose a person.');
    return;
  }
  if (!s || !e) {
    lflag('Set from and to dates.');
    return;
  }
  if (e < s) {
    const t = s;
    s = e;
    e = t;
  }
  const rec = {
    id: editLid || 'l' + Date.now() + Math.random().toString(36).slice(2, 6),
    personId: pid,
    type: document.getElementById('lType').value,
    start: s,
    end: e,
    note: document.getElementById('lNote').value.trim(),
  };
  closeLeave();
  await pushLeave(rec);
  await pullAll();
});
setControlHandler('lDelete', 'onclick', async () => {
  if (editLid) {
    const id = editLid;
    closeLeave();
    await removeLeave(id);
    await pullAll();
  }
});

/* ---------- leaves panel ---------- */
function buildLeaves() {
  const today = state.settings.asOf;
  const lvs = [...state.leaves].sort((a, b) => (a.start < b.start ? -1 : 1));
  const onNow = lvs.filter((l) => l.start <= today && l.end >= today).length;
  const upcoming = lvs.filter((l) => l.start > today).length;
  const totalDays = lvs.reduce((m, l) => m + dayDiff(l.start, l.end) + 1, 0);
  document.getElementById('leaveCards').innerHTML = `
   <div class="card"><div class="n">${lvs.length}</div><div class="l">Planned leaves</div></div>
   <div class="card leave"><div class="n">${onNow}</div><div class="l">On leave on ${fmt(today)}</div></div>
   <div class="card soon"><div class="n">${upcoming}</div><div class="l">Upcoming</div></div>
   <div class="card"><div class="n">${totalDays}</div><div class="l">Total leave days</div></div>`;
  let t =
    '<thead><tr><th>Person</th><th>Pod</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Note</th></tr></thead><tbody>';
  if (!lvs.length)
    t += `<tr><td colspan="8" class="empty">No leaves planned yet — use the + Leave button to plan time off in advance.</td></tr>`;
  lvs.forEach((l) => {
    const r = state.roster.find((x) => x.id === l.personId);
    const days = dayDiff(l.start, l.end) + 1;
    const stat = l.end < today ? 'PAST' : l.start <= today ? 'ON LEAVE' : 'UPCOMING';
    const pcls = l.end < today ? '' : l.start <= today ? 'leave' : 'soon';
    t += `<tr class="click" data-lid="${l.id}"><td><b>${r ? r.name : '(removed)'}</b></td><td>${r ? r.pod : '—'}</td><td>${l.type || 'Other'}</td><td>${fmt(l.start)}</td><td>${fmt(l.end)}</td><td>${days}</td><td>${pcls ? `<span class="pill ${pcls}">${stat}</span>` : stat}</td><td>${l.note || '—'}</td></tr>`;
  });
  document.getElementById('leaveTable').innerHTML = t + '</tbody>';
  document
    .querySelectorAll('#leaveTable tr.click')
    .forEach((row) => (row.onclick = () => openLeave(row.dataset.lid)));
  if (document.getElementById('attendanceSummaryTable')) buildAttendanceSummary();
}

/* ---------- dashboard ---------- */
function buildDash() {
  const c = countStatuses();
  const confirmedBookings = state.bookings.filter((b) => !isPotential(b)).length;
  const potentialBookings = state.bookings.filter(isPotential).length;
  document.getElementById('dashCards').innerHTML = `
   <div class="card"><div class="n">${state.roster.length}</div><div class="l">Staff</div></div>
   <div class="card busy"><div class="n">${c.busy}</div><div class="l">Confirmed booked</div></div>
   <div class="card potential"><div class="n">${c.potential}</div><div class="l">Potentially reserved</div></div>
   <div class="card leave"><div class="n">${c.leave}</div><div class="l">On leave</div></div>
   <div class="card soon"><div class="n">${c.soon}</div><div class="l">Free within ${state.settings.soonDays}d</div></div>
   <div class="card free"><div class="n">${c.free}</div><div class="l">Free now</div></div>
   <div class="card"><div class="n">${confirmedBookings} / ${potentialBookings}</div><div class="l">Confirmed / potential bookings</div></div>`;
  let t =
    '<thead><tr><th>Name</th><th>Pod</th><th>Status on ' +
    fmt(state.settings.asOf) +
    '</th><th>On</th><th>Until</th></tr></thead><tbody>';
  pods().forEach((p) => {
    state.roster
      .filter((r) => r.pod === p)
      .forEach((r) => {
        const st = personStatus(r.id);
        const lab =
          st.state === 'busy'
            ? 'BUSY'
            : st.state === 'soon'
              ? 'FREE SOON'
              : st.state === 'potential'
                ? 'POTENTIAL'
                : st.state === 'leave'
                  ? 'ON LEAVE'
                  : 'FREE';
        t += `<tr><td><b>${safe(r.name)}</b></td><td>${safe(r.pod)}</td><td><span class="pill ${st.state}">${lab}</span></td><td>${safe(st.client || (st.nextClient ? 'next: ' + st.nextClient : '—'))}</td><td>${st.until ? fmt(st.until) : st.nextStart ? 'from ' + fmt(st.nextStart) : '—'}</td></tr>`;
      });
  });
  document.getElementById('statusTable').innerHTML = t + '</tbody>';
  let c2 =
    '<thead><tr><th>Client / assignment</th><th>Type</th><th>People</th><th>Span</th><th>Names</th></tr></thead><tbody>';
  const cls = clients();
  if (!cls.length)
    c2 += `<tr><td colspan="5" class="empty">No bookings yet — drag across a row on the Timeline to add one.</td></tr>`;
  cls.forEach((cl) => {
    const bs = state.bookings.filter((b) => b.client === cl);
    const minS = bs.reduce((m, b) => (b.start < m ? b.start : m), bs[0].start);
    const maxE = bs.reduce((m, b) => (b.end > m ? b.end : m), bs[0].end);
    const names = [
      ...new Set(
        bs
          .map((b) => {
            const r = state.roster.find((x) => x.id === b.personId);
            return r ? r.name : null;
          })
          .filter(Boolean),
      ),
    ];
    const hasP = bs.some(isPotential),
      hasC = bs.some((b) => !isPotential(b));
    const type = hasP && hasC ? 'mixed' : hasP ? 'potential' : 'confirmed';
    c2 += `<tr><td><b style="color:${clientColor(cl)}">■</b> ${cl}</td><td><span class="pill ${type}">${typeLabel(type)}</span></td><td>${names.length}</td><td>${fmt(minS)} – ${fmt(maxE)}</td><td>${names.join(', ')}</td></tr>`;
  });
  document.getElementById('clientTable').innerHTML = c2 + '</tbody>';
}

function buildTimesheetDashboard() {
  ensurePerformanceRange();
  const hpd = +(state.settings.hoursPerDay || 8);
  let teamHours = 0,
    teamChargeable = 0,
    teamLeave = 0;
  const rows = state.roster.map((person) => {
    const x = WorkbookCalculations.employeeMetrics(
      state.entries,
      person,
      performanceStart,
      performanceEnd,
      state.holidays || [],
      entryHours,
      hpd,
    );
    const { total, chargeable, nonChargeable, leaveHours, required, variance, status } = x,
      rate = x.billingRate * 100;
    teamHours += total;
    teamChargeable += chargeable;
    teamLeave += leaveHours;
    return {
      person,
      total,
      chargeable,
      nonChargeable,
      rate,
      status,
      required,
      leaveHours,
      variance,
    };
  });
  const overall = teamHours ? (teamChargeable / teamHours) * 100 : 0;
  document.getElementById('tsdCards').innerHTML = `
    <div class="card"><div class="n">${h1(teamHours)}</div><div class="l">Total team hours</div></div>
    <div class="card free"><div class="n">${h1(teamChargeable)}</div><div class="l">Chargeable hours</div></div>
    <div class="card"><div class="n">${h1(rows.reduce((sum, x) => sum + x.nonChargeable, 0))}</div><div class="l">Non-chargeable hours</div></div>
    <div class="card ${overall >= 75 ? 'free' : overall >= 60 ? 'soon' : 'busy'}"><div class="n">${overall.toFixed(1)}%</div><div class="l">Billing rate</div></div>
    <div class="card leave"><div class="n">${h1(teamLeave)}</div><div class="l">Leave hours</div></div>`;
  let table =
    '<thead><tr><th>Employee Name</th><th>Entity</th><th>Total Hrs (excl. Leave Hrs)</th><th>Chargeable</th><th>Non-Charg</th><th>Billing Rate %</th><th>RAG Status</th><th>Min Hrs Required (excl. off days)</th><th>Leave Hrs (Period)</th><th>Actual Hrs Done</th><th>Hrs Variance (Over/Under)</th></tr></thead><tbody>';
  rows.forEach((x) => {
    const cls = x.status === 'GREEN' ? 'free' : x.status === 'AMBER' ? 'soon' : 'busy';
    table += `<tr><td><b>${x.person.name}</b><div class="vmeta">${x.person.id} · ${x.person.pod}</div></td><td>${x.person.entity || 'Reckoner'}</td><td>${h1(x.total)}</td><td>${h1(x.chargeable)}</td><td>${h1(x.nonChargeable)}</td><td>${x.rate.toFixed(1)}%</td><td><span class="pill ${cls}">${x.status}</span></td><td>${h1(x.required)}</td><td>${h1(x.leaveHours)}</td><td>${h1(x.total)}</td><td class="${x.variance < 0 ? 'busy' : 'free'}">${x.variance > 0 ? '+' : ''}${h1(x.variance)}</td></tr>`;
  });
  document.getElementById('tsdTable').innerHTML = table + '</tbody>';
}

function buildCrossPod() {
  if (!isManager()) return;
  ensureSheetPeriod();
  if (session.role === 'manager') crossPodMode = 'outgoing';
  const directory = state.billingRoster || [],
    people = Object.fromEntries(directory.map((p) => [p.id, p])),
    pods = [...new Set(directory.map((p) => p.pod).filter(Boolean))].sort();
  const podSelect = document.getElementById('cpPod'),
    oldPod = podSelect.value;
  podSelect.innerHTML = pods.map((p) => `<option value="${safe(p)}">${safe(p)}</option>`).join('');
  const focusPod =
    session.role === 'manager' ? session.pod : pods.includes(oldPod) ? oldPod : pods[0] || '';
  if (session.role !== 'manager') podSelect.value = focusPod;
  podSelect.onchange = buildCrossPod;
  const source =
    session.role === 'manager' && crossPodMode === 'incoming'
      ? state.crossPodEntries || []
      : state.entries;
  const rows = source
    .filter((e) => e.date >= sheetPeriodStart && e.date <= sheetPeriodEnd)
    .map((e) => ({ e, worker: people[e.personId], bill: people[e.billingTo || e.personId] }))
    .filter(
      (x) =>
        x.worker &&
        x.bill &&
        (crossPodMode === 'outgoing'
          ? x.worker.pod === focusPod && x.bill.pod !== focusPod
          : x.worker.pod !== focusPod && x.bill.pod === focusPod),
    )
    .sort((a, b) => b.e.date.localeCompare(a.e.date) || a.worker.name.localeCompare(b.worker.name));
  const from = document.getElementById('cpFrom'),
    to = document.getElementById('cpTo');
  if (from !== document.activeElement) from.value = sheetPeriodStart;
  if (to !== document.activeElement) to.value = sheetPeriodEnd;
  const change = () => {
    if (!from.value || !to.value) return;
    if (from.value > to.value) {
      alert('From date must be before the To date.');
      from.value = sheetPeriodStart;
      to.value = sheetPeriodEnd;
      return;
    }
    sheetPeriodStart = from.value;
    sheetPeriodEnd = to.value;
    saveSheetPeriod();
    buildCrossPod();
  };
  from.onchange = change;
  to.onchange = change;
  document.querySelectorAll('[data-cp-mode]').forEach((b) => {
    b.classList.toggle('pri', b.dataset.cpMode === crossPodMode);
    b.onclick = () => {
      crossPodMode = b.dataset.cpMode;
      buildCrossPod();
    };
  });
  const outgoing = crossPodMode === 'outgoing',
    subtitle = outgoing
      ? `${focusPod} employees working for another pod`
      : `Employees from other pods working for ${focusPod}`;
  document.getElementById('cpSubtitle').textContent = subtitle;
  document.getElementById('cpTableTitle').textContent = subtitle;
  const hours = rows.reduce((sum, x) => sum + entryHours(x.e), 0),
    counterPods = new Set(rows.map((x) => (outgoing ? x.bill.pod : x.worker.pod))),
    workersCount = new Set(rows.map((x) => x.e.personId)).size;
  document.getElementById('cpCards').innerHTML =
    `<div class="card"><div class="n">${rows.length}</div><div class="l">Cross-pod entries</div></div><div class="card"><div class="n">${h1(hours)}</div><div class="l">Cross-pod hours</div></div><div class="card"><div class="n">${workersCount}</div><div class="l">Employees working</div></div><div class="card"><div class="n">${counterPods.size}</div><div class="l">${outgoing ? 'Receiving' : 'Supplying'} pods</div></div>`;
  let table =
    '<thead><tr><th>Date</th><th>Employee</th><th>Employee Pod</th><th>Billing As</th><th>Billing Pod</th><th>Type</th><th>Client</th><th>Assignment</th><th>Hours</th><th>Work Done</th></tr></thead><tbody>';
  if (!rows.length)
    table +=
      '<tr><td colspan="10" class="empty">No cross-pod entries in this date range.</td></tr>';
  rows.forEach(({ e, worker, bill }) => {
    table += `<tr><td>${fmt(e.date)}</td><td><b>${safe(worker.name)}</b><div class="vmeta">${safe(worker.id)}</div></td><td>${safe(worker.pod)}</td><td><b>${safe(bill.name)}</b><div class="vmeta">${safe(bill.id)}</div></td><td>${safe(bill.pod)}</td><td>${safe(e.type)}</td><td>${safe(e.client) || '—'}</td><td>${safe(e.assignment) || '—'}</td><td><b>${h1(entryHours(e))}</b></td><td>${safe(e.notes) || '—'}</td></tr>`;
  });
  document.getElementById('cpTable').innerHTML = table + '</tbody>';
}

const safe = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const refValues = (category) =>
  state.references && state.references[category] && state.references[category].length
    ? state.references[category]
    : [];
const PERF_RANGE_KEY = 'reckoner_performance_range_v1';
function ensurePerformanceRange() {
  if (performanceStart && performanceEnd) return;
  try {
    const saved = JSON.parse(localStorage.getItem(PERF_RANGE_KEY) || 'null');
    if (
      saved &&
      /^\d{4}-\d{2}-\d{2}$/.test(saved.start || '') &&
      /^\d{4}-\d{2}-\d{2}$/.test(saved.end || '') &&
      saved.start <= saved.end
    ) {
      performanceStart = saved.start;
      performanceEnd = saved.end;
    }
  } catch (e) {}
  if (!performanceStart || !performanceEnd) {
    performanceStart = state.settings.start;
    performanceEnd = state.settings.end;
  }
}
function performanceDates() {
  ensurePerformanceRange();
  const out = [];
  for (let d = parse(performanceStart), end = parse(performanceEnd); d <= end; d = addDays(d, 1))
    out.push(new Date(d));
  return out;
}
function periodEntries() {
  ensurePerformanceRange();
  return state.entries.filter((e) => e.date >= performanceStart && e.date <= performanceEnd);
}
function syncPerformanceRangeInputs() {
  if (!state) return;
  ensurePerformanceRange();
  document.querySelectorAll('[data-performance-from]').forEach((input) => {
    if (input !== document.activeElement) input.value = performanceStart;
  });
  document.querySelectorAll('[data-performance-to]').forEach((input) => {
    if (input !== document.activeElement) input.value = performanceEnd;
  });
}
function refreshPerformanceView() {
  const active = document.querySelector('.panel.show');
  if (!active) return;
  const builders = {
    tsdashboard: buildTimesheetDashboard,
    kpiengine: buildKpiEngine,
    clientview: buildClientView,
    auditcheck: buildAuditCheck,
    workbookdashboard: () => {
      buildWorkbookDashboard();
      personalizeEmployeeDashboard();
    },
    masterdata: buildMasterData,
  };
  if (builders[active.id]) builders[active.id]();
}
function changePerformanceRange(event) {
  const filter = event.target.closest('.performance-filter'),
    from = filter.querySelector('[data-performance-from]'),
    to = filter.querySelector('[data-performance-to]');
  if (!from.value || !to.value) return;
  if (from.value > to.value) {
    alert('Performance From date must be before the To date.');
    syncPerformanceRangeInputs();
    return;
  }
  performanceStart = from.value;
  performanceEnd = to.value;
  try {
    localStorage.setItem(
      PERF_RANGE_KEY,
      JSON.stringify({ start: performanceStart, end: performanceEnd }),
    );
  } catch (e) {}
  refreshPerformanceView();
}
function weekNumber(dateString) {
  return WorkbookCalculations.excelWeekNum(dateString);
}
function buildMasterData() {
  let t =
    '<thead><tr><th>Emp No</th><th>Employee Name</th><th>Entity</th><th>Type</th><th>Date</th><th>Start Time</th><th>End Time</th><th>Hours</th><th>Client Name</th><th>Assignment Type</th><th>Work Area</th><th>Work Done</th><th>Week No</th><th>Month No</th><th>Month Name</th><th>Quarter</th></tr></thead><tbody>';
  const rows = periodEntries()
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length)
    t += '<tr><td colspan="16" class="empty">No timesheet entries in this period.</td></tr>';
  rows.forEach((e) => {
    const p = state.roster.find((r) => r.id === e.personId) || {},
      d = parse(e.date),
      month = d.getMonth() + 1;
    t += `<tr><td>${safe(p.id)}</td><td><b>${safe(p.name)}</b></td><td>${safe(e.entity)}</td><td>${safe(e.type)}</td><td>${fmt(e.date)}</td><td>${safe(e.start)}</td><td>${safe(e.end)}</td><td>${h1(entryHours(e))}</td><td>${safe(e.client)}</td><td>${safe(e.assignment)}</td><td>${safe(e.workArea)}</td><td>${safe(e.notes)}</td><td>${weekNumber(e.date)}</td><td>${month}</td><td>${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</td><td>Q${Math.ceil(month / 3)}</td></tr>`;
  });
  document.getElementById('masterDataTable').innerHTML = t + '</tbody>';
}
function kpiFilteredEntries() {
  const pid = document.getElementById('kpiEmployee').value,
    entity = document.getElementById('kpiEntity').value;
  return periodEntries().filter(
    (e) => (!pid || e.personId === pid) && (!entity || e.entity === entity),
  );
}
function buildKpiEngine() {
  const employee = document.getElementById('kpiEmployee'),
    entity = document.getElementById('kpiEntity'),
    oldEmployee = employee.value,
    oldEntity = entity.value;
  employee.innerHTML =
    '<option value="">All visible employees</option>' +
    state.roster.map((r) => `<option value="${safe(r.id)}">${safe(r.name)}</option>`).join('');
  entity.innerHTML =
    '<option value="">All entities</option>' +
    [
      ...new Set(
        refValues('entity')
          .concat(periodEntries().map((e) => e.entity))
          .filter(Boolean),
      ),
    ]
      .sort()
      .map((x) => `<option>${safe(x)}</option>`)
      .join('');
  employee.value = oldEmployee;
  entity.value = oldEntity;
  employee.onchange = buildKpiEngine;
  entity.onchange = buildKpiEngine;
  const summary = WorkbookCalculations.metrics(
    kpiFilteredEntries(),
    performanceStart,
    performanceEnd,
    entryHours,
  );
  const { work: worked, total, chargeable: charge, nonChargeable: non, audit, internal } = summary;
  const rate = summary.billingRate * 100,
    rag = rate >= 75 ? 'GREEN' : rate >= 60 ? 'AMBER' : 'RED';
  const periodTarget = WorkbookCalculations.annualTarget(
    state.roster,
    employee.value,
    entity.value,
    performanceStart,
    performanceEnd,
    state.holidays || [],
  );
  document.getElementById('kpiCards').innerHTML =
    `<div class="card"><div class="n">${h1(total)}</div><div class="l">Total hours excl. leaves</div></div><div class="card free"><div class="n">${h1(charge)}</div><div class="l">Chargeable hours</div></div><div class="card"><div class="n">${h1(non)}</div><div class="l">Non-chargeable hours</div></div><div class="card"><div class="n">${h1(audit)}</div><div class="l">Audit hours</div></div><div class="card"><div class="n">${h1(internal)}</div><div class="l">Internal hours</div></div><div class="card"><div class="n">${h1(periodTarget)}</div><div class="l">Period target · gap ${h1(periodTarget - total)}</div></div><div class="card ${rag === 'GREEN' ? 'free' : rag === 'AMBER' ? 'soon' : 'busy'}"><div class="n">${rate.toFixed(1)}%</div><div class="l">Billing rate · ${rag}</div></div>`;
  const weeks = {};
  worked.forEach((e) => {
    const key = weekNumber(e.date),
      day = parse(e.date),
      start = iso(addDays(day, -((day.getDay() + 6) % 7)));
    if (!weeks[key]) weeks[key] = { total: 0, charge: 0, non: 0, start };
    weeks[key].total += entryHours(e);
    if (WorkbookCalculations.same(e.type, 'Chargeable')) weeks[key].charge += entryHours(e);
    if (WorkbookCalculations.same(e.type, 'Non-Chargeable')) weeks[key].non += entryHours(e);
  });
  let t =
    '<thead><tr><th>Week</th><th>Total Hrs</th><th>Chargeable</th><th>Non-Chargeable</th><th>Billing Rate %</th><th>Target Gap</th></tr></thead><tbody>';
  Object.keys(weeks)
    .sort((a, b) => a - b)
    .forEach((k) => {
      const w = weeks[k],
        pct = w.total ? (w.charge / w.total) * 100 : 0,
        from = w.start > performanceStart ? w.start : performanceStart,
        weekEnd = iso(addDays(parse(w.start), 6)),
        to = weekEnd < performanceEnd ? weekEnd : performanceEnd,
        weeklyTarget = WorkbookCalculations.annualTarget(
          state.roster,
          employee.value,
          entity.value,
          from,
          to,
          state.holidays || [],
        );
      t += `<tr><td>Week ${k}</td><td>${h1(w.total)}</td><td>${h1(w.charge)}</td><td>${h1(w.non)}</td><td>${pct.toFixed(1)}%</td><td>${h1(w.total - weeklyTarget)}</td></tr>`;
    });
  if (!Object.keys(weeks).length)
    t += '<tr><td colspan="6" class="empty">No data for these filters.</td></tr>';
  document.getElementById('kpiWeekTable').innerHTML = t + '</tbody>';
}
function entityRateDetails(entity, person) {
  const exact = (state.entityPricing || []).find(
    (x) => x.entity === entity && x.designation === (person && person.role),
  );
  const general = (state.entityPricing || []).find(
    (x) => x.entity === entity && x.designation === 'All designations',
  );
  return exact
    ? { rate: +exact.rate, configured: true, source: 'designation' }
    : general
      ? { rate: +general.rate, configured: true, source: 'fallback' }
      : { rate: 0, configured: false, source: 'missing' };
}
function entityDesignationRate(entity, person) {
  return entityRateDetails(entity, person).rate;
}
function clientMetrics() {
  const map = {};
  periodEntries()
    .filter((e) => e.client)
    .forEach((e) => {
      const x =
        map[e.client] ||
        (map[e.client] = { client: e.client, total: 0, charge: 0, non: 0, value: 0 });
      const h = entryHours(e),
        p = state.roster.find((r) => r.id === e.personId);
      x.total += h;
      if (WorkbookCalculations.same(e.type, 'Chargeable')) {
        x.charge += h;
        x.value += h * entityDesignationRate(e.entity, p);
      }
      if (WorkbookCalculations.same(e.type, 'Non-Chargeable')) x.non += h;
    });
  return Object.values(map).sort((a, b) => b.total - a.total);
}
function buildClientView() {
  const rows = clientMetrics(),
    total = rows.reduce((s, x) => s + x.total, 0),
    charge = rows.reduce((s, x) => s + x.charge, 0),
    value = rows.reduce((s, x) => s + x.value, 0);
  document.getElementById('clientViewCards').innerHTML =
    `<div class="card"><div class="n">${rows.length}</div><div class="l">Active clients</div></div><div class="card"><div class="n">${h1(total)}</div><div class="l">Total hours</div></div><div class="card free"><div class="n">${h1(charge)}</div><div class="l">Chargeable hours</div></div><div class="card free"><div class="n">£${value.toFixed(2)}</div><div class="l">Billing value</div></div>`;
  let t =
    '<thead><tr><th>Client Name</th><th>Total Hrs</th><th>Chargeable Hrs</th><th>Non-Chargeable Hrs</th><th>Chargeable %</th><th>Billing Value (£)</th></tr></thead><tbody>';
  rows.forEach(
    (x) =>
      (t += `<tr><td><b>${safe(x.client)}</b></td><td>${h1(x.total)}</td><td>${h1(x.charge)}</td><td>${h1(x.non)}</td><td>${(x.total ? (x.charge / x.total) * 100 : 0).toFixed(1)}%</td><td>£${x.value.toFixed(2)}</td></tr>`),
  );
  if (!rows.length)
    t += '<tr><td colspan="6" class="empty">No client time in this period.</td></tr>';
  document.getElementById('clientViewTable').innerHTML = t + '</tbody>';
}
function buildAuditCheck() {
  const rows = clientMetrics().filter((x) =>
    periodEntries().some(
      (e) => e.client === x.client && WorkbookCalculations.same(e.assignment, 'Audit'),
    ),
  );
  Object.keys(state.auditThresholds || {}).forEach((client) => {
    if (!rows.some((x) => x.client === client))
      rows.push({ client, total: 0, charge: 0, value: 0 });
  });
  let t =
    '<thead><tr><th>Audit Client</th><th>Actual Audit Hrs</th><th>Min Hours Threshold</th><th>Variance</th><th>Completion %</th><th>Status</th></tr></thead><tbody>';
  rows.forEach((x) => {
    const actual = periodEntries()
        .filter((e) => e.client === x.client && WorkbookCalculations.same(e.assignment, 'Audit'))
        .reduce((s, e) => s + entryHours(e), 0),
      min = +(
        (state.auditThresholds && state.auditThresholds[x.client]) ||
        state.settings.auditMinHours ||
        40
      ),
      variance = actual - min,
      pct = min ? (actual / min) * 100 : 100,
      status = actual === 0 ? 'NO DATA' : variance >= 0 ? 'ON TRACK' : 'BELOW THRESHOLD';
    t += `<tr><td><b>${safe(x.client)}</b></td><td>${h1(actual)}</td><td>${isAdmin() ? `<input type="number" min="0" step="1" value="${min}" data-threshold="${safe(x.client)}" style="width:90px">` : h1(min)}</td><td>${h1(variance)}</td><td>${pct.toFixed(1)}%</td><td><span class="pill ${status === 'ON TRACK' ? 'free' : status === 'NO DATA' ? 'leave' : 'busy'}">${status}</span></td></tr>`;
  });
  if (!rows.length)
    t +=
      '<tr><td colspan="6" class="empty">No audit clients have time or thresholds yet.</td></tr>';
  const table = document.getElementById('auditCheckTable');
  table.innerHTML = t + '</tbody>';
  table.querySelectorAll('[data-threshold]').forEach(
    (input) =>
      (input.onchange = async () => {
        await api('saveThreshold', { client: input.dataset.threshold, hours: +input.value });
        await pullAll();
      }),
  );
}
function buildWorkbookDashboard() {
  const rows = clientMetrics(),
    entries = periodEntries(),
    total = entries.reduce((s, e) => s + entryHours(e), 0),
    charge = entries
      .filter((e) => WorkbookCalculations.same(e.type, 'Chargeable'))
      .reduce((s, e) => s + entryHours(e), 0),
    non = entries
      .filter((e) => WorkbookCalculations.same(e.type, 'Non-Chargeable'))
      .reduce((s, e) => s + entryHours(e), 0),
    rate = total ? (charge / total) * 100 : 0,
    value = rows.reduce((s, x) => s + x.value, 0),
    active = state.roster.filter((p) => p.active !== false).length,
    rag = rate >= 75 ? 'GREEN' : rate >= 60 ? 'AMBER' : 'RED';
  document.getElementById('workbookDashCards').innerHTML =
    `<div class="card"><div class="n">${h1(total)}</div><div class="l">Total team hours</div></div><div class="card free"><div class="n">${h1(charge)}</div><div class="l">Chargeable hours</div></div><div class="card"><div class="n">${h1(non)}</div><div class="l">Non-chargeable hours</div></div><div class="card"><div class="n">${rate.toFixed(1)}%</div><div class="l">Billing rate</div></div><div class="card free"><div class="n">£${value.toFixed(2)}</div><div class="l">Billing value</div></div><div class="card"><div class="n">${active}</div><div class="l">Active employees</div></div>`;
  document.getElementById('dashHoursSplit').innerHTML =
    `<thead><tr><th>Category</th><th>Hours</th></tr></thead><tbody><tr><td>Chargeable</td><td>${h1(charge)}</td></tr><tr><td>Non-Chargeable</td><td>${h1(non)}</td></tr></tbody>`;
  let top = '<thead><tr><th>Client</th><th>Hrs</th></tr></thead><tbody>';
  rows
    .slice(0, 8)
    .forEach((x) => (top += `<tr><td>${safe(x.client)}</td><td>${h1(x.total)}</td></tr>`));
  document.getElementById('dashTopClients').innerHTML = top + '</tbody>';
  const note = document.getElementById('dashRag');
  note.className = 'vnote';
  note.innerHTML = `<b>${rag}</b> — overall billing rate is ${rate.toFixed(1)}% against the 75% workbook target.`;
}
function buildAttendance() {
  buildLeaves();
  let t = '<thead><tr><th>Holiday</th><th>Date</th></tr></thead><tbody>';
  const holidays = state.holidays || [];
  holidays.forEach((h) => (t += `<tr><td><b>${safe(h.name)}</b></td><td>${fmt(h.date)}</td></tr>`));
  if (!holidays.length)
    t += '<tr><td colspan="2" class="empty">No public holidays configured.</td></tr>';
  document.getElementById('attendanceHolidayTable').innerHTML = t + '</tbody>';
}
function buildConfig() {
  if (!isAdmin()) return;
  const s = state.settings;
  document.getElementById('cfgFirm').value = s.firmName || 'The Reckoner Audit';
  document.getElementById('cfgReviewDay').value = s.reviewDay || 'Friday';
  document.getElementById('cfgReviewTime').value = s.reviewTime || '13:00';
  document.getElementById('cfgBillingTarget').value = s.billingTarget || 75;
  document.getElementById('cfgAmberThreshold').value = s.amberThreshold || 60;
  document.getElementById('cfgMonthlyTarget').value = s.defaultMonthlyTarget || 160;
  let users =
    '<thead><tr><th>Emp No</th><th>Full Name</th><th>Email</th><th>Entity</th><th>Pod</th><th>Job Title</th><th>Access</th><th>Monthly Target</th><th>Billing Rate</th><th></th></tr></thead><tbody>';
  state.roster.forEach(
    (r) =>
      (users += `<tr><td>${safe(r.id)}</td><td><b>${safe(r.name)}</b></td><td>${r.email ? safe(r.email) : '<span class="pill busy">EMAIL REQUIRED</span>'}</td><td>${safe(r.entity || 'Reckoner')}</td><td>${safe(r.pod)}</td><td>${safe(r.role)}</td><td>${safe(r.accessRole)}</td><td>${h1(r.monthlyTarget || 160)}</td><td>${r.billingRate == null ? '—' : '£' + (+r.billingRate).toFixed(2)}</td><td><button class="btn" data-cfg-edit="${safe(r.id)}">Edit</button></td></tr>`),
  );
  document.getElementById('cfgEmployees').innerHTML = users + '</tbody>';
  document
    .querySelectorAll('[data-cfg-edit]')
    .forEach((b) => (b.onclick = () => openPerson(b.dataset.cfgEdit)));
  let holidays = '<thead><tr><th>Holiday Name</th><th>Date</th><th></th></tr></thead><tbody>';
  (state.holidays || []).forEach(
    (h) =>
      (holidays += `<tr><td>${safe(h.name)}</td><td>${fmt(h.date)}</td><td><button class="btn danger" data-holiday-delete="${h.id}">Delete</button></td></tr>`),
  );
  document.getElementById('cfgHolidayTable').innerHTML = holidays + '</tbody>';
  document.querySelectorAll('[data-holiday-delete]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (confirm('Delete this public holiday?')) {
          await api('deleteHoliday', { id: +b.dataset.holidayDelete });
          await pullAll();
          buildConfig();
        }
      }),
  );
  buildReferenceConfig();
}
function buildReferenceConfig() {
  if (!isAdmin()) return;
  const category = document.getElementById('cfgRefCategory').value,
    query = document.getElementById('cfgRefSearch').value.trim().toLowerCase(),
    all = refValues(category),
    rows = all.filter((x) => !query || x.toLowerCase().includes(query)).slice(0, 200);
  document.getElementById('cfgRefCount').textContent =
    `Showing ${rows.length} of ${all.length} ${category.replace('_', ' ')} values`;
  let t = '<thead><tr><th>Value</th><th></th></tr></thead><tbody>';
  rows.forEach(
    (v) =>
      (t += `<tr><td>${safe(v)}</td><td><button class="btn danger" data-ref-delete="${safe(v)}">Delete</button></td></tr>`),
  );
  document.getElementById('cfgRefTable').innerHTML = t + '</tbody>';
  document.querySelectorAll('[data-ref-delete]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (confirm('Delete this dropdown value?')) {
          await api('deleteReference', { category, value: b.dataset.refDelete });
          await pullAll();
          buildConfig();
        }
      }),
  );
}

function showConfigPage(name) {
  document
    .querySelectorAll('.config-page')
    .forEach((x) => x.classList.toggle('show', x.dataset.configSection === name));
  document
    .querySelectorAll('.config-link')
    .forEach((x) => x.classList.toggle('active', x.dataset.configPage === name));
}
buildReferenceConfig = function () {
  if (!canConfig('references')) return;
  const category = document.getElementById('cfgRefCategory').value,
    query = document.getElementById('cfgRefSearch').value.trim().toLowerCase(),
    all = refValues(category),
    rows = all.filter((x) => !query || x.toLowerCase().includes(query)).slice(0, 200);
  document.getElementById('cfgRefCount').textContent =
    `Showing ${rows.length} of ${all.length} ${category.replace('_', ' ')} values`;
  let t = '<thead><tr><th>Value</th><th></th></tr></thead><tbody>';
  rows.forEach(
    (v) =>
      (t += `<tr><td>${safe(v)}</td><td><button class="btn danger" data-ref-delete="${safe(v)}">Delete</button></td></tr>`),
  );
  document.getElementById('cfgRefTable').innerHTML = t + '</tbody>';
  document.querySelectorAll('[data-ref-delete]').forEach(
    (b) =>
      (b.onclick = async () => {
        const value = b.dataset.refDelete,
          label = category.replace('_', ' ');
        if (
          confirm(
            `Delete “${value}” from the ${label} list? Existing timesheet rows will keep their saved value.`,
          )
        ) {
          await api('deleteReference', { category, value });
          await pullAll();
          buildConfig();
          showConfigPage('references');
        }
      }),
  );
};
buildConfig = function () {
  if (!hasConfig()) return;
  const s = state.settings,
    perms = state.configPermissions || [];
  document
    .querySelectorAll('[data-config-perm]')
    .forEach((x) => (x.style.display = canConfig(x.dataset.configPerm) ? '' : 'none'));
  const designations = [
    ...new Set(
      (state.billingRoster || state.roster)
        .map((r) => r.role)
        .concat(state.roster.map((r) => r.role))
        .filter(Boolean),
    ),
  ].sort();
  const designationList = document.getElementById('designationList');
  if (designationList)
    designationList.innerHTML = designations.map((x) => `<option value="${safe(x)}">`).join('');
  const entities = [
    ...new Set(
      refValues('entity')
        .concat(
          state.roster.map((r) => r.entity),
          state.entries.map((e) => e.entity),
          state.bookings.map((b) => b.firm),
        )
        .filter(Boolean),
    ),
  ].sort();
  const entitySelect = document.getElementById('cfgPriceEntity');
  if (entitySelect) {
    const oldEntity = entitySelect.value;
    entitySelect.innerHTML =
      '<option value="">Select entity</option>' +
      entities.map((x) => `<option value="${safe(x)}">${safe(x)}</option>`).join('');
    entitySelect.value = entities.includes(oldEntity) ? oldEntity : entities[0] || '';
    entitySelect.onchange = () => buildEntityPricingBlock(designations);
  }
  if (canConfig('employees') && document.getElementById('cfgEmployees')) {
    let users =
      '<thead><tr><th>Emp No</th><th>Employee</th><th>Email</th><th>Pod</th><th>Designation</th><th>Access</th><th></th></tr></thead><tbody>';
    state.roster.forEach(
      (r) =>
        (users += `<tr><td>${safe(r.id)}</td><td><b>${safe(r.name)}</b></td><td>${r.email ? safe(r.email) : '<span class="pill busy">EMAIL REQUIRED</span>'}</td><td>${safe(r.pod)}</td><td>${safe(r.role || 'Not specified')}</td><td>${safe(r.accessRole)}</td><td><button class="btn" data-cfg-edit="${safe(r.id)}">Edit</button></td></tr>`),
    );
    document.getElementById('cfgEmployees').innerHTML = users + '</tbody>';
    document
      .querySelectorAll('[data-cfg-edit]')
      .forEach((b) => (b.onclick = () => openPerson(b.dataset.cfgEdit)));
  }
  if (isAdmin() && document.getElementById('cfgPods')) {
    const podNames = [...new Set((state.pods || []).concat(pods()))].sort();
    document.getElementById('cfgPods').innerHTML =
      '<thead><tr><th>Pod / team</th><th>Employees</th></tr></thead><tbody>' +
      podNames
        .map(
          (name) =>
            `<tr><td><b>${safe(name)}</b></td><td>${state.roster.filter((r) => r.pod === name).length}</td></tr>`,
        )
        .join('') +
      (podNames.length ? '' : '<tr><td colspan="2" class="empty">No pods yet.</td></tr>') +
      '</tbody>';
  }
  if (canConfig('holidays') && document.getElementById('cfgHolidayTable')) {
    let h = '<thead><tr><th>Holiday</th><th>Date</th><th></th></tr></thead><tbody>';
    for (const x of state.holidays || [])
      h += `<tr><td><b>${safe(x.name)}</b></td><td>${fmt(x.date)}</td><td><button class="btn danger" data-holiday-delete="${x.id}">Delete</button></td></tr>`;
    document.getElementById('cfgHolidayTable').innerHTML = h + '</tbody>';
    document.querySelectorAll('[data-holiday-delete]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (confirm('Delete this public holiday?')) {
            await api('deleteHoliday', { id: +b.dataset.holidayDelete });
            await pullAll();
            buildConfig();
            showConfigPage('holidays');
          }
        }),
    );
  }
  if (canConfig('references') && document.getElementById('cfgRefTable')) buildReferenceConfig();
  if (canConfig('pricing') && entitySelect) buildEntityPricingBlock(designations);
  if (isAdmin() && document.getElementById('cfgAdminsTable')) {
    const admins = state.adminAccounts || [];
    document.getElementById('cfgAdminsTable').innerHTML =
      '<thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead><tbody>' +
      admins
        .map(
          (a) =>
            '<tr><td><b>' +
            safe(a.name) +
            '</b></td><td>' +
            safe(a.email) +
            '</td><td>' +
            (+a.active ? 'Active' : 'Inactive') +
            '</td></tr>',
        )
        .join('') +
      '</tbody>';
    let p =
      '<thead><tr><th>Manager</th><th>Pod</th><th>Employees</th><th>Holidays</th><th>Lists</th><th>Entity pricing</th></tr></thead><tbody>';
    state.roster
      .filter((r) => r.accessRole === 'manager')
      .forEach((r) => {
        const rp = r.configPermissions || [];
        p += `<tr data-manager="${safe(r.id)}"><td><b>${safe(r.name)}</b></td><td>${safe(r.pod)}</td>${['employees', 'holidays', 'references', 'pricing'].map((k) => `<td><input type="checkbox" data-perm="${k}" ${rp.includes(k) ? 'checked' : ''}></td>`).join('')}</tr>`;
      });
    document.getElementById('cfgPermissionsTable').innerHTML = p + '</tbody>';
    document.querySelectorAll('#cfgPermissionsTable input').forEach(
      (x) =>
        (x.onchange = async () => {
          const tr = x.closest('tr'),
            permissions = [...tr.querySelectorAll('input:checked')].map((i) => i.dataset.perm);
          await api('saveManagerPermissions', { id: tr.dataset.manager, permissions });
          await pullAll();
          buildConfig();
          showConfigPage('permissions');
        }),
    );
  }
  document
    .querySelectorAll('button.config-link')
    .forEach((b) => (b.onclick = () => showConfigPage(b.dataset.configPage)));
  const current = document.querySelector('.config-page.show')?.dataset.configSection,
    allowed =
      current &&
      document.querySelector(`[data-config-page="${current}"]`)?.style.display !== 'none';
  if (!allowed) {
    const preferred =
        INITIAL_CONFIG_PAGE &&
        document.querySelector(`[data-config-page="${INITIAL_CONFIG_PAGE}"]`),
      first =
        preferred && getComputedStyle(preferred).display !== 'none'
          ? preferred
          : [...document.querySelectorAll('.config-link')].find(
              (x) => getComputedStyle(x).display !== 'none',
            );
    if (first) showConfigPage(first.dataset.configPage);
  }
};

setControlHandler('cfgAddAdmin', 'onclick', async () => {
  if (!isAdmin()) return;
  const name = document.getElementById('cfgAdminName').value.trim(),
    email = document.getElementById('cfgAdminEmail').value.trim().toLowerCase(),
    button = document.getElementById('cfgAddAdmin');
  if (!name || !email || !email.includes('@')) {
    alert("Enter the administrator's name and a valid work email.");
    return;
  }
  button.disabled = true;
  button.textContent = 'Creating…';
  try {
    const result = await api('createAdmin', { name, email });
    await pullAll();
    showConfigPage('permissions');
    alert(
      'Administrator created.\n\nTemporary password: ' +
        result.temporaryPassword +
        '\n\nCopy it now and give it securely to ' +
        name +
        '. They must complete email verification and change this password.',
    );
  } catch (error) {
  } finally {
    button.disabled = false;
    button.textContent = 'Create administrator';
  }
});
function buildEntityPricingBlock(designations) {
  const entity = document.getElementById('cfgPriceEntity').value,
    table = document.getElementById('cfgPricingTable'),
    status = document.getElementById('cfgPriceStatus');
  document.getElementById('cfgPriceBlockTitle').textContent = entity
    ? entity + ' rate card'
    : 'Entity rate card';
  status.textContent = '';
  if (!entity) {
    table.innerHTML =
      '<tbody><tr><td class="empty">Select an entity to edit its rate card.</td></tr></tbody>';
    document.getElementById('cfgPriceBlockCount').textContent = '';
    return;
  }
  const roles = ['All designations', ...designations],
    saved = new Map(
      (state.entityPricing || [])
        .filter((x) => x.entity === entity)
        .map((x) => [x.designation, +x.rate]),
    );
  let html =
    '<thead><tr><th style="width:65%">Designation</th><th>Hourly rate (£)</th></tr></thead><tbody>';
  roles.forEach((role, index) => {
    const rate = saved.has(role) ? saved.get(role) : '';
    html += `<tr><td>${role === 'All designations' ? '<b>Default fallback</b><div class="vmeta">Used only when a designation-specific rate is blank</div>' : `<b>${safe(role)}</b>`}</td><td><input type="number" min="0" step="0.01" inputmode="decimal" data-entity-rate data-designation="${safe(role)}" value="${rate === '' ? '' : (+rate).toFixed(2)}" aria-label="${safe(role)} hourly rate"></td></tr>`;
  });
  table.innerHTML = html + '</tbody>';
  document.getElementById('cfgPriceBlockCount').textContent =
    `${saved.size} of ${roles.length} rates configured`;
  const inputs = [...table.querySelectorAll('[data-entity-rate]')],
    markChanged = () => {
      status.textContent = 'Unsaved changes';
      status.style.color = 'var(--steel)';
    };
  inputs.forEach((input, index) => {
    input.oninput = markChanged;
    input.onkeydown = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        document.getElementById('cfgSavePrice').click();
        return;
      }
      if (!['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey) ? -1 : 1,
        target = inputs[index + step];
      if (target) {
        target.focus();
        target.select();
      }
    };
    input.onpaste = (event) => {
      const text = event.clipboardData && event.clipboardData.getData('text');
      if (!text || (!text.includes('\n') && !text.includes('\t'))) return;
      event.preventDefault();
      const values = text
        .trim()
        .split(/\r?\n/)
        .map((line) =>
          line
            .split('\t')
            .pop()
            .replace(/[£,\s]/g, ''),
        );
      values.forEach((value, offset) => {
        const target = inputs[index + offset];
        if (target && value !== '' && !Number.isNaN(+value) && +value >= 0)
          target.value = (+value).toFixed(2);
      });
      markChanged();
    };
  });
}

function buildAttendanceSummary() {
  const year = +(state.settings.reportingYear || state.settings.start.slice(0, 4)),
    hpd = +(state.settings.hoursPerDay || 8),
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let t =
    '<thead><tr><th>Emp No</th><th>Employee Name</th><th>Monthly Target Hrs</th><th>Casual Leave Allowed</th><th>Sick Leave Allowed</th>' +
    months.map((m) => '<th>' + m + '</th>').join('') +
    '<th>Total Leave Days</th><th>Casual Leave (Paid)</th><th>Sick Leave (Paid)</th><th>Half Day Leave</th><th>Statutory Holiday</th><th>Exam Leave (Paid)</th><th>Unpaid Leave</th><th>Hrs Target (Excl. off days)</th><th>Hrs Done (excl. off days)</th><th>Hrs Variance</th><th>Status</th><th>Overtime Hrs (Weekend/PH)</th></tr></thead><tbody>';
  state.roster.forEach((p) => {
    const x = WorkbookCalculations.attendanceMetrics(
      state.entries,
      p,
      year,
      state.holidays || [],
      entryHours,
      hpd,
    );
    const { monthly, kinds, leaveDays, target, actual, variance, overtime, status } = x;
    const statusClass = status === 'ON TARGET' ? 'free' : status === 'NO DATA' ? 'leave' : 'busy';
    t +=
      '<tr><td>' +
      safe(p.id) +
      '</td><td><b>' +
      safe(p.name) +
      '</b></td><td>' +
      h1(p.monthlyTarget || 160) +
      '</td><td>14</td><td>6</td>' +
      monthly.map((n) => '<td>' + (n || '—') + '</td>').join('') +
      '<td>' +
      h1(leaveDays) +
      '</td><td>' +
      h1(kinds.casual) +
      '</td><td>' +
      h1(kinds.sick) +
      '</td><td>' +
      h1(kinds.half) +
      '</td><td>' +
      h1(kinds.statutory) +
      '</td><td>' +
      h1(kinds.exam) +
      '</td><td>' +
      h1(kinds.unpaid) +
      '</td><td>' +
      h1(target) +
      '</td><td>' +
      h1(actual) +
      '</td><td>' +
      h1(variance) +
      '</td><td><span class="pill ' +
      statusClass +
      '">' +
      status +
      '</span></td><td>' +
      h1(overtime) +
      '</td></tr>';
  });
  document.getElementById('attendanceSummaryTable').innerHTML = t + '</tbody>';
}

function buildWeeklyHours() {
  const fromInput = document.getElementById('weeklyFrom'),
    toInput = document.getElementById('weeklyTo'),
    select = document.getElementById('weeklyPerson');
  if (!fromInput.dataset.initialized) {
    const current = WorkbookCalculations.weeklyMetrics([], null, todayISO(), []);
    fromInput.value = current.from;
    toInput.value = current.to;
    fromInput.dataset.initialized = '1';
  }
  const from = fromInput.value,
    to = toInput.value;
  if (!from || !to || from > to) {
    document.getElementById('weeklyPeriod').textContent = 'Choose a valid From and To date.';
    for (const id of ['weeklyCards', 'weeklyTable', 'weeklyDays'])
      document.getElementById(id).innerHTML = '';
    return;
  }
  const previous = select.value;
  const people =
    session.role === 'employee'
      ? state.roster.filter((p) => p.id === session.personId)
      : state.roster;
  select.innerHTML =
    (session.role === 'employee' ? '' : '<option value="">All visible employees</option>') +
    people.map((p) => `<option value="${safe(p.id)}">${safe(p.name)}</option>`).join('');
  if (people.some((p) => p.id === previous)) select.value = previous;
  const rows = people
    .filter((p) => !select.value || p.id === select.value)
    .map((p) => ({
      person: p,
      ...WorkbookCalculations.hoursRangeMetrics(
        state.entries,
        p.id,
        from,
        to,
        state.holidays || [],
        entryHours,
        todayISO(),
      ),
    }));
  const employeeLabel = select.value
    ? people.find((p) => p.id === select.value)?.name || ''
    : 'All visible employees';
  document.getElementById('weeklyPeriod').textContent =
    fmt(from) + ' – ' + fmt(to) + ' · ' + employeeLabel + ' · 8 hours per working day';
  const totals = rows.reduce(
    (t, r) => {
      for (const key of Object.keys(t)) t[key] += r[key];
      return t;
    },
    {
      loggedExpected: 0,
      actual: 0,
      chargeable: 0,
      nonChargeable: 0,
      weekendDays: 0,
      weekendHours: 0,
      overtime: 0,
      loggedShortfall: 0,
      missingHours: 0,
    },
  );
  document.getElementById('weeklyCards').innerHTML = [
    ['Expected hours · logged days', 'loggedExpected'],
    ['Actual hours', 'actual'],
    ['Chargeable hours', 'chargeable'],
    ['Non-chargeable hours', 'nonChargeable'],
    ['Weekend days worked', 'weekendDays'],
    ['Weekend hours', 'weekendHours'],
    ['Overtime hours', 'overtime'],
    ['Short hours · logged days', 'loggedShortfall'],
    ['Missing hours · unlogged days', 'missingHours'],
  ]
    .map(
      ([label, key]) =>
        `<div class="card"><div class="n">${key === 'weekendDays' ? totals[key] : h1(totals[key])}</div><div class="l">${label}</div></div>`,
    )
    .join('');
  let table =
    '<thead><tr><th>Employee</th><th>Working days logged</th><th>Weekend days worked</th><th>Weekend hours</th><th>Days missing</th><th>Expected hours (logged days)</th><th>Actual hours</th><th>Chargeable hours</th><th>Non-chargeable hours</th><th>Overtime</th><th>Short hours</th><th>Missing hours</th></tr></thead><tbody>';
  rows.forEach(
    (r) =>
      (table += `<tr><td><b>${safe(r.person.name)}</b><div class="vmeta">${safe(r.person.pod || '')}</div></td><td>${r.attendedDays}</td><td>${r.weekendDays}</td><td>${h1(r.weekendHours)}</td><td>${r.missingDays}</td><td>${h1(r.loggedExpected)}</td><td>${h1(r.actual)}</td><td>${h1(r.chargeable)}</td><td>${h1(r.nonChargeable)}</td><td>${h1(r.overtime)}</td><td>${h1(r.loggedShortfall)}</td><td>${h1(r.missingHours)}</td></tr>`),
  );
  document.getElementById('weeklyTable').innerHTML =
    table +
    (rows.length ? '' : '<tr><td colspan="12" class="empty">No visible employees.</td></tr>') +
    '</tbody>';
  let daily =
    '<thead><tr><th>Employee</th><th>Date</th><th>Expected hours (logged day)</th><th>Actual hours</th><th>Chargeable hours</th><th>Non-chargeable hours</th><th>Weekend hours</th><th>Overtime</th><th>Short hours</th><th>Missing hours</th></tr></thead><tbody>';
  rows.forEach((r) =>
    r.days.forEach((d) => {
      daily += `<tr><td>${safe(r.person.name)}</td><td>${fmt(d.date)}</td><td>${h1(d.loggedExpected)}</td><td>${h1(d.actual)}</td><td>${h1(d.chargeable)}</td><td>${h1(d.nonChargeable)}</td><td>${h1(d.weekendHours)}</td><td>${h1(d.overtime)}</td><td>${h1(d.loggedShortfall)}</td><td>${h1(d.missingHours)}</td></tr>`;
    }),
  );
  document.getElementById('weeklyDays').innerHTML =
    daily +
    (rows.length ? '' : '<tr><td colspan="10" class="empty">No visible employees.</td></tr>') +
    '</tbody>';
}
for (const id of ['weeklyFrom', 'weeklyTo'])
  setControlHandler(id, 'onchange', () => {
    const from = document.getElementById('weeklyFrom'),
      to = document.getElementById('weeklyTo');
    if (from.value && to.value && from.value > to.value) {
      if (id === 'weeklyFrom') to.value = from.value;
      else from.value = to.value;
    }
    buildWeeklyHours();
  });
setControlHandler('weeklyPerson', 'onchange', buildWeeklyHours);

function personalizeEmployeeDashboard() {
  if (!session || session.role !== 'employee') return;
  const labels = document.querySelectorAll('#workbookDashCards .card .l');
  if (labels[0]) labels[0].textContent = 'My total hours';
  if (labels[1]) labels[1].textContent = 'My chargeable hours';
  if (labels[2]) labels[2].textContent = 'My non-chargeable hours';
  if (labels[5]) labels[5].textContent = 'Active profile';
}

/* ---------- controls ---------- */
function syncInputs() {
  const af = document.activeElement;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el !== af) el.value = v;
  };
  set('rangeStart', state.settings.start);
  set('rangeEnd', state.settings.end);
  set('asOf', state.settings.asOf);
  set('soonDays', state.settings.soonDays);
}
function changeSetting(k, v) {
  state.settings[k] = v;
  if (!ONLINE) saveLocal();
  render();
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(pushSettings, 600);
}
setControlHandler('rangeStart', 'onchange', (e) => changeSetting('start', e.target.value));
setControlHandler('rangeEnd', 'onchange', (e) => changeSetting('end', e.target.value));
setControlHandler('asOf', 'onchange', (e) => changeSetting('asOf', e.target.value));
setControlHandler('soonDays', 'oninput', (e) => changeSetting('soonDays', +e.target.value || 0));
document
  .querySelectorAll('[data-performance-from],[data-performance-to]')
  .forEach((input) => (input.onchange = changePerformanceRange));

const THEME_KEY = 'reckoner_theme_v1';
function setDarkMode(enabled) {
  document.body.classList.toggle('dark-mode', enabled);
  const button = document.getElementById('themeToggle');
  button.textContent = enabled ? '☀ Light mode' : '☾ Dark mode';
  button.setAttribute('aria-pressed', String(enabled));
}
try {
  setDarkMode(localStorage.getItem(THEME_KEY) === 'dark');
} catch (error) {
  setDarkMode(false);
}
setControlHandler('themeToggle', 'onclick', () => {
  const enabled = !document.body.classList.contains('dark-mode');
  setDarkMode(enabled);
  try {
    localStorage.setItem(THEME_KEY, enabled ? 'dark' : 'light');
  } catch (error) {}
});

const SIDEBAR_KEY = 'reckoner_sidebar_collapsed_v2';
function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  const button = document.getElementById('sidebarToggle');
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', collapsed ? 'Expand side menu' : 'Collapse side menu');
  button.title = collapsed ? 'Expand side menu' : 'Collapse side menu';
}
try {
  const stored = localStorage.getItem(SIDEBAR_KEY);
  setSidebarCollapsed(stored === null || stored === '1');
} catch (error) {
  setSidebarCollapsed(true);
}
setControlHandler('sidebarToggle', 'onclick', () => {
  const collapsed = !document.body.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(collapsed);
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch (error) {}
});
function syncMenuGroups() {
  document
    .querySelectorAll('.menu-group')
    .forEach((g) => g.classList.toggle('has-active', !!g.querySelector('.tab.active')));
}
// Navigation links load dedicated PHP pages; view selection happens in applyRole().

setControlHandler('exportBtn', 'onclick', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'resource-bookings.json';
  a.click();
});

/* ============================================================
   EXCEL EXPORT & MANAGEMENT ANALYSIS  (ExcelJS)
   ============================================================ */
const EXC = {
  navy: 'FF16273F',
  steel: 'FF2E5984',
  white: 'FFFFFFFF',
  ink: 'FF111827',
  muted: 'FF6B7280',
  soft: 'FFF3F6FA',
  line: 'FFD7DEE7',
  wknd: 'FFDFE5EC',
  busy: 'FFC62828',
  busyBg: 'FFF3B9B9',
  free: 'FF1F8A3B',
  freeBg: 'FFDBEDDC',
  soon: 'FFB26A00',
  soonBg: 'FFFDECCD',
  potential: 'FF7048B6',
  potentialBg: 'FFDFD2F5',
  leave: 'FF546E7A',
  leaveBg: 'FFC9D3D9',
  yellow: 'FFFFF2CC',
};
function xfill(a) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: a } };
}
function xborder() {
  const s = { style: 'thin', color: { argb: EXC.line } };
  return { top: s, left: s, bottom: s, right: s };
}
function styleHeader(row) {
  row.eachCell((c) => {
    c.fill = xfill(EXC.steel);
    c.font = { bold: true, color: { argb: EXC.white }, size: 11 };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = xborder();
  });
  row.height = 22;
}
function sheetTitle(ws, text, cols, sub) {
  ws.mergeCells(1, 1, 1, cols);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { bold: true, size: 15, color: { argb: EXC.navy } };
  ws.getRow(1).height = 26;
  if (sub) {
    ws.mergeCells(2, 1, 2, cols);
    const s = ws.getCell(2, 1);
    s.value = sub;
    s.font = { size: 10, color: { argb: EXC.muted } };
  }
}
function pctCell(cell, frac) {
  cell.value = frac;
  cell.numFmt = '0%';
  cell.alignment = { horizontal: 'center' };
}
function blockBar(frac, width) {
  const n = Math.max(0, Math.min(width, Math.round((frac || 0) * width)));
  return '█'.repeat(n) + '░'.repeat(width - n);
}
function bandColor(u) {
  return u < 0.4 ? EXC.busy : u < 0.75 ? EXC.soon : EXC.free;
}
function pct(x) {
  return Math.round((x || 0) * 100) + '%';
}
function workDaysBetween(s, e) {
  let n = 0;
  for (let d = parse(s); d <= parse(e); d = addDays(d, 1)) if (!isWknd(d)) n++;
  return n;
}
function colorScaleCF(ws, ref) {
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'colorScale',
        priority: 1,
        cfvo: [
          { type: 'num', value: 0 },
          { type: 'num', value: 0.5 },
          { type: 'num', value: 1 },
        ],
        color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
      },
    ],
  });
}
async function saveWb(wb, name, btn, label) {
  try {
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
}
function needExcel() {
  if (typeof ExcelJS === 'undefined') {
    alert(
      'The Excel library could not load from this site. Reload the page, then contact the administrator if it still fails.',
    );
    return true;
  }
  return false;
}

/* ---------- Excel export in EMPLOYEE TIMESHEET format ----------
   Produces a "Timesheet" sheet laid out exactly like Timesheet_Format.xlsx:
     row 1  title band              row 2  instruction band
     row 3  From / To / Total Hrs / Chargeable / Non-Chargeable (live formulas)
     row 5  column headers          row 6+ one row per person per working day
   Every setting below can be edited without touching the rest of the code. */
const TS_CFG = {
  hoursPerDay: 8, // hours expected against each booked working day
  defaultStart: '09:00', // start time used when pre-filling rows
  hoursForLeave: 0, // 0 = leave rows left blank; set to e.g. 7.5 to log leave hours
  chargeableEntity: 'Adlershine',
  nonChargeableEntity: 'Reckoner',
  defaultAssignment: 'Audit', // used when a booking has no stage / note
  defaultWorkArea: 'Fieldwork',
  homeFirm: 'Reckoner', // your own clients
  firmList: ['Reckoner', 'BKL', 'Adlershine', 'ThorneWidgery', 'Mgr'], // channels you deliver through
  capMode: 'block', // "block" or "warn" when a job's booked hours are used up
  includePotential: true, // include provisional bookings
  potentialIsChargeable: false, // provisional time booked as Non-Chargeable by default
  includeWeekends: false, // skip Sat/Sun
  blankRows: 25, // spare formatted rows for manual entry
  entityList: ['Reckoner', 'BKL', 'Adlershine', 'ThorneWidgery', 'Mgr', 'Other'],
  typeList: ['Chargeable', 'Non-Chargeable', 'Leave', 'Statutory Holiday', 'Break'],
  assignmentList: [
    'Audit',
    'Accounts',
    'Tax',
    'Review engagement',
    'Teams meeting',
    'Other work',
    'Half Day Leave',
  ],
  workAreaList: [
    'Planning',
    'Fieldwork',
    'Completion',
    'Review',
    'Internal',
    'Training',
    'Admin',
    'Travel',
  ],
};
const TSC = {
  title: 'FF1B3A5C',
  sub: 'FF2E6DA4',
  label: 'FF1A5276',
  dark: 'FF2C3E50',
  input: 'FFFFFACD',
  hoursBg: 'FFD6E4F0',
  cellBg: 'FFF7F9FC',
  numBg: 'FFECF0F1',
  white: 'FFFFFFFF',
  labelFg: 'FFAED6F1',
  blue: 'FF0000FF',
  hoursFg: 'FF2E6DA4',
  red: 'FFFF0000',
  line: 'FFBDC3C7',
  timeBg: 'FFFFFDF0',
};
function tsFill(a) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: a } };
}
function tsBorder() {
  const s = { style: 'thin', color: { argb: TSC.line } };
  return { top: s, left: s, bottom: s, right: s };
}
function tsList(arr) {
  return { type: 'list', allowBlank: true, formulae: ['"' + arr.join(',') + '"'] };
}
function tsClip(s, e, from, to) {
  const a = s < from ? from : s,
    b = e > to ? to : e;
  return b < a ? null : [a, b];
}

/* ---------- time helpers: "HH:MM" ⇄ hours ⇄ Excel day fraction ---------- */
function tMin(t) {
  const m = /^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i.exec(String(t || '').trim());
  if (!m) return null;
  let hour = +m[1],
    minute = +m[2];
  if (minute > 59) return null;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}
function normalizeTime(t) {
  const mins = tMin(t);
  return mins === null
    ? null
    : String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}
function tFrac(t) {
  const m = tMin(t);
  return m === null ? null : m / 1440;
}
function hoursBetween(s, e) {
  const a = tMin(s),
    b = tMin(e);
  if (a === null || b === null) return null;
  let d = b - a;
  if (d < 0) d += 1440; /* overnight */
  return d / 60;
}
function formatAmPm(t) {
  const mins = tMin(t);
  if (mins === null) return '';
  const hour = Math.floor(mins / 60),
    minute = mins % 60,
    suffix = hour >= 12 ? 'PM' : 'AM',
    hour12 = hour % 12 || 12;
  return String(hour12).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ' ' + suffix;
}
function addMinutes(t, mins) {
  const a = tMin(t);
  if (a === null) return '';
  const x = (((a + mins) % 1440) + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
}
/* the single source of truth for "how many hours is this row" */
function entryHours(e) {
  const c = hoursBetween(e.start, e.end);
  if (c !== null) return c;
  return e.hours === null || e.hours === undefined || e.hours === '' ? 0 : +e.hours || 0;
}

function exportBillingLabel(p) {
  return p.name + ' · ' + p.id + (p.pod ? ' · ' + p.pod : '');
}
/* one row per person per working day, sorted by employee then date */
function timesheetRows() {
  const pmap = Object.fromEntries(state.roster.map((r) => [r.id, r]));
  const from = state.settings.start,
    to = state.settings.end,
    out = [];
  const st = TS_CFG.defaultStart,
    en = addMinutes(st, Math.round(TS_CFG.hoursPerDay * 60));
  state.bookings.forEach((b) => {
    const pot = isPotential(b);
    if (pot && !TS_CFG.includePotential) return;
    const sp = tsClip(b.start, b.end, from, to);
    if (!sp) return;
    const r = pmap[b.personId];
    const type = !pot || TS_CFG.potentialIsChargeable ? 'Chargeable' : 'Non-Chargeable';
    const entity = type === 'Chargeable' ? TS_CFG.chargeableEntity : TS_CFG.nonChargeableEntity;
    const asg = (b.stage || b.note || TS_CFG.defaultAssignment) + (pot ? ' (potential)' : '');
    for (let d = parse(sp[0]); d <= parse(sp[1]); d = addDays(d, 1)) {
      if (!TS_CFG.includeWeekends && isWknd(d)) continue;
      out.push({
        name: r ? r.name : '(removed)',
        empNo: r ? r.id : b.personId,
        billingTo: r ? exportBillingLabel(r) : b.personId,
        bookingId: b.id,
        entity,
        type,
        date: new Date(d),
        start: st,
        end: en,
        hours: TS_CFG.hoursPerDay,
        client: b.client || '',
        assignment: asg,
        workArea: TS_CFG.defaultWorkArea,
      });
    }
  });
  state.leaves.forEach((l) => {
    const sp = tsClip(l.start, l.end, from, to);
    if (!sp) return;
    const r = pmap[l.personId],
      t = l.type || 'Other';
    const type = /stat|holiday|public|bank/i.test(t) ? 'Statutory Holiday' : 'Leave';
    for (let d = parse(sp[0]); d <= parse(sp[1]); d = addDays(d, 1)) {
      if (!TS_CFG.includeWeekends && isWknd(d)) continue;
      out.push({
        name: r ? r.name : '(removed)',
        empNo: r ? r.id : l.personId,
        billingTo: r ? exportBillingLabel(r) : l.personId,
        bookingId: '',
        entity: '',
        type,
        date: new Date(d),
        start: '',
        end: '',
        hours: TS_CFG.hoursForLeave || null,
        client: '',
        assignment: t + ' leave' + (l.note ? ' – ' + l.note : ''),
        workArea: '',
      });
    }
  });
  return out.sort((a, b) =>
    a.name < b.name
      ? -1
      : a.name > b.name
        ? 1
        : a.date - b.date || (a.client < b.client ? -1 : a.client > b.client ? 1 : 0),
  );
}

/* turn stored timesheet entries into export rows */
function entriesToRows(list) {
  const pmap = Object.fromEntries(state.roster.map((r) => [r.id, r]));
  return list
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => {
      const r = pmap[e.personId],
        billed = (state.billingRoster || state.roster).find(
          (p) => p.id === (e.billingTo || e.personId),
        );
      return {
        name: r ? r.name : '(removed)',
        empNo: r ? r.id : e.personId,
        billingTo: billed ? exportBillingLabel(billed) : e.billingTo || e.personId,
        bookingId: e.bookingId || '',
        entity: e.entity || '',
        type: e.type || '',
        date: parse(e.date),
        start: e.start || '',
        end: e.end || '',
        hours: e.hours === null || e.hours === undefined || e.hours === '' ? null : +e.hours,
        client: e.client || '',
        assignment: e.assignment || '',
        workArea: e.workArea || '',
        notes: e.notes || '',
      };
    });
}

/* ---------- the sheet ----------
   A #  B Employee Name  C Employee No  D Entity  E Type  F Billing As  G Date  H Start  I End
   J Hours (Auto)  K Client Name  L Assignment  M Work Area  N Work Done  O Linked Booking ID      */
function buildTimesheetSheet(wb, rows, opts) {
  opts = opts || {};
  const name = (opts.name || 'Timesheet').slice(0, 31);
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: TSC.title } },
    views: [{ state: 'frozen', ySplit: 5 }],
  });
  const blanks = opts.blankRows === undefined ? TS_CFG.blankRows : opts.blankRows;
  const total = rows.length + blanks,
    last = 5 + Math.max(total, 1);
  const from = opts.from || state.settings.start,
    to = opts.to || state.settings.end;

  const band = (row, argb, font, text, height) => {
    ws.mergeCells(row, 1, row, 15);
    for (let c = 1; c <= 15; c++) {
      const x = ws.getCell(row, c);
      x.fill = tsFill(argb);
      x.font = font;
      x.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    ws.getCell(row, 1).value = text;
    ws.getRow(row).height = height;
  };
  band(
    1,
    TSC.title,
    { name: 'Arial', size: 13, bold: true, color: { argb: TSC.white } },
    '📝 EMPLOYEE TIMESHEET',
    38,
  );
  band(
    2,
    TSC.sub,
    { name: 'Arial', size: 9, bold: true, color: { argb: TSC.white } },
    'Use DROPDOWNS for Entity, Type, Assignment and Work Area. Enter Start and End time and Hours calculates itself — only type into Hours if you have no times. Never free-type dropdown fields.',
    24,
  );

  /* row 3 – period and totals */
  ws.getRow(3).height = 26;
  const softLbl = (ref, txt) => {
    const x = ws.getCell(ref);
    x.value = txt;
    x.fill = tsFill(TSC.label);
    x.font = { name: 'Calibri', size: 9, bold: true, color: { argb: TSC.labelFg } };
    x.alignment = { horizontal: 'center', vertical: 'middle' };
  };
  const darkLbl = (ref, txt) => {
    const x = ws.getCell(ref);
    x.value = txt;
    x.fill = tsFill(TSC.dark);
    x.font = { name: 'Arial', size: 9, bold: true, color: { argb: TSC.white } };
    x.alignment = { horizontal: 'center', vertical: 'middle' };
  };
  const dateBox = (ref, isoDate) => {
    const x = ws.getCell(ref);
    x.value = excelDate(isoDate);
    x.numFmt = 'dd-mmm-yyyy';
    x.fill = tsFill(TSC.input);
    x.font = { name: 'Calibri', size: 10, bold: true, color: { argb: TSC.blue } };
    x.alignment = { horizontal: 'center', vertical: 'middle' };
  };
  const totBox = (ref, f) => {
    const x = ws.getCell(ref);
    x.value = { formula: f };
    x.numFmt = '0.00';
    x.fill = tsFill(TSC.hoursBg);
    x.border = tsBorder();
    x.font = { name: 'Calibri', size: 11, bold: true, color: { argb: TSC.hoursFg } };
    x.alignment = { horizontal: 'center', vertical: 'middle' };
  };
  softLbl('A3', 'From:');
  dateBox('B3', from);
  softLbl('C3', 'To:');
  dateBox('D3', to);
  darkLbl('E3', 'Total Hrs:');
  totBox('F3', 'IFERROR(SUM(J6:J' + last + '),0)');
  darkLbl('G3', 'Chargeable:');
  totBox('H3', 'IFERROR(SUMIF(E6:E' + last + ',"Chargeable",J6:J' + last + '),0)');
  darkLbl('I3', 'Non-Charg:');
  totBox('J3', 'IFERROR(SUMIF(E6:E' + last + ',"Non-Chargeable",J6:J' + last + '),0)');
  darkLbl('K3', 'Days:');
  totBox('L3', 'SUMPRODUCT((G6:G' + last + '<>"")/COUNTIF(G6:G' + last + ',G6:G' + last + '&""))');

  /* row 4 – format hints */
  const hint = (ref, txt) => {
    const x = ws.getCell(ref);
    x.value = txt;
    x.font = { name: 'Calibri', size: 10, bold: true, color: { argb: TSC.red } };
    x.alignment = { horizontal: 'right' };
    x.border = tsBorder();
  };
  hint('G4', 'dd/mm/yyyy*');
  hint('H4', 'hh:mm*');
  hint('I4', 'hh:mm*');

  /* row 5 – column headers */
  const heads = [
    '#',
    'Employee Name',
    'Employee No',
    'Entity',
    'Type (Chargeable / Non-Chargeable)',
    'Billing As',
    'Date',
    'Start Time',
    'End Time',
    'Hours (Auto)',
    'Client Name',
    'Assignment',
    'Work Area',
    'Work Done',
    'Linked Booking ID',
  ];
  heads.forEach((t, i) => {
    const x = ws.getCell(5, i + 1);
    x.value = t;
    x.fill = tsFill(TSC.dark);
    x.font = { name: 'Arial', size: 9, bold: true, color: { argb: TSC.white } };
    x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    x.border = tsBorder();
  });
  ws.getRow(5).height = 32;

  /* rows 6+ – data, then spare formatted rows that calculate themselves */
  for (let i = 0; i < Math.max(total, 1); i++) {
    const d = rows[i] || null,
      rn = 6 + i,
      row = ws.getRow(rn);
    row.height = 20;
    const set = (col, val, fill, font, align, numFmt) => {
      const x = ws.getCell(rn, col);
      if (val !== null && val !== undefined && val !== '') x.value = val;
      x.fill = tsFill(fill);
      x.font = font;
      x.border = tsBorder();
      if (align) x.alignment = align;
      if (numFmt) x.numFmt = numFmt;
    };
    const mid = { horizontal: 'center', vertical: 'middle' },
      left = { horizontal: 'left', vertical: 'middle' };
    const body = { name: 'Calibri', size: 11 },
      nameF = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
    set(1, i + 1, TSC.numBg, { name: 'Arial', size: 8 }, mid);
    set(2, d ? d.name : null, TSC.white, nameF, left);
    set(3, d ? d.empNo : null, TSC.cellBg, body, mid);
    set(4, d ? d.entity : null, TSC.cellBg, body, mid);
    set(5, d ? d.type : null, TSC.cellBg, body, mid);
    set(6, d ? d.billingTo : null, TSC.cellBg, body, left);
    set(7, d ? excelDate(d.date) : null, TSC.cellBg, body, mid, 'dd/mm/yyyy');
    set(8, d ? tFrac(d.start) : null, TSC.timeBg, body, mid, 'hh:mm');
    set(9, d ? tFrac(d.end) : null, TSC.timeBg, body, mid, 'hh:mm');

    /* Hours: a live formula whenever times could drive it, a plain number otherwise */
    const hcell = ws.getCell(rn, 10);
    const manual = d && tFrac(d.start) === null && d.hours !== null && d.hours !== undefined;
    if (manual) hcell.value = +d.hours;
    else
      hcell.value = {
        formula: `IFERROR(IF(AND(H${rn}>0,I${rn}>0),MOD(I${rn}-H${rn},1)*24,""),"")`,
      };
    hcell.numFmt = '0.00';
    hcell.fill = tsFill(TSC.hoursBg);
    hcell.border = tsBorder();
    hcell.alignment = mid;
    hcell.font = { name: 'Arial', size: 10, bold: true, color: { argb: TSC.hoursFg } };

    set(11, d ? d.client : null, TSC.cellBg, body, left);
    set(12, d ? d.assignment : null, TSC.cellBg, body, left);
    set(13, d ? d.workArea : null, TSC.cellBg, body, mid);
    set(14, d ? d.notes || null : null, TSC.cellBg, body, left);
    set(15, d ? d.bookingId : null, TSC.cellBg, body, left);
    ws.getCell(rn, 4).dataValidation = tsList(TS_CFG.entityList);
    ws.getCell(rn, 5).dataValidation = tsList(TS_CFG.typeList);
    ws.getCell(rn, 12).dataValidation = tsList(TS_CFG.assignmentList);
    ws.getCell(rn, 13).dataValidation = tsList(TS_CFG.workAreaList);
  }
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 15 } };
  [6.9, 22, 14, 14, 35.3, 30, 14, 12, 12, 12.7, 29.1, 18.6, 21.7, 30, 22].forEach(
    (w, i) => (ws.getColumn(i + 1).width = w),
  );
  return ws;
}

async function downloadBlankTimesheetTemplate() {
  if (needExcel()) return;
  const button = document.getElementById('msTemplate'),
    label = button.textContent;
  button.disabled = true;
  button.textContent = 'Building…';
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Reckoner Resource & Timesheet Portal';
    const ws = wb.addWorksheet('Timesheet', { views: [{ state: 'frozen', ySplit: 1 }] });
    const lists = wb.addWorksheet('Lists');
    lists.state = 'veryHidden';
    const billing = (state.billingRoster || []).map((x) => `${x.name} · ${x.id}`);
    const employees = (state.roster || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const listColumns = [
      refValues('entity'),
      refValues('type'),
      billing,
      refValues('client'),
      refValues('assignment'),
      refValues('work_area'),
    ];
    const ranges = [];
    listColumns.forEach((values, index) => {
      const col = index + 1;
      lists.getCell(1, col).value = [
        'Entity',
        'Type',
        'Billing As',
        'Client',
        'Assignment',
        'Work Area',
      ][index];
      values.forEach((value, row) => (lists.getCell(row + 2, col).value = value));
      const letter = String.fromCharCode(65 + index);
      ranges.push(`'Lists'!$${letter}$2:$${letter}$${Math.max(2, values.length + 1)}`);
    });
    lists.getCell('G1').value = 'Employee Name';
    lists.getCell('H1').value = 'Employee No';
    employees.forEach((person, index) => {
      lists.getCell(index + 2, 7).value = person.name;
      lists.getCell(index + 2, 8).value = person.id;
    });
    const employeeRange = `'Lists'!$G$2:$G$${Math.max(2, employees.length + 1)}`;
    const employeeLookup = `'Lists'!$G$2:$H$${Math.max(2, employees.length + 1)}`;
    const headers = [
      'Employee Name',
      'Employee No',
      'Entity',
      'Type',
      'Billing As',
      'Date',
      'Start',
      'End',
      'Hours',
      'Client',
      'Assignment',
      'Work Area',
      'Work Done (Description)',
    ];
    ws.getRow(1).values = headers;
    ws.getRow(1).height = 30;
    ws.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF26A21' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    const own = session && !isAdmin() ? state.roster.find((x) => x.id === session.personId) : null;
    for (let row = 2; row <= 201; row++) {
      if (own) ws.getCell(row, 1).value = own.name;
      ws.getCell(row, 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [employeeRange],
      };
      ws.getCell(row, 2).value = {
        formula: `IF(A${row}="","",IFERROR(VLOOKUP(A${row},${employeeLookup},2,FALSE),""))`,
      };
      [
        [3, 0],
        [4, 1],
        [5, 2],
        [10, 3],
        [11, 4],
        [12, 5],
      ].forEach(([column, list]) => {
        ws.getCell(row, column).dataValidation = {
          type: 'list',
          allowBlank: column !== 3 && column !== 4,
          formulae: [ranges[list]],
        };
      });
      ws.getCell(row, 6).numFmt = 'dd/mm/yyyy';
      ws.getCell(row, 7).numFmt = 'hh:mm AM/PM';
      ws.getCell(row, 8).numFmt = 'hh:mm AM/PM';
      ws.getCell(row, 9).value = {
        formula: `IF(AND(G${row}<>"",H${row}<>""),MOD(H${row}-G${row},1)*24,"")`,
      };
      ws.getCell(row, 9).numFmt = '0.00';
      for (let column = 1; column <= 13; column++) {
        const cell = ws.getCell(row, column);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: row % 2 ? 'FFFFF8F3' : 'FFFFFFFF' },
        };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE7D9D1' } } };
      }
    }
    [25, 14, 18, 20, 30, 14, 14, 14, 11, 30, 24, 24, 42].forEach(
      (width, index) => (ws.getColumn(index + 1).width = width),
    );
    wb.calcProperties.fullCalcOnLoad = true;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 13 } };
    await saveWb(wb, `reckoner-timesheet-template-${todayISO()}.xlsx`, button, label);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

setControlHandler('excelBtn', 'onclick', async () => {
  if (needExcel()) return;
  const btn = document.getElementById('excelBtn');
  btn.disabled = true;
  btn.textContent = 'Building…';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Resource Booking Tracker';
  const pmap = Object.fromEntries(state.roster.map((r) => [r.id, r]));

  /* main deliverable – timesheet format */
  const rows = timesheetRows();
  buildTimesheetSheet(wb, rows);

  /* supporting raw-data sheets (delete these three blocks if you only want the timesheet) */
  const ws1 = wb.addWorksheet('Roster', { properties: { tabColor: { argb: EXC.steel } } });
  ws1.columns = [{ width: 10 }, { width: 26 }, { width: 22 }, { width: 30 }];
  ws1.addRow(['ID', 'Name', 'Pod / team', 'Role']);
  styleHeader(ws1.getRow(1));
  state.roster.forEach((r) => ws1.addRow([r.id, r.name, r.pod, r.role]));

  const ws2 = wb.addWorksheet('Bookings', { properties: { tabColor: { argb: EXC.busy } } });
  ws2.columns = [
    { width: 26 },
    { width: 20 },
    { width: 16 },
    { width: 34 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 8 },
    { width: 13 },
    { width: 30 },
  ];
  ws2.addRow([
    'Person (billed as)',
    'Pod',
    'Firm / channel',
    'Client / assignment',
    'Type',
    'Stage',
    'Start',
    'End',
    'Days',
    'Working days',
    'Note',
  ]);
  styleHeader(ws2.getRow(1));
  state.bookings
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .forEach((b) => {
      const r = pmap[b.personId];
      const row = ws2.addRow([
        r ? r.name : '(removed)',
        r ? r.pod : '—',
        b.firm || TS_CFG.homeFirm,
        b.client,
        isPotential(b) ? 'Potential' : 'Confirmed',
        b.stage || '',
        b.start,
        b.end,
        dayDiff(b.start, b.end) + 1,
        workDaysBetween(b.start, b.end),
        b.note || '',
      ]);
      row.getCell(5).font = {
        bold: true,
        color: { argb: isPotential(b) ? EXC.potential : EXC.free },
      };
    });
  ws2.views = [{ state: 'frozen', ySplit: 1 }];
  ws2.autoFilter = { from: 'A1', to: 'K1' };

  const ws3 = wb.addWorksheet('Leaves', { properties: { tabColor: { argb: EXC.leave } } });
  ws3.columns = [
    { width: 26 },
    { width: 20 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 8 },
    { width: 13 },
    { width: 30 },
  ];
  ws3.addRow(['Person', 'Pod', 'Type', 'From', 'To', 'Days', 'Working days', 'Note']);
  styleHeader(ws3.getRow(1));
  state.leaves
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .forEach((l) => {
      const r = pmap[l.personId];
      ws3.addRow([
        r ? r.name : '(removed)',
        r ? r.pod : '—',
        l.type || 'Other',
        l.start,
        l.end,
        dayDiff(l.start, l.end) + 1,
        workDaysBetween(l.start, l.end),
        l.note || '',
      ]);
    });
  ws3.views = [{ state: 'frozen', ySplit: 1 }];
  ws3.autoFilter = { from: 'A1', to: 'H1' };

  const ws4 = wb.addWorksheet('Settings');
  ws4.columns = [{ width: 26 }, { width: 26 }];
  ws4.addRow(['Setting', 'Value']);
  styleHeader(ws4.getRow(1));
  ws4.addRow(['Range from', state.settings.start]);
  ws4.addRow(['Range to', state.settings.end]);
  ws4.addRow(['As-of date', state.settings.asOf]);
  ws4.addRow(['Free soon window (days)', state.settings.soonDays]);
  ws4.addRow(['Timesheet rows', rows.length]);
  ws4.addRow(['Hours per working day', TS_CFG.hoursPerDay]);
  ws4.addRow(['Exported', new Date().toLocaleString()]);

  await saveWb(
    wb,
    'timesheet-' + state.settings.start + '_' + state.settings.end + '.xlsx',
    btn,
    'Export Timesheet',
  );
});

/* ---------- analysis computation ---------- */
function computeAnalysis() {
  const days = rangeDates();
  const workDays = days.filter((d) => !isWknd(d));
  const dayClass = (pid, s) => {
    if (state.leaves.some((l) => l.personId === pid && l.start <= s && l.end >= s)) return 'lv';
    if (
      state.bookings.some(
        (b) => b.personId === pid && !isPotential(b) && b.start <= s && b.end >= s,
      )
    )
      return 'conf';
    if (
      state.bookings.some((b) => b.personId === pid && isPotential(b) && b.start <= s && b.end >= s)
    )
      return 'pot';
    return 'free';
  };
  const per = state.roster.map((r) => {
    let conf = 0,
      pot = 0,
      lv = 0,
      free = 0;
    workDays.forEach((d) => {
      const c = dayClass(r.id, iso(d));
      if (c === 'lv') lv++;
      else if (c === 'conf') conf++;
      else if (c === 'pot') pot++;
      else free++;
    });
    const avail = workDays.length - lv;
    return {
      r,
      conf,
      pot,
      lv,
      free,
      work: workDays.length,
      avail,
      util: avail ? conf / avail : 0,
      pipe: avail ? (conf + pot) / avail : 0,
    };
  });
  const sum = (arr, k) => arr.reduce((m, x) => m + x[k], 0);
  const podStats = pods().map((p) => {
    const rows = per.filter((x) => x.r.pod === p);
    const avail = sum(rows, 'avail');
    return {
      pod: p,
      n: rows.length,
      conf: sum(rows, 'conf'),
      pot: sum(rows, 'pot'),
      lv: sum(rows, 'lv'),
      free: sum(rows, 'free'),
      avail,
      util: avail ? sum(rows, 'conf') / avail : 0,
      pipe: avail ? (sum(rows, 'conf') + sum(rows, 'pot')) / avail : 0,
    };
  });
  const weeks = [];
  workDays.forEach((d) => {
    const monday = addDays(d, -((d.getDay() + 6) % 7));
    const k = iso(monday);
    let w = weeks.find((x) => x.key === k);
    if (!w) {
      w = { key: k, conf: 0, pot: 0, lv: 0, free: 0, total: 0 };
      weeks.push(w);
    }
    const s = iso(d);
    state.roster.forEach((r) => {
      w.total++;
      const c = dayClass(r.id, s);
      if (c === 'lv') w.lv++;
      else if (c === 'conf') w.conf++;
      else if (c === 'pot') w.pot++;
      else w.free++;
    });
  });
  const clip = (b) => {
    const s = b.start < state.settings.start ? state.settings.start : b.start;
    const e = b.end > state.settings.end ? state.settings.end : b.end;
    return e < s ? 0 : workDaysBetween(s, e);
  };
  const clientStats = clients()
    .map((c) => {
      const bs = state.bookings.filter((b) => b.client === c);
      const conf = bs.filter((b) => !isPotential(b)).reduce((m, b) => m + clip(b), 0);
      const pot = bs.filter(isPotential).reduce((m, b) => m + clip(b), 0);
      const ppl = new Set(bs.map((b) => b.personId)).size;
      const minS = bs.reduce((m, b) => (b.start < m ? b.start : m), bs[0].start);
      const maxE = bs.reduce((m, b) => (b.end > m ? b.end : m), bs[0].end);
      const type = conf && pot ? 'Mixed' : pot ? 'Potential' : 'Confirmed';
      return { client: c, conf, pot, total: conf + pot, ppl, minS, maxE, type };
    })
    .sort((a, b) => b.total - a.total);
  const conflicts = [];
  state.roster.forEach((r) => {
    const bs = state.bookings.filter((b) => b.personId === r.id);
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i],
          b = bs[j];
        if (a.start <= b.end && b.start <= a.end)
          conflicts.push({
            name: r.name,
            pod: r.pod,
            kind: 'Double booking',
            detail: a.client + ' ↔ ' + b.client,
            span:
              fmt(a.start > b.start ? a.start : b.start) +
              ' – ' +
              fmt(a.end < b.end ? a.end : b.end),
          });
      }
    bs.forEach((b) =>
      state.leaves
        .filter((l) => l.personId === r.id && l.start <= b.end && l.end >= b.start)
        .forEach((l) =>
          conflicts.push({
            name: r.name,
            pod: r.pod,
            kind: 'Booked over leave',
            detail: b.client + ' ↔ ' + (l.type || 'Other') + ' leave',
            span:
              fmt(b.start > l.start ? b.start : l.start) +
              ' – ' +
              fmt(b.end < l.end ? b.end : l.end),
          }),
        ),
    );
  });
  const totalAvail = sum(per, 'avail'),
    totalConf = sum(per, 'conf'),
    totalPot = sum(per, 'pot'),
    totalLv = sum(per, 'lv'),
    totalFree = sum(per, 'free'),
    totalWork = sum(per, 'work');
  const bench = per.filter((x) => x.avail > 0 && x.util < 0.5).sort((a, b) => a.util - b.util);
  const pipeClients = clientStats.filter((c) => c.conf === 0 && c.pot > 0);
  const pipeDays = pipeClients.reduce((m, c) => m + c.pot, 0);
  const lim = iso(addDays(parse(state.settings.asOf), 14));
  const upcomingLeaves = state.leaves.filter(
    (l) => l.start > state.settings.asOf && l.start <= lim,
  ).length;
  return {
    days,
    workDays,
    per,
    podStats,
    weeks,
    clientStats,
    conflicts,
    bench,
    pipeClients,
    pipeDays,
    upcomingLeaves,
    totalAvail,
    totalConf,
    totalPot,
    totalLv,
    totalFree,
    totalWork,
    util: totalAvail ? totalConf / totalAvail : 0,
    pipe: totalAvail ? (totalConf + totalPot) / totalAvail : 0,
    dayClass,
  };
}
function buildInsights(A) {
  const I = [];
  I.push(
    'Overall confirmed utilisation is ' +
      pct(A.util) +
      ' of available capacity (' +
      A.totalConf +
      ' of ' +
      A.totalAvail +
      ' person-days). Including potential work the book rises to ' +
      pct(A.pipe) +
      '.',
  );
  if (A.weeks.length > 1) {
    const peak = [...A.weeks].sort((a, b) => b.conf / b.total - a.conf / a.total)[0];
    const low = [...A.weeks].sort((a, b) => a.conf / a.total - b.conf / b.total)[0];
    I.push(
      'Peak load is the week of ' +
        fmt(peak.key) +
        ' (' +
        pct(peak.conf / peak.total) +
        ' confirmed); the lightest is the week of ' +
        fmt(low.key) +
        ' (' +
        pct(low.conf / low.total) +
        ') — a window for potential work, training or leave.',
    );
  }
  if (A.podStats.length > 1) {
    const hi = [...A.podStats].sort((a, b) => b.util - a.util)[0];
    const lo = [...A.podStats].sort((a, b) => a.util - b.util)[0];
    if (hi.pod !== lo.pod)
      I.push(
        hi.pod +
          ' is the most loaded pod (' +
          pct(hi.util) +
          ' utilised); ' +
          lo.pod +
          ' has the most spare capacity (' +
          pct(lo.util) +
          '). Consider rebalancing assignments across pods.',
      );
  }
  if (A.bench.length)
    I.push(
      A.bench.length +
        ' staff are below 50% confirmed utilisation (' +
        A.bench
          .slice(0, 5)
          .map((x) => x.r.name)
          .join(', ') +
        (A.bench.length > 5 ? '…' : '') +
        ') — priority candidates for the next assignments.',
    );
  if (A.pipeClients.length)
    I.push(
      A.pipeClients.length +
        ' client(s) are pipeline-only (' +
        A.pipeClients
          .slice(0, 4)
          .map((c) => c.client)
          .join(', ') +
        (A.pipeClients.length > 4 ? '…' : '') +
        '), worth ' +
        A.pipeDays +
        ' potential person-days. Converting them would lift utilisation by about ' +
        pct(A.totalAvail ? A.pipeDays / A.totalAvail : 0) +
        '.',
    );
  if (A.conflicts.length)
    I.push(
      A.conflicts.length +
        ' scheduling conflict(s) — double bookings or work booked over approved leave — need resolution. See the Risks & Conflicts sheet.',
    );
  else I.push('No double bookings or leave clashes detected in the selected range.');
  if (A.upcomingLeaves)
    I.push(
      A.upcomingLeaves +
        ' leave(s) begin within 14 days of the as-of date — arrange cover in advance.',
    );
  I.push(
    'Leave absorbs ' +
      A.totalLv +
      ' person-days (' +
      pct(A.totalWork ? A.totalLv / A.totalWork : 0) +
      ' of gross capacity); ' +
      A.totalFree +
      ' bench person-days remain unsold in this range.',
  );
  return I;
}

/* ---------- analysis workbook ---------- */
setControlHandler('analysisBtn', 'onclick', async () => {
  if (needExcel()) return;
  const btn = document.getElementById('analysisBtn');
  btn.disabled = true;
  btn.textContent = 'Analysing…';
  const A = computeAnalysis();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Resource Booking Tracker';
  const period = fmt(state.settings.start) + ' – ' + fmt(state.settings.end);

  /* --- 1. Executive Summary --- */
  const ex = wb.addWorksheet('Executive Summary', { properties: { tabColor: { argb: EXC.navy } } });
  ex.columns = [
    { width: 3 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 3 },
  ];
  sheetTitle(
    ex,
    'Resource Capacity Analysis — ' + period,
    9,
    'Prepared ' +
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' · ' +
      state.roster.length +
      ' staff · working days (Mon–Fri) only · as-of date ' +
      fmt(state.settings.asOf),
  );
  const kpis = [
    ['Staff', state.roster.length, EXC.navy],
    ['Utilisation', pct(A.util), bandColor(A.util)],
    ['Incl. pipeline', pct(A.pipe), EXC.potential],
    ['Bench days', A.totalFree, EXC.soon],
    ['Leave days', A.totalLv, EXC.leave],
    ['Conflicts', A.conflicts.length, A.conflicts.length ? EXC.busy : EXC.free],
    ['Clients', A.clientStats.length, EXC.steel],
  ];
  kpis.forEach((k, i) => {
    const col = i + 2;
    const v = ex.getCell(4, col);
    v.value = k[1];
    v.font = { bold: true, size: 18, color: { argb: k[2] } };
    v.alignment = { horizontal: 'center' };
    const l = ex.getCell(5, col);
    l.value = k[0].toUpperCase();
    l.font = { size: 8, bold: true, color: { argb: EXC.muted } };
    l.alignment = { horizontal: 'center' };
    [4, 5].forEach((rr) => {
      const c = ex.getCell(rr, col);
      c.fill = xfill(EXC.soft);
      c.border = xborder();
    });
  });
  ex.getRow(4).height = 26;
  /* capacity mix strip */
  ex.getCell(7, 2).value = 'CAPACITY MIX (gross person-days)';
  ex.getCell(7, 2).font = { size: 9, bold: true, color: { argb: EXC.muted } };
  ex.getRow(8).height = 16;
  {
    const c = ex.getCell(8, 2);
    ex.mergeCells(8, 2, 8, 8);
    const w = 60,
      t = Math.max(1, A.totalWork);
    const nC = Math.round((A.totalConf / t) * w),
      nP = Math.round((A.totalPot / t) * w),
      nL = Math.round((A.totalLv / t) * w);
    const nF = Math.max(0, w - nC - nP - nL);
    c.value = {
      richText: [
        { text: '█'.repeat(nC), font: { color: { argb: EXC.busy } } },
        { text: '█'.repeat(nP), font: { color: { argb: EXC.potential } } },
        { text: '█'.repeat(nL), font: { color: { argb: EXC.leave } } },
        { text: '█'.repeat(nF), font: { color: { argb: 'FFB8CDB9' } } },
      ],
    };
    const lg = ex.getCell(9, 2);
    ex.mergeCells(9, 2, 9, 8);
    lg.value = {
      richText: [
        { text: '█ ', font: { color: { argb: EXC.busy } } },
        { text: 'Confirmed ' + A.totalConf + '   ', font: { size: 9, color: { argb: EXC.muted } } },
        { text: '█ ', font: { color: { argb: EXC.potential } } },
        { text: 'Potential ' + A.totalPot + '   ', font: { size: 9, color: { argb: EXC.muted } } },
        { text: '█ ', font: { color: { argb: EXC.leave } } },
        { text: 'Leave ' + A.totalLv + '   ', font: { size: 9, color: { argb: EXC.muted } } },
        { text: '█ ', font: { color: { argb: 'FFB8CDB9' } } },
        { text: 'Bench ' + A.totalFree, font: { size: 9, color: { argb: EXC.muted } } },
      ],
    };
  }
  /* insights */
  ex.getCell(11, 2).value = 'KEY INSIGHTS FOR MANAGEMENT';
  ex.getCell(11, 2).font = { size: 9, bold: true, color: { argb: EXC.muted } };
  let rIns = 12;
  buildInsights(A).forEach((t, i) => {
    ex.mergeCells(rIns, 2, rIns, 8);
    const c = ex.getCell(rIns, 2);
    c.value = i + 1 + '.  ' + t;
    c.alignment = { wrapText: true, vertical: 'top' };
    c.font = { size: 10.5 };
    ex.getRow(rIns).height = Math.max(16, Math.ceil(t.length / 95) * 14 + 4);
    rIns++;
  });
  /* top clients */
  rIns++;
  ex.getCell(rIns, 2).value = 'TOP CLIENTS BY DEMAND (working person-days in range)';
  ex.getCell(rIns, 2).font = { size: 9, bold: true, color: { argb: EXC.muted } };
  rIns++;
  const th = ex.getRow(rIns);
  ['', 'Client', 'Type', 'People', 'Confirmed', 'Potential', 'Total', ''].forEach((v, i) => {
    if (v) th.getCell(i + 1).value = v;
  });
  for (let cc = 2; cc <= 7; cc++) {
    const c = th.getCell(cc);
    c.fill = xfill(EXC.steel);
    c.font = { bold: true, color: { argb: EXC.white }, size: 10 };
  }
  rIns++;
  A.clientStats.slice(0, 7).forEach((cs) => {
    const row = ex.getRow(rIns);
    row.getCell(2).value = cs.client;
    row.getCell(3).value = cs.type;
    row.getCell(4).value = cs.ppl;
    row.getCell(5).value = cs.conf;
    row.getCell(6).value = cs.pot;
    row.getCell(7).value = cs.total;
    for (let cc = 2; cc <= 7; cc++) row.getCell(cc).border = xborder();
    rIns++;
  });

  /* --- 2. Weekly Trend --- */
  const wt = wb.addWorksheet('Weekly Trend', { properties: { tabColor: { argb: EXC.steel } } });
  wt.columns = [
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 26 },
  ];
  sheetTitle(wt, 'Weekly capacity trend', 7, 'Share of staff working days per week · ' + period);
  wt.addRow([]);
  wt.addRow([
    'Week starting',
    'Confirmed',
    '+ Potential',
    'On leave',
    'Bench',
    'Staff-days',
    'Confirmed load',
  ]);
  styleHeader(wt.getRow(4));
  A.weeks.forEach((w) => {
    const row = wt.addRow([
      fmt(w.key),
      null,
      null,
      null,
      null,
      w.total,
      blockBar(w.conf / w.total, 20),
    ]);
    pctCell(row.getCell(2), w.conf / w.total);
    pctCell(row.getCell(3), (w.conf + w.pot) / w.total);
    pctCell(row.getCell(4), w.lv / w.total);
    pctCell(row.getCell(5), w.free / w.total);
    row.getCell(7).font = { color: { argb: bandColor(w.conf / w.total) } };
    row.eachCell((c) => (c.border = xborder()));
  });
  colorScaleCF(wt, 'B5:B' + (4 + A.weeks.length));
  wt.views = [{ state: 'frozen', ySplit: 4 }];

  /* --- 3. Utilization by Person --- */
  const up = wb.addWorksheet('Utilisation by Person', {
    properties: { tabColor: { argb: EXC.free } },
  });
  up.columns = [
    { width: 26 },
    { width: 20 },
    { width: 24 },
    { width: 9 },
    { width: 8 },
    { width: 10 },
    { width: 11 },
    { width: 10 },
    { width: 8 },
    { width: 11 },
    { width: 12 },
    { width: 26 },
  ];
  sheetTitle(
    up,
    'Utilisation by person',
    12,
    'Working days (Mon–Fri) within ' +
      period +
      ' · Available = working − leave · Utilisation = confirmed ÷ available',
  );
  up.addRow([]);
  up.addRow([
    'Name',
    'Pod',
    'Role',
    'Working',
    'Leave',
    'Available',
    'Confirmed',
    'Potential',
    'Bench',
    'Utilisation',
    'Incl. pipeline',
    'Load',
  ]);
  styleHeader(up.getRow(4));
  A.per
    .slice()
    .sort((a, b) => b.util - a.util)
    .forEach((x) => {
      const row = up.addRow([
        x.r.name,
        x.r.pod,
        x.r.role,
        x.work,
        x.lv,
        x.avail,
        x.conf,
        x.pot,
        x.free,
        null,
        null,
        blockBar(x.util, 20),
      ]);
      pctCell(row.getCell(10), x.util);
      pctCell(row.getCell(11), x.pipe);
      row.getCell(12).font = { color: { argb: bandColor(x.util) } };
      row.eachCell((c) => (c.border = xborder()));
    });
  colorScaleCF(up, 'J5:J' + (4 + A.per.length));
  up.views = [{ state: 'frozen', ySplit: 4 }];
  up.autoFilter = { from: 'A4', to: 'L4' };

  /* --- 4. Pod Summary --- */
  const ps = wb.addWorksheet('Pod Summary', { properties: { tabColor: { argb: EXC.soon } } });
  ps.columns = [
    { width: 24 },
    { width: 8 },
    { width: 11 },
    { width: 11 },
    { width: 10 },
    { width: 8 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 26 },
  ];
  sheetTitle(ps, 'Utilisation by pod / team', 10, period);
  ps.addRow([]);
  ps.addRow([
    'Pod',
    'Staff',
    'Available',
    'Confirmed',
    'Potential',
    'Leave',
    'Bench',
    'Utilisation',
    'Incl. pipeline',
    'Load',
  ]);
  styleHeader(ps.getRow(4));
  A.podStats.forEach((p) => {
    const row = ps.addRow([
      p.pod,
      p.n,
      p.avail,
      p.conf,
      p.pot,
      p.lv,
      p.free,
      null,
      null,
      blockBar(p.util, 20),
    ]);
    pctCell(row.getCell(8), p.util);
    pctCell(row.getCell(9), p.pipe);
    row.getCell(10).font = { color: { argb: bandColor(p.util) } };
    row.eachCell((c) => (c.border = xborder()));
  });
  colorScaleCF(ps, 'H5:H' + (4 + A.podStats.length));

  /* --- 5. Client Demand --- */
  const cd = wb.addWorksheet('Client Demand', {
    properties: { tabColor: { argb: EXC.potential } },
  });
  cd.columns = [
    { width: 34 },
    { width: 12 },
    { width: 8 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 20 },
    { width: 26 },
  ];
  sheetTitle(cd, 'Demand by client / assignment', 8, 'Working person-days clipped to ' + period);
  cd.addRow([]);
  cd.addRow([
    'Client / assignment',
    'Type',
    'People',
    'Confirmed',
    'Potential',
    'Total',
    'Span',
    'Share of total demand',
  ]);
  styleHeader(cd.getRow(4));
  const maxTot = Math.max(1, ...A.clientStats.map((c) => c.total));
  A.clientStats.forEach((cs) => {
    const row = cd.addRow([
      cs.client,
      cs.type,
      cs.ppl,
      cs.conf,
      cs.pot,
      cs.total,
      fmt(cs.minS) + ' – ' + fmt(cs.maxE),
      blockBar(cs.total / maxTot, 20),
    ]);
    row.getCell(2).font = {
      bold: true,
      color: {
        argb: cs.type === 'Potential' ? EXC.potential : cs.type === 'Mixed' ? EXC.soon : EXC.free,
      },
    };
    row.getCell(8).font = { color: { argb: EXC.steel } };
    row.eachCell((c) => (c.border = xborder()));
  });
  cd.views = [{ state: 'frozen', ySplit: 4 }];
  cd.autoFilter = { from: 'A4', to: 'H4' };

  /* --- 6. Availability Heatmap --- */
  const hm = wb.addWorksheet('Availability Heatmap', {
    properties: { tabColor: { argb: EXC.busy } },
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
  });
  hm.getColumn(1).width = 26;
  sheetTitle(hm, 'Day-by-day availability heatmap — ' + period, Math.min(20, A.days.length + 1));
  const mRow = hm.getRow(2),
    dRow = hm.getRow(3);
  let mStart = 2,
    curM = null;
  A.days.forEach((d, i) => {
    const col = i + 2;
    hm.getColumn(col).width = 3.2;
    const m = d.toLocaleDateString('en-GB', { month: 'short' });
    if (m !== curM) {
      if (curM !== null && col - 1 > mStart) hm.mergeCells(2, mStart, 2, col - 1);
      curM = m;
      mStart = col;
      mRow.getCell(col).value = m;
      mRow.getCell(col).font = { bold: true, size: 9, color: { argb: EXC.navy } };
    }
    const c = dRow.getCell(col);
    c.value = d.getDate();
    c.font = { size: 8, color: { argb: EXC.muted } };
    c.alignment = { horizontal: 'center' };
    if (isWknd(d)) c.fill = xfill(EXC.wknd);
  });
  if (curM !== null && A.days.length + 1 > mStart) hm.mergeCells(2, mStart, 2, A.days.length + 1);
  dRow.getCell(1).value = 'Staff';
  dRow.getCell(1).font = { bold: true, size: 10 };
  let hr = 4;
  pods().forEach((p) => {
    const pc = hm.getCell(hr, 1);
    pc.value = p;
    pc.font = { bold: true, size: 9, color: { argb: EXC.navy } };
    pc.fill = xfill('FFDDE6F0');
    hr++;
    state.roster
      .filter((r) => r.pod === p)
      .forEach((r) => {
        const nc = hm.getCell(hr, 1);
        nc.value = r.name;
        nc.font = { size: 9.5 };
        A.days.forEach((d, i) => {
          const cell = hm.getCell(hr, i + 2);
          if (isWknd(d)) {
            cell.fill = xfill(EXC.wknd);
            return;
          }
          const cls = A.dayClass(r.id, iso(d));
          cell.fill = xfill(
            cls === 'conf'
              ? EXC.busyBg
              : cls === 'pot'
                ? EXC.potentialBg
                : cls === 'lv'
                  ? EXC.leaveBg
                  : EXC.freeBg,
          );
        });
        hr++;
      });
  });
  hr++;
  const lgd = [
    ['Confirmed booking', EXC.busyBg],
    ['Potential booking', EXC.potentialBg],
    ['On leave', EXC.leaveBg],
    ['Free / bench', EXC.freeBg],
    ['Weekend', EXC.wknd],
  ];
  lgd.forEach((l) => {
    hm.getCell(hr, 2).fill = xfill(l[1]);
    hm.mergeCells(hr, 3, hr, 12);
    const t = hm.getCell(hr, 3);
    t.value = l[0];
    t.font = { size: 9, color: { argb: EXC.muted } };
    hr++;
  });

  /* --- 7. Leave Plan --- */
  const lp = wb.addWorksheet('Leave Plan', { properties: { tabColor: { argb: EXC.leave } } });
  lp.columns = [
    { width: 26 },
    { width: 20 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 8 },
    { width: 13 },
    { width: 12 },
    { width: 28 },
  ];
  sheetTitle(
    lp,
    'Planned leaves',
    9,
    'Sorted by start date · status relative to as-of ' + fmt(state.settings.asOf),
  );
  lp.addRow([]);
  lp.addRow(['Person', 'Pod', 'Type', 'From', 'To', 'Days', 'Working days', 'Status', 'Note']);
  styleHeader(lp.getRow(4));
  const pmap2 = Object.fromEntries(state.roster.map((r) => [r.id, r]));
  state.leaves
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .forEach((l) => {
      const r = pmap2[l.personId];
      const as = state.settings.asOf;
      const stat = l.end < as ? 'Past' : l.start <= as ? 'On leave' : 'Upcoming';
      const row = lp.addRow([
        r ? r.name : '(removed)',
        r ? r.pod : '—',
        l.type || 'Other',
        l.start,
        l.end,
        dayDiff(l.start, l.end) + 1,
        workDaysBetween(l.start, l.end),
        stat,
        l.note || '',
      ]);
      row.getCell(8).font = {
        bold: true,
        color: {
          argb: stat === 'On leave' ? EXC.leave : stat === 'Upcoming' ? EXC.soon : EXC.muted,
        },
      };
      row.eachCell((c) => (c.border = xborder()));
    });

  /* --- 8. Risks & Conflicts --- */
  const rk = wb.addWorksheet('Risks & Conflicts', { properties: { tabColor: { argb: EXC.busy } } });
  rk.columns = [{ width: 26 }, { width: 20 }, { width: 20 }, { width: 40 }, { width: 20 }];
  sheetTitle(rk, 'Risks & conflicts', 5, 'Items needing management attention');
  let rr = 3;
  rr++;
  rk.getCell(rr, 1).value = 'SCHEDULING CONFLICTS';
  rk.getCell(rr, 1).font = { size: 9, bold: true, color: { argb: EXC.muted } };
  rr++;
  rk.getRow(rr).values = ['Person', 'Pod', 'Type', 'Detail', 'Overlap'];
  styleHeader(rk.getRow(rr));
  rr++;
  if (!A.conflicts.length) {
    rk.getCell(rr, 1).value = 'None detected in the selected range ✓';
    rk.getCell(rr, 1).font = { color: { argb: EXC.free }, italic: true };
    rr++;
  }
  A.conflicts.forEach((c) => {
    const row = rk.getRow(rr);
    row.values = [c.name, c.pod, c.kind, c.detail, c.span];
    row.getCell(3).font = { bold: true, color: { argb: EXC.busy } };
    row.eachCell((x) => (x.border = xborder()));
    rr++;
  });
  rr++;
  rk.getCell(rr, 1).value = 'BENCH RISK — below 50% confirmed utilisation';
  rk.getCell(rr, 1).font = { size: 9, bold: true, color: { argb: EXC.muted } };
  rr++;
  rk.getRow(rr).values = ['Person', 'Pod', 'Role', 'Utilisation', 'Bench days'];
  styleHeader(rk.getRow(rr));
  rr++;
  if (!A.bench.length) {
    rk.getCell(rr, 1).value = 'None — everyone is at least 50% utilised ✓';
    rk.getCell(rr, 1).font = { color: { argb: EXC.free }, italic: true };
    rr++;
  }
  A.bench.forEach((x) => {
    const row = rk.getRow(rr);
    row.values = [x.r.name, x.r.pod, x.r.role, null, x.free];
    pctCell(row.getCell(4), x.util);
    row.eachCell((c) => (c.border = xborder()));
    rr++;
  });
  rr++;
  rk.getCell(rr, 1).value = 'PIPELINE TO CONVERT — clients with only potential bookings';
  rk.getCell(rr, 1).font = { size: 9, bold: true, color: { argb: EXC.muted } };
  rr++;
  rk.getRow(rr).values = ['Client', 'Pod', 'People', 'Potential days', 'Span'];
  styleHeader(rk.getRow(rr));
  rr++;
  if (!A.pipeClients.length) {
    rk.getCell(rr, 1).value = 'None — all clients have at least one confirmed booking ✓';
    rk.getCell(rr, 1).font = { color: { argb: EXC.free }, italic: true };
    rr++;
  }
  A.pipeClients.forEach((c) => {
    const row = rk.getRow(rr);
    row.values = [c.client, '—', c.ppl, c.pot, fmt(c.minS) + ' – ' + fmt(c.maxE)];
    row.getCell(1).font = { bold: true, color: { argb: EXC.potential } };
    row.eachCell((x) => (x.border = xborder()));
    rr++;
  });

  await saveWb(
    wb,
    'resource-analysis-' + state.settings.start + '_' + state.settings.end + '.xlsx',
    btn,
    '📊 Analysis (Excel)',
  );
});

/* ============================================================
   TIMESHEET UPLOAD  →  BOOKED vs ACTUAL VARIANCE
   Upload a timesheet in the exported format; the app matches it to the
   tracker by employee name + date and reports the recovery gap.
   ============================================================ */
const TS_KEY = 'rbt_last_import_v1';
let lastImport = { file: '', at: '', added: 0, skipped: [] };
let activeTimesheetImportButton = null,
  importErrorReport = '';
function showImportErrors(lines) {
  importErrorReport = lines.join('\n');
  for (const prefix of ['ms', 'v']) {
    const panel = document.getElementById(prefix + 'ImportErrors'),
      button = document.getElementById(prefix + 'ImportErrorsDownload');
    if (!panel || !button) continue;
    panel.textContent = importErrorReport;
    panel.hidden = !lines.length;
    button.hidden = !lines.length;
  }
  document.querySelectorAll('[data-performance-import-errors]').forEach((panel) => {
    panel.textContent = importErrorReport;
    panel.hidden = !lines.length;
  });
  document
    .querySelectorAll('[data-performance-import-errors-download]')
    .forEach((button) => (button.hidden = !lines.length));
}
function downloadImportErrors() {
  if (!importErrorReport) return;
  const blob = new Blob([importErrorReport + '\n'], { type: 'text/plain;charset=utf-8' }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = 'timesheet-import-errors-' + todayISO() + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
for (const id of ['msImportErrorsDownload', 'vImportErrorsDownload'])
  setControlHandler(id, 'onclick', downloadImportErrors);
try {
  const s = localStorage.getItem(TS_KEY);
  if (s) lastImport = JSON.parse(s);
} catch (e) {}
function saveImportLog() {
  try {
    localStorage.setItem(TS_KEY, JSON.stringify(lastImport));
  } catch (e) {}
}
function nkey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function ckey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
function sameClient(a, b) {
  const x = ckey(a),
    y = ckey(b);
  if (!x || !y) return false;
  return x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
}

/* ---------- cell readers (values may be text, formulas, dates or serials) ---------- */
function cText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return iso(v);
  if (typeof v === 'object') {
    if (v.richText)
      return v.richText
        .map((t) => t.text)
        .join('')
        .trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
    return '';
  }
  return String(v).trim();
}
function cReference(v) {
  const value = cText(v);
  return value === '0' ? '' : value;
}
function cNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v.result !== undefined)
    return typeof v.result === 'number' ? v.result : parseFloat(v.result) || 0;
  const n = parseFloat(String(cText(v)).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function cTime(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (v.result !== undefined) v = v.result;
    else v = cText(v);
  }
  if (v instanceof Date) {
    const h = v.getUTCHours(),
      m = v.getUTCMinutes();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  if (typeof v === 'number') {
    const mins = Math.round((v % 1) * 1440);
    return (
      String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0')
    );
  }
  const t = String(v).trim();
  const m = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?/i.exec(t);
  if (!m) return '';
  let h = +m[1];
  const mn = +m[2];
  if (m[3]) {
    const pm = /pm/i.test(m[3]);
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return String(h).padStart(2, '0') + ':' + String(mn).padStart(2, '0');
}
function serialToISO(n) {
  const d = new Date(Math.round((n - 25569) * 86400000));
  return iso(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function cDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return iso(v);
  if (typeof v === 'object') {
    if (v.result instanceof Date) return iso(v.result);
    if (typeof v.result === 'number') return serialToISO(v.result);
    v = cText(v);
  }
  if (typeof v === 'number') return v > 20000 && v < 80000 ? serialToISO(v) : null;
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); /* dd/mm/yyyy */
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  }
  const d = new Date(t);
  return isNaN(d) ? null : iso(d);
}

/* ---------- import ---------- */
async function importTimesheet(file) {
  if (!/\.(xlsx|xlsm)$/i.test(file.name || ''))
    throw new Error('Choose an .xlsx or .xlsm workbook.');
  if (file.size > 15 * 1024 * 1024)
    throw new Error('The workbook is larger than the 15 MB import limit.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const rows = [],
    problems = [];
  let sheets = 0;
  wb.eachSheet((ws) => {
    let hr = 0,
      map = {};
    for (let r = 1; r <= Math.min(ws.rowCount || 0, 25) && !hr; r++) {
      const vals = [];
      for (let c = 1; c <= 20; c++) vals.push(cText(ws.getCell(r, c).value).toLowerCase());
      if (!vals.some((v) => v.indexOf('employee') >= 0 && v.indexOf('name') >= 0)) continue;
      hr = r;
      vals.forEach((v, i) => {
        const col = i + 1;
        if (!v) return;
        if (
          !map.empNo &&
          (v.indexOf('emp no') >= 0 || v.indexOf('employee no') >= 0 || v.indexOf('staff id') >= 0)
        )
          map.empNo = col;
        else if (!map.name && v.indexOf('employee') >= 0 && v.indexOf('name') >= 0) map.name = col;
        else if (!map.billingTo && (v.indexOf('billing as') >= 0 || v.indexOf('billing to') >= 0))
          map.billingTo = col;
        else if (!map.entity && v.indexOf('entity') >= 0) map.entity = col;
        else if (!map.type && v.indexOf('type') >= 0) map.type = col;
        else if (!map.date && v.indexOf('date') >= 0) map.date = col;
        else if (!map.start && v.indexOf('start') >= 0) map.start = col;
        else if (!map.end && v.indexOf('end') >= 0) map.end = col;
        else if (!map.hours && v.indexOf('hour') >= 0) map.hours = col;
        else if (!map.client && v.indexOf('client') >= 0) map.client = col;
        else if (!map.assignment && v.indexOf('assignment') >= 0) map.assignment = col;
        else if (!map.workArea && v.indexOf('work area') >= 0) map.workArea = col;
        else if (
          !map.notes &&
          (v.indexOf('note') >= 0 || v.indexOf('description') >= 0 || v.indexOf('comment') >= 0)
        )
          map.notes = col;
      });
    }
    if (!hr || !map.name || !map.date) return;
    sheets++;
    const end = ws.rowCount || hr;
    for (let r = hr + 1; r <= end; r++) {
      const name = cText(ws.getCell(r, map.name).value),
        empNo = map.empNo ? cText(ws.getCell(r, map.empNo).value).toUpperCase() : '';
      const date = cDate(ws.getCell(r, map.date).value);
      const hasWork = [
        map.entity,
        map.type,
        map.date,
        map.start,
        map.end,
        map.hours,
        map.client,
        map.assignment,
        map.workArea,
        map.notes,
      ].some((col) => col && cText(ws.getCell(r, col).value) !== '');
      if (!date && !hasWork) continue;
      if (!name && !empNo) {
        problems.push(ws.name + ' row ' + r + ': Employee Name or Employee No is missing.');
        continue;
      }
      if (!date || iso(parse(date)) !== date) {
        problems.push(ws.name + ' row ' + r + ': Date is missing or invalid.');
        continue;
      }
      const st = map.start ? cTime(ws.getCell(r, map.start).value) : '';
      const en = map.end ? cTime(ws.getCell(r, map.end).value) : '';
      if (map.start && cText(ws.getCell(r, map.start).value) && !st)
        problems.push(ws.name + ' row ' + r + ': Start time is invalid.');
      if (map.end && cText(ws.getCell(r, map.end).value) && !en)
        problems.push(ws.name + ' row ' + r + ': End time is invalid.');
      let hrs = map.hours ? cNum(ws.getCell(r, map.hours).value) : 0;
      const calc = hoursBetween(st, en);
      if (calc !== null) hrs = calc; /* times win — the file's own formula may not be cached */
      rows.push({
        name,
        empNo,
        key: nkey(name),
        source: ws.name + ' row ' + r,
        date,
        start: st,
        end: en,
        entity: map.entity ? cReference(ws.getCell(r, map.entity).value) : '',
        type: map.type ? cReference(ws.getCell(r, map.type).value) : '',
        billingTo: map.billingTo ? cText(ws.getCell(r, map.billingTo).value) : '',
        hours: hrs,
        client: map.client ? cReference(ws.getCell(r, map.client).value) : '',
        assignment: map.assignment ? cReference(ws.getCell(r, map.assignment).value) : '',
        workArea: map.workArea ? cReference(ws.getCell(r, map.workArea).value) : '',
        notes: map.notes ? cText(ws.getCell(r, map.notes).value) : '',
      });
    }
  });
  if (!sheets)
    throw new Error(
      'Could not find an Employee Name header row. Use a file in the exported timesheet format.',
    );
  if (!rows.length && !problems.length)
    throw new Error('The header was found but no dated rows could be read.');
  if (rows.length > 20000)
    throw new Error(
      'The workbook contains more than the 20,000-row import limit. Split it into smaller files.',
    );

  /* match names to the roster; anything unmatched is reported, not silently dropped */
  const byKey = {},
    byId = {};
  state.roster.forEach((r) => {
    byKey[nkey(r.name)] = r;
    byId[String(r.id).toUpperCase()] = r;
  });
  const billingPeople = [...(state.billingRoster || []), ...state.roster],
    billingByKey = {},
    billingById = {};
  billingPeople.forEach((r) => {
    billingByKey[nkey(r.name)] = r;
    billingById[String(r.id).toUpperCase()] = r;
  });
  const resolveBilling = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const id = (raw.toUpperCase().match(/[A-Z]{1,6}-\d+/) || [])[0];
    return (
      (id && billingById[id]) || billingById[raw.toUpperCase()] || billingByKey[nkey(raw)] || null
    );
  };
  const matched = [];
  rows.forEach((r) => {
    const p = (r.empNo && byId[r.empNo]) || byKey[r.key];
    if (!p) {
      problems.push(
        r.source + ': Employee ' + (r.name || r.empNo) + ' is not in the visible roster.',
      );
      return;
    }
    if (r.name && nkey(p.name) !== r.key) {
      problems.push(r.source + ': Employee Name does not match Employee No ' + r.empNo + '.');
      return;
    }
    if (r.empNo && r.empNo !== String(p.id).toUpperCase()) {
      problems.push(r.source + ': Employee No does not match ' + r.name + '.');
      return;
    }
    if (!isAdmin() && p.id !== session.personId) {
      problems.push(r.source + ': You may import only your own timesheet rows.');
      return;
    }
    const billed = r.billingTo ? resolveBilling(r.billingTo) : p;
    if (!billed) {
      problems.push(r.source + ': Billing As does not match a registered employee: ' + r.billingTo);
      return;
    }
    if (r.hours < 0 || r.hours > 24) {
      problems.push(r.source + ': Hours must be between 0 and 24.');
      return;
    }
    if (!isAdmin()) {
      for (const [category, value, required] of [
        ['entity', r.entity || p.entity || TS_CFG.homeFirm, true],
        ['type', r.type || 'Non-Chargeable', true],
        ['client', r.client, false],
        ['assignment', r.assignment, false],
        ['work_area', r.workArea, false],
      ]) {
        if (required && !value) problems.push(r.source + ': ' + category + ' is required.');
        else if (value && !refValues(category).some((x) => x.toLowerCase() === value.toLowerCase()))
          problems.push(
            r.source + ': ' + category + ' value "' + value + '" is not in the reference list.',
          );
      }
    }
    matched.push({
      id: entryId(),
      sourceRow: r.source,
      personId: p.id,
      billingTo: billed.id,
      bookingId: '',
      date: r.date,
      entity: r.entity || p.entity || TS_CFG.homeFirm,
      type: r.type || 'Non-Chargeable',
      start: r.start,
      end: r.end,
      hours: r.hours,
      client: r.client,
      assignment: r.assignment,
      workArea: r.workArea,
      notes: r.notes,
      source: 'import',
    });
  });
  if (problems.length) {
    const error = new Error(
      problems.length + ' row error(s) found; no rows from this file were saved.',
    );
    error.details = problems;
    throw error;
  }
  if (!matched.length)
    throw new Error('None of the names in that file match anyone on the tracker.');

  await api('importEntries', { entries: matched, fileName: file.name });
  return {
    file: file.name,
    added: matched.length,
    from: matched.reduce((min, row) => (row.date < min ? row.date : min), matched[0].date),
    to: matched.reduce((max, row) => (row.date > max ? row.date : max), matched[0].date),
    people: [...new Set(matched.map((row) => row.personId))],
  };
}

/* ---------- index actual hours: personId → date → totals ---------- */
function actualIndex() {
  const idx = {};
  state.entries.forEach((r) => {
    const t = (r.type || '').toLowerCase();
    const isLeave = t.indexOf('leave') >= 0 || t.indexOf('holiday') >= 0;
    const p = idx[r.personId] || (idx[r.personId] = { days: {}, total: 0, rows: 0 });
    const d =
      p.days[r.date] || (p.days[r.date] = { hrs: 0, chg: 0, non: 0, leave: 0, clients: {} });
    p.rows++;
    if (isLeave) {
      d.leave++;
      return;
    }
    const h = entryHours(r);
    d.hrs += h;
    p.total += h;
    if (t.indexOf('non') >= 0) d.non += h;
    else if (t.indexOf('charge') >= 0) d.chg += h;
    else d.non += h;
    if (r.client) d.clients[r.client] = (d.clients[r.client] || 0) + h;
    const bk = resolveBooking(r);
    if (bk && bk.personId !== r.personId) {
      const owner = state.roster.find((x) => x.id === bk.personId);
      d.forOthers = d.forOthers || {};
      const nm = owner ? owner.name : 'another booking';
      d.forOthers[nm] = (d.forOthers[nm] || 0) + h;
    }
  });
  return idx;
}

/* ---------- comparison ---------- */
function vSettings() {
  return {
    hpd: +document.getElementById('vHours').value || TS_CFG.hoursPerDay,
    thr: +document.getElementById('vThr').value || 0,
    incPot: document.getElementById('vPot').checked,
  };
}
function jobDayDelivery() {
  const m = {};
  state.entries.forEach((e) => {
    if (/leave|holiday/i.test(e.type || '')) return;
    const b = resolveBooking(e);
    if (!b) return;
    const who = state.roster.find((r) => r.id === e.personId);
    const k = b.id + '|' + e.date,
      nm = who ? who.name : '(removed)';
    m[k] = m[k] || {};
    m[k][nm] = (m[k][nm] || 0) + entryHours(e);
  });
  return m;
}
function computeVariance() {
  const { hpd, thr, incPot } = vSettings();
  const idx = actualIndex();
  const deliv = jobDayDelivery();
  const days = rangeDates()
    .filter((d) => !isWknd(d))
    .map(iso);
  const per = [],
    dayRows = [];
  state.roster.forEach((r) => {
    const p = idx[r.id],
      act = p ? p.days : {};
    let bookedDays = 0,
      expected = 0,
      actual = 0,
      chg = 0,
      non = 0,
      unplanned = 0,
      missing = 0,
      short = 0,
      leaveDays = 0,
      mismatch = 0;
    days.forEach((s) => {
      const a = act[s] || null,
        ah = a ? a.hrs : 0;
      const aClients = a ? Object.keys(a.clients) : [];
      if (a) {
        chg += a.chg;
        non += a.non;
        if (a.leave) leaveDays++;
      }
      const onLeave = state.leaves.some((l) => l.personId === r.id && l.start <= s && l.end >= s);
      const bs = state.bookings.filter(
        (b) => b.personId === r.id && b.start <= s && b.end >= s && (incPot || !isPotential(b)),
      );
      if (onLeave) {
        if (ah > 0)
          dayRows.push({
            name: r.name,
            pod: r.pod,
            date: s,
            booked: 'On leave',
            expected: 0,
            actual: ah,
            gap: ah,
            logged: aClients.join(', ') || '—',
            flag: 'Time logged during leave',
          });
        return;
      }
      if (bs.length) {
        bookedDays++;
        expected += hpd;
        actual += ah;
        const bClients = [...new Set(bs.map((b) => b.client))];
        const wrong =
          ah > 0 &&
          aClients.length > 0 &&
          !aClients.some((c) => bClients.some((bc) => sameClient(bc, c)));
        let flag = '';
        if (ah <= 0) {
          missing++;
          const cover = [];
          bs.forEach((b) => {
            const m = deliv[b.id + '|' + s] || {};
            Object.keys(m).forEach((n) => {
              if (n !== r.name && cover.indexOf(n) < 0) cover.push(n);
            });
          });
          flag = cover.length
            ? 'No time logged — the job was covered by ' + cover.join(', ')
            : 'No time logged';
        } else if (ah < hpd * (1 - thr / 100)) {
          short++;
          flag = 'Short ' + (hpd - ah).toFixed(2) + ' h';
        }
        if (wrong) {
          mismatch++;
          flag = flag ? flag + ' · other client' : 'Posted to another client';
        }
        if (flag)
          dayRows.push({
            name: r.name,
            pod: r.pod,
            date: s,
            booked: bClients.join(', '),
            expected: hpd,
            actual: ah,
            gap: ah - hpd,
            logged: aClients.join(', ') || '—',
            flag,
          });
      } else if (ah > 0) {
        unplanned += ah;
        const fo = a && a.forOthers ? Object.keys(a.forOthers) : [];
        dayRows.push({
          name: r.name,
          pod: r.pod,
          date: s,
          booked: fo.length ? 'On ' + fo.join(', ') + "'s job" : 'Not booked',
          expected: 0,
          actual: ah,
          gap: ah,
          logged: aClients.join(', ') || '—',
          flag: fo.length
            ? 'Delivered on ' + fo.join(', ') + "'s booking"
            : 'Worked but not on the tracker',
        });
      }
    });
    const variance = actual - expected;
    per.push({
      r,
      bookedDays,
      expected,
      actual,
      chg,
      non,
      unplanned,
      missing,
      short,
      mismatch,
      leaveDays,
      variance,
      rate: expected ? actual / expected : null,
      hasData: !!p,
    });
  });
  const unmatched = (lastImport && lastImport.skipped) || [];
  const sum = (f) => per.reduce((m, x) => m + f(x), 0);
  const T = {
    expected: sum((x) => x.expected),
    actual: sum((x) => x.actual),
    unplanned: sum((x) => x.unplanned),
    missing: sum((x) => x.missing),
    bookedDays: sum((x) => x.bookedDays),
    chg: sum((x) => x.chg),
  };
  T.gap = T.actual - T.expected;
  T.rate = T.expected ? T.actual / T.expected : 0;
  T.under = per.filter((x) => x.expected > 0 && x.rate < 1 - thr / 100).length;
  dayRows.sort((a, b) => a.gap - b.gap || (a.name < b.name ? -1 : 1));
  per.sort((a, b) => a.variance - b.variance);
  return { per, dayRows, unmatched, totals: T, hpd, thr, incPot };
}
function vStatus(x, thr) {
  if (!x.hasData) return ['leave', 'NO TIMESHEET'];
  if (!x.expected) return ['', x.actual > 0 ? 'NOT BOOKED' : '—'];
  if (x.rate < 1 - thr / 100) return ['busy', 'UNDER ' + Math.round((1 - x.rate) * 100) + '%'];
  if (x.rate > 1 + thr / 100) return ['potential', 'OVER +' + Math.round((x.rate - 1) * 100) + '%'];
  return ['free', 'ON TRACK'];
}
const h1 = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

/* ---------- variance panel ---------- */
function buildVariance() {
  const info = document.getElementById('tsInfo');
  const imported = state.entries.filter((e) => e.source === 'import').length;
  document.getElementById('tsClear').style.display = 'none';
  if (!state.entries.length) {
    info.textContent = 'No timesheet data yet — employees can enter theirs live, or import a file';
    document.getElementById('vCards').innerHTML = '';
    document.getElementById('vWarn').style.display = 'none';
    document.getElementById('vExceptionCount').textContent = '· 0 items';
    document.getElementById('vTable').innerHTML =
      `<tr><td class="empty">Nothing to compare yet. Employees fill in the My timesheet tab, or you can import a timesheet file in the exported format.</td></tr>`;
    document.getElementById('vDayTable').innerHTML = '';
    return;
  }
  const V = computeVariance(),
    T = V.totals;
  document.getElementById('vExceptionCount').textContent =
    `· ${V.dayRows.length} item${V.dayRows.length === 1 ? '' : 's'}`;
  const people = new Set(state.entries.map((e) => e.personId)).size;
  info.innerHTML =
    `<b>${state.entries.length} live row(s)</b> from ${people} employee(s)` +
    (lastImport.file
      ? ` · last import: ${lastImport.file} (${lastImport.added} rows, ${lastImport.at})`
      : ` · entered in the app`);

  const gapCls = T.gap < 0 ? 'busy' : 'free';
  document.getElementById('vCards').innerHTML = `
   <div class="card"><div class="n">${h1(T.expected)}</div><div class="l">Expected hrs (${T.bookedDays} booked days × ${V.hpd})</div></div>
   <div class="card"><div class="n">${h1(T.actual)}</div><div class="l">Logged on booked days</div></div>
   <div class="card ${gapCls}"><div class="n">${T.gap >= 0 ? '+' : ''}${h1(T.gap)}</div><div class="l">Variance hrs (${Math.round(T.rate * 100)}% recovered)</div></div>
   <div class="card busy"><div class="n">${T.missing}</div><div class="l">Booked days with no time</div></div>
   <div class="card potential"><div class="n">${h1(T.unplanned)}</div><div class="l">Hrs logged off-tracker</div></div>
   <div class="card soon"><div class="n">${T.under}</div><div class="l">Staff under ${100 - V.thr}% recovery</div></div>`;

  const w = document.getElementById('vWarn');
  if (V.unmatched.length) {
    w.style.display = 'block';
    w.innerHTML =
      `<b>${V.unmatched.length} name(s) in the timesheet did not match anyone on the tracker</b> — their hours are excluded: ` +
      V.unmatched.map((u) => `${u.name} (${h1(u.hours)} h)`).join(', ') +
      `. Rename the person in the tracker so the names match exactly.`;
  } else w.style.display = 'none';

  let t = `<thead><tr><th>Employee</th><th>Pod</th><th>Booked days</th><th>Expected hrs</th><th>Logged on booked days</th><th>Chargeable (all logged)</th><th>Variance</th><th>Recovery</th><th>Days w/o time</th><th>Off-tracker hrs</th><th>Status</th></tr></thead><tbody>`;
  V.per.forEach((x) => {
    const [cls, lab] = vStatus(x, V.thr);
    const vc =
      x.variance < 0
        ? 'color:var(--busy);font-weight:700'
        : x.variance > 0
          ? 'color:var(--potential);font-weight:700'
          : '';
    t +=
      `<tr><td><b>${x.r.name}</b></td><td>${x.r.pod}</td><td>${x.bookedDays}</td><td>${h1(x.expected)}</td><td>${h1(x.actual)}</td><td>${h1(x.chg)}</td>` +
      `<td style="${vc}">${x.variance >= 0 ? '+' : ''}${h1(x.variance)}</td><td>${x.rate === null ? '—' : Math.round(x.rate * 100) + '%'}</td>` +
      `<td>${x.missing || '—'}</td><td>${x.unplanned ? h1(x.unplanned) : '—'}</td><td>${cls ? `<span class="pill ${cls}">${lab}</span>` : lab}</td></tr>`;
  });
  document.getElementById('vTable').innerHTML = t + '</tbody>';

  const cap = 300,
    shown = V.dayRows.slice(0, cap);
  let d = `<thead><tr><th>Employee</th><th>Date</th><th>Booked to</th><th>Expected</th><th>Logged</th><th>Gap</th><th>Time posted to</th><th>Exception</th></tr></thead><tbody>`;
  if (!V.dayRows.length)
    d += `<tr><td colspan="8" class="empty">No exceptions — every booked day is fully accounted for ✓</td></tr>`;
  shown.forEach((r) => {
    const gc =
      r.gap < 0 ? 'color:var(--busy);font-weight:700' : 'color:var(--potential);font-weight:700';
    d +=
      `<tr><td><b>${r.name}</b></td><td>${fmt(r.date)}</td><td>${r.booked}</td><td>${h1(r.expected)}</td><td>${h1(r.actual)}</td>` +
      `<td style="${gc}">${r.gap >= 0 ? '+' : ''}${h1(r.gap)}</td><td>${r.logged}</td><td>${r.flag}</td></tr>`;
  });
  if (V.dayRows.length > cap)
    d += `<tr><td colspan="8" class="empty">Showing the ${cap} largest gaps of ${V.dayRows.length}. Export to Excel for the full list.</td></tr>`;
  document.getElementById('vDayTable').innerHTML = d + '</tbody>';
}

/* ---------- controls ---------- */
const varianceHours = document.getElementById('vHours');
if (varianceHours) varianceHours.value = TS_CFG.hoursPerDay;
function chooseTimesheetImport(button) {
  activeTimesheetImportButton = button;
  document.getElementById('tsFile').click();
}
setControlHandler('tsUploadBtn', 'onclick', (e) => chooseTimesheetImport(e.currentTarget));
setControlHandler('msImportBtn', 'onclick', (e) => chooseTimesheetImport(e.currentTarget));
setControlHandler('msTemplate', 'onclick', downloadBlankTimesheetTemplate);
/* Performance exports use the report currently displayed, including its filters. */
const PERFORMANCE_REPORTS = {
  weeklyhours: {
    title: 'Weekly Hours & Overtime',
    cards: 'weeklyCards',
    tables: [
      ['weeklyTable', 'Employee comparison'],
      ['weeklyDays', 'Daily breakdown'],
    ],
  },
  kpiengine: {
    title: 'KPI Engine',
    cards: 'kpiCards',
    tables: [['kpiWeekTable', 'Weekly breakdown']],
  },
  tsdashboard: { title: 'Employee View', cards: 'tsdCards', tables: [['tsdTable', 'Employees']] },
  clientview: {
    title: 'Client View',
    cards: 'clientViewCards',
    tables: [['clientViewTable', 'Clients']],
  },
  auditcheck: { title: 'Audit Check', tables: [['auditCheckTable', 'Audit clients']] },
  workbookdashboard: {
    title: 'Dashboard',
    cards: 'workbookDashCards',
    tables: [
      ['dashHoursSplit', 'Hours split'],
      ['dashTopClients', 'Top clients'],
    ],
    note: 'dashRag',
  },
  masterdata: { title: 'Master Data', tables: [['masterDataTable', 'Entries']] },
};
function performanceCellText(cell) {
  const controls = [...cell.querySelectorAll('input,select,textarea')];
  if (controls.length)
    return controls
      .map((input) =>
        input.tagName === 'SELECT' ? input.selectedOptions[0]?.textContent || '' : input.value,
      )
      .join(' · ');
  return (cell.innerText ?? cell.textContent ?? '').replace(/\s+/g, ' ').trim();
}
function performanceReportSnapshot(view) {
  const report = PERFORMANCE_REPORTS[view];
  if (!report) throw new Error('Unknown performance report.');
  let filters;
  if (view === 'weeklyhours') {
    const from = document.getElementById('weeklyFrom').value,
      to = document.getElementById('weeklyTo').value;
    if (!from || !to || from > to)
      throw new Error('Choose a valid From and To date before exporting.');
    filters = [
      ['From', from],
      ['To', to],
      [
        'Employee',
        document.getElementById('weeklyPerson').selectedOptions[0]?.textContent ||
          'All visible employees',
      ],
    ];
  } else {
    ensurePerformanceRange();
    filters = [
      ['From', performanceStart],
      ['To', performanceEnd],
    ];
  }
  if (view === 'kpiengine')
    for (const [id, label] of [
      ['kpiEmployee', 'Employee'],
      ['kpiEntity', 'Entity'],
    ]) {
      const select = document.getElementById(id);
      filters.push([label, select.selectedOptions[0]?.textContent || 'All']);
    }
  const cards = report.cards
    ? [...document.getElementById(report.cards).querySelectorAll('.card')].map((card) => [
        card.querySelector('.l').textContent.trim(),
        card.querySelector('.n').textContent.trim(),
      ])
    : [];
  const tables = report.tables.map(([id, title]) => ({
    title,
    rows: [...document.getElementById(id).rows]
      .filter((row) => !row.hidden && row.style.display !== 'none' && !row.querySelector('.empty'))
      .map((row) =>
        [...row.cells]
          .filter((cell) => !cell.hidden && cell.style.display !== 'none')
          .map(performanceCellText),
      ),
  }));
  return {
    title: report.title,
    filters,
    cards,
    tables,
    note: report.note ? document.getElementById(report.note).textContent.trim() : '',
  };
}
async function exportPerformanceReport(view, button) {
  if (needExcel()) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Building…';
  try {
    const snapshot = performanceReportSnapshot(view);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Reckoner Resource & Timesheet Portal';
    const summary = wb.addWorksheet('Report');
    summary.columns = [{ width: 48 }, { width: 40 }];
    summary.addRow([snapshot.title]);
    styleHeader(summary.getRow(1));
    snapshot.filters.forEach((row) => summary.addRow(row));
    if (snapshot.cards.length) {
      summary.addRow([]);
      styleHeader(summary.addRow(['Metric', 'Displayed value']));
      snapshot.cards.forEach((row) => summary.addRow(row));
    }
    if (snapshot.note) {
      summary.addRow([]);
      summary.addRow(['Overall status', snapshot.note]);
    }
    for (const table of snapshot.tables) {
      const ws = wb.addWorksheet(table.title);
      table.rows.forEach((row) => ws.addRow(row));
      if (table.rows.length) {
        styleHeader(ws.getRow(1));
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: table.rows[0].length },
        };
      }
      for (let column = 1; column <= ws.columnCount; column++) {
        let width = 16;
        for (const row of table.rows)
          width = Math.min(55, Math.max(width, String(row[column - 1] ?? '').length + 2));
        ws.getColumn(column).width = width;
      }
    }
    await saveWb(
      wb,
      `reckoner-${view}-${snapshot.filters[0][1]}_${snapshot.filters[1][1]}.xlsx`,
      button,
      label,
    );
  } catch (error) {
    alert('Could not export this report: ' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
for (const view of Object.keys(PERFORMANCE_REPORTS)) {
  const panel = document.getElementById(view);
  if (!panel) continue;
  const toolbar = panel.querySelector('.vbar'),
    actions = document.createElement('div');
  actions.className = 'view-actions';
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'btn';
  importButton.textContent = 'Import timesheet';
  importButton.title = 'Import timesheet entries used to calculate performance reports';
  importButton.onclick = () => chooseTimesheetImport(importButton);
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.className = 'btn';
  exportButton.textContent = 'Export report';
  exportButton.title = 'Export this report with the current filters';
  exportButton.onclick = () => exportPerformanceReport(view, exportButton);
  if (view !== 'weeklyhours') actions.append(importButton);
  actions.append(exportButton);
  toolbar.append(actions);
  if (view === 'weeklyhours') continue;
  const errors = document.createElement('div');
  errors.className = 'vnote import-errors';
  errors.hidden = true;
  errors.setAttribute('data-performance-import-errors', '');
  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'btn';
  download.textContent = 'Download import errors (.txt)';
  download.hidden = true;
  download.setAttribute('data-performance-import-errors-download', '');
  download.onclick = downloadImportErrors;
  toolbar.after(errors, download);
}

setControlHandler('tsFile', 'onchange', async (event) => {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length) {
    activeTimesheetImportButton = null;
    return;
  }
  if (needExcel()) {
    activeTimesheetImportButton = null;
    return;
  }
  if (
    !confirm(
      `Import ${files.length} workbook(s)? Existing manual entries will be kept; identical imported rows will be updated.`,
    )
  ) {
    activeTimesheetImportButton = null;
    return;
  }
  const button = activeTimesheetImportButton || document.getElementById('tsUploadBtn'),
    label = button.textContent;
  button.disabled = true;
  showImportErrors([]);
  const saved = [],
    errors = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      button.textContent = `Importing ${i + 1} of ${files.length}…`;
      try {
        saved.push(await importTimesheet(file));
      } catch (error) {
        errors.push(file.name + ': ' + (error.message || String(error)));
        if (error.details) errors.push(...error.details);
      }
    }
    if (saved.length) {
      await pullAll();
      sheetPeriodStart = saved.reduce((min, x) => (x.from < min ? x.from : min), saved[0].from);
      sheetPeriodEnd = saved.reduce((max, x) => (x.to > max ? x.to : max), saved[0].to);
      saveSheetPeriod();
      const people = new Set(saved.flatMap((x) => x.people));
      if (people.size === 1) mySheetPid = [...people][0];
      sheetRowLimit = 50;
      lastImport = {
        file: saved.length === 1 ? saved[0].file : saved.length + ' files',
        at: new Date().toLocaleString(),
        added: saved.reduce((sum, x) => sum + x.added, 0),
        skipped: [],
      };
      saveImportLog();
      buildVariance();
      buildMySheet();
      refreshPerformanceView();
    }
    if (errors.length)
      showImportErrors(['Timesheet import errors — ' + new Date().toLocaleString(), '', ...errors]);
    alert(
      saved.length +
        ' of ' +
        files.length +
        ' workbook(s) imported (' +
        saved.reduce((sum, x) => sum + x.added, 0) +
        ' rows).' +
        (errors.length
          ? ' Errors are listed on this page; use Download import errors to save the full report.'
          : ''),
    );
  } finally {
    button.disabled = false;
    button.textContent = label;
    activeTimesheetImportButton = null;
  }
});
setControlHandler('tsClear', 'onclick', async () => {
  const imp = state.entries.filter((e) => e.source === 'import');
  if (!imp.length) return;
  if (
    !confirm(`Delete ${imp.length} imported row(s)? Rows employees typed in themselves are kept.`)
  )
    return;
  const btn = document.getElementById('tsClear');
  btn.disabled = true;
  let n = 0;
  for (const e of imp) {
    btn.textContent = 'Deleting… ' + ++n;
    await removeEntry(e.id);
  }
  btn.disabled = false;
  btn.textContent = 'Delete imported rows';
  lastImport = { file: '', at: '', added: 0, skipped: [] };
  saveImportLog();
  buildVariance();
});
['vHours', 'vThr'].forEach((id) => setControlHandler(id, 'oninput', () => buildVariance()));
setControlHandler('vPot', 'onchange', () => buildVariance());

/* ---------- comparison export ---------- */
setControlHandler('vExport', 'onclick', async () => {
  if (needExcel()) return;
  if (!state.entries.length) {
    alert('There is no timesheet data to compare yet.');
    return;
  }
  const btn = document.getElementById('vExport');
  btn.disabled = true;
  btn.textContent = 'Building…';
  const V = computeVariance(),
    T = V.totals;
  const period = fmt(state.settings.start) + ' – ' + fmt(state.settings.end);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Resource Booking Tracker';

  const s = wb.addWorksheet('Summary', { properties: { tabColor: { argb: EXC.navy } } });
  s.columns = [{ width: 38 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }];
  sheetTitle(
    s,
    'Booked vs actual — recovery summary',
    5,
    period +
      '  ·  ' +
      state.entries.length +
      ' timesheet rows' +
      (lastImport.file ? '  ·  last import: ' + lastImport.file : ''),
  );
  let r = 4;
  const kv = (k, v, bold, color) => {
    const row = s.getRow(r++);
    row.values = [k, v];
    row.getCell(1).font = { bold: !!bold };
    if (color) row.getCell(2).font = { bold: true, color: { argb: color } };
    row.eachCell((c) => (c.border = xborder()));
  };
  kv('Hours expected per booked working day', V.hpd);
  kv('Tolerance band', V.thr + '%');
  kv('Potential bookings counted', V.incPot ? 'Yes' : 'No');
  kv('Booked working days', T.bookedDays, true);
  kv('Expected hours', +h1(T.expected), true);
  kv('Hours logged on booked days', +h1(T.actual), true);
  kv('Variance (hours)', +h1(T.gap), true, T.gap < 0 ? EXC.busy : EXC.free);
  kv(
    'Recovery rate',
    Math.round(T.rate * 100) + '%',
    true,
    T.rate < 1 - V.thr / 100 ? EXC.busy : EXC.free,
  );
  kv('Chargeable hours logged', +h1(T.chg));
  kv('Hours logged outside any booking', +h1(T.unplanned));
  kv('Booked days with no time logged', T.missing, true, T.missing ? EXC.busy : EXC.free);
  kv('Staff below the tolerance band', T.under, true, T.under ? EXC.busy : EXC.free);

  const e1 = wb.addWorksheet('By employee', { properties: { tabColor: { argb: EXC.steel } } });
  e1.columns = [
    { width: 26 },
    { width: 18 },
    { width: 13 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
  ];
  sheetTitle(e1, 'Booked vs actual by employee', 12, period);
  e1.getRow(4).values = [
    'Employee',
    'Pod',
    'Booked days',
    'Expected hrs',
    'Logged on booked days',
    'Chargeable (all logged)',
    'Non-chargeable (all logged)',
    'Variance',
    'Recovery',
    'Days w/o time',
    'Off-tracker hrs',
    'Status',
  ];
  styleHeader(e1.getRow(4));
  V.per.forEach((x) => {
    const row = e1.addRow([
      x.r.name,
      x.r.pod,
      x.bookedDays,
      +h1(x.expected),
      +h1(x.actual),
      +h1(x.chg),
      +h1(x.non),
      +h1(x.variance),
      null,
      x.missing,
      +h1(x.unplanned),
      vStatus(x, V.thr)[1],
    ]);
    if (x.rate === null) row.getCell(9).value = '—';
    else pctCell(row.getCell(9), x.rate);
    row.getCell(8).font = { bold: true, color: { argb: x.variance < 0 ? EXC.busy : EXC.free } };
    row.eachCell((c) => (c.border = xborder()));
  });
  e1.views = [{ state: 'frozen', ySplit: 4 }];
  e1.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 12 } };
  if (V.per.length) colorScaleCF(e1, 'I5:I' + (4 + V.per.length));

  const d1 = wb.addWorksheet('Day exceptions', { properties: { tabColor: { argb: EXC.busy } } });
  d1.columns = [
    { width: 26 },
    { width: 18 },
    { width: 13 },
    { width: 34 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 34 },
    { width: 26 },
  ];
  sheetTitle(
    d1,
    'Day-level exceptions',
    9,
    'Missing, short, off-tracker or mis-posted time · ' + period,
  );
  d1.getRow(4).values = [
    'Employee',
    'Pod',
    'Date',
    'Booked to',
    'Expected',
    'Logged',
    'Gap',
    'Time posted to',
    'Exception',
  ];
  styleHeader(d1.getRow(4));
  V.dayRows.forEach((x) => {
    const row = d1.addRow([
      x.name,
      x.pod,
      parse(x.date),
      x.booked,
      +h1(x.expected),
      +h1(x.actual),
      +h1(x.gap),
      x.logged,
      x.flag,
    ]);
    row.getCell(3).numFmt = 'dd/mm/yyyy';
    row.getCell(7).font = { bold: true, color: { argb: x.gap < 0 ? EXC.busy : EXC.potential } };
    row.eachCell((c) => (c.border = xborder()));
  });
  if (!V.dayRows.length)
    d1.getCell(5, 1).value = 'No exceptions — every booked day is fully accounted for ✓';
  d1.views = [{ state: 'frozen', ySplit: 4 }];
  d1.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 9 } };

  const u = wb.addWorksheet('Unmatched names', { properties: { tabColor: { argb: EXC.soon } } });
  u.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 44 }];
  sheetTitle(
    u,
    'Timesheet names with no tracker match',
    4,
    'From the last file import — these hours were skipped',
  );
  u.getRow(4).values = ['Name in timesheet', 'Hours', 'Days', 'Action'];
  styleHeader(u.getRow(4));
  V.unmatched.forEach((x) => {
    const row = u.addRow([
      x.name,
      +h1(x.hours),
      x.days,
      'Add to roster or correct the spelling so both sides match',
    ]);
    row.eachCell((c) => (c.border = xborder()));
  });
  if (!V.unmatched.length)
    u.getCell(5, 1).value = 'Every timesheet name matched a person on the tracker ✓';

  await saveWb(
    wb,
    'booked-vs-actual-' + state.settings.start + '_' + state.settings.end + '.xlsx',
    btn,
    '📤 Export comparison',
  );
});

/* ============================================================
   ACCESS CONTROL  —  admin vs employee
   NOTE: this gate runs in the browser. It keeps colleagues out of each
   other's views, but anyone who can open the file can read the source.
   For real enforcement, keep the Apps Script backend and check the
   token server-side (see Code.gs).
   ============================================================ */
const SESS_KEY = 'rbt_session_v1';
let session = null,
  sheetEditing = false,
  mySheetPid = null,
  newEntryFocusId = '',
  sheetRowLimit = 50,
  sheetPeriodStart = '',
  sheetPeriodEnd = '',
  performanceStart = '',
  performanceEnd = '',
  crossPodMode = 'outgoing';
let timesheetUndoStack = [],
  timesheetRedoStack = [],
  timesheetUndoBusy = false;

/* --- compact SHA-256 (works offline / on file:// where crypto.subtle is absent) --- */
function sha256(msg) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const utf = unescape(encodeURIComponent(msg));
  const l = utf.length;
  const wl = [];
  for (let i = 0; i < l; i++)
    wl[i >> 2] = (wl[i >> 2] || 0) | (utf.charCodeAt(i) << (24 - (i % 4) * 8));
  wl[l >> 2] = (wl[l >> 2] || 0) | (0x80 << (24 - (l % 4) * 8));
  const n = (((l + 8) >> 6) + 1) * 16;
  while (wl.length < n) wl.push(0);
  wl[n - 1] = l * 8;
  const rr = (x, c) => (x >>> c) | (x << (32 - c));
  for (let i = 0; i < n; i += 16) {
    const w = wl.slice(i, i + 16);
    for (let t = 16; t < 64; t++) {
      const s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25),
        ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22),
        mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    H = [
      (H[0] + a) | 0,
      (H[1] + b) | 0,
      (H[2] + c) | 0,
      (H[3] + d) | 0,
      (H[4] + e) | 0,
      (H[5] + f) | 0,
      (H[6] + g) | 0,
      (H[7] + h) | 0,
    ];
  }
  return H.map((x) => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('');
}
function pwHash(pw) {
  return sha256('rbt|' + String(pw || '').trim());
}
const isAdmin = () => !!session && session.role === 'admin';
const isManager = () => !!session && (session.role === 'manager' || session.role === 'admin');
const canConfig = (area) =>
  isAdmin() ||
  (session && session.role === 'manager' && (state.configPermissions || []).includes(area));
const hasConfig = () =>
  isAdmin() ||
  (session && session.role === 'manager' && (state.configPermissions || []).length > 0);
const myPerson = () =>
  session && session.personId ? state.roster.find((r) => r.id === session.personId) : null;

/* ---------- login ---------- */
let pendingMfaChallenge = '',
  pendingMfaEmail = '',
  forgotChallenge = '';
function loginFill() {
  const sel = document.getElementById('lgWho');
  sel.value = '';
}
function showLogin() {
  pendingMfaChallenge = '';
  pendingMfaEmail = '';
  document.getElementById('mfaModal').classList.remove('show');
  document.getElementById('forgotModal').classList.remove('show');
  loginFill();
  document.getElementById('lgWarn').classList.remove('show');
  document.getElementById('lgPass').value = '';
  document.getElementById('loginModal').classList.add('show');
  document.body.classList.add('locked');
}
function lgFlag(m) {
  const w = document.getElementById('lgWarn');
  w.textContent = m;
  w.classList.add('show');
}
function forgotFlag(message) {
  const warn = document.getElementById('forgotWarn');
  warn.textContent = message;
  warn.classList.add('show');
}
function openForgotPassword() {
  forgotChallenge = '';
  document.getElementById('loginModal').classList.remove('show');
  document.getElementById('forgotWarn').classList.remove('show');
  document.getElementById('forgotRequestStep').style.display = '';
  document.getElementById('forgotVerifyStep').style.display = 'none';
  document.getElementById('forgotSend').style.display = '';
  document.getElementById('forgotReset').style.display = 'none';
  document.getElementById('forgotEmail').value = document.getElementById('lgWho').value.trim();
  document.getElementById('forgotCode').value = '';
  document.getElementById('forgotPassword').value = '';
  document.getElementById('forgotPasswordConfirm').value = '';
  document.getElementById('forgotModal').classList.add('show');
  document.getElementById('forgotEmail').focus();
}
async function requestForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    forgotFlag('Enter a valid email address.');
    return;
  }
  const button = document.getElementById('forgotSend');
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const data = await api('requestPasswordReset', { email });
    forgotChallenge = data.challenge;
    document.getElementById('forgotRequestStep').style.display = 'none';
    document.getElementById('forgotVerifyStep').style.display = '';
    document.getElementById('forgotSend').style.display = 'none';
    document.getElementById('forgotReset').style.display = '';
    document.getElementById('forgotIntro').textContent = data.message;
    document.getElementById('forgotWarn').classList.remove('show');
    document.getElementById('forgotCode').focus();
  } catch (error) {
    forgotFlag(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Send reset code';
  }
}
async function resetForgottenPassword() {
  const code = document.getElementById('forgotCode').value.replace(/\D/g, ''),
    password = document.getElementById('forgotPassword').value,
    confirmation = document.getElementById('forgotPasswordConfirm').value;
  if (code.length !== 6) {
    forgotFlag('Enter the complete six-digit reset code.');
    return;
  }
  if (password.length < 8) {
    forgotFlag('Use at least 8 characters for the new password.');
    return;
  }
  if (password !== confirmation) {
    forgotFlag('The passwords do not match.');
    return;
  }
  const button = document.getElementById('forgotReset');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const email = document.getElementById('forgotEmail').value;
    await api('resetForgottenPassword', { challenge: forgotChallenge, code, password });
    alert(
      'Your password has been reset. Sign in with the new password and complete email verification.',
    );
    showLogin();
    document.getElementById('lgWho').value = email;
  } catch (error) {
    forgotFlag(error.message);
    document.getElementById('forgotCode').select();
  } finally {
    button.disabled = false;
    button.textContent = 'Set new password';
  }
}
async function doLogin() {
  const email = document.getElementById('lgWho').value.trim();
  const pw = document.getElementById('lgPass').value;
  if (!email) {
    lgFlag('Enter your email address.');
    return;
  }
  if (!pw || pw.trim().length < 4) {
    lgFlag('Enter your password.');
    return;
  }
  try {
    const data = await api('login', { email, password: pw });
    if (data.mfaRequired) {
      pendingMfaChallenge = data.challenge;
      pendingMfaEmail = data.maskedEmail || email;
      document.getElementById('loginModal').classList.remove('show');
      document.getElementById('mfaIntro').textContent =
        `Enter the six-digit code sent to ${pendingMfaEmail}.`;
      document.getElementById('mfaCode').value = '';
      document.getElementById('mfaRememberDevice').checked = false;
      document.getElementById('mfaWarn').classList.remove('show');
      document.getElementById('mfaModal').classList.add('show');
      document.getElementById('mfaCode').focus();
      return;
    }
    session = data.session;
    state = sanitizeState(data.state);
  } catch (e) {
    lgFlag(e.message);
    return;
  }
  window.location.replace('timesheet.php');
}
function mfaFlag(message) {
  const warn = document.getElementById('mfaWarn');
  warn.textContent = message;
  warn.classList.add('show');
}
async function verifyMfa() {
  const code = document.getElementById('mfaCode').value.replace(/\D/g, '');
  if (code.length !== 6) {
    mfaFlag('Enter the complete six-digit code.');
    return;
  }
  const button = document.getElementById('mfaVerify');
  button.disabled = true;
  button.textContent = 'Verifying…';
  try {
    const data = await api('verifyMfa', {
      challenge: pendingMfaChallenge,
      code,
      rememberDevice: document.getElementById('mfaRememberDevice').checked,
    });
    session = data.session;
    state = sanitizeState(data.state);
    window.location.replace('timesheet.php');
  } catch (error) {
    mfaFlag(error.message);
    document.getElementById('mfaCode').select();
  } finally {
    button.disabled = false;
    button.textContent = 'Verify & sign in';
  }
}
async function resendMfa() {
  const button = document.getElementById('mfaResend');
  button.disabled = true;
  try {
    const data = await api('resendMfa');
    pendingMfaChallenge = data.challenge;
    pendingMfaEmail = data.maskedEmail || pendingMfaEmail;
    document.getElementById('mfaIntro').textContent =
      `A new six-digit code was sent to ${pendingMfaEmail}.`;
    document.getElementById('mfaWarn').classList.remove('show');
  } catch (error) {
    mfaFlag(error.message);
  } finally {
    setTimeout(() => {
      button.disabled = false;
    }, 60000);
  }
}
function showRequiredPasswordChange() {
  modalOpen = true;
  document.body.classList.add('locked');
  document.getElementById('forcePassword').value = '';
  document.getElementById('forcePasswordConfirm').value = '';
  document.getElementById('forcePasswordWarn').classList.remove('show');
  document.getElementById('forcePasswordModal').classList.add('show');
}
async function saveRequiredPassword() {
  const password = document.getElementById('forcePassword').value,
    confirmPassword = document.getElementById('forcePasswordConfirm').value,
    warn = document.getElementById('forcePasswordWarn');
  if (password.length < 8) {
    warn.textContent = 'Use at least 8 characters.';
    warn.classList.add('show');
    return;
  }
  if (password !== confirmPassword) {
    warn.textContent = 'The passwords do not match.';
    warn.classList.add('show');
    return;
  }
  const button = document.getElementById('forcePasswordSave');
  button.disabled = true;
  try {
    await api('changePassword', { password });
    session.mustChangePassword = false;
    modalOpen = false;
    document.getElementById('forcePasswordModal').classList.remove('show');
    document.body.classList.remove('locked');
  } catch (error) {
    warn.textContent = error.message;
    warn.classList.add('show');
  } finally {
    button.disabled = false;
  }
}
async function signOut() {
  try {
    await api('logout');
  } catch (e) {}
  session = null;
  state = null;
  timesheetUndoStack = [];
  timesheetRedoStack = [];
  sheetPeriodStart = '';
  sheetPeriodEnd = '';
  sheetRowLimit = 50;
  document.body.classList.remove('employee', 'manager');
  document.body.classList.add('gated');
  await init();
}

const ukClockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});
const ukDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function ukTodayISO() {
  const parts = Object.fromEntries(
    ukDateFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function updateUkClock() {
  const clock = document.getElementById('ukClock'),
    now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent =
    'UK · ' +
    ukClockFormatter
      .formatToParts(now)
      .map((part) => (part.type === 'dayPeriod' ? part.value.toUpperCase() : part.value))
      .join('');
}
updateUkClock();
setInterval(updateUkClock, 1000);
/* ---------- role gating ---------- */
function applyRole() {
  if (!session) return;
  document.body.classList.remove('gated');
  const employee = session.role === 'employee',
    manager = session.role === 'manager';
  document.body.classList.toggle('employee', employee);
  document.body.classList.toggle('manager', manager);
  document.querySelector('.config-tab').style.display = hasConfig() ? '' : 'none';
  document.getElementById('whoami').textContent =
    session.name + ' · ' + (isAdmin() ? 'Administrator' : manager ? 'Manager' : 'Employee');
  const hour = +new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
    firstName =
      String(session.name || '')
        .trim()
        .split(/\s+/)[0] || 'there';
  document.getElementById('portalGreeting').textContent =
    (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') +
    ', ' +
    firstName +
    '!';
  const wanted = INITIAL_VIEW || 'mysheet';
  const employeeTabs = ['mysheet', 'variance', 'weeklyhours', 'importhistory', 'bookingcontext'];
  const target =
    employee && !employeeTabs.includes(wanted)
      ? 'mysheet'
      : (wanted === 'config' && !hasConfig()) || (wanted === 'masterdata' && !isAdmin())
        ? 'mysheet'
        : wanted;
  if (
    !document.getElementById(target) ||
    (target === 'access' && !isAdmin()) ||
    (['firms', 'crosspod'].includes(target) && !isManager())
  ) {
    window.location.replace('timesheet.php');
    return;
  }
  document
    .querySelectorAll('.tab')
    .forEach((x) => x.classList.toggle('active', x.dataset.tab === target));
  syncMenuGroups();
  document.querySelectorAll('.panel').forEach((x) => x.classList.toggle('show', x.id === target));
  document.body.dataset.view = target;
  mySheetPid =
    (employee || manager) && session.personId
      ? session.personId
      : mySheetPid || (state.roster[0] && state.roster[0].id);
  syncPerformanceRangeInputs();
  render();
  if (['mysheet', 'importhistory', 'bookingcontext'].includes(target)) buildMySheet();
  if (session.mustChangePassword) showRequiredPasswordChange();
  else document.body.classList.remove('locked');
}

/* ---------- admin access modal ---------- */
function openAccess() {
  if (!isAdmin()) return;
  modalOpen = true;
  document.getElementById('acCurrent').value = '';
  document.getElementById('acNew').value = '';
  document.getElementById('acCap').checked = (state.settings.capMode || TS_CFG.capMode) === 'block';
  setControlHandler('acCap', 'onchange', async (ev) => {
    state.settings.capMode = ev.target.checked ? 'block' : 'warn';
    await pushSettings();
    if (!ONLINE) saveLocal();
  });
  let t =
    '<thead><tr><th>Employee</th><th>Pod</th><th>Access role</th><th>Status</th><th>MFA</th><th>Password</th><th></th></tr></thead><tbody>';
  state.roster.forEach((r) => {
    t +=
      `<tr><td><b>${safe(r.name)}</b><div class="vmeta">${r.email ? safe(r.email) : '<span class="pill busy">EMAIL REQUIRED</span>'}</div></td><td>${safe(r.pod)}</td><td><span class="pill ${r.accessRole === 'manager' ? 'potential' : 'confirmed'}">${safe((r.accessRole || 'employee').toUpperCase())}</span></td><td><span class="pill ${r.active ? 'free' : 'busy'}">${r.active ? 'ACTIVE' : 'INACTIVE'}</span></td><td><span class="pill ${r.email && r.mfaEnabled ? 'free' : 'busy'}">${r.email && r.mfaEnabled ? 'ENABLED' : 'EMAIL REQUIRED'}</span></td><td><span class="pill ${r.mustChangePassword ? 'potential' : 'free'}">${r.mustChangePassword ? 'CHANGE REQUIRED' : 'SET'}</span></td>` +
      `<td><button class="btn ${r.active ? 'danger' : 'pri'}" data-active="${safe(r.id)}" style="padding:3px 9px;font-size:12px">${r.active ? 'Deactivate' : 'Activate'}</button> <button class="btn" data-edit="${safe(r.id)}" style="padding:3px 9px;font-size:12px">Edit</button> <button class="btn" data-reset="${safe(r.id)}" style="padding:3px 9px;font-size:12px">Reset password</button></td></tr>`;
  });
  document.getElementById('acTable').innerHTML = t + '</tbody>';
  document.querySelectorAll('#acTable button[data-active]').forEach(
    (b) =>
      (b.onclick = async () => {
        const p = state.roster.find((r) => r.id === b.dataset.active);
        if (!p) return;
        const next = !p.active;
        if (
          !confirm(
            `${next ? 'Activate' : 'Deactivate'} ${p.name}?${next ? ' They will then be allowed to sign in.' : ' Their current sessions will be closed.'}`,
          )
        )
          return;
        await api('setUserActive', { id: p.id, active: next });
        await pullAll();
        openAccess();
      }),
  );
  document.querySelectorAll('#acTable button[data-reset]').forEach(
    (b) =>
      (b.onclick = async () => {
        const p = state.roster.find((r) => r.id === b.dataset.reset);
        if (!p) return;
        const chosen = prompt(
          `Enter a temporary password for ${p.name}, or leave blank to generate a secure one automatically.`,
          ``,
        );
        if (chosen === null) return;
        const result = await api('resetPassword', { id: p.id, password: chosen.trim() });
        alert(
          `Password reset successfully.\n\nTemporary password: ${result.temporaryPassword}\n\nCopy it now and give it securely to ${p.name}. A password change will be required after MFA sign-in.`,
        );
        await pullAll();
        openAccess();
      }),
  );
  document.querySelectorAll('#acTable button[data-edit]').forEach(
    (b) =>
      (b.onclick = () => {
        const id = b.dataset.edit;
        closeAccess();
        openPerson(id);
      }),
  );
  document.getElementById('acModal').classList.add('show');
}
function closeAccess() {
  document.getElementById('acModal').classList.remove('show');
  modalOpen = false;
}

/* ============================================================
   LIVE TIMESHEET  —  employees enter their own hours
   ============================================================ */
function entryId() {
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function compareTimesheetEntries(a, b) {
  return (
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(b.start || '').localeCompare(String(a.start || '')) ||
    String(b.end || '').localeCompare(String(a.end || '')) ||
    String(b.id || '').localeCompare(String(a.id || ''))
  );
}
function myEntries(pid) {
  return state.entries.filter((e) => e.personId === pid).sort(compareTimesheetEntries);
}
const SHEET_PERIOD_KEY = 'reckoner_timesheet_period_v1';
function sheetPeriodStorageKey() {
  return SHEET_PERIOD_KEY + '_' + (session?.personId || session?.name || 'admin');
}
function saveSheetPeriod() {
  try {
    localStorage.setItem(
      sheetPeriodStorageKey(),
      JSON.stringify({ start: sheetPeriodStart, end: sheetPeriodEnd }),
    );
  } catch (error) {}
}
function ensureSheetPeriod() {
  if (sheetPeriodStart && sheetPeriodEnd) return;
  try {
    const saved = JSON.parse(localStorage.getItem(sheetPeriodStorageKey()) || 'null');
    if (
      saved &&
      /^\d{4}-\d{2}-\d{2}$/.test(saved.start || '') &&
      /^\d{4}-\d{2}-\d{2}$/.test(saved.end || '') &&
      saved.start <= saved.end
    ) {
      sheetPeriodStart = saved.start;
      sheetPeriodEnd = saved.end;
      return;
    }
  } catch (error) {}
  const today = ukTodayISO();
  sheetPeriodStart = today.slice(0, 7) + '-01';
  sheetPeriodEnd = today;
}
function sheetDates() {
  ensureSheetPeriod();
  const out = [];
  for (let d = parse(sheetPeriodStart), end = parse(sheetPeriodEnd); d <= end; d = addDays(d, 1))
    out.push(new Date(d));
  return out;
}
function myBookings(pid) {
  ensureSheetPeriod();
  return state.bookings
    .filter((b) => b.personId === pid && b.end >= sheetPeriodStart && b.start <= sheetPeriodEnd)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}
function bookedClientsFor(pid) {
  return [...new Set(myBookings(pid).map((b) => b.client))].filter(Boolean);
}

function renderMySheetCards(pid, override) {
  const hpd = TS_CFG.hoursPerDay;
  const days = sheetDates()
    .filter((d) => !isWknd(d))
    .map(iso);
  let bookedDays = 0;
  days.forEach((s) => {
    if (state.leaves.some((l) => l.personId === pid && l.start <= s && l.end >= s)) return;
    if (
      state.bookings.some(
        (x) => x.personId === pid && !isPotential(x) && x.start <= s && x.end >= s,
      )
    )
      bookedDays++;
  });
  let rows = myEntries(pid).filter((e) => e.date >= sheetPeriodStart && e.date <= sheetPeriodEnd);
  if (override) rows = rows.map((e) => (e.id === override.id ? override : e));
  const worked = rows.filter((e) => !/leave|holiday/i.test(e.type || ''));
  const logged = worked.reduce((m, e) => m + entryHours(e), 0);
  const chg = worked
    .filter((e) => /^chargeable$/i.test(e.type || ''))
    .reduce((m, e) => m + entryHours(e), 0);
  const expected = bookedDays * hpd,
    gap = logged - expected,
    billingRate = logged ? (chg / logged) * 100 : 0;
  document.getElementById('msCards').innerHTML = `
   <div class="card"><div class="n">${bookedDays}</div><div class="l">Booked working days</div></div>
   <div class="card"><div class="n">${h1(expected)}</div><div class="l">Expected hrs (${hpd}/day)</div></div>
   <div class="card ${gap < 0 ? 'busy' : 'free'}"><div class="n">${h1(logged)}</div><div class="l">Hours logged</div></div>
   <div class="card ${gap < 0 ? 'busy' : 'free'}"><div class="n">${gap >= 0 ? '+' : ''}${h1(gap)}</div><div class="l">Variance vs booked</div></div>
   <div class="card free"><div class="n">${h1(chg)}</div><div class="l">Chargeable hrs</div></div>
   <div class="card free"><div class="n">${billingRate.toFixed(1)}%</div><div class="l">My billing rate</div></div>`;
}

const pendingTimesheetSaves = new Set();
async function saveEntry(e) {
  e.updatedAt = new Date().toISOString();
  const pending = pushEntry(e);
  pendingTimesheetSaves.add(pending);
  try {
    await pending;
    refreshAfterEntry();
  } finally {
    pendingTimesheetSaves.delete(pending);
  }
}
async function deleteEntry(id) {
  await removeEntry(id);
  refreshAfterEntry();
}
function copyTimesheetEntry(entry) {
  return JSON.parse(JSON.stringify(entry));
}
function rememberTimesheetChange(change) {
  if (timesheetUndoBusy) return null;
  timesheetUndoStack.push(change);
  timesheetRedoStack = [];
  if (timesheetUndoStack.length > 50) timesheetUndoStack.shift();
  updateTimesheetUndoButton();
  return change;
}
function forgetTimesheetChange(change) {
  const index = timesheetUndoStack.indexOf(change);
  if (index >= 0) timesheetUndoStack.splice(index, 1);
  updateTimesheetUndoButton();
}
function updateTimesheetUndoButton() {
  const button = document.getElementById('msUndo');
  if (button) button.disabled = timesheetUndoBusy || !timesheetUndoStack.length;
  const redo = document.getElementById('msRedo');
  if (redo) redo.disabled = timesheetUndoBusy || !timesheetRedoStack.length;
}
async function undoTimesheetChange() {
  if (timesheetUndoBusy) return;
  const change = timesheetUndoStack.pop();
  if (!change) return;
  timesheetUndoBusy = true;
  updateTimesheetUndoButton();
  try {
    if (change.pending) await change.pending;
    if (change.kind === 'update') await pushEntry(copyTimesheetEntry(change.before));
    else if (change.kind === 'add') await removeEntry(change.entry.id);
    else if (change.kind === 'delete') {
      const restored = copyTimesheetEntry(change.entry);
      newEntryFocusId = restored.id;
      await pushEntry(restored);
    } else if (change.kind === 'addMany') {
      await batchEntries(
        [],
        change.entries.map((entry) => entry.id),
      );
    }
    timesheetRedoStack.push(change);
    refreshAfterEntry();
    const hint = document.getElementById('msEntryHint');
    if (hint) hint.textContent = 'Last timesheet change undone and saved.';
  } catch (error) {
    if (!change.failed) timesheetUndoStack.push(change);
    throw error;
  } finally {
    timesheetUndoBusy = false;
    updateTimesheetUndoButton();
  }
}
async function redoTimesheetChange() {
  if (timesheetUndoBusy) return;
  const change = timesheetRedoStack.pop();
  if (!change) return;
  timesheetUndoBusy = true;
  updateTimesheetUndoButton();
  try {
    if (change.kind === 'update') await pushEntry(copyTimesheetEntry(change.after));
    else if (change.kind === 'add') await pushEntry(copyTimesheetEntry(change.entry));
    else if (change.kind === 'delete') await removeEntry(change.entry.id);
    else if (change.kind === 'addMany') await batchEntries(change.entries.map(copyTimesheetEntry));
    timesheetUndoStack.push(change);
    refreshAfterEntry();
    const hint = document.getElementById('msEntryHint');
    if (hint) hint.textContent = 'Timesheet change redone and saved.';
  } catch (error) {
    timesheetRedoStack.push(change);
    throw error;
  } finally {
    timesheetUndoBusy = false;
    updateTimesheetUndoButton();
  }
}
function refreshAfterEntry() {
  buildMySheet();
  if (document.getElementById('variance')?.classList.contains('show')) buildVariance();
  if (document.getElementById('crosspod')?.classList.contains('show')) buildCrossPod();
}

function jobPicker(e, pid) {
  const use = jobUsage();
  const list = bookingsOn(e.date);
  const cur = e.bookingId ? state.bookings.find((b) => b.id === e.bookingId) : null;
  if (cur && !list.some((b) => b.id === cur.id)) list.push(cur); /* keep a stale link visible */
  let options = '<option value="">Internal / no job</option>';
  list.forEach((b) => {
    const cap = bookingCapacity(b),
      used = (use[b.id] || { total: 0 }).total;
    const left = Math.round((cap - used) * 100) / 100;
    const owner = (state.billingRoster || state.roster).find((r) => r.id === b.personId);
    const mine = b.personId === pid;
    const label = `${b.client} · ${b.firm || TS_CFG.homeFirm}${mine ? '' : ' · for ' + (owner ? owner.name : '—')} · ${left > 0 ? h1(left) + 'h left' : 'FULL'}`;
    options += `<option value="${safe(b.id)}" ${e.bookingId === b.id ? 'selected' : ''}>${safe(label)}</option>`;
  });
  const badge =
    cur && cur.personId !== pid
      ? `<div class="onbehalf">⚑ billed as ${((state.billingRoster || state.roster).find((r) => r.id === cur.personId) || {}).name || '—'}</div>`
      : '';
  return (
    `<select data-f="bookingId" aria-label="Linked Booking" title="Select linked booking">${options}</select>` +
    badge
  );
}
function applyJob(e, pid) {
  const b = e.bookingId ? state.bookings.find((x) => x.id === e.bookingId) : null;
  if (!b) return;
  e.client = b.client;
  e.entity = b.firm || TS_CFG.homeFirm;
  e.billingTo = b.personId;
  if (!e.assignment) e.assignment = b.stage || TS_CFG.defaultAssignment;
  e.type = isPotential(b) ? 'Non-Chargeable' : 'Chargeable';
  if (b.personId !== pid) {
    const owner = state.roster.find((r) => r.id === b.personId);
    const tag = 'on behalf of ' + (owner ? owner.name : '—');
    if (!e.notes) e.notes = tag;
  }
}
function buildImportHistory() {
  const table = document.getElementById('msImportHistory');
  if (!table) return;
  const logs = state.importLogs || [];
  let html =
    '<thead><tr><th>Imported</th><th>File</th><th>By</th><th>Employees</th><th>Rows</th><th>Status</th><th></th></tr></thead><tbody>';
  if (!logs.length)
    html +=
      '<tr><td colspan="7" class="empty">No workbook imports have been recorded yet.</td></tr>';
  logs.forEach((log) => {
    const active = log.status === 'active';
    html += `<tr><td>${safe(log.createdAt || '')}</td><td><b>${safe(log.fileName)}</b></td><td>${safe(log.importer || '—')}</td><td>${log.employeeCount}</td><td>${log.rowCount}</td><td><span class="pill ${active ? 'free' : 'potential'}">${active ? 'IMPORTED' : 'UNDONE'}</span></td><td>${active ? `<button class="btn danger" data-import-undo="${safe(log.batchId)}">Undo import</button>` : '—'}</td></tr>`;
  });
  table.innerHTML = html + '</tbody>';
  table.querySelectorAll('[data-import-undo]').forEach(
    (button) =>
      (button.onclick = async () => {
        const log = logs.find((x) => x.batchId === button.dataset.importUndo);
        if (
          !log ||
          !confirm(
            `Undo the import “${log.fileName}”? Rows created by it will be removed and overwritten rows will be restored.`,
          )
        )
          return;
        button.disabled = true;
        button.textContent = 'Undoing…';
        try {
          const result = await api('undoTimesheetImport', { batchId: log.batchId });
          await pullAll();
          buildMySheet();
          if (document.getElementById('variance')?.classList.contains('show')) buildVariance();
          alert(`Import undone. ${result.restored} row(s) were restored or removed.`);
        } finally {
          button.disabled = false;
        }
      }),
  );
}
function buildBookingContext(pid) {
  /* my bookings */
  const bks = myBookings(pid);
  let b =
    '<thead><tr><th>Client / assignment</th><th>Type</th><th>From</th><th>To</th><th>Working days</th><th>Note</th></tr></thead><tbody>';
  if (!bks.length)
    b += `<tr><td colspan="6" class="empty">You have no bookings in this period.</td></tr>`;
  bks.forEach((x) => {
    b +=
      `<tr><td><b>${x.client}</b>${x.stage ? ` <span class="vmeta">· ${x.stage}</span>` : ''}</td>` +
      `<td><span class="pill ${isPotential(x) ? 'potential' : 'confirmed'}">${isPotential(x) ? 'POTENTIAL' : 'CONFIRMED'}</span></td>` +
      `<td>${fmt(x.start)}</td><td>${fmt(x.end)}</td><td>${workDaysBetween(x.start, x.end)}</td><td>${x.note || '—'}</td></tr>`;
  });
  document.getElementById('msBookings').innerHTML = b + '</tbody>';

  const lvs = state.leaves.filter(
    (l) => l.personId === pid && l.end >= sheetPeriodStart && l.start <= sheetPeriodEnd,
  );
  document.getElementById('msLeave').innerHTML = lvs.length
    ? 'Approved leave in this period: ' +
      lvs.map((l) => `${l.type || 'Other'} ${fmt(l.start)}–${fmt(l.end)}`).join(' · ')
    : '';
}

function buildMySheet() {
  if (!document.getElementById('msWho')) return;
  ensureSheetPeriod();
  const sel = document.getElementById('msWho');
  if (isManager()) {
    sel.style.display = '';
    const ownId = session.role === 'manager' ? session.personId : '';
    const ordered = state.roster
      .slice()
      .sort((a, b) => (a.id === ownId ? -1 : b.id === ownId ? 1 : a.name.localeCompare(b.name)));
    sel.innerHTML = ordered
      .map((r) => `<option value="${safe(r.id)}">${safe(r.name)}</option>`)
      .join('');
    if (!state.roster.some((r) => r.id === mySheetPid))
      mySheetPid = state.roster.some((r) => r.id === ownId) ? ownId : ordered[0] && ordered[0].id;
    sel.value = mySheetPid;
  } else {
    sel.style.display = 'none';
    mySheetPid = session.personId;
  }
  const pid = mySheetPid;
  const p = state.roster.find((r) => r.id === pid);
  document
    .querySelectorAll('[data-timesheet-context]')
    .forEach(
      (el) =>
        (el.textContent =
          (p ? p.name : 'No employee selected') +
          ' · ' +
          fmt(sheetPeriodStart) +
          ' – ' +
          fmt(sheetPeriodEnd)),
    );
  document.getElementById('msPeriod').textContent =
    fmt(sheetPeriodStart) + ' ? ' + fmt(sheetPeriodEnd);
  document.getElementById('msFrom').value = sheetPeriodStart;
  document.getElementById('msTo').value = sheetPeriodEnd;
  buildImportHistory();
  if (document.getElementById('msBookings')) buildBookingContext(pid);
  if (!document.getElementById('msSheet')) return;
  const canEditSheet = isAdmin() || pid === session.personId;
  document.getElementById('msImportBtn').style.display = canEditSheet ? '' : 'none';
  document.getElementById('msImportBtn').textContent = isAdmin()
    ? 'Import all timesheets'
    : 'Import my timesheet';
  document.getElementById('msSave').style.display = canEditSheet ? '' : 'none';
  document.getElementById('msSaveStatus').style.display = canEditSheet ? '' : 'none';
  buildImportHistory();
  document.getElementById('msTitle').textContent =
    session.role === 'manager' && pid === session.personId
      ? 'My timesheet'
      : isManager() && p
        ? `${p.name}'s timesheet${canEditSheet ? '' : ' · View only'}`
        : 'My timesheet';
  document.getElementById('msEntriesTitle').textContent = p
    ? `${p.name}'s Timesheet`
    : 'Timesheet entries';
  document.getElementById('msFill').style.display = canEditSheet ? '' : 'none';
  document.getElementById('msUndo').style.display = canEditSheet ? '' : 'none';
  document.getElementById('msRedo').style.display = canEditSheet ? '' : 'none';
  updateTimesheetUndoButton();
  document.getElementById('msShortcuts').style.display = canEditSheet ? '' : 'none';
  document.getElementById('msEntryHint').textContent = canEditSheet
    ? 'Enter your actual work below. Start and end times calculate hours automatically.'
    : 'Managers can review pod-member timesheets here. Only the employee can add, edit or delete these entries.';
  document.getElementById('msPeriod').textContent =
    fmt(sheetPeriodStart) + ' – ' + fmt(sheetPeriodEnd);
  document.getElementById('msFrom').value = sheetPeriodStart;
  document.getElementById('msTo').value = sheetPeriodEnd;
  if (!p) {
    document.getElementById('msSheet').innerHTML = '';
    return;
  }

  renderMySheetCards(pid);

  /* editable grid — skip a rebuild while the user is typing in it */
  const grid = document.getElementById('msSheet');
  if (
    (sheetEditing && grid.contains(document.activeElement)) ||
    (grid.querySelector('.ms-draft-row') &&
      draftTimesheetContext === pid + '|' + sheetPeriodStart + '|' + sheetPeriodEnd)
  )
    return;
  const cl = refValues('client').concat(bookedClientsFor(pid), ['Internal', 'Internal meetings']),
    clientValues = [...new Set(cl)].filter(Boolean),
    entities = refValues('entity').length ? refValues('entity') : TS_CFG.entityList,
    types = refValues('type').length ? refValues('type') : TS_CFG.typeList,
    assignments = refValues('assignment').length ? refValues('assignment') : TS_CFG.assignmentList,
    areas = refValues('work_area').length ? refValues('work_area') : TS_CFG.workAreaList,
    billingPeople = (state.billingRoster || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  const billingLabel = (x) => (x ? `${x.name} · ${x.id} · ${x.pod}` : ''),
    billingByLabel = new Map(billingPeople.map((x) => [billingLabel(x).toLowerCase(), x]));
  document.getElementById('msEntities').innerHTML = entities
    .map((c) => `<option value="${safe(c)}">`)
    .join('');
  document.getElementById('msTypes').innerHTML = types
    .map((c) => `<option value="${safe(c)}">`)
    .join('');
  document.getElementById('msBillingPeople').innerHTML = billingPeople
    .map((x) => `<option value="${safe(billingLabel(x))}">`)
    .join('');
  document.getElementById('msClients').innerHTML = clientValues
    .map((c) => `<option value="${safe(c)}">`)
    .join('');
  document.getElementById('msAsg').innerHTML = assignments
    .map((c) => `<option value="${safe(c)}">`)
    .join('');
  document.getElementById('msArea').innerHTML = areas
    .map((c) => `<option value="${safe(c)}">`)
    .join('');
  const esc = (v) => String(v || '').replace(/"/g, '&quot;');
  const allowed = {
    entity: entities,
    type: types,
    client: clientValues,
    assignment: assignments,
    workArea: areas,
  };
  let t =
    '<colgroup><col style="width:2%"><col style="width:7%"><col style="width:5%"><col style="width:7%"><col style="width:9%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:5%"><col style="width:7%"><col style="width:7%"><col style="width:5%"><col style="width:8%"><col style="width:5%"><col style="width:8%"><col style="width:4%"></colgroup>' +
    '<thead><tr><th>#</th><th>Employee<br>Name</th><th>Entity</th><th>Type</th><th>Billing As</th><th>Date</th><th>Start</th><th>End</th><th>Hours</th><th>Client</th><th>Assignment</th><th>Work Area</th><th>Work Done</th><th>Emp No</th><th>Linked Booking</th><th></th></tr></thead><tbody>';
  const personEntries = myEntries(pid);
  const all = personEntries.filter((e) => e.date >= sheetPeriodStart && e.date <= sheetPeriodEnd);
  if (newEntryFocusId) {
    const ni = all.findIndex((e) => e.id === newEntryFocusId);
    if (ni >= sheetRowLimit) sheetRowLimit = ni + 1;
  }
  t += canEditSheet
    ? `<tr class="ms-add-row"><td colspan="16"><button class="btn" id="msAddInline">＋ Add a new timesheet row</button></td></tr>`
    : `<tr class="ms-add-row"><td colspan="16"><span class="vmeta">View only · pod members manage their own timesheet entries</span></td></tr>`;
  if (!all.length) {
    const elsewhere = personEntries.length > 0;
    const message = elsewhere
      ? `${personEntries.length} saved row(s) are outside ${sheetPeriodStart} to ${sheetPeriodEnd}. They span ${personEntries[personEntries.length - 1].date} to ${personEntries[0].date}. <button class="btn" id="msShowSavedDates">Show saved dates</button>`
      : canEditSheet
        ? 'No timesheet rows yet — add your first row above, or use “Fill booked days”.'
        : 'No timesheet rows in this period.';
    t += `<tr><td colspan="16" class="empty">${message}</td></tr>`;
  }
  const visible = all.slice(0, sheetRowLimit);
  visible.forEach((e, rowIndex) => {
    const auto = hoursBetween(e.start, e.end);
    t +=
      `<tr data-eid="${e.id}">` +
      `<td>${all.length - rowIndex}</td><td><b>${p.name}</b></td>` +
      `<td><input type="text" data-f="entity" list="msEntities" value="${safe(e.entity)}" title="Type and select an entity"></td>` +
      `<td><input type="text" data-f="type" list="msTypes" value="${safe(e.type)}" title="Type and select a work type"></td>` +
      `<td><input type="text" data-f="billingTo" list="msBillingPeople" value="${safe(billingLabel(billingPeople.find((x) => x.id === (e.billingTo || pid))))}" title="Type and select an employee"></td>` +
      `<td><input type="date" data-f="date" value="${e.date}"></td>` +
      `<td><input type="text" data-f="start" value="${formatAmPm(e.start)}" placeholder="09:00 AM" maxlength="8" inputmode="text" aria-label="Start time"></td>` +
      `<td><input type="text" data-f="end" value="${formatAmPm(e.end)}" placeholder="05:00 PM" maxlength="8" inputmode="text" aria-label="End time"></td>` +
      `<td><input type="number" data-f="hours" step="0.25" min="0" max="24" class="hrs${auto !== null ? ' auto' : ''}"` +
      ` value="${auto !== null ? auto : e.hours === null || e.hours === undefined ? '' : e.hours}"${auto !== null ? ' readonly title="Calculated from start and end time"' : ''}></td>` +
      `<td><input type="text" data-f="client" list="msClients" value="${esc(e.client)}" title="Type and select a client"></td>` +
      `<td><input type="text" data-f="assignment" list="msAsg" value="${esc(e.assignment)}" title="Type and select an assignment"></td>` +
      `<td><input type="text" data-f="workArea" list="msArea" value="${esc(e.workArea)}" title="Type and select a work area"></td>` +
      `<td><input type="text" data-f="notes" value="${esc(e.notes)}" title="Free-text work description"></td>` +
      `<td><b>${p.id}</b></td><td>${jobPicker(e, pid)}</td>` +
      `<td><button class="btn danger xdel" title="Delete row" style="padding:2px 8px">✕</button></td></tr>`;
  });
  if (all.length > visible.length)
    t += `<tr class="ms-more-row"><td colspan="16"><button class="btn" id="msShowMore">Show 50 more · ${all.length - visible.length} remaining</button></td></tr>`;
  grid.innerHTML = t + '</tbody>';
  const showSavedDates = document.getElementById('msShowSavedDates');
  if (showSavedDates)
    showSavedDates.onclick = () => {
      sheetPeriodStart = personEntries[personEntries.length - 1].date;
      sheetPeriodEnd = personEntries[0].date;
      saveSheetPeriod();
      sheetRowLimit = 50;
      buildMySheet();
    };
  if (!canEditSheet) {
    grid
      .querySelectorAll('tr[data-eid] input,tr[data-eid] select')
      .forEach((x) => (x.disabled = true));
    grid.querySelectorAll('.xdel').forEach((x) => x.remove());
    const more = document.getElementById('msShowMore');
    if (more)
      more.onclick = () => {
        sheetRowLimit += 50;
        buildMySheet();
      };
    return;
  }
  grid.querySelectorAll('tr[data-eid]').forEach((tr) => {
    const id = tr.dataset.eid;
    const previewHours = () => {
      const start = tr.querySelector('[data-f="start"]')?.value || '';
      const end = tr.querySelector('[data-f="end"]')?.value || '';
      const hours = tr.querySelector('[data-f="hours"]');
      if (!hours) return;
      const calculated = hoursBetween(start, end);
      const current = state.entries.find((e) => e.id === id);
      if (calculated === null) {
        hours.value = '';
        hours.readOnly = false;
        hours.classList.remove('auto');
        hours.title = 'Enter hours manually, or provide both times';
        if (current) renderMySheetCards(pid, { ...current, start, end, hours: null });
        return;
      }
      hours.value = calculated;
      hours.readOnly = true;
      hours.classList.add('auto');
      hours.title = 'Calculated from start and end time';
      if (current) renderMySheetCards(pid, { ...current, start, end, hours: calculated });
    };
    tr.querySelectorAll('input,select').forEach((inp) => {
      inp.onfocus = () => {
        sheetEditing = true;
        document.getElementById('msSaveStatus').textContent = '';
      };
      inp.onblur = () => {
        sheetEditing = false;
      };
      if (inp.dataset.f === 'start' || inp.dataset.f === 'end') inp.oninput = previewHours;
      if (inp.dataset.f === 'hours')
        inp.oninput = () => {
          const current = state.entries.find((e) => e.id === id);
          if (current)
            renderMySheetCards(pid, { ...current, hours: inp.value === '' ? null : +inp.value });
        };
      inp.onchange = async () => {
        const e = state.entries.find((x) => x.id === id);
        if (!e) return;
        const before = JSON.stringify(e);
        const f = inp.dataset.f;
        if (f === 'hours')
          e.hours = inp.value === '' ? null : Math.max(0, Math.min(24, +inp.value));
        else if (f === 'start' || f === 'end') {
          const normalized = inp.value.trim() === '' ? '' : normalizeTime(inp.value);
          if (normalized === null) {
            alert('Enter time as HH:MM AM or HH:MM PM, for example 09:45 AM.');
            inp.value = formatAmPm(e[f]);
            previewHours();
            return;
          }
          e[f] = normalized;
          inp.value = normalized ? formatAmPm(normalized) : '';
        } else if (f === 'billingTo') {
          const person = billingByLabel.get(inp.value.trim().toLowerCase());
          if (!person) {
            alert('Type a name and select an employee from the Billing As dropdown.');
            const old = billingPeople.find((x) => x.id === e.billingTo);
            inp.value = old ? billingLabel(old) : '';
            return;
          }
          e.billingTo = person.id;
          inp.value = billingLabel(person);
        } else if (f === 'bookingId') {
          e.bookingId = inp.value || '';
        } else if (allowed[f]) {
          const value = inp.value.trim(),
            match = allowed[f].find((x) => String(x).toLowerCase() === value.toLowerCase());
          if (((f === 'entity' || f === 'type') && !value) || (value && !match)) {
            alert(
              `Type and select a valid ${f === 'workArea' ? 'Work Area' : f.charAt(0).toUpperCase() + f.slice(1)} result from the dropdown.`,
            );
            inp.value = e[f] || '';
            return;
          }
          e[f] = match || '';
          inp.value = match || '';
        } else e[f] = inp.value;
        const auto = hoursBetween(e.start, e.end);
        if (auto !== null) {
          e.hours = auto;
          previewHours();
        } /* times drive the hours */
        else if (f === 'start' || f === 'end') e.hours = null;
        renderMySheetCards(pid);
        if (f === 'bookingId') {
          applyJob(e, mySheetPid);
          const selected = e.bookingId ? state.bookings.find((b) => b.id === e.bookingId) : null;
          if (selected) {
            const clientInput = tr.querySelector('[data-f="client"]');
            const entityInput = tr.querySelector('[data-f="entity"]');
            const typeInput = tr.querySelector('[data-f="type"]');
            const assignmentInput = tr.querySelector('[data-f="assignment"]');
            const billingInput = tr.querySelector('[data-f="billingTo"]');
            if (clientInput) clientInput.value = e.client || '';
            if (entityInput) entityInput.value = e.entity || '';
            if (typeInput) typeInput.value = e.type || '';
            if (assignmentInput) assignmentInput.value = e.assignment || '';
            if (billingInput) {
              const person = billingPeople.find((x) => x.id === e.billingTo);
              billingInput.value = person ? billingLabel(person) : '';
            }
          }
          renderMySheetCards(pid);
        }
        const c = capCheck(e);
        if (!c.ok) {
          const msg =
            `“${c.booking.client}” was booked for ${h1(c.cap)} h and ${h1(c.used)} h are already recorded against it` +
            (c.left > 0 ? `, leaving ${h1(c.left)} h.` : `, so it is full.`) +
            `\n\nYou are trying to add ${h1(c.want)} h.`;
          if ((state.settings.capMode || TS_CFG.capMode) === 'block') {
            alert(msg + '\n\nShorten your hours, or ask the administrator to extend the booking.');
            Object.assign(e, JSON.parse(before));
            buildMySheet();
            return;
          }
          if (!confirm(msg + '\n\nSave anyway? It will be flagged to the administrator.')) {
            Object.assign(e, JSON.parse(before));
            buildMySheet();
            return;
          }
        }
        await saveEntry(e);
        inp.defaultValue = inp.value;
        rememberTimesheetChange({
          kind: 'update',
          before: JSON.parse(before),
          after: copyTimesheetEntry(e),
        });
      };
    });
    tr.querySelector('.xdel').onclick = async () => {
      if (!confirm('Delete this timesheet row?')) return;
      const removed = state.entries.find((e) => e.id === id);
      if (!removed) return;
      const change = rememberTimesheetChange({
        kind: 'delete',
        entry: copyTimesheetEntry(removed),
        pending: null,
        failed: false,
      });
      try {
        change.pending = deleteEntry(id);
        await change.pending;
      } catch (error) {
        change.failed = true;
        forgetTimesheetChange(change);
        throw error;
      }
    };
  });
  installSheetKeyboard(grid);
  setControlHandler('msAddInline', 'onclick', addTimesheetRow);
  const more = document.getElementById('msShowMore');
  if (more)
    more.onclick = () => {
      sheetRowLimit += 50;
      buildMySheet();
    };
  if (newEntryFocusId) {
    const added = grid.querySelector(`tr[data-eid="${newEntryFocusId}"]`);
    newEntryFocusId = '';
    if (added) {
      added.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const field = added.querySelector('[data-f="date"]');
      if (field) field.focus();
    }
  }
}

function installSheetKeyboard(grid) {
  const rows = () => [...grid.querySelectorAll('tr[data-eid]')];
  const focusCell = (rowIndex, columnIndex) => {
    const row = rows()[rowIndex];
    if (!row) return;
    const controls = [...row.querySelectorAll('input,select')];
    const target = controls[Math.max(0, Math.min(columnIndex, controls.length - 1))];
    if (target) {
      target.focus();
      if (target.select && target.tagName === 'INPUT' && !['date', 'time'].includes(target.type))
        target.select();
    }
  };
  rows().forEach((row, rowIndex) =>
    [...row.querySelectorAll('input,select')].forEach((control, columnIndex) => {
      control.addEventListener('keydown', (event) => {
        const addShortcut =
          event.ctrlKey && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd');
        const deleteShortcut =
          event.ctrlKey && (event.key === '-' || event.code === 'NumpadSubtract');
        if (addShortcut) {
          event.preventDefault();
          addTimesheetRow();
          return;
        }
        if (deleteShortcut) {
          event.preventDefault();
          row.querySelector('.xdel')?.click();
          return;
        }
        if (event.key === 'Escape') {
          control.blur();
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          focusCell(rowIndex + (event.shiftKey ? -1 : 1), columnIndex);
          return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          focusCell(rowIndex + (event.key === 'ArrowUp' ? -1 : 1), columnIndex);
          return;
        }
        if (event.ctrlKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          focusCell(rowIndex, columnIndex + (event.key === 'ArrowLeft' ? -1 : 1));
        }
      });
    }),
  );
}

document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase(),
    redo = (key === 'y' && !event.shiftKey) || (key === 'z' && event.shiftKey);
  if (!redo && !(key === 'z' && !event.shiftKey)) return;
  const sheet = document.getElementById('mysheet');
  if (!sheet || sheet.offsetParent === null || !session) return;
  const canEditCurrent = isAdmin() || mySheetPid === session.personId;
  if (!canEditCurrent) return;
  if (!(redo ? timesheetRedoStack : timesheetUndoStack).length) return;
  event.preventDefault();
  (redo ? redoTimesheetChange() : undoTimesheetChange()).catch(() => {});
});
setControlHandler('msUndo', 'onclick', () => undoTimesheetChange().catch(() => {}));
setControlHandler('msRedo', 'onclick', () => redoTimesheetChange().catch(() => {}));
setControlHandler('msSave', 'onclick', async () => {
  if (!session || (!isAdmin() && mySheetPid !== session.personId)) return;
  const button = document.getElementById('msSave'),
    status = document.getElementById('msSaveStatus');
  button.disabled = true;
  button.textContent = 'Saving…';
  status.textContent = '';
  try {
    const draft = document.querySelector('#msSheet .ms-draft-row');
    if (draft) {
      await draft.saveDraft();
      if (draft.isConnected) return;
    } else {
      const focused = document.activeElement;
      if (focused?.closest?.('#msSheet tr[data-eid]')) focused.blur();
      const results = await Promise.allSettled([...pendingTimesheetSaves]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
    }
    status.textContent = 'Saved';
  } catch (error) {
    status.textContent = error.message || 'Save failed';
  } finally {
    button.disabled = false;
    button.textContent = 'Save timesheet';
  }
});

/* ---------- downloads ---------- */
async function downloadTimesheet(list, label, fname, btn, btnLabel) {
  if (needExcel()) return;
  if (!list.length) {
    alert('There are no timesheet rows to download yet.');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Building…';
  }
  const dts = list.map((e) => e.date).sort();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Resource Booking Tracker';
  buildTimesheetSheet(wb, entriesToRows(list), {
    name: label,
    from: dts[0],
    to: dts[dts.length - 1],
  });
  await saveWb(wb, fname, btn, btnLabel);
}
setControlHandler('msDownload', 'onclick', async () => {
  const pid = mySheetPid,
    p = state.roster.find((r) => r.id === pid);
  if (!p) return;
  const btn = document.getElementById('msDownload');
  const periodRows = myEntries(pid).filter(
    (e) => e.date >= sheetPeriodStart && e.date <= sheetPeriodEnd,
  );
  await downloadTimesheet(
    periodRows,
    'Timesheet',
    'timesheet-' + p.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-' + todayISO() + '.xlsx',
    btn,
    '⬇ Download my timesheet',
  );
});
setControlHandler('msDownloadAll', 'onclick', async () => {
  if (!isManager() || needExcel()) return;
  const visibleEntries = state.entries.filter(
    (e) => e.date >= sheetPeriodStart && e.date <= sheetPeriodEnd,
  );
  if (!visibleEntries.length) {
    alert('There are no visible timesheet rows in this period.');
    return;
  }
  const btn = document.getElementById('msDownloadAll');
  btn.disabled = true;
  btn.textContent = 'Building…';
  const dts = visibleEntries.map((e) => e.date).sort();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Resource Booking Tracker';
  buildTimesheetSheet(wb, entriesToRows(visibleEntries), {
    name: 'All timesheets',
    from: dts[0],
    to: dts[dts.length - 1],
    blankRows: 0,
  });
  const used = state.roster.filter((r) => visibleEntries.some((e) => e.personId === r.id));
  if (used.length <= 30) {
    const taken = {};
    used.forEach((r) => {
      const mine = visibleEntries.filter((e) => e.personId === r.id);
      const d2 = mine.map((e) => e.date).sort();
      let nm = r.name.replace(/[\\\/\*\?:\[\]]/g, '').slice(0, 31) || r.id;
      while (taken[nm]) nm = nm.slice(0, 28) + '~' + Object.keys(taken).length;
      taken[nm] = 1;
      buildTimesheetSheet(wb, entriesToRows(mine), {
        name: nm,
        from: d2[0],
        to: d2[d2.length - 1],
        blankRows: 0,
      });
    });
  }
  await saveWb(wb, 'all-timesheets-' + todayISO() + '.xlsx', btn, '⬇ All timesheets');
});

let draftTimesheetContext = '';
function addTimesheetRow() {
  const pid = mySheetPid;
  if (!pid || (!isAdmin() && pid !== session.personId)) return;
  ensureSheetPeriod();
  const grid = document.getElementById('msSheet');
  const existing = grid.querySelector('.ms-draft-row');
  if (existing) {
    existing.querySelector('input[data-f="date"]').focus();
    return;
  }
  draftTimesheetContext = pid + '|' + sheetPeriodStart + '|' + sheetPeriodEnd;
  const sheetPerson = state.roster.find((x) => x.id === pid);
  const billingSelf = (state.billingRoster || []).find((x) => x.id === pid);
  const billingSelfLabel = billingSelf
    ? `${billingSelf.name} · ${billingSelf.id} · ${billingSelf.pod}`
    : '';
  const row = document.createElement('tr');
  row.className = 'ms-draft-row';
  row.innerHTML = `<td></td><td><b>${safe(sheetPerson?.name || '')}</b></td>
    <td><input data-f="entity" list="msEntities" aria-label="Entity"></td>
    <td><input data-f="type" list="msTypes" aria-label="Type"></td>
    <td><input data-f="billingTo" list="msBillingPeople" value="${safe(billingSelfLabel)}" aria-label="Billing As"></td>
    <td><input type="date" data-f="date" aria-label="Date"></td>
    <td><input data-f="start" value="${formatAmPm(TS_CFG.defaultStart)}" placeholder="09:00 AM" aria-label="Start time"></td>
    <td><input data-f="end" value="${formatAmPm(addMinutes(TS_CFG.defaultStart, Math.round(TS_CFG.hoursPerDay * 60)))}" placeholder="05:00 PM" aria-label="End time"></td>
    <td><input type="number" data-f="hours" class="hrs auto" min="0" max="24" step="0.25" value="${TS_CFG.hoursPerDay}" readonly aria-label="Hours"></td>
    <td><input data-f="client" list="msClients" aria-label="Client"></td>
    <td><input data-f="assignment" list="msAsg" aria-label="Assignment"></td>
    <td><input data-f="workArea" list="msArea" aria-label="Work Area"></td>
    <td><input data-f="notes" aria-label="Work Done"></td>
    <td><b>${safe(sheetPerson?.id || '')}</b></td><td><select data-f="bookingId" aria-label="Linked Booking"><option value="">Choose date first</option></select></td>
    <td><button class="btn pri" type="button" data-draft-save title="Save row">✓</button><button class="btn danger" type="button" data-draft-cancel title="Cancel row">✕</button></td>`;
  grid.querySelector('.ms-add-row').after(row);
  const field = (name) => row.querySelector('[data-f="' + name + '"]');
  const updateHours = () => {
    const calculated = hoursBetween(field('start').value, field('end').value),
      hours = field('hours');
    if (calculated === null) {
      if (hours.classList.contains('auto')) hours.value = '';
      hours.readOnly = false;
      hours.classList.remove('auto');
      return;
    }
    hours.value = calculated;
    hours.readOnly = true;
    hours.classList.add('auto');
  };
  field('start').oninput = updateHours;
  field('end').oninput = updateHours;
  const updateJobs = () => {
    const date = field('date').value,
      bookingSelect = field('bookingId');
    if (!date) {
      bookingSelect.innerHTML = '<option value="">Choose date first</option>';
      return;
    }
    const matches = bookingsOn(date),
      use = jobUsage();
    let html = '<option value="">Internal / no job</option>';
    matches.forEach((b) => {
      const cap = bookingCapacity(b),
        used = (use[b.id] || { total: 0 }).total,
        left = Math.round((cap - used) * 100) / 100;
      const owner = (state.billingRoster || state.roster).find((r) => r.id === b.personId),
        mine = b.personId === pid;
      const label = `${b.client} · ${b.firm || TS_CFG.homeFirm}${mine ? '' : ' · for ' + (owner ? owner.name : '—')} · ${left > 0 ? h1(left) + 'h left' : 'FULL'}`;
      html += `<option value="${safe(b.id)}">${safe(label)}</option>`;
    });
    bookingSelect.innerHTML = html;
  };
  field('date').onchange = updateJobs;
  row.querySelector('[data-draft-cancel]').onclick = () => {
    row.remove();
    draftTimesheetContext = '';
    buildMySheet();
  };
  row.querySelector('[data-draft-save]').onclick = row.saveDraft = async () => {
    const date = field('date').value;
    if (!date || date < sheetPeriodStart || date > sheetPeriodEnd) {
      alert('Choose a date within the selected timesheet period.');
      field('date').focus();
      return;
    }
    const choices = {
      entity: refValues('entity'),
      type: refValues('type'),
      client: refValues('client'),
      assignment: refValues('assignment'),
      workArea: refValues('work_area'),
    };
    for (const [name, values] of Object.entries(choices)) {
      const input = field(name),
        value = input.value.trim();
      if ((name === 'entity' || name === 'type') && !value) {
        alert('Choose ' + name + '.');
        input.focus();
        return;
      }
      if (value && values.length && !values.some((x) => x.toLowerCase() === value.toLowerCase())) {
        alert('Choose a valid ' + name + ' from the list.');
        input.focus();
        return;
      }
    }
    const billingInput = field('billingTo').value.trim();
    const billing = (state.billingRoster || []).find(
      (x) => `${x.name} · ${x.id} · ${x.pod}`.toLowerCase() === billingInput.toLowerCase(),
    );
    if (billingInput && !billing) {
      alert('Choose a valid Billing As employee from the list.');
      field('billingTo').focus();
      return;
    }
    const start = field('start').value.trim(),
      end = field('end').value.trim();
    const normalizedStart = start ? normalizeTime(start) : '',
      normalizedEnd = end ? normalizeTime(end) : '';
    if (normalizedStart === null || normalizedEnd === null) {
      alert('Enter times as HH:MM AM or HH:MM PM.');
      return;
    }
    const calculated = hoursBetween(normalizedStart, normalizedEnd);
    const manual = field('hours').value;
    if (calculated === null && manual === '') {
      alert('Enter start and end times, or enter hours.');
      field('hours').focus();
      return;
    }
    if (
      calculated === null &&
      manual !== '' &&
      (!Number.isFinite(+manual) || +manual < 0 || +manual > 24)
    ) {
      alert('Hours must be between 0 and 24.');
      field('hours').focus();
      return;
    }
    const bookingInput = field('bookingId');
    const rec = {
      id: entryId(),
      personId: pid,
      billingTo: billing ? billing.id : pid,
      date,
      bookingId: bookingInput.value || '',
      entity: field('entity').value.trim(),
      type: field('type').value.trim(),
      start: normalizedStart,
      end: normalizedEnd,
      hours: calculated === null ? (manual === '' ? null : +manual) : calculated,
      client: field('client').value.trim(),
      assignment: field('assignment').value.trim(),
      workArea: field('workArea').value.trim(),
      notes: field('notes').value.trim(),
      source: 'self',
    };
    if (rec.bookingId) applyJob(rec, pid);
    const capacity = capCheck(rec);
    if (!capacity.ok) {
      const message = 'The linked booking does not have enough remaining hours.';
      if ((state.settings.capMode || TS_CFG.capMode) === 'block') {
        alert(message);
        return;
      }
      if (!confirm(message + ' Save anyway?')) return;
    }
    const button = row.querySelector('[data-draft-save]');
    button.disabled = true;
    try {
      await pushEntry(rec);
      row.remove();
      draftTimesheetContext = '';
      refreshAfterEntry();
      rememberTimesheetChange({ kind: 'add', entry: copyTimesheetEntry(rec) });
    } catch (error) {
      state.entries = state.entries.filter((e) => e.id !== rec.id);
      button.disabled = false;
      alert(error.message);
    }
  };
  field('date').focus();
}
setControlHandler('msFill', 'onclick', async () => {
  const pid = mySheetPid;
  if (!pid) return;
  if (!isAdmin() && pid !== session.personId) return;
  const have = {};
  myEntries(pid).forEach((e) => {
    have[e.date] = 1;
  });
  const fst = TS_CFG.defaultStart,
    fen = addMinutes(fst, Math.round(TS_CFG.hoursPerDay * 60));
  const usage = jobUsage(),
    use = {},
    planned = {};
  let full = 0;
  Object.keys(usage).forEach((k) => {
    use[k] = usage[k].total;
  });
  const add = [];
  sheetDates()
    .filter((d) => !isWknd(d))
    .map(iso)
    .forEach((s) => {
      if (have[s]) return;
      if (state.leaves.some((l) => l.personId === pid && l.start <= s && l.end >= s)) return;
      const bs = state.bookings.filter((b) => b.personId === pid && b.start <= s && b.end >= s);
      if (!bs.length) return;
      const b = bs.find((x) => !isPotential(x)) || bs[0];
      const pot = isPotential(b);
      const used = (use[b.id] || 0) + (planned[b.id] || 0);
      if (used + TS_CFG.hoursPerDay > bookingCapacity(b) + 0.001) {
        full++;
        return;
      }
      planned[b.id] = (planned[b.id] || 0) + TS_CFG.hoursPerDay;
      add.push({
        id: entryId(),
        personId: pid,
        date: s,
        bookingId: b.id,
        billingTo: pid,
        entity: b.firm || TS_CFG.homeFirm,
        type: pot ? 'Non-Chargeable' : 'Chargeable',
        start: fst,
        end: fen,
        hours: hoursBetween(fst, fen),
        client: b.client,
        assignment: b.stage || TS_CFG.defaultAssignment,
        workArea: TS_CFG.defaultWorkArea,
        notes: '',
        source: 'fill',
      });
    });
  if (!add.length) {
    alert(
      full
        ? `Nothing to add — ${full} booked day(s) are skipped because the job's booked hours are already fully recorded, by you or by a colleague working on it.`
        : 'Nothing to add — every booked day in this period already has a row.',
    );
    return;
  }
  if (
    !confirm(
      `Add ${add.length} row(s) at ${fst}–${fen}, one per booked day with no entry yet?` +
        (full ? ` ${full} day(s) were skipped because the job is already fully recorded.` : '') +
        ` Correct the times afterwards and the hours follow.`,
    )
  )
    return;
  const btn = document.getElementById('msFill');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    await batchEntries(add);
    rememberTimesheetChange({ kind: 'addMany', entries: add.map(copyTimesheetEntry) });
    refreshAfterEntry();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fill booked days';
  }
});
setControlHandler('msWho', 'onchange', (e) => {
  mySheetPid = e.target.value;
  sheetRowLimit = 50;
  buildMySheet();
});
function changeSheetPeriod() {
  const from = document.getElementById('msFrom').value,
    to = document.getElementById('msTo').value;
  if (!from || !to) return;
  if (from > to) {
    alert('The From date must be before the To date.');
    buildMySheet();
    return;
  }
  sheetPeriodStart = from;
  sheetPeriodEnd = to;
  saveSheetPeriod();
  sheetRowLimit = 50;
  buildMySheet();
}
setControlHandler('msFrom', 'onchange', changeSheetPeriod);
setControlHandler('msTo', 'onchange', changeSheetPeriod);

/* ============================================================
   JOBS, CAPACITY AND WHO ACTUALLY DID THE WORK
   A booking is a job: it names the firm it is delivered through and the
   person whose name goes on it (billed as). Anyone can log time against
   it, so the person who delivered and the person who is charged can differ
   — and the total logged against a job cannot exceed what was booked.
   ============================================================ */
function bookingLabel(b) {
  const p = state.roster.find((r) => r.id === b.personId);
  return b.client + ' · ' + (b.firm || TS_CFG.homeFirm) + ' · billed as ' + (p ? p.name : '—');
}
function bookingCapacity(b) {
  return workDaysBetween(b.start, b.end) * TS_CFG.hoursPerDay;
}
function bookingsOn(dateISO) {
  return state.bookings
    .filter((b) => b.start <= dateISO && b.end >= dateISO)
    .sort((a, b) => ((a.firm || '') < (b.firm || '') ? -1 : 1));
}
/* an entry belongs to a job explicitly, or by matching client + date (covers imported files) */
function resolveBooking(e) {
  if (e.bookingId) {
    const b = state.bookings.find((x) => x.id === e.bookingId);
    if (b) return b;
  }
  if (!e.client) return null;
  const cands = state.bookings.filter(
    (b) => b.start <= e.date && b.end >= e.date && sameClient(b.client, e.client),
  );
  if (!cands.length) return null;
  return cands.find((b) => b.personId === e.personId) || cands[0];
}
function jobUsage() {
  const use = {};
  state.entries.forEach((e) => {
    if (/leave|holiday/i.test(e.type || '')) return;
    const b = resolveBooking(e);
    if (!b) return;
    const u = use[b.id] || (use[b.id] = { total: 0, by: {}, rows: 0 });
    const h = entryHours(e);
    u.total += h;
    u.rows++;
    u.by[e.personId] = (u.by[e.personId] || 0) + h;
  });
  return use;
}
/* how much room is left on a job, ignoring the row being edited */
function capCheck(entry) {
  const b = entry.bookingId ? state.bookings.find((x) => x.id === entry.bookingId) : null;
  if (!b) return { ok: true };
  const cap = bookingCapacity(b);
  let used = 0;
  state.entries.forEach((e) => {
    if (e.id === entry.id) return;
    if (/leave|holiday/i.test(e.type || '')) return;
    if (e.bookingId === b.id) used += entryHours(e);
  });
  const want = entryHours(entry);
  const left = Math.round((cap - used) * 100) / 100;
  return { ok: want <= left + 0.001, cap, used, left, want, booking: b };
}

/* ---------- firm billing model ---------- */
function billingModel() {
  const directory = state.billingRoster || state.roster,
    pmap = Object.fromEntries(directory.map((r) => [r.id, r]));
  const from = state.settings.start,
    to = state.settings.end;
  const scoped = [
    ...new Map(
      [...(state.entries || []), ...(state.crossPodEntries || [])].map((e) => [e.id, e]),
    ).values(),
  ];
  const rows = scoped
    .filter((e) => e.date >= from && e.date <= to && !/leave|holiday/i.test(e.type || ''))
    .map((e) => {
      const worker = pmap[e.personId] || state.roster.find((r) => r.id === e.personId),
        billed = pmap[e.billingTo || e.personId] || worker,
        booking = resolveBooking(e);
      const entity =
          e.entity || (booking && booking.firm) || (worker && worker.entity) || TS_CFG.homeFirm,
        client = e.client || (booking && booking.client) || 'Internal / no client',
        hours = entryHours(e),
        pricing = entityRateDetails(entity, billed);
      return {
        e,
        date: e.date,
        entity,
        client,
        type: e.type || '',
        hours,
        rate: pricing.rate,
        value: Math.round(hours * pricing.rate * 100) / 100,
        configured: pricing.configured,
        rateSource: pricing.source,
        workerName: worker ? worker.name : '(removed)',
        workerPod: worker ? worker.pod : '',
        billedName: billed ? billed.name : '(removed)',
        billedPod: billed ? billed.pod : '',
        designation: billed ? billed.role : '',
        booking,
        linked: !!booking,
      };
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.entity.localeCompare(b.entity) ||
        a.workerName.localeCompare(b.workerName),
    );
  const entities = {};
  rows.forEach((r) => {
    const x =
      entities[r.entity] ||
      (entities[r.entity] = {
        entity: r.entity,
        entries: 0,
        hours: 0,
        value: 0,
        linked: 0,
        unlinked: 0,
        missing: 0,
        clients: new Set(),
        people: {},
      });
    x.entries++;
    x.hours += r.hours;
    x.value += r.value;
    if (r.linked) x.linked += r.hours;
    else x.unlinked += r.hours;
    if (!r.configured) x.missing += r.hours;
    x.clients.add(r.client);
    x.people[r.billedName] = (x.people[r.billedName] || 0) + r.hours;
  });
  const totals = {
    hours: rows.reduce((s, r) => s + r.hours, 0),
    value: rows.reduce((s, r) => s + r.value, 0),
    linked: rows.filter((r) => r.linked).reduce((s, r) => s + r.hours, 0),
    unlinked: rows.filter((r) => !r.linked).reduce((s, r) => s + r.hours, 0),
    missing: rows.filter((r) => !r.configured).reduce((s, r) => s + r.hours, 0),
    entries: rows.length,
  };
  return { rows, entities: Object.values(entities).sort((a, b) => b.hours - a.hours), totals };
}

function buildFirms() {
  const M = billingModel(),
    T = M.totals;
  document.getElementById('fCards').innerHTML = `
   <div class="card"><div class="n">${h1(T.hours)}</div><div class="l">Timesheet hours billed</div></div>
   <div class="card free"><div class="n">£${T.value.toFixed(2)}</div><div class="l">Calculated billing value</div></div>
   <div class="card"><div class="n">${h1(T.linked)}</div><div class="l">Hours with booking</div></div>
   <div class="card soon"><div class="n">${h1(T.unlinked)}</div><div class="l">Hours without booking · still billed</div></div>
   <div class="card ${T.missing ? 'busy' : 'free'}"><div class="n">${h1(T.missing)}</div><div class="l">Hours missing a configured rate</div></div>`;

  let f =
    '<thead><tr><th>Entity</th><th>Clients</th><th>Entries</th><th>Hours</th><th>Billing value</th><th>With booking</th><th>Without booking</th><th>Missing rate</th><th>Billed to</th></tr></thead><tbody>';
  if (!M.entities.length)
    f += `<tr><td colspan="9" class="empty">No worked timesheet hours in this period.</td></tr>`;
  M.entities.forEach((x) => {
    const names = Object.keys(x.people)
      .sort((a, b) => x.people[b] - x.people[a])
      .slice(0, 4)
      .join(', ');
    f += `<tr><td><b>${safe(x.entity)}</b></td><td>${x.clients.size}</td><td>${x.entries}</td><td><b>${h1(x.hours)}</b></td><td><b>£${x.value.toFixed(2)}</b></td><td>${h1(x.linked)}</td><td>${h1(x.unlinked)}</td><td>${x.missing ? `<span class="pill busy">${h1(x.missing)} h</span>` : '—'}</td><td>${safe(names) || '—'}</td></tr>`;
  });
  document.getElementById('fTable').innerHTML = f + '</tbody>';

  let j =
    '<thead><tr><th>Date</th><th>Entity</th><th>Client</th><th>Type</th><th>Worked by</th><th>Billed to</th><th>Designation</th><th>Rate</th><th>Hours</th><th>Value</th><th>Booking</th></tr></thead><tbody>';
  if (!M.rows.length)
    j += `<tr><td colspan="11" class="empty">No worked timesheet hours in this period.</td></tr>`;
  M.rows.forEach((x) => {
    j += `<tr><td>${fmt(x.date)}</td><td><b>${safe(x.entity)}</b></td><td>${safe(x.client)}</td><td>${safe(x.type)}</td><td>${safe(x.workerName)}</td><td>${safe(x.billedName)}</td><td>${safe(x.designation || 'Not specified')}</td><td>${x.configured ? '£' + x.rate.toFixed(2) : '<span class="pill busy">MISSING</span>'}</td><td><b>${h1(x.hours)}</b></td><td><b>£${x.value.toFixed(2)}</b></td><td>${x.linked ? '<span class="pill free">Linked</span>' : '<span class="pill soon">No booking</span>'}</td></tr>`;
  });
  document.getElementById('fJobs').innerHTML = j + '</tbody>';

  const flags = M.rows.filter((x) => !x.configured);
  let e =
    '<thead><tr><th>Entity</th><th>Designation</th><th>Employee billed to</th><th>Hours affected</th><th>Action</th></tr></thead><tbody>';
  if (!flags.length)
    e += `<tr><td colspan="5" class="empty">Every worked hour has a configured Entity + Designation rate.</td></tr>`;
  const missing = {};
  flags.forEach((x) => {
    const key = x.entity + '|' + x.designation,
      m =
        missing[key] ||
        (missing[key] = {
          entity: x.entity,
          designation: x.designation,
          name: x.billedName,
          hours: 0,
        });
    m.hours += x.hours;
  });
  Object.values(missing).forEach((x) => {
    e += `<tr><td><b>${safe(x.entity)}</b></td><td>${safe(x.designation || 'Not specified')}</td><td>${safe(x.name)}</td><td>${h1(x.hours)}</td><td><span class="pill busy">Add rate in Config</span></td></tr>`;
  });
  document.getElementById('fFlags').innerHTML = e + '</tbody>';
}

/* ---------- billing export ---------- */
setControlHandler('fExport', 'onclick', async () => {
  if (!isManager() || needExcel()) return;
  const btn = document.getElementById('fExport');
  btn.disabled = true;
  btn.textContent = 'Building…';
  const M = billingModel(),
    T = M.totals;
  const period = fmt(state.settings.start) + ' – ' + fmt(state.settings.end);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Resource Booking Tracker';

  const s = wb.addWorksheet('Billing summary', { properties: { tabColor: { argb: EXC.navy } } });
  s.columns = [
    { width: 24 },
    { width: 10 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 16 },
    { width: 44 },
  ];
  sheetTitle(
    s,
    'Hours to bill by firm',
    8,
    period +
      '  ·  billable hours = booked working days × ' +
      TS_CFG.hoursPerDay +
      ' h, on the person named on the booking',
  );
  s.getRow(4).values = [
    'Firm / channel',
    'Jobs',
    'Booked days',
    'Billable hrs',
    'Hrs delivered',
    'Delivered by others',
    'Over booking',
    'Named on the invoices',
  ];
  styleHeader(s.getRow(4));
  M.firms.forEach((x) => {
    const names = Object.keys(x.people)
      .sort((a, b) => x.people[b] - x.people[a])
      .map((n) => n + ' (' + h1(x.people[n]) + 'h)')
      .join(', ');
    const row = s.addRow([
      x.firm,
      x.jobs,
      x.days,
      +h1(x.billable),
      +h1(x.logged),
      +h1(x.byOthers),
      +h1(x.over),
      names,
    ]);
    row.getCell(4).font = { bold: true };
    if (x.byOthers) row.getCell(6).font = { bold: true, color: { argb: EXC.potential } };
    if (x.over) row.getCell(7).font = { bold: true, color: { argb: EXC.busy } };
    row.eachCell((c) => (c.border = xborder()));
  });
  const tot = s.addRow([
    'TOTAL',
    M.firms.reduce((m, x) => m + x.jobs, 0),
    M.firms.reduce((m, x) => m + x.days, 0),
    +h1(T.billable),
    +h1(T.logged),
    +h1(T.byOthers),
    +h1(T.over),
    '',
  ]);
  tot.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
    c.border = xborder();
  });
  s.views = [{ state: 'frozen', ySplit: 4 }];

  const d = wb.addWorksheet('Billing detail', { properties: { tabColor: { argb: EXC.steel } } });
  d.columns = [
    { width: 18 },
    { width: 36 },
    { width: 24 },
    { width: 24 },
    { width: 13 },
    { width: 13 },
    { width: 9 },
    { width: 14 },
    { width: 13 },
    { width: 14 },
    { width: 15 },
  ];
  sheetTitle(
    d,
    'Hours to bill, job by job',
    11,
    'One row per booking — this is what the firms should be invoiced for',
  );
  d.getRow(4).values = [
    'Firm',
    'Client / job',
    'Billed as',
    'Role',
    'From',
    'To',
    'Days',
    'Billable hrs',
    'Logged',
    'By named person',
    'By other staff',
  ];
  styleHeader(d.getRow(4));
  M.jobs.forEach((x) => {
    const row = d.addRow([
      x.firm,
      x.client + (x.potential ? ' (potential)' : ''),
      x.ownerName,
      x.role,
      parse(x.from),
      parse(x.to),
      x.days,
      +h1(x.billable),
      +h1(x.logged),
      +h1(x.byOwner),
      +h1(x.byOthers),
    ]);
    row.getCell(5).numFmt = 'dd/mm/yyyy';
    row.getCell(6).numFmt = 'dd/mm/yyyy';
    row.getCell(8).font = { bold: true };
    if (x.byOthers) row.getCell(11).font = { bold: true, color: { argb: EXC.potential } };
    if (x.over > 0) row.getCell(9).font = { bold: true, color: { argb: EXC.busy } };
    row.eachCell((c) => (c.border = xborder()));
  });
  d.views = [{ state: 'frozen', ySplit: 4 }];
  d.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 11 } };

  const w = wb.addWorksheet('Who did the work', {
    properties: { tabColor: { argb: EXC.potential } },
  });
  w.columns = [
    { width: 18 },
    { width: 36 },
    { width: 24 },
    { width: 24 },
    { width: 20 },
    { width: 13 },
    { width: 13 },
    { width: 20 },
  ];
  sheetTitle(
    w,
    'Delivery against each job',
    8,
    'Named person vs the people who actually recorded the time',
  );
  w.getRow(4).values = [
    'Firm',
    'Client / job',
    'Billed as',
    'Worked by',
    'Their pod',
    'Hours',
    'Share',
    'Same person?',
  ];
  styleHeader(w.getRow(4));
  M.jobs.forEach((x) => {
    if (!x.contribs.length) {
      const row = w.addRow([
        x.firm,
        x.client,
        x.ownerName,
        '— nobody logged time —',
        '',
        0,
        null,
        '',
      ]);
      row.eachCell((c) => (c.border = xborder()));
      return;
    }
    x.contribs.forEach((c) => {
      const p = state.roster.find((r) => r.id === c.pid);
      const row = w.addRow([
        x.firm,
        x.client,
        x.ownerName,
        c.name,
        p ? p.pod : '',
        +h1(c.hours),
        null,
        c.own ? 'Yes' : 'NO — delivered on their behalf',
      ]);
      pctCell(row.getCell(7), x.logged ? c.hours / x.logged : 0);
      if (!c.own) row.getCell(8).font = { bold: true, color: { argb: EXC.potential } };
      row.eachCell((c2) => (c2.border = xborder()));
    });
  });
  w.views = [{ state: 'frozen', ySplit: 4 }];
  w.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 8 } };

  const f = wb.addWorksheet('Flags', { properties: { tabColor: { argb: EXC.busy } } });
  f.columns = [{ width: 18 }, { width: 36 }, { width: 24 }, { width: 60 }];
  sheetTitle(
    f,
    'Exceptions to look at',
    4,
    'Over-booking, work delivered by others, and jobs with no time against them',
  );
  f.getRow(4).values = ['Firm', 'Client / job', 'Billed as', 'Flag'];
  styleHeader(f.getRow(4));
  let any = false;
  M.jobs.forEach((x) => {
    const add = (t) => {
      any = true;
      const row = f.addRow([x.firm, x.client, x.ownerName, t]);
      row.eachCell((c) => (c.border = xborder()));
    };
    const others = x.contribs
      .filter((c) => !c.own)
      .map((c) => c.name)
      .join(', ');
    if (x.over > 0) add('Over the booking by ' + h1(x.over) + ' h');
    if (x.logged > 0 && x.byOwner === 0)
      add('Named person logged nothing — delivered entirely by ' + others);
    else if (x.byOthers > 0)
      add(h1(x.byOthers) + ' h of ' + h1(x.logged) + ' h delivered by ' + others);
    if (x.logged === 0 && !x.potential) add('No time logged against this job at all');
  });
  if (!any) f.getCell(5, 1).value = 'Nothing flagged — delivery matches the bookings ✓';
  if (T.unlinked)
    f.getCell(f.rowCount + 2, 1).value =
      'Note: ' + h1(T.unlinked) + ' logged hours are not linked to any job.';

  await saveWb(
    wb,
    'billing-by-firm-' + state.settings.start + '_' + state.settings.end + '.xlsx',
    btn,
    '📤 Export billing',
  );
});

/* Current billing export: every worked timesheet row, whether booked or not. */
setControlHandler('fExport', 'onclick', async () => {
  if (!isManager() || needExcel()) return;
  const btn = document.getElementById('fExport');
  btn.disabled = true;
  btn.textContent = 'Building…';
  const M = billingModel(),
    T = M.totals,
    period = fmt(state.settings.start) + ' – ' + fmt(state.settings.end);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Reckoner Resource & Timesheet Portal';
  const s = wb.addWorksheet('Billing summary', { properties: { tabColor: { argb: EXC.navy } } });
  s.columns = [
    { width: 24 },
    { width: 10 },
    { width: 10 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 17 },
    { width: 15 },
    { width: 42 },
  ];
  sheetTitle(
    s,
    'Timesheet billing by entity',
    9,
    period + ' · every worked timesheet hour is included; booking link is optional',
  );
  s.getRow(4).values = [
    'Entity',
    'Clients',
    'Entries',
    'Hours',
    'Billing value',
    'With booking',
    'Without booking',
    'Missing rate hrs',
    'Billed to',
  ];
  styleHeader(s.getRow(4));
  M.entities.forEach((x) => {
    const names = Object.keys(x.people)
      .sort((a, b) => x.people[b] - x.people[a])
      .map((n) => n + ' (' + h1(x.people[n]) + 'h)')
      .join(', ');
    const row = s.addRow([
      x.entity,
      x.clients.size,
      x.entries,
      +h1(x.hours),
      +x.value.toFixed(2),
      +h1(x.linked),
      +h1(x.unlinked),
      +h1(x.missing),
      names,
    ]);
    row.getCell(4).font = { bold: true };
    row.getCell(5).numFmt = '£#,##0.00';
    if (x.missing) row.getCell(8).font = { bold: true, color: { argb: EXC.busy } };
    row.eachCell((c) => (c.border = xborder()));
  });
  const total = s.addRow([
    'TOTAL',
    '',
    T.entries,
    +h1(T.hours),
    +T.value.toFixed(2),
    +h1(T.linked),
    +h1(T.unlinked),
    +h1(T.missing),
    '',
  ]);
  total.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } };
    c.border = xborder();
  });
  total.getCell(5).numFmt = '£#,##0.00';
  s.views = [{ state: 'frozen', ySplit: 4 }];

  const d = wb.addWorksheet('Billing detail', { properties: { tabColor: { argb: EXC.steel } } });
  d.columns = [
    { width: 13 },
    { width: 20 },
    { width: 28 },
    { width: 18 },
    { width: 26 },
    { width: 26 },
    { width: 24 },
    { width: 13 },
    { width: 12 },
    { width: 15 },
    { width: 15 },
    { width: 42 },
  ];
  sheetTitle(
    d,
    'Timesheet billing detail',
    12,
    'One row per worked timesheet entry · rows without bookings remain fully valued',
  );
  d.getRow(4).values = [
    'Date',
    'Entity',
    'Client',
    'Type',
    'Worked by',
    'Billed to',
    'Designation',
    'Rate',
    'Hours',
    'Value',
    'Booking',
    'Work done',
  ];
  styleHeader(d.getRow(4));
  M.rows.forEach((x) => {
    const row = d.addRow([
      parse(x.date),
      x.entity,
      x.client,
      x.type,
      x.workerName,
      x.billedName,
      x.designation,
      x.configured ? x.rate : null,
      +h1(x.hours),
      +x.value.toFixed(2),
      x.linked ? 'Linked' : 'No booking',
      x.e.notes || '',
    ]);
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    row.getCell(8).numFmt = '£#,##0.00';
    row.getCell(10).numFmt = '£#,##0.00';
    if (!x.configured) row.getCell(8).value = 'MISSING RATE';
    if (!x.linked) row.getCell(11).font = { bold: true, color: { argb: EXC.soon } };
    row.eachCell((c) => (c.border = xborder()));
  });
  d.views = [{ state: 'frozen', ySplit: 4 }];
  d.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 12 } };

  const f = wb.addWorksheet('Missing rates', { properties: { tabColor: { argb: EXC.busy } } });
  f.columns = [{ width: 24 }, { width: 28 }, { width: 28 }, { width: 16 }];
  sheetTitle(
    f,
    'Missing Entity + Designation rates',
    4,
    'Add these combinations in Config → Entity pricing, then billing values update automatically',
  );
  f.getRow(4).values = ['Entity', 'Designation', 'Billed to', 'Hours affected'];
  styleHeader(f.getRow(4));
  const missing = {};
  M.rows
    .filter((x) => !x.configured)
    .forEach((x) => {
      const key = x.entity + '|' + x.designation,
        m =
          missing[key] ||
          (missing[key] = {
            entity: x.entity,
            designation: x.designation,
            name: x.billedName,
            hours: 0,
          });
      m.hours += x.hours;
    });
  Object.values(missing).forEach((x) => {
    const row = f.addRow([x.entity, x.designation || 'Not specified', x.name, +h1(x.hours)]);
    row.eachCell((c) => (c.border = xborder()));
  });
  if (!Object.keys(missing).length)
    f.getCell(5, 1).value = 'Every worked hour has a configured rate ✓';
  await saveWb(
    wb,
    'billing-by-entity-' + state.settings.start + '_' + state.settings.end + '.xlsx',
    btn,
    '📤 Export billing',
  );
});

/* ---------- login / access wiring ---------- */
setControlHandler('lgGo', 'onclick', doLogin);
setControlHandler('lgPass', 'onkeydown', (e) => {
  if (e.key === 'Enter') doLogin();
});
setControlHandler('forgotOpen', 'onclick', openForgotPassword);
setControlHandler('forgotBack', 'onclick', showLogin);
setControlHandler('forgotSend', 'onclick', requestForgotPassword);
setControlHandler('forgotEmail', 'onkeydown', (e) => {
  if (e.key === 'Enter') requestForgotPassword();
});
setControlHandler('forgotReset', 'onclick', resetForgottenPassword);
setControlHandler('forgotCode', 'oninput', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});
setControlHandler('forgotPasswordConfirm', 'onkeydown', (e) => {
  if (e.key === 'Enter') resetForgottenPassword();
});
setControlHandler('mfaVerify', 'onclick', verifyMfa);
setControlHandler('mfaCode', 'oninput', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});
setControlHandler('mfaCode', 'onkeydown', (e) => {
  if (e.key === 'Enter') verifyMfa();
});
setControlHandler('mfaResend', 'onclick', resendMfa);
setControlHandler('mfaCancel', 'onclick', () => {
  document.getElementById('mfaModal').classList.remove('show');
  showLogin();
});
setControlHandler('forcePasswordSave', 'onclick', saveRequiredPassword);
setControlHandler('forcePasswordConfirm', 'onkeydown', (e) => {
  if (e.key === 'Enter') saveRequiredPassword();
});
setControlHandler('signOutBtn', 'onclick', signOut);
setControlHandler('acClose', 'onclick', closeAccess);
setControlHandler('acSave', 'onclick', async () => {
  const currentPassword = document.getElementById('acCurrent').value,
    v = document.getElementById('acNew').value.trim();
  if (!currentPassword) {
    alert('Enter your current password.');
    return;
  }
  if (v.length < 8) {
    alert('The admin password needs at least 8 characters.');
    return;
  }
  await api('changePassword', { currentPassword, password: v });
  document.getElementById('acCurrent').value = '';
  document.getElementById('acNew').value = '';
  document.getElementById('acCap').checked = (state.settings.capMode || TS_CFG.capMode) === 'block';
  setControlHandler('acCap', 'onchange', async (ev) => {
    state.settings.capMode = ev.target.checked ? 'block' : 'warn';
    await pushSettings();
    if (!ONLINE) saveLocal();
  });
  alert('Admin password updated.');
});
setControlHandler('cfgAddEmployee', 'onclick', () => openPerson(null));
setControlHandler('cfgAddPod', 'onclick', async () => {
  if (!isAdmin()) return;
  const input = document.getElementById('cfgPodName'),
    name = input.value.trim().replace(/\s+/g, ' '),
    button = document.getElementById('cfgAddPod');
  if (!name) {
    alert('Enter a pod name.');
    input.focus();
    return;
  }
  button.disabled = true;
  try {
    await api('addPod', { name });
    input.value = '';
    await pullAll();
    refreshSelects();
    showConfigPage('employees');
  } catch (error) {
  } finally {
    button.disabled = false;
  }
});
setControlHandler('cfgAddHoliday', 'onclick', async () => {
  const name = document.getElementById('cfgHolidayName').value.trim(),
    date = document.getElementById('cfgHolidayDate').value;
  if (!name || !date) {
    alert('Enter a holiday name and date.');
    return;
  }
  await api('saveHoliday', { name, date });
  document.getElementById('cfgHolidayName').value = '';
  document.getElementById('cfgHolidayDate').value = '';
  await pullAll();
  buildConfig();
});
setControlHandler('cfgAddReference', 'onclick', async () => {
  const category = document.getElementById('cfgRefCategory').value,
    value = document.getElementById('cfgRefValue').value.trim();
  if (!value) {
    alert('Enter a reference value.');
    return;
  }
  await api('upsertReference', { category, value });
  document.getElementById('cfgRefValue').value = '';
  await pullAll();
  buildConfig();
});
setControlHandler('cfgSavePrice', 'onclick', async () => {
  const entity = document.getElementById('cfgPriceEntity').value,
    inputs = [...document.querySelectorAll('#cfgPricingTable [data-entity-rate]')],
    button = document.getElementById('cfgSavePrice'),
    status = document.getElementById('cfgPriceStatus');
  if (!entity) {
    alert('Select an entity first.');
    return;
  }
  const rates = [];
  for (const input of inputs) {
    const raw = input.value.trim();
    if (raw !== '' && (!Number.isFinite(+raw) || +raw < 0)) {
      alert('Every hourly rate must be zero or greater.');
      input.focus();
      return;
    }
    rates.push({ designation: input.dataset.designation, rate: raw === '' ? null : +raw });
  }
  button.disabled = true;
  button.textContent = 'Saving…';
  status.textContent = '';
  try {
    await api('saveEntityPricingBlock', { entity, rates });
    await pullAll();
    showConfigPage('pricing');
    status.textContent = 'All rates saved';
    status.style.color = 'var(--free)';
  } finally {
    button.disabled = false;
    button.textContent = 'Save all rates';
  }
});
setControlHandler('cfgRefCategory', 'onchange', buildReferenceConfig);
setControlHandler('cfgRefSearch', 'oninput', buildReferenceConfig);

/* polling for others' edits — keeps every screen and the comparison live */
let pollInFlight = false;
async function pollIfIdle() {
  if (
    pollInFlight ||
    document.visibilityState !== 'visible' ||
    !session ||
    modalOpen ||
    dragging ||
    sheetEditing ||
    pendingTimesheetSaves.size
  )
    return;
  pollInFlight = true;
  try {
    await pullAll();
  } finally {
    pollInFlight = false;
  }
}
if (ONLINE) {
  setInterval(pollIfIdle, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollIfIdle();
  });
}

/* init */
async function init() {
  try {
    const data = await api('bootstrap');
    if (data.session) {
      session = data.session;
      state = sanitizeState(data.state);
      syncInputs();
      applyRole();
    } else {
      state = {
        roster: data.roster || [],
        bookings: [],
        leaves: [],
        entries: [],
        settings: {
          start: todayISO().slice(0, 8) + '01',
          end: todayISO(),
          asOf: todayISO(),
          soonDays: 3,
        },
      };
      showLogin();
    }
  } catch (e) {
    document.body.classList.remove('gated');
    document.querySelector('.wrap').innerHTML =
      `<div class="vnote"><b>Unable to load the portal.</b><br>${safe(e.message)}</div>`;
  }
}
init();

setControlHandler('manageAccessBtn', 'onclick', openAccess);
