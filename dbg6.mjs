import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/x/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win; globalThis.document = win.document;
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
if (!win.matchMedia) win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
globalThis.localStorage = win.localStorage;
const { Engine } = await import('/workspace/js/engine.js');
Engine.touch = function () { console.log('TOUCH CALLED'); this.dirty = true; };
Engine.open(Engine.newDatabase('T'));
const t1 = Engine.createTable('X', [{name:'ID',type:'auto_id',primaryKey:true,required:true},{name:'N',type:'text'}]);
console.log('undoStack len:', Engine.undoStack.length);
console.log('snapshot sample:', JSON.stringify(Engine.undoStack[0] && Engine.undoStack[0].after.tables.map(t=>t.name)));
try { Engine.addRecord('X', { N: 'hello' }); console.log('add ok'); } catch(e){ console.log('THREW:', e.message); }
console.log('records after:', JSON.stringify(Engine.getTable(t1.id).records));
console.log('undoStack len2:', Engine.undoStack.length);
