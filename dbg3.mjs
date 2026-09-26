import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/x/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win; globalThis.document = win.document;
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
if (!win.matchMedia) win.matchMedia = () => ({ matches:false, addEventListener(){}, addListener(){} });
const { Engine } = await import('/workspace/js/engine.js');
Engine.open(Engine.newDatabase('T'));
const t1 = Engine.createTable('X', [{name:'ID',type:'auto_id',primaryKey:true,required:true},{name:'N',type:'text'}]);
console.log('typeof addRecord:', typeof Engine.addRecord);
try { const r = Engine.addRecord('X', { N: 'hello' }); console.log('addRecord returned ok'); } catch(e){ console.log('THREW:', e.message, '| stack head:', (e.stack||'').split('\n')[1]); }
console.log('records:', JSON.stringify(Engine.getTable(t1.id).records));
