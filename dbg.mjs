import { JSDOM } from 'jsdom';
import * as fake from 'fake-indexeddb';
const dom = new JSDOM('<!doctype html><html><body><div id="save-status"></div><div id="toast-container"></div></body></html>', { url: 'http://localhost/AP-WebDB/dbCenter.html', pretendToBeVisual: true });
const win = dom.window;
win.indexedDB = fake.indexedDB; win.IDBKeyRange = fake.IDBKeyRange;
if (!win.matchMedia) win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
globalThis.window = win; globalThis.document = win.document;
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
globalThis.localStorage = win.localStorage; globalThis.indexedDB = win.indexedDB; globalThis.IDBKeyRange = win.IDBKeyRange;
globalThis.Blob = win.Blob;
const { Engine } = await import('/workspace/js/engine.js');
const { IDB } = await import('/workspace/js/idb.js');
const db = Engine.newDatabase('TestDB');
await IDB.putDatabase(db);
Engine.open(structuredClone(await IDB.getDatabase(db.id)));
console.log('engine db set:', !!Engine.db, 'id match:', Engine.db && Engine.db.id === db.id);
const t1 = Engine.createTable('Students', [
  { name: 'ID', type: 'auto_id', primaryKey: true, required: true },
  { name: 'Name', type: 'text', required: true },
  { name: 'Email', type: 'email' },
  { name: 'GPA', type: 'decimal' },
  { name: 'Active', type: 'boolean' }
]);
console.log('table:', t1 && t1.name, 'fields in engine table:', JSON.stringify(Engine.getTable(t1.id).fields.map(f=>f.name+':'+f.type)));
try { Engine.addRecord('Students', { Name: 'Ahmed', Email: 'a@b.com', GPA: 3.5, Active: true }); } catch(e){ console.log('addRecord threw:', e.message); }
const tbl = Engine.getTable(t1.id);
console.log('records:', JSON.stringify(tbl.records));
try { Engine.addRecord('Students', { Name: '', Email: 'not-an-email' }); console.log('BAD accepted'); } catch(e){ console.log('rejected ok:', e.message.slice(0,80)); }
