import { JSDOM } from 'jsdom';
import * as fake from 'fake-indexeddb';
const dom = new JSDOM('<!doctype html><html><body><div id="save-status"></div><div id="toast-container"></div></body></html>', { url: 'http://localhost/x/dbCenter.html', pretendToBeVisual: true });
const win = dom.window;
win.indexedDB = fake.indexedDB; win.IDBKeyRange = fake.IDBKeyRange;
if (!win.matchMedia) win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
globalThis.window = win; globalThis.document = win.document;
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
globalThis.localStorage = win.localStorage; globalThis.indexedDB = win.indexedDB; globalThis.IDBKeyRange = win.IDBKeyRange;
globalThis.Blob = win.Blob;
const { Engine } = await import('/workspace/js/engine.js');
const db = Engine.newDatabase('T');
Engine.open(db);
console.log('before withHistory tables:', db.tables.length);
Engine.createTable('X', [{name:'ID',type:'auto_id',primaryKey:true,required:true},{name:'N',type:'text'}]);
console.log('after createTable tables:', db.tables.length, 'Engine.db.tables:', Engine.db.tables.length);
try { Engine.addRecord('X', { N: 'hello' }); } catch(e){ console.log('add threw', e.message); }
console.log('tables now:', Engine.db.tables.length, JSON.stringify(Engine.getTableByName('X') && Engine.getTableByName('X').records));
