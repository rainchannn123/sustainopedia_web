// Shared LCIA utilities — window.LciaUtils
// Centralises all CSV escaping, HTML escaping, markdown table parsing,
// LCIA payload normalisation, and record normalisation so that script.js
// and records.js never duplicate these functions.

(function () {
    'use strict';

    // ─── String helpers ──────────────────────────────────────────────────────

    function escapeCSV(str) {
        if (!str) return '';
        if (typeof str !== 'string') str = String(str);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text == null ? '' : text);
        return div.innerHTML;
    }

    function toNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (value === null || value === undefined) return 0;
        const parsed = parseFloat(String(value).replace(/[^0-9eE+\-.]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    // ─── Markdown table helpers ───────────────────────────────────────────────

    function splitMarkdownRow(row) {
        const parts = row.split('|').map(c => c.trim());
        if (parts[0] === '') parts.shift();
        if (parts[parts.length - 1] === '') parts.pop();
        return parts;
    }

    /** Extract the first markdown pipe-table block from mixed text. */
    function extractMarkdownTable(md) {
        if (typeof md !== 'string') return null;
        const lines = md.split('\n');
        const startIdx = lines.findIndex(line => line.trim().startsWith('|'));
        if (startIdx === -1) return null;
        return lines.slice(startIdx).join('\n');
    }

    /** Convert a markdown pipe-table string into a DOM <table> element. */
    function parseMarkdownTable(md) {
        if (typeof md !== 'string') return null;
        const lines = md.split('\n').map(l => l.trim()).filter(l => l.length);
        if (lines.length < 2) return null;

        // Require a separator row (e.g. | --- | --- |)
        if (!/^[\|\s\:?\-]+$/.test(lines[1] || '')) return null;

        const headers = splitMarkdownRow(lines[0]);
        if (!headers.length) return null;

        const table = document.createElement('table');
        table.className = 'markdown-table lcia-table';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        lines.slice(2).forEach(line => {
            const cells = splitMarkdownRow(line);
            if (!cells.length) return;
            const tr = document.createElement('tr');
            for (let i = 0; i < headers.length; i++) {
                const td = document.createElement('td');
                td.textContent = cells[i] !== undefined ? cells[i] : '';
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        return table;
    }

    // ─── LCIA data parsing ────────────────────────────────────────────────────

    /**
     * Parse a markdown LCIA table string into a structured data object.
     * Used when loading old records that were stored as raw markdown.
     */
    function parseMarkdownToLciaObject(markdown, productName, fallbackTotal) {
        if (typeof markdown !== 'string') return null;

        const cleanTable = extractMarkdownTable(markdown);
        if (!cleanTable) return null;

        const lines = cleanTable.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) return null;

        const headers = splitMarkdownRow(lines[0]);
        const normalizeHeader = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
        const headerMap = headers.reduce((acc, h, idx) => {
            acc[normalizeHeader(h)] = idx;
            return acc;
        }, {});

        const getCell = (cells, keys, fallbackIndex = -1) => {
            for (const key of keys) {
                if (headerMap[key] !== undefined) return cells[headerMap[key]] || '';
            }
            return (fallbackIndex >= 0 && fallbackIndex < cells.length) ? cells[fallbackIndex] || '' : '';
        };

        const processes = [];
        lines.slice(2).forEach(line => {
            const cells = splitMarkdownRow(line);
            if (!cells.length) return;
            const p = {
                process:          getCell(cells, ['process'], 0),
                amount_location:  getCell(cells, ['amountlocation'], 1),
                system_boundary:  getCell(cells, ['systemboundary'], 2),
                matched_activity: getCell(cells, ['matchedactivity'], 3),
                unit_location:    getCell(cells, ['unitlocation'], 4),
                db_version_code:  getCell(cells, ['databaseversion', 'dbversioncode', 'dbversion'], 5),
                ref_product:      getCell(cells, ['refproduct'], 6),
                mean_impact:      toNumber(getCell(cells, ['meanimpactkgco2eq', 'meanimpact'], 7)),
                sd:               toNumber(getCell(cells, ['sdkgco2eq', 'sd'], 8)),
                percentile:       getCell(cells, ['595percentile', 'percentile'], 9)
            };
            if (p.process || p.mean_impact) processes.push(p);
        });

        if (!processes.length) return null;

        const total = toNumber(fallbackTotal) || processes.reduce((sum, p) => sum + p.mean_impact, 0);

        return {
            product: productName || 'Unknown Product',
            database: '',
            lcaMethods: '',
            processes,
            totalMeanImpact: total
        };
    }

    /**
     * Normalise an LCIA payload from the backend.
     * Handles both the structured object format and the raw markdown string format.
     * @param {Object|string} payload  - The lcia_table value from the backend response.
     * @param {string}        answerText  - The bot answer text (used to extract total if markdown).
     * @param {string}        productName - The product name for labelling.
     * @returns {Object|null} Normalised LCIA object with guaranteed numeric fields.
     */
    function normalizeLciaPayload(payload, answerText, productName) {
        if (!payload) return null;

        if (typeof payload === 'object' && Array.isArray(payload.processes)) {
            return {
                ...payload,
                product: payload.product || productName || 'Unknown Product',
                processes: payload.processes.map(p => ({
                    ...p,
                    mean_impact: toNumber(p.mean_impact),
                    sd: toNumber(p.sd)
                })),
                totalMeanImpact: toNumber(payload.totalMeanImpact)
            };
        }

        if (typeof payload === 'string') {
            const match = (answerText || '').match(/total\s+estimated\s+impact\s*[:\-]?\s*([0-9.eE+\-]+)/i);
            const fallbackTotal = match ? parseFloat(match[1]) : 0;
            return parseMarkdownToLciaObject(payload, productName, fallbackTotal);
        }

        return null;
    }

    /**
     * Normalise a stored LCA record loaded from localStorage.
     * Handles records where `data` is a markdown string (old format) or a structured object.
     * Returns null if the record cannot be normalised (so callers can .filter(Boolean)).
     */
    function normalizeRecord(record) {
        if (!record) return null;

        let data = record.data;

        if (typeof data === 'string') {
            data = parseMarkdownToLciaObject(data, record.product, record.carbonEmission);
        } else if (data && Array.isArray(data.processes)) {
            data = {
                ...data,
                processes: data.processes.map(p => ({
                    ...p,
                    mean_impact: toNumber(p.mean_impact),
                    sd: toNumber(p.sd)
                })),
                totalMeanImpact: toNumber(data.totalMeanImpact)
            };
        }

        if (!data || !Array.isArray(data.processes) || !data.processes.length) return null;

        return {
            ...record,
            product: record.product || 'Unknown Product',
            timestamp: record.timestamp || new Date().toISOString(),
            carbonEmission: toNumber(record.carbonEmission) || toNumber(data.totalMeanImpact),
            data
        };
    }

    // ─── Export ───────────────────────────────────────────────────────────────

    window.LciaUtils = {
        escapeCSV,
        escapeHtml,
        toNumber,
        splitMarkdownRow,
        extractMarkdownTable,
        parseMarkdownTable,
        parseMarkdownToLciaObject,
        normalizeLciaPayload,
        normalizeRecord
    };

}());
