// Database engine: schema model, CRUD operations, validation and undo/redo.
// The engine keeps one "open" database in memory and persists it via IDB.
const Engine = {
    db: null,            // currently open database object
    dirty: false,
    undoStack: [],       // array of {labelKey, before, after, apply('undo'|'redo')}
    redoStack: [],
    MAX_HISTORY: 50,
    listeners: {},

    FIELD_TYPES: [
        'auto_id', 'text', 'long_text', 'integer', 'decimal',
        'boolean', 'date', 'datetime', 'email', 'url'
    ],

    /* ---------- tiny event bus ---------- */
    on(event, fn) {
        (this.listeners[event] = this.listeners[event] || []).push(fn);
    },
    emit(event, payload) {
        (this.listeners[event] || []).forEach((fn) => fn(payload));
    },

    /* ---------- lifecycle ---------- */
    newDatabase(name) {
        return {
            format: 'apwebdb',
            formatVersion: 2,
            id: Utils.uid(),
            name: name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tables: [],
            relationships: []
        };
    },

    open(db) {
        this.db = db;
        this.undoStack = [];
        this.redoStack = [];
        this.dirty = false;
        this.emit('opened', db);
    },

    close() {
        this.db = null;
        this.undoStack = [];
        this.redoStack = [];
        this.dirty = false;
    },

    persist() {
        if (!this.db) return Promise.resolve();
        this.db.updatedAt = new Date().toISOString();
        this.setSaveStatus('saving');
        return IDB.putDatabase(this.db)
            .then(() => {
                this.dirty = false;
                this.setSaveStatus('saved');
                this.emit('persisted');
            })
            .catch((e) => {
                console.error('Failed to persist database:', e);
                this.setSaveStatus('error');
                UI.toast(t('errStorageFull'), 'error');
            });
    },

    touch() {
        this.dirty = true;
        this.setSaveStatus('dirty');
        this.debouncedPersist();
    },

    debouncedPersist: null,

    setSaveStatus(state) {
        const el = document.getElementById('save-status');
        if (!el) return;
        el.dataset.state = state;
        el.textContent = state === 'saving' ? t('saving') : state === 'saved' ? t('saved') : t('unsavedChanges');
    },

    /* ---------- history / undo-redo ---------- */
    snapshotDb() {
        return Utils.deepClone(this.db);
    },

    pushHistory(labelKey, beforeSnapshot) {
        const after = this.snapshotDb();
        this.undoStack.push({ labelKey, before: beforeSnapshot, after });
        if (this.undoStack.length > this.MAX_HISTORY) this.undoStack.shift();
        this.redoStack = [];
        this.emit('history');
    },

    // Wrap a mutation so it can be undone: fn receives nothing,
    // we snapshot before/after automatically.
    withHistory(labelKey, fn) {
        if (!this.db) return fn();
        const before = this.snapshotDb();
        const result = fn();
        this.pushHistory(labelKey, before);
        this.touch();
        return result;
    },

    undo() {
        if (!this.undoStack.length) {
            UI.toast(t('toastNothingToUndo'), 'info');
            return false;
        }
        const entry = this.undoStack.pop();
        this.redoStack.push(entry);
        this.db = entry.before;
        this.touch();
        this.emit('structure-changed');
        UI.toast(t('toastUndo', { label: t(entry.labelKey) }), 'info');
        return true;
    },

    redo() {
        if (!this.redoStack.length) {
            UI.toast(t('toastNothingToRedo'), 'info');
            return false;
        }
        const entry = this.redoStack.pop();
        this.undoStack.push(entry);
        this.db = entry.after;
        this.touch();
        this.emit('structure-changed');
        UI.toast(t('toastRedo', { label: t(entry.labelKey) }), 'info');
        return true;
    },

    canUndo() { return this.undoStack.length > 0; },
    canRedo() { return this.redoStack.length > 0; },

    /* ---------- helpers ---------- */
    tables() {
        return this.db ? this.db.tables : [];
    },

    getTable(id) {
        return this.tables().find((tbl) => tbl.id === id) || null;
    },

    getTableByName(name, exceptId) {
        return this.tables().find(
            (tbl) => tbl.id !== exceptId && tbl.name.toLowerCase() === String(name).toLowerCase()
        ) || null;
    },

    pkFields(table) {
        return table.fields.filter((f) => f.primaryKey);
    },

    autoIdField(table) {
        return table.fields.find((f) => f.type === 'auto_id') || null;
    },

    nextAutoId(table) {
        const field = this.autoIdField(table);
        if (!field) return null;
        let max = 0;
        table.records.forEach((r) => {
            const n = parseInt(r[field.name], 10);
            if (!isNaN(n) && n > max) max = n;
        });
        return max + 1;
    },

    /* ---------- validation ---------- */
    isValueEmpty(v) {
        return v === undefined || v === null || v === '';
    },

    validateFieldValue(field, value) {
        // returns null when valid, otherwise an error key
        if (field.type === 'auto_id') return null;
        if (this.isValueEmpty(value)) {
            return field.required ? 'errFieldRequired' : null;
        }
        const str = String(value);
        switch (field.type) {
            case 'number':
                return (!isNaN(Number(str)) && str.trim() !== '') ? null : 'errInvalidNumber';
            case 'integer':
                return /^-?\d+$/.test(str.trim()) ? null : 'errInvalidInteger';
            case 'decimal':
                return /^-?\d+(\.\d+)?$/.test(str.trim()) ? null : 'errInvalidDecimal';
            case 'boolean':
                return null;
            case 'date': {
                const d = new Date(str);
                return !isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(str) ? null : 'errInvalidDate';
            }
            case 'datetime': {
                const d = new Date(str);
                return !isNaN(d.getTime()) ? null : 'errInvalidDateTime';
            }
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str) ? null : 'errInvalidEmail';
            case 'url':
                return /^https?:\/\/[^\s]+\.[^\s]+/.test(str) ? null : 'errInvalidUrl';
            default:
                return null; // text / long_text
        }
    },

    validateRecord(table, record, ignoreIndex) {
        for (const field of table.fields) {
            const errKey = this.validateFieldValue(field, record[field.name]);
            if (errKey) {
                return { ok: false, message: t(errKey, { field: field.name }), field: field.name };
            }
        }
        // primary key uniqueness
        for (const pk of this.pkFields(table)) {
            if (pk.type === 'auto_id') continue;
            const val = record[pk.name];
            if (this.isValueEmpty(val)) continue;
            const clash = table.records.some((r, i) =>
                i !== ignoreIndex && String(r[pk.name]) === String(val));
            if (clash) {
                return { ok: false, message: t('errPkUnique'), field: pk.name };
            }
        }
        return { ok: true };
    },

    /* ---------- table operations ---------- */
    createTable(name, fields) {
        name = String(name || '').trim();
        if (!name) throw new Error(t('errEnterTableName'));
        if (this.getTableByName(name)) throw new Error(t('errDuplicateTable'));
        const table = {
            id: Utils.uid(),
            name: name,
            fields: fields || [],
            records: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.withHistory('newTable', () => {
            this.db.tables.push(table);
        });
        this.emit('structure-changed');
        return table;
    },

    renameTable(tableId, newName) {
        newName = String(newName || '').trim();
        if (!newName) throw new Error(t('errEnterTableName'));
        const table = this.getTable(tableId);
        if (!table) return;
        if (this.getTableByName(newName, tableId)) throw new Error(t('errRenameDuplicate'));
        const oldName = table.name;
        this.withHistory('renameTableTitle', () => {
            table.name = newName;
            table.updatedAt = new Date().toISOString();
        });
        this.emit('structure-changed');
        return { oldName, newName };
    },

    deleteTable(tableId) {
        const table = this.getTable(tableId);
        if (!table) return;
        this.withHistory('confirmDeleteTableTitle', () => {
            this.db.relationships = this.db.relationships.filter(
                (r) => r.sourceTableId !== tableId && r.targetTableId !== tableId
            );
            const idx = this.db.tables.findIndex((tbl) => tbl.id === tableId);
            this.db.tables.splice(idx, 1);
        });
        this.emit('structure-changed');
    },

    saveTableStructure(tableId, name, fields) {
        name = String(name || '').trim();
        if (!name) throw new Error(t('errEnterTableName'));
        if (this.getTableByName(name, tableId)) throw new Error(t('errDuplicateTable'));
        const seen = {};
        for (const f of fields) {
            const fname = String(f.name || '').trim();
            if (!fname) throw new Error(t('errEnterFieldName'));
            const lower = fname.toLowerCase();
            if (seen[lower]) throw new Error(t('errDuplicateField'));
            seen[lower] = true;
        }
        const pks = fields.filter((f) => f.primaryKey);
        if (!pks.length) throw new Error(t('errNoPk'));
        if (fields.filter((f) => f.primaryKey && f.type === 'auto_id').length > 1) {
            throw new Error(t('errMultiplePkAuto'));
        }

        const table = this.getTable(tableId);

        this.withHistory(table ? 'toastTableUpdated' : 'toastTableCreated', () => {
            if (table) {
                table.name = name;
                table.fields = fields;
                // prune values of removed fields, fill defaults for added ones
                table.records.forEach((rec) => {
                    Object.keys(rec).forEach((key) => {
                        if (!fields.some((f) => f.name === key)) delete rec[key];
                    });
                    fields.forEach((f) => {
                        if (!(f.name in rec)) rec[f.name] = f.type === 'boolean' ? false : '';
                    });
                });
                table.updatedAt = new Date().toISOString();
            } else {
                this.db.tables.push({
                    id: Utils.uid(),
                    name: name,
                    fields: fields,
                    records: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }
        });
        this.emit('structure-changed');
        return table || this.getTableByName(name);
    },

    /* ---------- field operations (live datasheet editing) ---------- */
    addField(tableId, field) {
        const table = this.getTable(tableId);
        if (!table) return;
        field.name = String(field.name || '').trim();
        if (!field.name) throw new Error(t('errEnterFieldName'));
        if (table.fields.some((f) => f.name.toLowerCase() === field.name.toLowerCase())) {
            throw new Error(t('errDuplicateField'));
        }
        if (field.type === 'auto_id' && this.autoIdField(table)) {
            throw new Error(t('errMultiplePkAuto'));
        }
        this.withHistory('addField', () => {
            table.fields.push(field);
            table.records.forEach((r) => {
                r[field.name] = field.type === 'boolean' ? false : '';
            });
            table.updatedAt = new Date().toISOString();
        });
        this.emit('structure-changed');
        return field;
    },

    renameField(tableId, fieldName, newName) {
        const table = this.getTable(tableId);
        newName = String(newName || '').trim();
        if (!newName) throw new Error(t('errEnterFieldName'));
        const field = table.fields.find((f) => f.name === fieldName);
        if (!field) return;
        if (table.fields.some((f) => f.name.toLowerCase() === newName.toLowerCase() && f !== field)) {
            throw new Error(t('errDuplicateField'));
        }
        this.withHistory('renameColumnTitle', () => {
            table.records.forEach((r) => {
                r[newName] = r[fieldName];
                delete r[fieldName];
            });
            // keep relationships pointing at renamed field
            this.db.relationships.forEach((rel) => {
                if (rel.sourceTableId === tableId && rel.sourceField === fieldName) rel.sourceField = newName;
                if (rel.targetTableId === tableId && rel.targetField === fieldName) rel.targetField = newName;
            });
            field.name = newName;
            table.updatedAt = new Date().toISOString();
        });
        this.emit('structure-changed');
    },

    changeFieldType(tableId, fieldName, newType) {
        const table = this.getTable(tableId);
        const field = table.fields.find((f) => f.name === fieldName);
        if (!field) return;
        if (newType === 'auto_id' && this.autoIdField(table) && field.type !== 'auto_id') {
            throw new Error(t('errMultiplePkAuto'));
        }
        this.withHistory('type', () => {
            field.type = newType;
            table.updatedAt = new Date().toISOString();
        });
        this.emit('structure-changed');
    },

    togglePrimaryKey(tableId, fieldName) {
        const table = this.getTable(tableId);
        const field = table.fields.find((f) => f.name === fieldName);
        if (!field) return;
        this.withHistory('primaryKey', () => {
            field.primaryKey = !field.primaryKey;
            if (field.primaryKey) field.required = true;
            table.updatedAt = new Date().toISOString();
        });
        this.emit('structure-changed');
        return field.primaryKey;
    },

    deleteField(tableId, fieldName) {
        const table = this.getTable(tableId);
        if (!table) return;
        const used = this.db.relationships.some(
            (r) => (r.sourceTableId === tableId && r.sourceField === fieldName) ||
                   (r.targetTableId === tableId && r.targetField === fieldName)
        );
        if (used) throw new Error(t('errFieldInUse'));
        this.withHistory('confirmDeleteFieldTitle', () => {
            const idx = table.fields.findIndex((f) => f.name === fieldName);
            table.fields.splice(idx, 1);
            table.records.forEach((r) => delete r[fieldName]);
            table.updatedAt = new Date().toISOString();
        });
        this.emit('structure-changed');
    },

    /* ---------- record operations ---------- */
    addRecord(tableId, record) {
        const table = this.getTable(tableId);
        if (!table) return;
        const check = this.validateRecord(table, record, -1);
        if (!check.ok) throw new Error(check.message);
        this.withHistory('addRecord', () => {
            const copy = Object.assign({}, record, { _created: new Date().toISOString() });
            const auto = this.autoIdField(table);
            if (auto) copy[auto.name] = String(this.nextAutoId(table));
            table.records.push(copy);
            table.updatedAt = new Date().toISOString();
        });
        this.emit('records-changed', tableId);
    },

    updateRecord(tableId, index, record) {
        const table = this.getTable(tableId);
        if (!table || !table.records[index]) return;
        const check = this.validateRecord(table, record, index);
        if (!check.ok) throw new Error(check.message);
        this.withHistory('editRecordTitle', () => {
            const old = table.records[index];
            const merged = Object.assign({}, record);
            const auto = this.autoIdField(table);
            if (auto) merged[auto.name] = old[auto.name];
            merged._created = old._created || new Date().toISOString();
            table.records[index] = merged;
            table.updatedAt = new Date().toISOString();
        });
        this.emit('records-changed', tableId);
    },

    deleteRecord(tableId, index) {
        const table = this.getTable(tableId);
        if (!table || !table.records[index]) return;
        this.withHistory('confirmDeleteRecordTitle', () => {
            table.records.splice(index, 1);
            table.updatedAt = new Date().toISOString();
        });
        this.emit('records-changed', tableId);
    },

    appendRecords(tableId, records) {
        const table = this.getTable(tableId);
        if (!table) return 0;
        let count = 0;
        this.withHistory('importCsv', () => {
            records.forEach((raw) => {
                const rec = {};
                table.fields.forEach((f) => {
                    rec[f.name] = f.type === 'boolean'
                        ? /^(true|1|yes)$/i.test(String(raw[f.name] ?? ''))
                        : (raw[f.name] !== undefined ? String(raw[f.name]) : '');
                });
                const check = this.validateRecord(table, rec, -1);
                if (!check.ok) return; // skip invalid rows silently
                const auto = this.autoIdField(table);
                if (auto) rec[auto.name] = String(this.nextAutoId(table));
                rec._created = new Date().toISOString();
                table.records.push(rec);
                count++;
            });
            table.updatedAt = new Date().toISOString();
        });
        this.emit('records-changed', tableId);
        return count;
    },

    /* ---------- relationship operations ---------- */
    getRelationships() {
        return this.db ? this.db.relationships : [];
    },

    createRelationship(sourceTableId, sourceField, targetTableId, targetField) {
        if (!sourceTableId || !sourceField || !targetTableId || !targetField) {
            throw new Error(t('errFillAllFields'));
        }
        if (sourceTableId === targetTableId && sourceField === targetField) {
            throw new Error(t('errSameRelField'));
        }
        const exists = this.getRelationships().some((r) =>
            r.sourceTableId === sourceTableId && r.sourceField === sourceField &&
            r.targetTableId === targetTableId && r.targetField === targetField);
        if (exists) throw new Error(t('relationshipExists'));
        const rel = {
            id: Utils.uid(),
            sourceTableId, sourceField,
            targetTableId, targetField,
            createdAt: new Date().toISOString()
        };
        this.withHistory('relationships', () => {
            this.db.relationships.push(rel);
        });
        this.emit('structure-changed');
        return rel;
    },

    deleteRelationship(relId) {
        this.withHistory('relationships', () => {
            const idx = this.db.relationships.findIndex((r) => r.id === relId);
            if (idx !== -1) this.db.relationships.splice(idx, 1);
        });
        this.emit('structure-changed');
    },

    // Count how many child values exist in parent column (simple integrity check)
    checkIntegrity(rel) {
        const src = this.getTable(rel.sourceTableId);
        const tgt = this.getTable(rel.targetTableId);
        if (!src || !tgt) return { total: 0, matched: 0, missing: 0 };
        const parentVals = new Set(src.records.map((r) => String(r[rel.sourceField])));
        let total = 0, matched = 0;
        tgt.records.forEach((r) => {
            const v = r[rel.targetField];
            if (this.isValueEmpty(v)) return;
            total++;
            if (parentVals.has(String(v))) matched++;
        });
        return { total, matched, missing: total - matched };
    },

    /* ---------- statistics ---------- */
    stats() {
        const tables = this.tables();
        return {
            tables: tables.length,
            records: tables.reduce((s, tbl) => s + tbl.records.length, 0),
            fields: tables.reduce((s, tbl) => s + tbl.fields.length, 0),
            relationships: this.getRelationships().length
        };
    }
};

Engine.debouncedPersist = Utils.debounce(() => Engine.persist(), 800);
