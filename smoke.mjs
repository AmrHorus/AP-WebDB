import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import * as fake from 'fake-indexeddb';

function makeDom(page) {
  const html = readFileSync(page, 'utf8')
    .replace(/<script type="module"[^>]*><\/script>/g, '')
    .replace(/<link[^>]*fonts[^>]*>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/AP-WebDB/' + page, runScripts: 'outside-only', pretendToBeVisual: true });
  return dom;
}

const errors = [];
process.on('unhandledRejection', (r) => errors.push('rejection: ' + String(r)));

async function boot(page) {
  const dom = makeDom(page);
  const win = dom.window;
  win.indexedDB = win.indexedDB || fake.indexedDB;
  win.IDBKeyRange = fake.IDBKeyRange;
  if (!win.matchMedia) win.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  globalThis.window = win;
  globalThis.document = win.document;
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
  globalThis.localStorage = win.localStorage;
  globalThis.indexedDB = win.indexedDB;
  globalThis.IDBKeyRange = win.IDBKeyRange;
  globalThis.Blob = win.Blob;
  for (const k of ['Utils','I18N','Prefs','t','tp','formatRelativeTime','Errors','Sanitize','IDB','Engine','UI','Csv','Backup','RecordForm']) delete globalThis[k];
  await import('./js/bootstrap.js?v=' + Math.random());
  // bootstrap imports modules with fixed specifiers -> cached. Force fresh copies instead:
  return win;
}

// ---- Page 1: index.html flow ----
let win = await boot('index.html');
await import('./js/utils.js'); await import('./js/i18n.js'); await import('./js/theme.js');
await import('./js/errors.js'); await import('./js/sanitize.js'); await import('./js/idb.js');
await import('./js/engine.js'); await import('./js/ui.js'); await import('./js/csv.js');
await import('./js/backup.js'); await import('./js/recordform.js');
const { Home } = await import('./js/home.js');
win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
await new Promise(r => setTimeout(r, 200));

const { Engine } = await import('./js/engine.js');
const { IDB } = await import('./js/idb.js');
const { Csv } = await import('./js/csv.js');
const { Backup } = await import('./js/backup.js');

const db = Engine.newDatabase('TestDB');
await IDB.putDatabase(db);
console.log('1. create+persist DB:', (await IDB.listDatabases()).map(d => d.name));

Engine.open(structuredClone(await IDB.getDatabase(db.id)));
const t1 = Engine.createTable('Students', [
  { name: 'ID', type: 'auto_id', primaryKey: true, required: true },
  { name: 'Name', type: 'text', required: true },
  { name: 'Email', type: 'email' },
  { name: 'GPA', type: 'decimal' },
  { name: 'Active', type: 'boolean' }
]);
console.log('2. table created:', !!t1);
Engine.addRecord('Students', { Name: 'Ahmed', Email: 'a@b.com', GPA: 3.5, Active: true });
Engine.addRecord('Students', { Name: 'Sara, "the best"', Email: 's@b.com', GPA: 3.9 });
console.log('3. records:', Engine.getTable(t1.id).records.length, 'autoId:', Engine.getTable(t1.id).records.map(r=>r.ID).join(','));
try { Engine.addRecord('Students', { Name: '', Email: 'not-an-email' }); console.log('4. VALIDATION FAILED (accepted bad record)'); }
catch (e) { console.log('4. invalid record rejected:', e.message.slice(0, 60)); }
// duplicate PK check via update? ensure unique enforcement exists on pk values
const csv = Csv.exportTable(Engine.getTable(t1.id));
const parsed = await Csv.parse(csv);
console.log('5. CSV roundtrip rows:', parsed.length, 'quoted-name ok:', JSON.stringify(parsed[1]).includes('Sara, "the best"'));

// relationships
const t2 = Engine.createTable('Grades', [
  { name: 'ID', type: 'auto_id', primaryKey: true, required: true },
  { name: 'student_id', type: 'integer', required: true },
  { name: 'Score', type: 'decimal' }
]);
Engine.addRelationship(t1.id, 'ID', t2.id, 'student_id');
console.log('6. relationships:', Engine.db.relationships.length);
try { Engine.addRelationship(t1.id, 'Nope', t2.id, 'student_id'); console.log('7. BAD: invalid rel accepted'); }
catch (e) { console.log('7. invalid relationship rejected:', e.message.slice(0,50)); }

// backup format
const bk = Backup.buildBackup ? Backup.buildBackup([Engine.db]) : null;
console.log('8. backup built:', !!bk || 'uses other API', Object.keys(bk || {}).join(','));

// undo/redo
Engine.undo(); console.log('9. after undo tables:', Engine.db.tables.length);
Engine.redo(); console.log('10. after redo tables:', Engine.db.tables.length);

// persist then simulate reload
await IDB.putDatabase(Engine.db);

// ---- Page 2: dbCenter.html flow ----
win = await boot('dbCenter.html');
for (const p of ['utils','i18n','theme','errors','sanitize','idb','engine','ui','csv','backup','recordform']) {
  await import('./js/' + p + '.js?' + Math.random());
}
// modules are cached per-process; globals were re-injected by the window.* lines — verify:
console.log('globals present:', ['Utils','I18N','Prefs','Engine','IDB','UI','Csv','Backup','RecordForm','Errors','Sanitize'].filter(k => !globalThis.window[k]));
const E2 = win.Engine;
const savedList = await win.IDB.listDatabases();
console.log('11. persisted databases:', savedList.map(d => d.name + '/' + d.tableCount + 't/' + d.recordCount + 'r'));
E2.open(await win.IDB.getDatabase(savedList[0].id));
console.log('12. reopened tables:', E2.db.tables.map(t => t.name), 'records:', E2.getTable(E2.db.tables.find(x=>x.name==='Students').id).records.length);

// language switch
win.Prefs.setLang('ar');
console.log('13. ar dir:', win.document.documentElement.dir, 'translated sample:', win.t('createDatabase'));
win.Prefs.setLang('en');
console.log('14. en dir:', win.document.documentElement.dir, win.t('createDatabase'));

// theme cycle
win.Prefs.setTheme('dark'); console.log('15. theme dark:', win.document.documentElement.getAttribute('data-theme'));
win.Prefs.setTheme('light'); console.log('   theme light:', win.document.documentElement.getAttribute('data-theme'));
win.Prefs.setTheme('system'); console.log('   theme system:', win.document.documentElement.getAttribute('data-theme'));

// init DbCenter UI itself
const { DbCenter } = await import('./js/dbCenter.js');
win.document.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
await new Promise(r => setTimeout(r, 300));
console.log('16. DbCenter init done without throwing');

console.log('ERRORS:', errors.length ? errors : 'none');
