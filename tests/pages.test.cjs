const { test, after } = require('node:test');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pages = fs
  .readdirSync(root)
  .filter((file) => file.endsWith('.php') && /\$portalView = '/.test(read(file)));

// Render real PHP templates in an isolated copy with development defaults.
// Never load the developer's private config.local.php or connect to a database.
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'timesheet-pages-'));
for (const file of [...pages, 'config.php'])
  fs.copyFileSync(path.join(root, file), path.join(staging, file));
for (const folder of ['includes', 'assets'])
  fs.cpSync(path.join(root, folder), path.join(staging, folder), { recursive: true });
after(() => fs.rmSync(staging, { recursive: true, force: true }));
function html(file) {
  const result = spawnSync(process.env.PHP_BINARY || 'php', [path.join(staging, file)], {
    encoding: 'utf8',
    env: { ...process.env, APP_ENV: 'development' },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /<!DOCTYPE html>/);
  return result.stdout;
}
function fixture(role) {
  const roster = [
    {
      id: 'DEMO-1',
      name: 'Demo Employee',
      pod: 'Demo Pod',
      role: 'Associate',
      accessRole: 'employee',
      entity: 'Demo',
      active: true,
      monthlyTarget: 160,
    },
  ];
  return {
    ok: true,
    session: role
      ? { role, name: 'Demo User', personId: 'DEMO-1', pod: 'Demo Pod', mustChangePassword: false }
      : null,
    state: {
      roster,
      billingRoster: roster,
      bookings: [
        {
          id: 'BOOK-1',
          personId: 'DEMO-1',
          client: 'Demo Client',
          firm: 'Demo',
          stage: 'Audit',
          start: '2026-11-02',
          end: '2026-11-06',
          status: 'confirmed',
          color: '#f26a21',
        },
      ],
      leaves: [
        {
          id: 'LEAVE-1',
          personId: 'DEMO-1',
          start: '2026-11-05',
          end: '2026-11-05',
          type: 'Annual Leave',
        },
      ],
      entries: [
        {
          id: 'ENTRY-1',
          personId: 'DEMO-1',
          billingTo: 'DEMO-1',
          date: '2026-11-02',
          start: '09:00',
          end: '17:00',
          hours: 8,
          type: 'Chargeable',
          entity: 'Demo',
          client: 'Demo Client',
          assignment: 'Audit',
          workArea: 'Planning',
          bookingId: 'BOOK-1',
          notes: 'Example work',
          source: 'manual',
        },
      ],
      holidays: [],
      references: {},
      importLogs: [],
      configPermissions: ['employees', 'holidays', 'references', 'pricing'],
      adminAccounts: [],
      settings: {
        start: '2026-11-01',
        end: '2026-11-30',
        asOf: '2026-11-04',
        soonDays: 3,
        hoursPerDay: 8,
      },
    },
    roster,
  };
}
async function boot(file, role) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  const dom = new JSDOM(html(file), {
    url: 'https://portal.example/' + file,
    runScripts: 'outside-only',
    virtualConsole,
  });
  const { window } = dom;
  window.alert = (message) => errors.push(message);
  window.confirm = () => false;
  window.fetch = async () => ({ ok: true, text: async () => JSON.stringify(fixture(role)) });
  window.setInterval = () => 0;
  const view = /\$portalView = '([^']+)'/.exec(read(file))[1];
  try {
    window.eval(read('assets/workbook-calculations.js'));
    window.eval(
      `const INITIAL_VIEW=${JSON.stringify(view)}; const INITIAL_CONFIG_PAGE='';\n` +
        read('assets/portal.js'),
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      window.document.querySelectorAll('.panel').length,
      1,
      'Only the requested page panel should be rendered',
    );
    assert.deepEqual(errors, []);
    assert.doesNotMatch(window.document.body.textContent, /Unable to load the portal/);
    if (role) {
      assert.equal(window.document.body.dataset.view, view);
      assert.equal(window.document.querySelector('.panel.show')?.id, view);
      window.eval('render(); syncInputs();');
      // Imports may be triggered from multiple page types; absent error panels are valid.
      window.eval('showImportErrors(["Example rejected row"]);');
      window.eval(
        'openBooking(null,null); closeBooking(); openPerson(null); closePerson(); openLeave(null,null); closeLeave();',
      );
    } else {
      assert.ok(window.document.getElementById('loginModal').classList.contains('show'));
    }
    return dom;
  } catch (error) {
    window.close();
    throw error;
  }
}
for (const file of pages) {
  for (const role of file === 'access.php' || file === 'master-data.php'
    ? [null, 'admin']
    : [null, 'admin', 'manager'])
    test(`${file}: ${role || 'signed out'} initializes independently`, async () => {
      const dom = await boot(file, role);
      dom.window.close();
    });
}
for (const file of [
  'timesheet.php',
  'weekly-hours.php',
  'booked-vs-actual.php',
  'import-history.php',
  'booking-context.php',
]) {
  test(`${file}: employee initializes independently`, async () => {
    const dom = await boot(file, 'employee');
    dom.window.close();
  });
}
test('navigation links resolve to dedicated content pages', () => {
  const dom = new JSDOM(html('timesheet.php'));
  for (const link of dom.window.document.querySelectorAll('a.tab[href]')) {
    const file = link.getAttribute('href');
    assert.ok(pages.includes(file), `${file} must own its content`);
    assert.doesNotMatch(read(file), /require[^;]*index\.php/);
  }
  dom.window.close();
});
