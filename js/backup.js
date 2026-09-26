// JSON backup / restore for AP-WebDB databases (ES Module).
// Import path is treated as fully untrusted input: the payload is parsed,
// deep-sanitized (prototype pollution + control chars + markup stripped),
// schema-validated against Engine.FIELD_TYPES and size-capped before it
// ever reaches IndexedDB.
import Sanitize from './sanitize.js';
import Csv from './csv.js';

const MAX_DATABASES = 50;
const MAX_TABLES_PER_DB = 200;
const MAX_RECORDS_PER_TABLE = 100000;

function userError(key) {
    const e = new Error(key);
    e.isUserMessage = true;
    return e;
}

const Backup = {
    FORMAT: 'apwebdb',

    // Build a portable export payload from one or more full database objects
    buildExport(dbs) {
        return {
            format: this.FORMAT,
            formatVersion: 2,
            exportedAt: new Date().toISOString(),
            app: 'AP-WebDB',
            appVersion: I18N.version,
            databases: dbs.map((db) => ({
                id: db.id,
                name: db.name,
                createdAt: db.createdAt,
                updatedAt: db.updatedAt,
                tables: (db.tables || []).map((tbl) => ({
                    id: tbl.id,
                    name: tbl.name,
                    fields: (tbl.fields || []).map((f) => ({
                        name: f.name,
                        type: f.type,
                        required: !!f.required,
                        primaryKey: !!f.primaryKey
                    })),
                    records: tbl.records || [],
                    createdAt: tbl.createdAt,
                    updatedAt: tbl.updatedAt
                })),
                relationships: (db.relationships || []).map((r) => ({
                    id: r.id,
                    sourceTableId: r.sourceTableId,
                    sourceField: r.sourceField,
                    targetTableId: r.targetTableId,
                    targetField: r.targetField
                }))
            }))
        };
    },

    downloadDatabases(dbs) {
        const payload = this.buildExport(dbs);
        const stamp = new Date().toISOString().slice(0, 10);
        const single = dbs.length === 1 ? Csv.slugify(dbs[0].name) : 'collection';
        Csv.download(`apwebdb-${single}-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
    },

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('read error'));
            reader.readAsText(file, 'UTF-8');
        });
    },

    // Validate + normalize an imported JSON string. Returns array of db objects.
    parse(text) {
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('JSON parse failed:', e);
            throw userError('errImportFormat');
        }
        // Strip prototype-pollution vectors and non-finite numbers first.
        data = Sanitize.plainObject(data);

        const candidates = [];
        if (data && data.format === this.FORMAT && Array.isArray(data.databases)) {
            candidates.push(...data.databases);
        } else if (data && Array.isArray(data.tables)) {
            // legacy single-database export (v1)
            candidates.push(data);
        } else if (Array.isArray(data) && data.every((d) => d && Array.isArray(d.tables))) {
            candidates.push(...data);
        } else {
            throw userError('errImportFormat');
        }
        if (candidates.length > MAX_DATABASES) throw userError('errImportTooLarge');

        const result = [];
        candidates.forEach((raw) => {
            const norm = this.normalize(raw);
            if (norm) result.push(norm);
        });
        if (!result.length) throw userError('errImportFormat');
        return result;
    },

    normalize(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tables)) return null;
        const validTypes = Engine.FIELD_TYPES;
        const db = {
            format: this.FORMAT,
            formatVersion: 2,
            id: typeof raw.id === 'string' ? Sanitize.text(raw.id, 100) : Utils.uid(),
            name: Sanitize.stripTags(Sanitize.text(raw.name)).slice(0, 120) || t('untitled'),
            createdAt: Sanitize.text(raw.createdAt, 40) || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tables: [],
            relationships: []
        };
        const tableIds = {};
        const incomingTables = raw.tables.slice(0, MAX_TABLES_PER_DB);
        db.tables = incomingTables.map((tbl) => {
            if (!tbl || typeof tbl !== 'object') return null;
            const id = typeof tbl.id === 'string' ? Sanitize.text(tbl.id, 100) : Utils.uid();
            tableIds[id] = true;
            const fields = Array.isArray(tbl.fields) ? tbl.fields
                .filter((f) => f && typeof f.name === 'string' && Sanitize.text(f.name))
                .map((f) => ({
                    name: Sanitize.stripTags(Sanitize.text(f.name)).slice(0, 120),
                    // unknown field types are coerced to text, never trusted
                    type: validTypes.indexOf(f.type) !== -1 ? f.type : 'text',
                    required: !!f.required,
                    primaryKey: !!f.primaryKey
                })) : [];
            if (!fields.some((f) => f.primaryKey) && fields.length) fields[0].primaryKey = true;
            const records = Array.isArray(tbl.records) ? tbl.records
                .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
                .slice(0, MAX_RECORDS_PER_TABLE)
                .map((r) => {
                    const src = Sanitize.record(r); // strips tags/control chars per cell
                    const clean = {};
                    fields.forEach((f) => {
                        const v = src[f.name];
                        if (f.type === 'boolean') clean[f.name] = v === true || v === 'true' || v === 1 || v === '1';
                        else if (f.type === 'url') clean[f.name] = Sanitize.safeUrl(v);
                        else clean[f.name] = v === undefined || v === null ? '' : String(v);
                    });
                    if (src._created) clean._created = Sanitize.text(src._created, 40);
                    return clean;
                }) : [];
            return {
                id,
                name: Sanitize.stripTags(Sanitize.text(tbl.name)).slice(0, 120) || t('unnamed'),
                fields,
                records,
                createdAt: Sanitize.text(tbl.createdAt, 40) || db.createdAt,
                updatedAt: Sanitize.text(tbl.updatedAt, 40) || db.updatedAt
            };
        }).filter(Boolean);
        // dedupe table names inside the imported db
        const usedNames = {};
        db.tables.forEach((tbl) => {
            let name = tbl.name;
            let i = 2;
            while (usedNames[name.toLowerCase()]) { name = tbl.name + ' (' + i++ + ')'; }
            usedNames[name.toLowerCase()] = true;
            tbl.name = name;
        });
        (Array.isArray(raw.relationships) ? raw.relationships : []).forEach((r) => {
            if (!r || !tableIds[r.sourceTableId] || !tableIds[r.targetTableId]) return;
            db.relationships.push({
                id: typeof r.id === 'string' ? Sanitize.text(r.id, 100) : Utils.uid(),
                sourceTableId: r.sourceTableId,
                sourceField: Sanitize.stripTags(Sanitize.text(r.sourceField)).slice(0, 120),
                targetTableId: r.targetTableId,
                targetField: Sanitize.stripTags(Sanitize.text(r.targetField)).slice(0, 120),
                createdAt: Sanitize.text(r.createdAt, 40) || db.createdAt
            });
        });
        return db;
    },

    // Import parsed databases into IndexedDB, replacing same-name/same-id dbs.
    async importDatabases(dbs) {
        const existing = await IDB.listDatabases();
        for (const db of dbs) {
            const clash = existing.find((e) => e.id === db.id || e.name.toLowerCase() === db.name.toLowerCase());
            if (clash) db.id = clash.id; // replace in place
            await IDB.putDatabase(db);
        }
        return dbs;
    }
};

export default Backup;
export { Backup };
if (typeof window !== 'undefined') window.Backup = Backup;
