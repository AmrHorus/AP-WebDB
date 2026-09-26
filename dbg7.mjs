import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/x/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win; globalThis.document = win.document;
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
if (!win.matchMedia) win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
globalThis.localStorage = win.localStorage;
const { Engine } = await import('/workspace/js/engine.js');
Engine.touch = function () { this.dirty = true; };
Engine.open(Engine.newDatabase('T'));
const t1 = Engine.createTable('X', [{name:'ID',type:'auto_id',primaryKey:true,required:true},{name:'N',type:'text'}]);
Engine.on('records-changed', (id) => console.log('event records-changed', id === t1.id ? '(our table)' : id));
console.log('listeners:', JSON.stringify(Object.keys(Engine.listeners)));
try { Engine.addRecord('X', { N: 'hello' }); console.log('add ok'); } catch(e){ console.log('THREW:', e.message); }
console.log('raw db tables[0].records:', JSON.stringify(Engine.db.tables[0].records));
console.log('getTable records:', JSON.stringify(Engine.getTable(t1.id).records));
console.log('same object?', Engine.db.tables[0] === Engine.getTable(t1.id));
