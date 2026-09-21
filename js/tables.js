// Tables Module - Table management and UI
const Tables = {
    currentDesignerTableId: null,

    init() {
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-new-table-sidebar').addEventListener('click', () => this.openDesigner());
        document.getElementById('btn-create-table-overview').addEventListener('click', () => this.openDesigner());
        document.getElementById('btn-save-table').addEventListener('click', () => this.saveTable());
        document.getElementById('btn-close-designer').addEventListener('click', () => this.closeDesigner());
        document.getElementById('btn-add-field').addEventListener('click', () => this.addFieldRow());
        document.getElementById('table-name-input').addEventListener('input', () => {
            document.getElementById('designer-table-name').textContent = 
                document.getElementById('table-name-input').value || 'Table Designer';
        });
    },

    openDesigner(tableId = null) {
        this.currentDesignerTableId = tableId;
        const table = tableId ? Database.getTable(tableId) : null;

        document.getElementById('table-name-input').value = table ? table.name : '';
        document.getElementById('designer-table-name').textContent = table ? table.name : 'New Table';
        
        const tbody = document.getElementById('fields-table-body');
        tbody.innerHTML = '';

        if (table && table.fields) {
            table.fields.forEach((field, index) => this.addFieldRow(field, index));
        } else {
            // Default fields for new table
            this.addFieldRow({ name: 'ID', type: 'auto_id', required: false, primaryKey: true });
        }

        App.switchTab('tab-table-designer');
    },

    closeDesigner() {
        this.currentDesignerTableId = null;
        App.switchTab('tab-overview');
    },

    addFieldRow(field = {}, index = -1) {
        const tbody = document.getElementById('fields-table-body');
        const tr = document.createElement('tr');
        
        const types = ['auto_id', 'text', 'long_text', 'number', 'decimal', 'date', 'boolean', 'email'];
        
        tr.innerHTML = `
            <td><input type="text" class="input-field field-name" value="${field.name || ''}" placeholder="Field name"></td>
            <td>
                <select class="input-field field-type">
                    ${types.map(t => `<option value="${t}" ${field.type === t ? 'selected' : ''}>${t.replace('_', ' ').toUpperCase()}</option>`).join('')}
                </select>
            </td>
            <td><input type="checkbox" class="field-required" ${field.required ? 'checked' : ''}></td>
            <td><input type="checkbox" class="field-primary" ${field.primaryKey ? 'checked' : ''} ${field.type === 'auto_id' ? '' : ''}></td>
            <td><button class="btn btn-danger btn-sm delete-field-btn">Delete</button></td>
        `;

        tr.querySelector('.delete-field-btn').addEventListener('click', () => {
            if (tbody.children.length > 1) {
                tr.remove();
            } else {
                UI.showToast('Cannot delete the only field', 'error');
            }
        });

        tbody.appendChild(tr);
    },

    saveTable() {
        const name = document.getElementById('table-name-input').value.trim();
        if (!name) {
            UI.showToast('Please enter a table name', 'error');
            return;
        }

        const rows = document.querySelectorAll('#fields-table-body tr');
        const fields = [];
        
        rows.forEach(row => {
            const fieldName = row.querySelector('.field-name').value.trim();
            const fieldType = row.querySelector('.field-type').value;
            const required = row.querySelector('.field-required').checked;
            const primaryKey = row.querySelector('.field-primary').checked;

            if (!fieldName) {
                UI.showToast('All fields must have a name', 'error');
                throw new Error('Empty field name');
            }

            fields.push({ name: fieldName, type: fieldType, required, primaryKey });
        });

        try {
            if (this.currentDesignerTableId) {
                // Update existing table
                Database.updateTable(this.currentDesignerTableId, { name, fields });
                UI.showToast('Table updated', 'success');
            } else {
                // Create new table
                Database.createTable(name, fields);
                UI.showToast('Table created', 'success');
            }
            
            this.closeDesigner();
            App.renderTablesList();
            App.renderOverview();
        } catch (e) {
            UI.showToast(e.message, 'error');
        }
    },

    deleteTable(tableId) {
        const table = Database.getTable(tableId);
        if (!table) return;

        UI.showConfirm(
            `Delete "${table.name}"?`,
            'This will permanently remove the table and all its records.',
            () => {
                Database.deleteTable(tableId);
                UI.showToast('Table deleted', 'success');
                App.renderTablesList();
                App.renderOverview();
                App.switchTab('tab-overview');
            }
        );
    }
};
