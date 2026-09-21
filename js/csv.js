// CSV Module - Import and Export functionality
const CSV = {
    // Export table to CSV
    exportTable(table) {
        if (!table || !table.fields || !table.records) {
            throw new Error('Invalid table data');
        }

        const headers = table.fields.map(f => this.escapeCSVValue(f.name));
        const rows = table.records.map(record => {
            return table.fields.map(field => {
                const value = record[field.name] !== undefined ? record[field.name] : '';
                return this.escapeCSVValue(value);
            });
        });

        // Add UTF-8 BOM for proper Arabic text support
        const bom = '\uFEFF';
        const csvContent = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        
        return csvContent;
    },

    // Escape a value for CSV
    escapeCSVValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        
        const str = String(value);
        
        // If the value contains comma, quote, or newline, wrap in quotes
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            // Escape quotes by doubling them
            return '"' + str.replace(/"/g, '""') + '"';
        }
        
        return str;
    },

    // Parse CSV content
    parseCSV(content) {
        // Remove UTF-8 BOM if present
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }

        const lines = [];
        let currentLine = '';
        let inQuotes = false;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const nextChar = content[i + 1];

            if (inQuotes) {
                currentLine += char;
                if (char === '"' && nextChar === '"') {
                    currentLine += nextChar;
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                    currentLine += char;
                } else if (char === '\n') {
                    lines.push(currentLine);
                    currentLine = '';
                } else if (char === '\r') {
                    // Skip carriage return
                } else {
                    currentLine += char;
                }
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        if (lines.length === 0) {
            throw new Error('Empty CSV file');
        }

        // Parse header line
        const headers = this.parseCSVLine(lines[0]);
        
        // Parse data lines
        const records = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length === headers.length) {
                const record = {};
                headers.forEach((header, index) => {
                    record[header.trim()] = values[index].trim();
                });
                records.push(record);
            }
        }

        return { headers, records };
    },

    // Parse a single CSV line
    parseCSVLine(line) {
        const values = [];
        let currentValue = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (inQuotes) {
                if (char === '"' && nextChar === '"') {
                    currentValue += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    currentValue += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    values.push(currentValue);
                    currentValue = '';
                } else {
                    currentValue += char;
                }
            }
        }

        values.push(currentValue);
        return values;
    },

    // Download CSV file
    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    // Read CSV file from input
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'UTF-8');
        });
    }
};
