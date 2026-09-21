// Database Module - Core database operations
const Database = {
    state: {
        database: null,
        currentTableId: null,
        currentView: 'overview'
    },

    createDatabase(name) {
        this.state.database = {
            id: this.generateId(),
            name: name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tables: [],
            relationships: []
        };
        return this.state.database;
    },

    loadDatabase(db) {
        this.state.database = db;
        this.state.currentTableId = null;
        this.state.currentView = 'overview';
    },

    getDatabase() {
        return this.state.database;
    },

    saveDatabase() {
        if (!this.state.database) return false;
        this.state.database.updatedAt = new Date().toISOString();
        return Storage.saveDatabase(this.state.database);
    },

    // Table operations
    createTable(name, fields) {
        if (!this.state.database) return null;
        
        // Check for duplicate table name
        if (this.state.database.tables.some(t => t.name.toLowerCase() === name.toLowerCase())) {
            throw new Error('A table with this name already exists');
        }

        const table = {
            id: this.generateId(),
            name: name,
            fields: fields || [],
            records: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.state.database.tables.push(table);
        this.saveDatabase();
        return table;
    },

    updateTable(tableId, updates) {
        const table = this.getTable(tableId);
        if (!table) return null;

        Object.assign(table, updates, { updatedAt: new Date().toISOString() });
        this.saveDatabase();
        return table;
    },

    deleteTable(tableId) {
        const index = this.state.database.tables.findIndex(t => t.id === tableId);
        if (index === -1) return false;

        // Remove related relationships
        this.state.database.relationships = this.state.database.relationships.filter(
            r => r.sourceTableId !== tableId && r.targetTableId !== tableId
        );

        this.state.database.tables.splice(index, 1);
        
        if (this.state.currentTableId === tableId) {
            this.state.currentTableId = null;
        }

        this.saveDatabase();
        return true;
    },

    getTable(tableId) {
        if (!this.state.database) return null;
        return this.state.database.tables.find(t => t.id === tableId);
    },

    getTableByName(name) {
        if (!this.state.database) return null;
        return this.state.database.tables.find(t => t.name.toLowerCase() === name.toLowerCase());
    },

    // Field operations
    addField(tableId, field) {
        const table = this.getTable(tableId);
        if (!table) return null;

        // Check for duplicate field name
        if (table.fields.some(f => f.name.toLowerCase() === field.name.toLowerCase())) {
            throw new Error('A field with this name already exists');
        }

        table.fields.push(field);
        table.updatedAt = new Date().toISOString();
        this.saveDatabase();
        return field;
    },

    updateField(tableId, fieldIndex, updates) {
        const table = this.getTable(tableId);
        if (!table || !table.fields[fieldIndex]) return null;

        Object.assign(table.fields[fieldIndex], updates);
        table.updatedAt = new Date().toISOString();
        this.saveDatabase();
        return table.fields[fieldIndex];
    },

    deleteField(tableId, fieldIndex) {
        const table = this.getTable(tableId);
        if (!table || !table.fields[fieldIndex]) return false;

        table.fields.splice(fieldIndex, 1);
        table.updatedAt = new Date().toISOString();
        this.saveDatabase();
        return true;
    },

    // Record operations
    addRecord(tableId, record) {
        const table = this.getTable(tableId);
        if (!table) return null;

        // Generate Auto ID if needed
        const autoIdField = table.fields.find(f => f.type === 'auto_id');
        if (autoIdField) {
            const maxId = table.records.reduce((max, r) => {
                const val = parseInt(r[autoIdField.name]);
                return isNaN(val) ? max : Math.max(max, val);
            }, 0);
            record[autoIdField.name] = (maxId + 1).toString();
        }

        table.records.push(record);
        table.updatedAt = new Date().toISOString();
        this.saveDatabase();
        return record;
    },

    updateRecord(tableId, recordIndex, record) {
        const table = this.getTable(tableId);
        if (!table || !table.records[recordIndex]) return null;

        // Preserve Auto ID
        const autoIdField = table.fields.find(f => f.type === 'auto_id');
        if (autoIdField && table.records[recordIndex][autoIdField.name]) {
            record[autoIdField.name] = table.records[recordIndex][autoIdField.name];
        }

        table.records[recordIndex] = record;
        table.updatedAt = new Date().toISOString();
        this.saveDatabase();
        return record;
    },

    deleteRecord(tableId, recordIndex) {
        const table = this.getTable(tableId);
        if (!table || !table.records[recordIndex]) return false;

        table.records.splice(recordIndex, 1);
        table.updatedAt = new Date().toISOString();
        this.saveDatabase();
        return true;
    },

    getRecords(tableId) {
        const table = this.getTable(tableId);
        return table ? table.records : [];
    },

    // Relationship operations
    createRelationship(sourceTableId, sourceField, targetTableId, targetField) {
        if (!this.state.database) return null;

        const relationship = {
            id: this.generateId(),
            sourceTableId,
            sourceField,
            targetTableId,
            targetField,
            createdAt: new Date().toISOString()
        };

        this.state.database.relationships.push(relationship);
        this.saveDatabase();
        return relationship;
    },

    deleteRelationship(relId) {
        const index = this.state.database.relationships.findIndex(r => r.id === relId);
        if (index === -1) return false;

        this.state.database.relationships.splice(index, 1);
        this.saveDatabase();
        return true;
    },

    getRelationships() {
        return this.state.database ? this.state.database.relationships : [];
    },

    // Statistics
    getStats() {
        if (!this.state.database) {
            return { tables: 0, records: 0, relationships: 0 };
        }

        const tables = this.state.database.tables.length;
        const records = this.state.database.tables.reduce((sum, t) => sum + t.records.length, 0);
        const relationships = this.state.database.relationships.length;

        return { tables, records, relationships };
    },

    generateId() {
        return '_' + Math.random().toString(36).substr(2, 9);
    }
};
