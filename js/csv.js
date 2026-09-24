// CSV parsing / generation and file download helpers.
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
        const headers = table.fields.map((f) => this.escapeValue(f.name));
        const rows = (table.records || []).map((rec) =>
            table.fields.map((f) => {
                let v = rec[f.name];
                if (f.type === 'boolean') v = v ? 'true' : 'false';
                return this.escapeValue(v);
            }).join(',')
        );
        // UTF-8 BOM so spreadsheet apps read Arabic text correctly
        return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    },

    parseLine(line) {
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
    },

    parse(content) {
        if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
        // split into logical lines while respecting quoted newlines
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
        if (nonEmpty.length === 0) throw new Error('empty');
        const headers = this.parseLine(nonEmpty[0]).map((h) => h.trim());
        if (headers.length === 0 || (headers.length === 1 && headers[0] === '')) throw new Error('empty');
        const records = [];
        for (let i = 1; i < nonEmpty.length; i++) {
            const values = this.parseLine(nonEmpty[i]);
            const rec = {};
            headers.forEach((h, idx) => { rec[h] = (values[idx] !== undefined ? values[idx] : '').trim(); });
            records.push(rec);
        }
        return { headers, records };
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
        void lower;
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
        const blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8;' });
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
