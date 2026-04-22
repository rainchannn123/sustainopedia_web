// Records page — requires shared.js (checkAuth, apiReq globals)

// Global registry of Chart.js instances so they can be properly destroyed
const charts = {};

// â”€â”€ Page initialisation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function loadRecordsPage() {
    const recordsContainer = document.getElementById('recordsContainer');
    if (!recordsContainer) return;

    Object.keys(charts).forEach(id => { charts[id].destroy(); delete charts[id]; });
    recordsContainer.innerHTML = '<div class="empty-state"><p>Loading records\u2026</p></div>';

    let records;
    try {
        const raw = await apiReq('GET', '/api/lca-records');
        records = raw.map(window.LciaUtils.normalizeRecord).filter(Boolean);
    } catch (err) {
        console.error('Failed to load LCA records:', err);
        recordsContainer.innerHTML = '<div class="empty-state"><p>Failed to load records. Please try again.</p></div>';
        return;
    }

    const searchInput = document.getElementById('recordsSearch');
    const sortSelect  = document.getElementById('recordsSort');

    if (searchInput) {
        const fresh = searchInput.cloneNode(true);
        searchInput.replaceWith(fresh);
        fresh.addEventListener('input', () => filterAndRenderRecords(records));
    }
    if (sortSelect) {
        const fresh = sortSelect.cloneNode(true);
        sortSelect.replaceWith(fresh);
        fresh.addEventListener('change', () => filterAndRenderRecords(records));
    }

    filterAndRenderRecords(records);
}

function filterAndRenderRecords(records) {
    const recordsContainer = document.getElementById('recordsContainer');
    const searchInput = document.getElementById('recordsSearch');
    const sortSelect  = document.getElementById('recordsSort');
    if (!recordsContainer) return;

    // Filter by search term
    let filtered = records;
    const term = searchInput ? searchInput.value.toLowerCase() : '';
    if (term) {
        filtered = records.filter(r => r.product.toLowerCase().includes(term));
    }

    // Sort
    switch (sortSelect ? sortSelect.value : 'recent') {
        case 'oldest':    filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); break;
        case 'product':   filtered.sort((a, b) => a.product.localeCompare(b.product));            break;
        case 'emissions': filtered.sort((a, b) => b.carbonEmission - a.carbonEmission);           break;
        default:          filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Render cards
    recordsContainer.innerHTML = '';
    if (filtered.length === 0) {
        recordsContainer.innerHTML = `
            <div class="empty-state">
                <p>No LCA records found. Run your first LCA from the Chatbot tab to see results here.</p>
            </div>`;
        return;
    }
    filtered.forEach(record => recordsContainer.appendChild(createRecordCard(record)));
}

// â”€â”€ Dashboard record card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function createRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.title = 'Click to view full details';

    const date    = new Date(record.timestamp);
    const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    // â”€â”€ Top: product info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const info = document.createElement('div');
    info.className = 'record-info';
    info.innerHTML = `
        <div class="record-product">${window.LciaUtils.escapeHtml(record.product)}</div>
        <div class="record-date">${dateStr} at ${timeStr}</div>
        <div class="record-emissions-badge">
            Total: ${window.LciaUtils.toNumber(record.carbonEmission).toFixed(1)} kg CO<sub>2</sub>-eq
        </div>`;
    card.appendChild(info);

    // â”€â”€ Middle: preview histogram â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const chartContainer = document.createElement('div');
    chartContainer.className = 'record-chart-container';
    const chartId = `chart-${record.id}`;
    chartContainer.innerHTML = `<canvas id="${chartId}"></canvas>`;
    card.appendChild(chartContainer);

    // â”€â”€ Bottom: action buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const actions = document.createElement('div');
    actions.className = 'record-actions';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn-small view';
    viewBtn.textContent = 'View Details';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-small download';
    downloadBtn.textContent = 'Download CSV';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-small delete';
    deleteBtn.textContent = 'Delete';

    viewBtn.addEventListener('click',     e => { e.stopPropagation(); openRecordDetail(record); });
    downloadBtn.addEventListener('click', e => { e.stopPropagation(); downloadRecordCSV(record); });
    deleteBtn.addEventListener('click',   e => { e.stopPropagation(); deleteRecord(record.id); });

    actions.appendChild(viewBtn);
    actions.appendChild(downloadBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(actions);

    // Clicking anywhere else on the card also opens detail view
    card.addEventListener('click', () => openRecordDetail(record));

    // Draw the preview chart once the card is in the DOM
    setTimeout(() => renderPreviewChart(chartId, record), 120);

    return card;
}

// â”€â”€ Preview histogram (compact, up to 8 bars) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderPreviewChart(canvasId, record) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !record.data || !Array.isArray(record.data.processes)) return;

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const MAX_BARS = 8;
    const processes = record.data.processes.slice(0, MAX_BARS);
    const labels    = processes.map(p => p.process || '\u2014');
    const values    = processes.map(p => window.LciaUtils.toNumber(p.mean_impact));
    const total     = window.LciaUtils.toNumber(record.data.totalMeanImpact) || 1;

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(45, 106, 79, 0.80)');
    gradient.addColorStop(1, 'rgba(64, 145, 108, 0.20)');

    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'kg CO\u2082-eq',
                data: values,
                backgroundColor: gradient,
                borderColor: '#2d6a4f',
                borderWidth: 1.5,
                borderRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 700, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(27, 67, 50, 0.92)',
                    titleColor: '#fff',
                    bodyColor: '#d8f3dc',
                    borderColor: '#40916c',
                    borderWidth: 1,
                    callbacks: {
                        label:      c => `${c.parsed.y.toFixed(1)} kg CO\u2082-eq`,
                        afterLabel: c => `${((c.parsed.y / total) * 100).toFixed(1)}% of total`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'kg CO\u2082-eq', color: '#1b4332', font: { size: 9 } },
                    grid:  { color: 'rgba(183, 228, 199, 0.25)' },
                    ticks: { color: '#1b4332', font: { size: 9 }, maxTicksLimit: 5,
                             callback: v => Math.round(v) }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#1b4332',
                        font: { size: 9 },
                        maxRotation: 40,
                        callback: function(val, idx) {
                            const lbl = labels[idx] || '';
                            return lbl.length > 16 ? lbl.slice(0, 14) + '\u2026' : lbl;
                        }
                    }
                }
            }
        }
    });
}

// â”€â”€ Full-screen detail overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function openRecordDetail(record) {
    // Remove any existing overlay
    const existing = document.getElementById('record-detail-overlay');
    if (existing) existing.remove();

    const date    = new Date(record.timestamp);
    const dateStr = date.toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    const overlay = document.createElement('div');
    overlay.id        = 'record-detail-overlay';
    overlay.className = 'record-detail-overlay';

    // â”€â”€ Fixed header bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const header = document.createElement('div');
    header.className = 'detail-header';
    header.innerHTML = `
        <div class="detail-title">
            <span class="detail-product-name">${window.LciaUtils.escapeHtml(record.product)}</span>
            <span class="detail-timestamp">Generated: ${dateStr}</span>
        </div>
        <button class="detail-quit-btn" id="detailQuitBtn" title="Return to dashboard">
            Quit
        </button>`;
    overlay.appendChild(header);

    // â”€â”€ Scrollable content body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const body = document.createElement('div');
    body.className = 'detail-body';

    // User query / prompt (if stored)
    if (record.query) {
        const querySection = document.createElement('div');
        querySection.className = 'detail-section';
        querySection.innerHTML = `
            <h3 class="detail-section-title">User Query</h3>
            <div class="detail-query-text">${window.LciaUtils.escapeHtml(record.query)}</div>`;
        body.appendChild(querySection);
    }

    // Full AI response text (if stored)
    if (record.answerText) {
        const answerSection = document.createElement('div');
        answerSection.className = 'detail-section';
        answerSection.innerHTML = `
            <h3 class="detail-section-title">Sustainopedia's Response</h3>
            <div class="detail-answer-text"></div>`;
        const answerEl = answerSection.querySelector('.detail-answer-text');
        // Render markdown using the same configuration as the chat window
        if (window.markdownit) {
            const md = window.markdownit({ html: false, breaks: true, linkify: true });
            answerEl.className = 'detail-answer-text bot-message-prose';
            answerEl.innerHTML = md.render(record.answerText);
        } else {
            answerEl.textContent = record.answerText;
        }
        body.appendChild(answerSection);
    }

    // LCIA results table
    const tableSection = document.createElement('div');
    tableSection.className = 'detail-section';
    tableSection.innerHTML = `<h3 class="detail-section-title">LCIA Results Table</h3>`;
    tableSection.appendChild(buildLciaDetailTable(record));
    body.appendChild(tableSection);

    // High-resolution histogram
    const detailChartId = `detail-chart-${record.id}`;
    const chartSection  = document.createElement('div');
    chartSection.className = 'detail-section';
    chartSection.innerHTML = `
        <h3 class="detail-section-title">Carbon Emission by Process</h3>
        <div class="detail-chart-container">
            <canvas id="${detailChartId}"></canvas>
        </div>`;
    body.appendChild(chartSection);

    // Footer: CSV download
    const footer = document.createElement('div');
    footer.className = 'detail-footer';
    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn-small download';
    dlBtn.textContent = 'Download CSV';
    dlBtn.addEventListener('click', () => downloadRecordCSV(record));
    footer.appendChild(dlBtn);
    body.appendChild(footer);

    overlay.appendChild(body);
    const recordsPage = document.getElementById('records');
    (recordsPage || document.body).appendChild(overlay);

    // Quit button closes the overlay and destroys the detail chart
    document.getElementById('detailQuitBtn').addEventListener('click', () => {
        if (charts[detailChartId]) {
            charts[detailChartId].destroy();
            delete charts[detailChartId];
        }
        overlay.remove();
    });

    // Render the high-res chart after the overlay is painted
    requestAnimationFrame(() => renderDetailChart(detailChartId, record));
}

// â”€â”€ Full-resolution detail histogram (all processes, staggered animation) â”€â”€â”€â”€â”€

function renderDetailChart(canvasId, record) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !record.data || !Array.isArray(record.data.processes)) return;

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const processes = record.data.processes;
    const labels = processes.map(p => {
        const raw = p.process || '—';
        return raw.split(':')[0].trim(); 
        });
    const values    = processes.map(p => window.LciaUtils.toNumber(p.mean_impact));
    const total     = window.LciaUtils.toNumber(record.data.totalMeanImpact) || 1;

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 500);
    gradient.addColorStop(0,   'rgba(45, 106, 79, 0.90)');
    gradient.addColorStop(0.5, 'rgba(64, 145, 108, 0.60)');
    gradient.addColorStop(1,   'rgba(183, 228, 199, 0.30)');

    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Carbon Emission (kg CO\u2082-eq)',
                data: values,
                backgroundColor: gradient,
                borderColor: '#2d6a4f',
                borderWidth: 2,
                borderRadius: 5,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1200,
                easing: 'easeOutCubic',
                delay: ctx => ctx.dataIndex * 55
            },
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#1b4332', font: { size: 13, weight: '600' } }
                },
                tooltip: {
                    backgroundColor: 'rgba(27, 67, 50, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#d8f3dc',
                    borderColor: '#40916c',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        title:      c => c[0].label,
                        label:      c => `  ${c.parsed.y.toFixed(1)} kg CO\u2082-eq`,
                        afterLabel: c => `  ${((c.parsed.y / total) * 100).toFixed(1)}% of total`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Carbon Emission (kg CO\u2082-eq)',
                        color: '#1b4332',
                        font: { size: 13, weight: '600' }
                    },
                    grid:  { color: 'rgba(183, 228, 199, 0.30)' },
                    ticks: { color: '#1b4332', font: { size: 11 }, callback: v => Math.round(v) }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#1b4332',
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

// â”€â”€ LCIA data table for the detail view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildLciaDetailTable(record) {
    const wrapper = document.createElement('div');
    wrapper.className = 'detail-table-wrapper';

    const table = document.createElement('table');
    table.className = 'lcia-detail-table';

    const columns = [
        'Process', 'Amount & Location', 'Unit / Location', 'Ref. Product',
        'Mean Impact (kg CO\u2082-eq)', 'SD (kg CO\u2082-eq)', '5/95 Percentile'
    ];

    const thead   = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    record.data.processes.forEach(p => {
        const tr = document.createElement('tr');
        [
            p.process, p.amount_location,
            p.unit_location, p.ref_product,
            window.LciaUtils.toNumber(p.mean_impact).toFixed(1),
            window.LciaUtils.toNumber(p.sd).toFixed(1),
            p.percentile
        ].forEach(val => {
            const td = document.createElement('td');
            td.textContent = val || '\u2014';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    // Totals footer row
    const totalRow  = document.createElement('tr');
    totalRow.className = 'lcia-total-row';
    const labelCell = document.createElement('td');
    labelCell.colSpan   = 4;
    labelCell.textContent = 'Total Estimated Impact';
    const valueCell = document.createElement('td');
    valueCell.textContent = window.LciaUtils.toNumber(record.data.totalMeanImpact).toFixed(1);
    totalRow.appendChild(labelCell);
    totalRow.appendChild(valueCell);
    totalRow.appendChild(document.createElement('td')); // SD placeholder
    totalRow.appendChild(document.createElement('td')); // Percentile placeholder
    tbody.appendChild(totalRow);

    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
}

// â”€â”€ CSV export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function downloadRecordCSV(record) {
    const headers = [
        'Process', 'Amount & Location', 'System Boundary', 'Matched Activity',
        'Unit / Location', 'DB Version', 'Ref. Product',
        'Mean Impact (kg CO2-Eq)', 'SD (kg CO2-Eq)', '5/95 Percentile', 'Notes'
    ];

    let csv = `Product: ${window.LciaUtils.escapeHtml(record.product)}\n`;
    csv    += `Generated: ${new Date(record.timestamp).toISOString()}\n`;
    if (record.query) csv += `Query: ${record.query}\n`;
    csv    += `Total Emission: ${record.carbonEmission} kg CO2-Eq\n\n`;
    csv    += headers.join(',') + '\n';

    record.data.processes.forEach(p => {
        const row = [
            window.LciaUtils.escapeCSV(p.process),
            window.LciaUtils.escapeCSV(p.amount_location),
            window.LciaUtils.escapeCSV(p.system_boundary),
            window.LciaUtils.escapeCSV(p.matched_activity),
            window.LciaUtils.escapeCSV(p.unit_location),
            window.LciaUtils.escapeCSV(p.db_version_code),
            window.LciaUtils.escapeCSV(p.ref_product),
            p.mean_impact,
            p.sd,
            window.LciaUtils.escapeCSV(p.percentile),
            ''
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `${record.product}_LCA_${record.id}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// â”€â”€ Delete record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function deleteRecord(recordId) {
    if (!confirm('Are you sure you want to delete this record?')) return;

    const chartId = `chart-${recordId}`;
    if (charts[chartId]) { charts[chartId].destroy(); delete charts[chartId]; }

    try {
        await apiReq('DELETE', `/api/lca-records/${recordId}`);
    } catch (err) {
        console.error('Failed to delete record:', err);
        alert('Failed to delete record. Please try again.');
        return;
    }
    loadRecordsPage();
}

// â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Boot: load records when the page is ready
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) return;
    loadRecordsPage();
});