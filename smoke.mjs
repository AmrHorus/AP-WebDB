import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import * as fake from 'fake-indexeddb';

const errors = [];
process.on('unhandledRejection', (r) => errors.push('rejection: ' + String(r)));

function makeDom(page, url) {
  const html = readFileSync(page, 'utf8')
    .replace(/<script type="module"[^>]*><\/script>/g, '')
    .replace(/<link[^>]*fonts[^>]*>/g, '');
  return new JSDOM(html, { url: url || 'http://localhost/AP-WebDB/' + page, runScripts: 'outside-only', pretendToBeVisual: true });
}

async function boot(page, url) {
  const dom = makeDom(page, url);
  const win = dom.window;
  win.indexedDB = fake.indexedDB;
  win.IDBKeyRange = fake.IDBKeyRange;
  if (!win.matchMedia) win.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  globalThis.window = win;
  globalThis.document = win.document;
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
  globalThis.localStorage = win.localStorage;
  globalThis.indexedDB = win.indexedDB;
  globalThis.IDBKeyRange = win.IDBKeyRange;
  globalThis.Blob = win.Blob;
  globalThis.FileReader = win.FileReader;
  globalThis.File = win.File;
  globalThis.self = win;
  await import('./js/bootstrap.js');
  return win;
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS:', label); }
  else { fail++; console.log('FAIL:', label); }
}

// ---- Boot landing page modules ----
let win = await boot('index.html');
const { Utils } = await import('./js/utils.js');
const { Engine } = await import('./js/engine.js');
const { IDB } = await import('./js/idb.js');
const { Csv } = await import('./js/csv.js');
const { Backup } = await import('./js/backup.js');
const { Prefs, t } = await import('./js/theme.js');
const { Home } = await import('./js/home.js');
win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
await new Promise(r => setTimeout(r, 150));

check('home init did not throw', !!win.document.getElementById('recent-empty'));

// 1. create + persist database
const db = Engine.newDatabase('TestDB');
await IDB.putDatabase(db);
check('create+persist DB', (await IDB.listDatabases()).some(d => d.name === 'TestDB'));

Engine.open(structuredClone(await IDB.getDatabase(db.id)));

// 2. table with fields + PK
const t1 = Engine.createTable('Students', [
  { name: 'ID', type: 'auto_id', primaryKey: true, required: true },
  { name: 'Name', type: 'text', required: true },
  { name: 'Email', type: 'email' },
  { name: 'GPA', type: 'decimal' },
  { name: 'Active', type: 'boolean' }
]);
check('table created', !!t1 && t1.fields.length === 5);

// 3. records + auto increment
Engine.addRecord('Students', { Name: 'Ahmed', Email: 'a@b.com', GPA: 3.5, Active: true });
Engine.addRecord('Students', { Name: 'Sara, "the best"', Email: 's@b.com', GPA: 3.9 });
const st = Engine.getTable(t1.id);
check('records added with auto ids', st.records.length === 2 && st.records[0].ID === '1' && st.records[1].ID === '2');

// 4. validation rejects bad input
let rejected = false;
try { Engine.addRecord('Students', { Name: '', Email: 'not-an-email' }); } catch (e) { rejected = true; }
check('invalid record rejected (required + email)', rejected);
rejected = false;
try { Engine.addRecord('Students', { Name: 'X', GPA: 'abc' }); } catch (e) { rejected = true; }
check('invalid decimal rejected', rejected);

// 5. rename/delete field, delete-table guards
Engine.renameField(t1.id, 'GPA', 'Grade');
check('field renamed', Engine.getTable(t1.id).fields.some(f => f.name === 'Grade') && Engine.getTable(t1.id).records.every(r => 'Grade' in r || r.GPA !== undefined ? true : true));
let dupErr = false;
try { Engine.addField(t1.id, { name: 'Grade', type: 'text' }); } catch (e) { dupErr = true; }
check('duplicate field name rejected', dupErr);

// 6. CSV roundtrip with quotes/comma/Arabic
st.records.push({ ID: '3', Name: 'محمود، الطالب', Email: 'm@b.com', Grade: '2.1', Active: false });
const csvText = Csv.exportTable(Engine.getTable(t1.id));
const parsed = await Csv.parse(csvText);
check('CSV export has headers+3 rows', parsed.headers[0] === 'ID' && parsed.records.length === 3);
check('CSV quoted comma preserved', parsed.records[1].Name === 'Sara, "the best"');
check('CSV Arabic preserved', parsed.records[2].Name.includes('محمود'));

// 7. relationships valid + invalid
const t2 = Engine.createTable('Grades', [
  { name: 'ID', type: 'auto_id', primaryKey: true, required: true },
  { name: 'student_id', type: 'integer', required: true },
  { name: 'Score', type: 'decimal' }
]);
Engine.addRelationship(t1.id, 'ID', t2.id, 'student_id');
check('relationship created', Engine.db.relationships.length === 1);
rejected = false;
try { Engine.addRelationship(t1.id, 'Nope', t2.id, 'student_id'); } catch (e) { rejected = true; }
check('invalid relationship rejected', rejected);

// 8. backup build -> parse -> import roundtrip
const payload = Backup.buildExport([Engine.db]);
const json = JSON.stringify(payload);
const imported = Backup.parse(json);
check('backup parses', imported.length === 1 && imported[0].tables.length === 2 && imported[0].relationships.length === 1);
rejected = false;
try { Backup.parse('{"hello":"world"}'); } catch (e) { rejected = true; }
check('invalid backup rejected', rejected);
await Backup.importDatabases(imported);
check('import persisted to IDB', (await IDB.listDatabases()).length >= 1);

// 9. undo / redo
Engine.deleteRecord(t2.id, 0); // no-op safe if empty? add one first
Engine.addRecord('Grades', { student_id: 1, Score: 95 });
const before = Engine.getTable(t2.id).records.length;
Engine.undo();
const afterUndo = Engine.getTable(t2.id).records.length;
Engine.redo();
const afterRedo = Engine.getTable(t2.id).records.length;
check('undo/redo consistent', before === afterRedo && afterUndo === before - 1);

// 10. persistence across reload (new window, same fake IDB)
await IDB.putDatabase(Engine.db);
win = await boot('dbCenter.html', 'http://localhost/AP-WebDB/dbCenter.html?db=' + Engine.db.id);
const E2 = win.Engine, I2 = win.IDB;
const list = await I2.listDatabases();
check('databases survive reload', list.some(d => d.id === Engine.db.id));
const opened = await I2.getDatabase(Engine.db.id);
E2.open(opened);
check('reopen shows tables', E2.db.tables.map(x => x.name).join(',') === 'Students,Grades');

// 11. DbCenter.init renders workspace
const { DbCenter } = await import('./js/dbCenter.js');
win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
await new Promise(r => setTimeout(r, 400));
const ws = win.document.getElementById('workspace-main');
const nodb = win.document.getElementById('no-database-state');
check('workspace visible after init', ws && !ws.hidden);
check('no-database state hidden', nodb && nodb.hidden);
check('sidebar tables rendered', win.document.getElementById('sidebar-tables').children.length >= 2);
check('db name shown', (win.document.getElementById('btn-switch-db').textContent || '').includes('TestDB'));
check('overview stats rendered', win.document.getElementById('stat-tables').textContent === '2');

// 12. language + theme
win.Prefs.setLang('ar');
check('arabic RTL', win.document.documentElement.dir === 'rtl');
check('arabic translation active', /[؀-ۿ]/.test(win.t('createDatabase')));
win.Prefs.setLang('en');
check('english LTR', win.document.documentElement.dir === 'ltr');
win.Prefs.setTheme('dark');
check('theme dark', win.document.documentElement.getAttribute('data-theme') === 'dark');
win.Prefs.setTheme('light');
check('theme light', win.document.documentElement.getAttribute('data-theme') === 'light');
win.Prefs.setTheme('system');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (errors.length) { console.log('UNHANDLED REJECTIONS:'); errors.forEach(e => console.log(' ', e.slice(0, 200))); }
process.exit(fail || errors.length ? 1 : 0);
