// CSV parsing / generation and file download helpers (ES Module).
// - Parsing is a single-pass state machine (O(n)) with sanitized cells.
// - Generation streams chunks into the Blob to stay memory-friendly on big tables.
// - Optional Web Worker acceleration with automatic main-thread fallback.


import { Sanitize } from './sanitize.js';

const LARGE_FILE_BYTES = 512 * 1024;   // above this, try the worker
const LARGE_ROW_COUNT = 5000;          // above this, chunked blob assembly

function parseLine(line) {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') inQuotes = false;
            else cur += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === ',') { values.push(cur); cur = ''; }
            else cur += ch;
        }
    }
    values.push(cur);
    return values;
}

// Core parse: returns { headers, records } with every cell sanitized.
function parseContent(content) {
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    // Split into logical lines while respecting quoted newlines (single pass).
    const lines = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (ch === '"') { inQuotes = !inQuotes; cur += ch; continue; }
        if (!inQuotes && (ch === '\n' || ch === '\r')) {
            if (ch === '\r' && content[i + 1] === '\n') i++;
            lines.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    if (cur.trim() !== '') lines.push(cur);

    const nonEmpty = lines.filter((l) => l.trim() !== '');
    if (nonEmpty.length === 0) throw userError('errCsvEmpty');
    const headers = parseLine(nonEmpty[0])
        .map((h) => Sanitize.stripTags(Sanitize.text(h)))
        .filter((h, idx, arr) => h !== '' || arr.length === 1);
    if (headers.length === 0 || (headers.length === 1 && headers[0] === '')) throw userError('errCsvEmpty');

    const records = [];
    for (let i = 1; i < nonEmpty.length; i++) {
        const values = parseLine(nonEmpty[i]);
        const rec = {};
        headers.forEach((h, idx) => {
            rec[h] = Sanitize.stripTags(Sanitize.text(values[idx] !== undefined ? values[idx] : ''));
        });
        records.push(rec);
    }
    return { headers, records };
}

function userError(key) {
    const e = new Error(key);
    e.isUserMessage = true;
    return e;
}

let _worker = null;
let _workerFailed = false;
let _reqId = 0;
const _pending = new Map();

function getWorker() {
    if (_workerFailed || typeof Worker === 'undefined') return null;
    if (_worker) return _worker;
    try {
        const code = [
            'self.onmessage = function(e) {',
            '  var d = e.data;',
            '  try {',
            '    if (d.cmd === "parse") {',
            '      var content = d.content;',
            '      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);',
            '      var lines = [], cur = "", q = false;',
            '      for (var i = 0; i < content.length; i++) {',
            '        var ch = content[i];',
            '        if (ch === \'"\') { q = !q; cur += ch; continue; }',
            '        if (!q && (ch === "\\n" || ch === "\\r")) { if (ch === "\\r" && content[i+1] === "\\n") i++; lines.push(cur); cur = ""; continue; }',
            '        cur += ch;',
            '      }',
            '      if (cur.trim() !== "") lines.push(cur);',
            '      var ne = lines.filter(function(l){ return l.trim() !== ""; });',
            '      if (!ne.length) throw new Error("errCsvEmpty");',
            '      self.postMessage({ id: d.id, ok: true, lines: ne });',
            '    } else if (d.cmd === "stringify") {',
            '      self.postMessage({ id: d.id, ok: true, text: d.rows.join("\\r\\n") });',
            '    }',
            '  } catch (err) {',
            '    self.postMessage({ id: d.id, ok: false, error: String(err && err.message || err) });',
            '  }',
            '};'
        ].join('\n');
        const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        _worker = new Worker(blobUrl);
        URL.revokeObjectURL(blobUrl);
        _worker.onmessage = (e) => {
            const p = _pending.get(e.data.id);
            if (!p) return;
            _pending.delete(e.data.id);
            if (e.data.ok) p.resolve(e.data);
            else p.reject(userError(e.data.error === 'errCsvEmpty' ? 'errCsvEmpty' : 'errCsvParse'));
        };
        _worker.onerror = () => {
            _workerFailed = true;
            _worker.terminate();
            _worker = null;
            _pending.forEach((p) => p.reject(new Error('worker unavailable')));
            _pending.clear();
        };
        return _worker;
    } catch (e) {
        _workerFailed = true;
        return null;
    }
}

function workerCall(msg) {
    return new Promise((resolve, reject) => {
        const w = getWorker();
        if (!w) { reject(new Error('no worker')); return; }
        const id = ++_reqId;
        _pending.set(id, { resolve, reject });
        msg.id = id;
        w.postMessage(msg);
    });
}

const Csv = {
    escapeValue(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (/[",\n\r]/.test(str)) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    },

    exportTable(table) {
        if (!table || !Array.isArray(table.fields)) throw new Error('Invalid table');
        const headers = table.fields.map((f) => Csv.escapeValue(f.name));
        const rows = (table.records || []).map((rec) =>
            table.fields.map((f) => {
                let v = rec[f.name];
                if (f.type === 'boolean') v = v ? 'true' : 'false';
                return Csv.escapeValue(v);
            }).join(',')
        );
        // UTF-8 BOM so spreadsheet apps read Arabic text correctly
        return '\uFEFF' + [headers, ...rows].map((r) => r.join(',')).join('\r\n');
    },

    // Chunked generation for very large tables: build Blob parts incrementally
    // instead of concatenating one giant string.
    buildTableBlob(table) {
        if (!table || !Array.isArray(table.fields)) throw new Error('Invalid table');
        const headerLine = table.fields.map((f) => Csv.escapeValue(f.name)).join(',');
        const parts = ['\uFEFF' + headerLine];
        const records = table.records || [];
        const CHUNK = 2000;
        for (let start = 0; start < records.length; start += CHUNK) {
            const slice = records.slice(start, start + CHUNK).map((rec) =>
                table.fields.map((f) => {
                    let v = rec[f.name];
                    if (f.type === 'boolean') v = v ? 'true' : 'false';
                    return Csv.escapeValue(v);
                }).join(',')
            );
            parts.push('\r\n' + slice.join('\r\n'));
        }
        return new Blob(parts, { type: 'text/csv;charset=utf-8;' });
    },

    async exportTableAsync(table) {
        const records = table && Array.isArray(table.records) ? table.records : [];
        if (records.length >= LARGE_ROW_COUNT) {
            return Csv.buildTableBlob(table);
        }
        return Csv.exportTable(table);
    },

    parseLine,

    // Parse CSV text or File. Uses a Web Worker for large payloads when
    // available; falls back to the identical main-thread implementation.
    async parse(source) {
        let content = typeof source === 'string' ? source : await Csv.readFile(source);
        const useWorker = typeof source !== 'string' && source.size > LARGE_FILE_BYTES;
        if (useWorker) {
            try {
                const res = await workerCall({ cmd: 'parse', content });
                // Worker returned logical lines; finish sanitization here.
                const nonEmpty = res.lines;
                if (!nonEmpty.length) throw userError('errCsvEmpty');
                const headers = parseLine(nonEmpty[0])
                    .map((h) => Sanitize.stripTags(Sanitize.text(h)));
                if (headers.length === 0) throw userError('errCsvEmpty');
                const records = [];
                for (let i = 1; i < nonEmpty.length; i++) {
                    const values = parseLine(nonEmpty[i]);
                    const rec = {};
                    headers.forEach((h, idx) => {
                        rec[h] = Sanitize.stripTags(Sanitize.text(values[idx] !== undefined ? values[idx] : ''));
                    });
                    records.push(rec);
                }
                return { headers, records };
            } catch (err) {
                if (err.isUserMessage) throw err;
                console.warn('CSV worker unavailable, using main thread:', err);
            }
        }
        return parseContent(content);
    },

    guessType(headerName, sampleValues) {
        const lower = String(headerName).toLowerCase();
        const filled = sampleValues.filter((v) => v !== '');
        if (filled.length === 0) return 'text';
        const allInt = filled.every((v) => /^-?\d+$/.test(v));
        if (allInt) return 'integer';
        if (filled.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'decimal';
        if (filled.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))) return 'date';
        if (filled.every((v) => /^(true|false)$/i.test(v))) return 'boolean';
        if (filled.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) return 'email';
        if (filled.every((v) => /^https?:\/\//.test(v))) return 'url';
        if (/id$/.test(lower) && allInt) return 'integer';
        return 'text';
    },

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(reader.error || new Error('read error'));
            reader.readAsText(file, 'UTF-8');
        });
    },

    download(filename, content, mime) {
        const blob = content instanceof Blob
            ? content
            : new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    slugify(name) {
        return String(name).replace(/[^\w\u0600-\u06FF-]+/g, '_').replace(/^_+|_+$/g, '') || 'table';
    }
};

export default Csv;
export { Csv, parseContent };
if (typeof window !== 'undefined') window.Csv = Csv;
