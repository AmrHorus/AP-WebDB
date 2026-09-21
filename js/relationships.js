// Relationships Module - Table relationship management
const Relationships = {
    init() {
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('rel-source-table').addEventListener('change', () => this.updateSourceFields());
        document.getElementById('rel-target-table').addEventListener('change', () => this.updateTargetFields());
        document.getElementById('btn-create-relationship').addEventListener('click', () => this.createRelationship());
    },

    openView() {
        const db = Database.getDatabase();
        if (!db) return;

        const sourceSelect = document.getElementById('rel-source-table');
        const targetSelect = document.getElementById('rel-target-table');
        
        const options = '<option value="">Select table</option>' + 
            db.tables.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        
        sourceSelect.innerHTML = options;
        targetSelect.innerHTML = options;
        
        document.getElementById('rel-source-field').innerHTML = '<option value="">Select field</option>';
        document.getElementById('rel-target-field').innerHTML = '<option value="">Select field</option>';
        
        this.renderRelationshipsList();
    },

    updateSourceFields() {
        const tableId = document.getElementById('rel-source-table').value;
        const fieldSelect = document.getElementById('rel-source-field');
        
        if (!tableId) {
            fieldSelect.innerHTML = '<option value="">Select field</option>';
            return;
        }

        const table = Database.getTable(tableId);
        fieldSelect.innerHTML = '<option value="">Select field</option>' + 
            table.fields.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
    },

    updateTargetFields() {
        const tableId = document.getElementById('rel-target-table').value;
        const fieldSelect = document.getElementById('rel-target-field');
        
        if (!tableId) {
            fieldSelect.innerHTML = '<option value="">Select field</option>';
            return;
        }

        const table = Database.getTable(tableId);
        fieldSelect.innerHTML = '<option value="">Select field</option>' + 
            table.fields.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
    },

    createRelationship() {
        const sourceTableId = document.getElementById('rel-source-table').value;
        const sourceField = document.getElementById('rel-source-field').value;
        const targetTableId = document.getElementById('rel-target-table').value;
        const targetField = document.getElementById('rel-target-field').value;

        if (!sourceTableId || !sourceField || !targetTableId || !targetField) {
            UI.showToast('Please fill in all fields', 'error');
            return;
        }

        if (sourceTableId === targetTableId && sourceField === targetField) {
            UI.showToast('Cannot create a relationship to the same field', 'error');
            return;
        }

        try {
            Database.createRelationship(sourceTableId, sourceField, targetTableId, targetField);
            UI.showToast('Relationship created', 'success');
            
            // Reset form
            document.getElementById('rel-source-field').value = '';
            document.getElementById('rel-target-field').value = '';
            
            this.renderRelationshipsList();
        } catch (e) {
            UI.showToast(e.message, 'error');
        }
    },

    deleteRelationship(relId) {
        UI.showConfirm(
            'Delete this relationship?',
            'This will remove the relationship between the tables.',
            () => {
                Database.deleteRelationship(relId);
                UI.showToast('Relationship deleted', 'success');
                this.renderRelationshipsList();
            }
        );
    },

    renderRelationshipsList() {
        const container = document.getElementById('relationships-list-container');
        const relationships = Database.getRelationships();

        if (relationships.length === 0) {
            container.innerHTML = '<p>No relationships defined.</p>';
            return;
        }

        container.innerHTML = relationships.map(rel => {
            const sourceTable = Database.getTable(rel.sourceTableId);
            const targetTable = Database.getTable(rel.targetTableId);
            
            return `
                <div class="relationship-item">
                    <span><strong>${sourceTable ? sourceTable.name : 'Unknown'}</strong>.${rel.sourceField}</span>
                    <span>→</span>
                    <span><strong>${targetTable ? targetTable.name : 'Unknown'}</strong>.${rel.targetField}</span>
                    <button class="btn btn-danger btn-sm" onclick="Relationships.deleteRelationship('${rel.id}')">Delete</button>
                </div>
            `;
        }).join('');
    }
};
