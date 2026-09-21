// Forms Module - Form generation for data entry
const Forms = {
    currentTableId: null,
    currentRecordIndex: null,

    init() {
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('form-table-select').addEventListener('change', (e) => {
            this.currentTableId = e.target.value;
            this.currentRecordIndex = null;
            this.generateForm();
        });
    },

    openView() {
        const db = Database.getDatabase();
        if (!db) return;

        const select = document.getElementById('form-table-select');
        select.innerHTML = '<option value="">Select a table</option>' + 
            db.tables.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        
        this.currentTableId = null;
        document.getElementById('form-generator-container').innerHTML = '';
    },

    generateForm(recordIndex = null) {
        if (!this.currentTableId) {
            document.getElementById('form-generator-container').innerHTML = '<p>Please select a table to generate a form.</p>';
            return;
        }

        const table = Database.getTable(this.currentTableId);
        if (!table) return;

        this.currentRecordIndex = recordIndex;
        const record = recordIndex !== null ? table.records[recordIndex] : null;

        let html = '<div class="generated-form" style="max-width:500px;margin-top:20px;">';
        
        table.fields.forEach(field => {
            if (field.type === 'auto_id') {
                html += `<div class="form-group">
                    <label>${field.name}</label>
                    <input type="text" class="input-field" value="${record ? record[field.name] : '(Auto-generated)'}" disabled>
                </div>`;
                return;
            }

            const value = record ? record[field.name] : '';
            let inputHtml = '';

            switch (field.type) {
                case 'long_text':
                    inputHtml = `<textarea class="input-field form-field-${field.name}" rows="4">${value || ''}</textarea>`;
                    break;
                case 'boolean':
                    inputHtml = `<input type="checkbox" class="form-field-${field.name}" ${value ? 'checked' : ''}>`;
                    break;
                case 'number':
                case 'decimal':
                    inputHtml = `<input type="number" class="input-field form-field-${field.name}" step="${field.type === 'decimal' ? '0.01' : '1'}" value="${value || ''}">`;
                    break;
                case 'date':
                    inputHtml = `<input type="date" class="input-field form-field-${field.name}" value="${value || ''}">`;
                    break;
                case 'email':
                    inputHtml = `<input type="email" class="input-field form-field-${field.name}" value="${value || ''}">`;
                    break;
                default:
                    inputHtml = `<input type="text" class="input-field form-field-${field.name}" value="${value || ''}">`;
            }

            html += `<div class="form-group">
                <label>${field.name}${field.required ? ' *' : ''}</label>
                ${inputHtml}
            </div>`;
        });

        html += `
            <div class="form-actions" style="margin-top:20px;display:flex;gap:10px;">
                <button class="btn btn-primary" onclick="Forms.submitForm()">${record ? 'Update Record' : 'Create Record'}</button>
                ${record ? '<button class="btn" onclick="Forms.generateForm()">Cancel</button>' : ''}
            </div>
        </div>`;

        document.getElementById('form-generator-container').innerHTML = html;
    },

    submitForm() {
        if (!this.currentTableId) {
            UI.showToast('Please select a table', 'error');
            return;
        }

        const table = Database.getTable(this.currentTableId);
        if (!table) return;

        const record = {};
        let hasError = false;

        table.fields.forEach(field => {
            if (field.type === 'auto_id') return;

            let value;
            const fieldEl = document.querySelector(`.form-field-${field.name}`);
            
            if (field.type === 'boolean') {
                value = fieldEl.checked;
            } else {
                value = fieldEl.value;
            }

            if (field.required && !value) {
                UI.showToast(`${field.name} is required`, 'error');
                hasError = true;
                return;
            }

            if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                UI.showToast(`${field.name} must be a valid email`, 'error');
                hasError = true;
                return;
            }

            if ((field.type === 'number' || field.type === 'decimal') && value && isNaN(parseFloat(value))) {
                UI.showToast(`${field.name} must be a valid number`, 'error');
                hasError = true;
                return;
            }

            record[field.name] = value;
        });

        if (hasError) return;

        try {
            if (this.currentRecordIndex !== null) {
                Database.updateRecord(this.currentTableId, this.currentRecordIndex, record);
                UI.showToast('Record updated', 'success');
            } else {
                Database.addRecord(this.currentTableId, record);
                UI.showToast('Record created', 'success');
            }

            this.generateForm();
            App.renderOverview();
        } catch (e) {
            UI.showToast(e.message, 'error');
        }
    }
};
