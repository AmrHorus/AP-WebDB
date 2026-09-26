import { JSDOM } from 'jsdom';
import * as fake from 'fake-indexeddb';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/x/', pretendToBeVisual: true });
const win = dom.window;
win.indexedDB = fake.indexedDB; win.IDBKeyRange = fake.IDBKeyRange;
if (!win.matchMedia) win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
globalThis.window = win; globalThis.document = win.document;
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
globalThis.localStorage = win.localStorage; globalThis.indexedDB = win.indexedDB; globalThis.IDBKeyRange = win.IDBKeyRange;
globalThis.Blob = win.Blob;
const { Engine } = await import('/workspace/js/engine.js');
Engine.open(Engine.newDatabase('T'));
const t1 = Engine.createTable('X', [{name:'ID',type:'auto_id',primaryKey:true,required:true},{name:'N',type:'text'}]);
console.log('getByName:', !!Engine.getTableByName('X'), 'getById:', !!Engine.getTable(t1.id));
try { Engine.addRecord('X', { N: 'hello' }); console.log('add ok'); } catch(e){ console.log('THREW:', e.message); }
console.log('records:', JSON.stringify(Engine.getTable(t1.id).records));
