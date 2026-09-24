// JSON backup / restore for AP WebDB databases.
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
            throw new Error(t('errImportFormat'));
        }
        const candidates = [];
        if (data && data.format === this.FORMAT && Array.isArray(data.databases)) {
            candidates.push(...data.databases);
        } else if (data && Array.isArray(data.tables)) {
            // legacy single-database export (v1)
            candidates.push(data);
        } else if (Array.isArray(data) && data.every((d) => d && Array.isArray(d.tables))) {
            candidates.push(...data);
        } else {
            throw new Error(t('errImportFormat'));
        }
        const result = [];
        candidates.forEach((raw) => {
            const norm = this.normalize(raw);
            if (norm) result.push(norm);
        });
        if (!result.length) throw new Error(t('errImportFormat'));
        return result;
    },

    normalize(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tables)) return null;
        const validTypes = Engine.FIELD_TYPES;
        const db = {
            format: this.FORMAT,
            formatVersion: 2,
            id: typeof raw.id === 'string' ? raw.id : Utils.uid(),
            name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : t('untitled'),
            createdAt: raw.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tables: [],
            relationships: []
        };
        const tableIds = {};
        db.tables = raw.tables.map((tbl) => {
            if (!tbl || typeof tbl !== 'object') return null;
            const id = typeof tbl.id === 'string' ? tbl.id : Utils.uid();
            tableIds[id] = true;
            const fields = Array.isArray(tbl.fields) ? tbl.fields
                .filter((f) => f && typeof f.name === 'string' && f.name.trim())
                .map((f) => ({
                    name: f.name.trim(),
                    type: validTypes.indexOf(f.type) !== -1 ? f.type : 'text',
                    required: !!f.required,
                    primaryKey: !!f.primaryKey
                })) : [];
            if (!fields.some((f) => f.primaryKey) && fields.length) fields[0].primaryKey = true;
            const records = Array.isArray(tbl.records) ? tbl.records
                .filter((r) => r && typeof r === 'object')
                .map((r) => {
                    const clean = {};
                    fields.forEach((f) => {
                        const v = r[f.name];
                        if (f.type === 'boolean') clean[f.name] = v === true || v === 'true' || v === 1 || v === '1';
                        else clean[f.name] = v === undefined || v === null ? '' : String(v);
                    });
                    if (r._created) clean._created = String(r._created);
                    return clean;
                }) : [];
            return {
                id,
                name: typeof tbl.name === 'string' && tbl.name.trim() ? tbl.name.trim() : t('unnamed'),
                fields,
                records,
                createdAt: tbl.createdAt || db.createdAt,
                updatedAt: tbl.updatedAt || db.updatedAt
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
                id: typeof r.id === 'string' ? r.id : Utils.uid(),
                sourceTableId: r.sourceTableId,
                sourceField: String(r.sourceField || ''),
                targetTableId: r.targetTableId,
                targetField: String(r.targetField || ''),
                createdAt: r.createdAt || db.createdAt
            });
        });
        return db;
    },

    // Import parsed databases into IndexedDB, replacing same-name/same-id dbs.
    importDatabases(dbs) {
        const tasks = dbs.map((db) => IDB.listDatabases().then((existing) => {
            const clash = existing.find((e) => e.id === db.id || e.name.toLowerCase() === db.name.toLowerCase());
            if (clash) db.id = clash.id; // replace in place
            return IDB.putDatabase(db);
        }));
        return Promise.all(tasks).then(() => dbs);
    }
};
