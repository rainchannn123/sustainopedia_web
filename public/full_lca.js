// full_lca.js - unified LCA assessment workflow
// Requires shared.js to provide checkAuth() and apiReq() globals.
// Requires lcia-utils.js to provide window.LciaUtils.

// Registry for backend-record Chart.js instances (preview and detail charts)
const charts = {};

// Colorful modern palette for bar and pie charts
const CHART_PALETTE = [
    '#ffb3c1', '#a0c4ff', '#fdffb6', '#caffbf', '#ffd6a5',
    '#bde0fe', '#ffc8dd', '#d0f4de', '#e2cfea', '#fde8d0'
];

const FLASK_BASE = 'https://teamsustainopedia-backend-hbcvdcbvcsb4fmaf.eastasia-01.azurewebsites.net';
const POLL_INTERVAL_MS = 3000;

// ── Job polling state ────────────────────────────────────────────────────────
let _lcaPollTimer   = null;
let _lcaActiveJobId = null;
const STORAGE_KEY = 'lca_assessments_v2';
const STATUS = {
    DRAFT: 'draft',
    RUNNING: 'running',
    COMPLETE: 'complete'
};

const state = {
    records: [],          // localStorage drafts
    activeRecordId: null,
    activeTab: 'form'
};

function createBlankRecord() {
    return {
        id: createId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: STATUS.DRAFT,
        form: {
            productDescription: '',
            functionalUnitAmount: '',
            functionalUnitUnit: 'tonne',
            materials: '',
            manufacturingLocation: '',
            distribution: '',
            lifespan: '',
            usageRough: '',
            endOfLife: '',
            systemBoundary: 'cradle-to-gate',
            impactCategories: '',
            runMc: false,
            nSimulations: '',
            furtherNotes: '',
            unknowns: {
                q1: false,
                q2: false,
                q3: false,
                q4: false,
                q5: false,
                q6: false,
                q7: false,
                q8: false,
                q9: false,
                q10: false,
                q11: false
            },
            options: {
                regionMode: 'region'
            }
        },
        logs: [],
        result: null
    };
}

function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeForm(form) {
    const defaults = createBlankRecord().form;
    const merged = {
        ...defaults,
        ...(form || {}),
        unknowns: {
            ...defaults.unknowns,
            ...(form?.unknowns || {})
        },
        options: {
            ...defaults.options,
            ...(form?.options || {})
        }
    };

    // Backward compatibility for older localStorage records.
    if (!merged.functionalUnitAmount && form?.weight) {
        merged.functionalUnitAmount = form.weight;
    }

    return merged;
}

function loadState() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        state.records = Array.isArray(parsed) ? parsed : [];
    } catch {
        state.records = [];
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function getActiveRecord() {
    return state.records.find(r => r.id === state.activeRecordId) || null;
}

function saveActiveRecord() {
    const record = getActiveRecord();
    if (!record) return;
    record.updatedAt = Date.now();
    persistState();
}

function readForm() {
    return {
        productDescription: document.getElementById('q1')?.value.trim() || '',
        functionalUnitAmount: document.getElementById('q2-amount')?.value.trim() || '',
        functionalUnitUnit: document.getElementById('q2-unit')?.value || 'tonne',
        materials: document.getElementById('q3')?.value.trim() || '',
        manufacturingLocation: document.getElementById('q4')?.value.trim() || '',
        distribution: document.getElementById('q5')?.value.trim() || '',
        lifespan: document.getElementById('q6-lifespan')?.value.trim() || '',
        usageRough: document.getElementById('q6-rough')?.value || '',
        endOfLife: document.getElementById('q7')?.value.trim() || '',
        systemBoundary: getGroupActiveValue('systemBoundaryGroup') || 'cradle-to-gate',
        impactCategories: document.getElementById('q9')?.value.trim() || '',
        runMc: getGroupActiveValue('monteCarloGroup') === 'true',
        nSimulations: document.getElementById('q10-sims')?.value.trim() || '',
        furtherNotes: document.getElementById('q11')?.value.trim() || '',
        unknowns: {
            q1: !!document.getElementById('q1-unknown')?.checked,
            q2: !!document.getElementById('q2-unknown')?.checked,
            q3: !!document.getElementById('q3-unknown')?.checked,
            q4: !!document.getElementById('q4-unknown')?.checked,
            q5: !!document.getElementById('q5-unknown')?.checked,
            q6: !!document.getElementById('q6-unknown')?.checked,
            q7: !!document.getElementById('q7-unknown')?.checked,
            q8: !!document.getElementById('q8-unknown')?.checked,
            q9: !!document.getElementById('q9-unknown')?.checked,
            q10: !!document.getElementById('q10-unknown')?.checked,
            q11: !!document.getElementById('q11-unknown')?.checked
        },
        options: {
            regionMode: getGroupActiveValue('regionModeGroup')
        }
    };
}

function fillForm(form) {
    const data = normalizeForm(form);
    setValue('q1', data.productDescription);
    setValue('q2-amount', data.functionalUnitAmount);
    setValue('q2-unit', data.functionalUnitUnit || 'tonne');
    setValue('q3', data.materials);
    setValue('q4', data.manufacturingLocation);
    setValue('q5', data.distribution);
    setValue('q6-lifespan', data.lifespan);
    setValue('q6-rough', data.usageRough);
    setValue('q7', data.endOfLife);
    setValue('q9', data.impactCategories);
    setValue('q10-sims', data.nSimulations);
    setValue('q11', data.furtherNotes);

    setChecked('q1-unknown', !!data.unknowns?.q1);
    setChecked('q2-unknown', !!data.unknowns?.q2);
    setChecked('q3-unknown', !!data.unknowns?.q3);
    setChecked('q4-unknown', !!data.unknowns?.q4);
    setChecked('q5-unknown', !!data.unknowns?.q5);
    setChecked('q6-unknown', !!data.unknowns?.q6);
    setChecked('q7-unknown', !!data.unknowns?.q7);
    setChecked('q8-unknown', !!data.unknowns?.q8);
    setChecked('q9-unknown', !!data.unknowns?.q9);
    setChecked('q10-unknown', !!data.unknowns?.q10);
    setChecked('q11-unknown', !!data.unknowns?.q11);

    setGroupActiveValue('regionModeGroup', data.options?.regionMode || 'region');
    setGroupActiveValue('systemBoundaryGroup', data.systemBoundary || 'cradle-to-gate');
    setGroupActiveValue('monteCarloGroup', data.runMc ? 'true' : 'false');
    syncMonteCarloInputState();
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

function setChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = !!checked;
}

function getGroupActiveValue(groupId) {
    const active = document.querySelector(`#${groupId} .lca-option-btn.active`);
    return active ? active.dataset.value || '' : '';
}

function setGroupActiveValue(groupId, value) {
    const buttons = document.querySelectorAll(`#${groupId} .lca-option-btn`);
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });
}

function setWorkspaceTitle(record) {
    const titleEl = document.getElementById('workspaceTitle');
    const subtitleEl = document.getElementById('workspaceSubtitle');
    if (!titleEl || !subtitleEl) return;
    subtitleEl.textContent = `Record ${record?.id || '-'} | Last updated ${formatDateTime(record?.updatedAt || Date.now())}`;
}

function formatDateTime(ts) {
    const date = new Date(ts);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) +
        ' ' +
        date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function computeFillCount(form) {
    const data = normalizeForm(form);
    return [
        data.productDescription || (data.unknowns?.q1 ? 'Unknown' : ''),
        data.functionalUnitAmount || (data.unknowns?.q2 ? 'Unknown' : ''),
        data.materials || (data.unknowns?.q3 ? 'Unknown' : ''),
        data.manufacturingLocation || (data.unknowns?.q4 ? 'Unknown' : ''),
        data.distribution || (data.unknowns?.q5 ? 'Unknown' : ''),
        data.lifespan || data.usageRough || (data.unknowns?.q6 ? 'Unknown' : ''),
        data.endOfLife || (data.unknowns?.q7 ? 'Unknown' : ''),
        data.systemBoundary || (data.unknowns?.q8 ? 'Unknown' : ''),
        data.impactCategories || (data.unknowns?.q9 ? 'No specific categories' : ''),
        data.runMc ? (data.nSimulations || '25') : 'No Monte Carlo',
        data.furtherNotes || (data.unknowns?.q11 ? 'Unknown' : '')
    ].filter(Boolean).length;
}

function updateDataQualityUI(form) {
    const filled = computeFillCount(form);
    const totalQuestions = 11;
    const assumptions = Math.max(0, totalQuestions - filled);
    const percent = Math.round((filled / totalQuestions) * 100);

    const userCount = document.getElementById('dqUserCount');
    const assumptionCount = document.getElementById('dqAssumptionCount');
    const text = document.getElementById('dqCompleteness');
    const completeBar = document.getElementById('dqCompleteBar');
    const assumptionBar = document.getElementById('dqAssumptionBar');

    if (userCount) userCount.textContent = String(filled);
    if (assumptionCount) assumptionCount.textContent = String(assumptions);
    if (text) {
        const level = percent < 30 ? 'Low (assumption-heavy)' : percent < 70 ? 'Medium' : 'High';
        text.textContent = `${percent}% - ${level}`;
    }
    if (completeBar) completeBar.style.setProperty('--lca-filled', String(Math.max(filled, 0.1)));
    if (assumptionBar) assumptionBar.style.setProperty('--lca-remaining', String(Math.max(assumptions, 0.1)));
}

function switchMainView(target) {
    const historyView = document.getElementById('lcaHistoryView');
    const workspaceView = document.getElementById('lcaWorkspaceView');
    if (!historyView || !workspaceView) return;
    historyView.classList.toggle('active', target === 'history');
    workspaceView.classList.toggle('active', target === 'workspace');
}

// Show either the form panel or the results panel inside the workspace view.
function showWorkspacePanel(panel) {
    const formPanel    = document.getElementById('workspaceFormPanel');
    const resultsPanel = document.getElementById('workspaceResultsPanel');
    if (formPanel)    formPanel.classList.toggle('active', panel === 'form');
    if (resultsPanel) resultsPanel.classList.toggle('active', panel === 'results');
}

// ─── Open draft in form workspace ─────────────────────────────────────────────

function openRecord(recordId) {
    state.activeRecordId = recordId;
    const record = getActiveRecord();
    if (!record) return;

    switchMainView('workspace');
    showWorkspacePanel('form');
    fillForm(record.form);
    updateDataQualityUI(record.form);
    setWorkspaceTitle(record);
    renderConsole(record.logs || []);
}

function addNewRecord() {
    const record = createBlankRecord();
    state.records.unshift(record);
    persistState();
    openRecord(record.id);
}

// ─── Backend history list ─────────────────────────────────────────────────────

async function loadBackendHistory() {
    const container = document.getElementById('lcaHistoryContainer');
    if (!container) return;

    // Destroy any lingering preview charts
    Object.keys(charts).forEach(id => {
        if (id.startsWith('chart-')) { charts[id].destroy(); delete charts[id]; }
    });
    container.innerHTML = '<div class="empty-state"><p>Loading records\u2026</p></div>';

    let records;
    try {
        const raw = await apiReq('GET', '/api/lca-records');
        records = raw.map(window.LciaUtils.normalizeRecord).filter(Boolean);
    } catch (err) {
        console.error('Failed to load LCA records:', err);
        container.innerHTML =
            '<div class="empty-state"><p>Failed to load records. Please try again.</p></div>';
        return;
    }

    const searchInput = document.getElementById('lcaSearch');
    const sortSelect  = document.getElementById('lcaSort');

    if (searchInput) {
        const fresh = searchInput.cloneNode(true);
        searchInput.replaceWith(fresh);
        fresh.addEventListener('input', () => filterAndRenderHistory(records));
    }
    if (sortSelect) {
        const fresh = sortSelect.cloneNode(true);
        sortSelect.replaceWith(fresh);
        fresh.addEventListener('change', () => filterAndRenderHistory(records));
    }

    filterAndRenderHistory(records);
}

function filterAndRenderHistory(records) {
    const container   = document.getElementById('lcaHistoryContainer');
    const searchInput = document.getElementById('lcaSearch');
    const sortSelect  = document.getElementById('lcaSort');
    if (!container) return;

    let filtered = records;
    const term = searchInput ? searchInput.value.toLowerCase() : '';
    if (term) {
        filtered = records.filter(r => r.product.toLowerCase().includes(term));
    }

    switch (sortSelect ? sortSelect.value : 'recent') {
        case 'oldest':    filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); break;
        case 'product':   filtered.sort((a, b) => a.product.localeCompare(b.product));            break;
        case 'emissions': filtered.sort((a, b) => b.carbonEmission - a.carbonEmission);           break;
        default:          filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    container.innerHTML = '';
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No LCA records yet. Click <strong>+ New Assessment</strong> to generate your first one.</p>
            </div>`;
        return;
    }
    filtered.forEach(record => container.appendChild(createHistoryCard(record)));
}

function createHistoryCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.title = 'Click to view full details';

    const date    = new Date(record.timestamp);
    const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const info = document.createElement('div');
    info.className = 'record-info';
    info.innerHTML = `
        <div class="record-product">${window.LciaUtils.escapeHtml(record.product)}</div>
        <div class="record-date">${dateStr} at ${timeStr}</div>
        <div class="record-emissions-badge">
            Total: ${window.LciaUtils.toNumber(record.carbonEmission).toFixed(1)} kg CO<sub>2</sub>-eq
        </div>`;
    card.appendChild(info);

    const canvas_container = document.createElement('div');
    canvas_container.className = 'record-canvas-container';
    card.appendChild(canvas_container);

    // ── Bar chart (separate div) ──────────────────────────────────────────────
    const chartId = `chart-${record.id}`;
    const chartContainer = document.createElement('div');
    chartContainer.className = 'record-chart-container';
    chartContainer.innerHTML = `<canvas id="${chartId}"></canvas>`;
    canvas_container.appendChild(chartContainer);

    // ── Pie chart (separate div, only if streamSummary present) ──────────────
    const streamSummary = record.data?.streamSummary;
    const pieId = `pie-${record.id}`;
    if (streamSummary) {
        const pieContainer = document.createElement('div');
        pieContainer.className = 'record-pie-container';
        pieContainer.innerHTML = `<canvas id="${pieId}"></canvas>`;
        canvas_container.appendChild(pieContainer);
    }

    const actions = document.createElement('div');
    actions.className = 'record-actions';

    const viewBtn     = document.createElement('button');
    viewBtn.className = 'btn-small view';
    viewBtn.textContent = 'View Details';

    const downloadBtn     = document.createElement('button');
    downloadBtn.className = 'btn-small download';
    downloadBtn.textContent = 'Download CSV';

    const deleteBtn     = document.createElement('button');
    deleteBtn.className = 'btn-small delete';
    deleteBtn.textContent = 'Delete';

    viewBtn.addEventListener('click',     e => { e.stopPropagation(); openBackendResultsInTab(record); });
    downloadBtn.addEventListener('click', e => { e.stopPropagation(); downloadRecordCSV(record); });
    deleteBtn.addEventListener('click',   e => { e.stopPropagation(); deleteBackendRecord(record.id); });

    actions.appendChild(viewBtn);
    actions.appendChild(downloadBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(actions);

    card.addEventListener('click', () => openBackendResultsInTab(record));
    setTimeout(() => {
        renderPreviewChart(chartId, record);
        if (record.data?.streamSummary) { renderStreamPieChart(pieId, record); }
    }, 120);
    return card;
}

// ─── Preview chart (compact, up to 8 bars) ───────────────────────────────────

function renderStreamPieChart(canvasId, record, isDetail = false) {
    const canvas = document.getElementById(canvasId);
    const summary = record.data?.streamSummary;
    if (!canvas || !summary) return;

    if (charts[canvasId]) { charts[canvasId].destroy(); }

    const upstream   = summary.upstream    || 0;
    const downstream = summary.downstream  || 0;
    const gateToGate = summary.gate_to_gate || 0;
    const total = upstream + downstream + gateToGate;
    if (total === 0) return;

    const legendFontSize = isDetail ? 13 : 8;
    const titleFontSize  = isDetail ? 14 : 8;
    const boxWidth       = isDetail ? 14 : 8;
    const padding        = isDetail ? 10 : 6;

    // Inline plugin: draw percentage text on each slice (detail view only)
    const sliceLabelPlugin = {
        id: 'sliceLabels',
        afterDraw(chart) {
            const { ctx: c, data } = chart;
            const dataset = data.datasets[0];
            const tot = dataset.data.reduce((a, b) => a + b, 0);
            if (tot === 0) return;
            chart.getDatasetMeta(0).data.forEach((arc, i) => {
                const val = dataset.data[i];
                if (val === 0) return;
                const pct = ((val / tot) * 100).toFixed(0) + '%';
                const angle  = (arc.startAngle + arc.endAngle) / 2;
                const radius = (arc.outerRadius - arc.innerRadius) * 0.55 + arc.innerRadius;
                const x = arc.x + Math.cos(angle) * radius;
                const y = arc.y + Math.sin(angle) * radius;
                c.save();
                c.textAlign    = 'center';
                c.textBaseline = 'middle';
                c.fillStyle    = '#1b4332';
                c.font         = 'bold 13px sans-serif';
                c.fillText(pct, x, y);
                c.restore();
            });
        }
    };

    const ctx = canvas.getContext('2d');
    charts[canvasId] = new Chart(ctx, {
        type: 'pie',
        plugins: isDetail ? [sliceLabelPlugin] : [],
        data: {
            labels: ['Upstream', 'Downstream', 'Gate-to-Gate'],
            datasets: [{
                data: [upstream, downstream, gateToGate],
                backgroundColor: ['#a0c4ff', '#ffb3c1', '#fdffb6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600 },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#1b4332', font: { size: legendFontSize }, boxWidth, padding }
                },
                title: {
                    display: false,
                    text: 'Process Distribution',
                    color: '#1b4332',
                    font: { size: titleFontSize, weight: '600' },
                    padding: { bottom: isDetail ? 8 : 2 }
                },
                tooltip: {
                    callbacks: {
                        label: c => `${c.label}: ${c.parsed} (${((c.parsed / total) * 100).toFixed(0)}%)`
                    }
                }
            }
        }
    });
}

function renderPreviewChart(canvasId, record) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !record.data || !Array.isArray(record.data.processes)) return;

    if (charts[canvasId]) { charts[canvasId].destroy(); }

    const MAX_BARS  = 8;
    const processes = record.data.processes.slice(0, MAX_BARS);
    const labels    = processes.map(p => p.process || '\u2014');
    const values    = processes.map(p => window.LciaUtils.toNumber(p.mean_impact));
    const total     = window.LciaUtils.toNumber(record.data.totalMeanImpact) || 1;

    const ctx      = canvas.getContext('2d');

    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'kg CO\u2082-eq',
                data: values,
                backgroundColor: values.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
                borderColor: '#fff',
                borderWidth: 1,
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
                    ticks: { color: '#1b4332', font: { size: 9 }, maxTicksLimit: 5, callback: v => Math.round(v) }
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

// ─── Open backend record in the results tab ───────────────────────────────────

function openBackendResultsInTab(record) {
    const container = document.getElementById('backendResultsContainer');
    if (!container) return;

    // Destroy any previous detail charts
    const prevDetailId = container.dataset.detailChartId;
    if (prevDetailId && charts[prevDetailId]) {
        charts[prevDetailId].destroy();
        delete charts[prevDetailId];
    }
    const prevDetailPieId = container.dataset.detailPieId;
    if (prevDetailPieId && charts[prevDetailPieId]) {
        charts[prevDetailPieId].destroy();
        delete charts[prevDetailPieId];
    }

    const date    = new Date(record.timestamp);
    const dateStr = date.toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    container.innerHTML = '';

    // Update the subtitle bar instead of rendering an in-body header
    const subtitleEl = document.getElementById('workspaceSubtitle');
    if (subtitleEl) {
        subtitleEl.textContent = `${window.LciaUtils.escapeHtml(record.product)}  ·  Generated: ${dateStr}`;
    }

    const body = document.createElement('div');
    body.className = 'detail-body';

    // ── 1. Form inputs (always first — lets user review what was submitted) ────
    if (record.form && Object.keys(record.form).length > 0) {
        body.appendChild(buildFormInputsSection(record.form));
    }

    // ── 2. Sustainopedia AI response ─────────────────────────────────────────
    if (record.answerText) {
        const answerSection = document.createElement('div');
        answerSection.className = 'detail-section';
        answerSection.innerHTML = `
            <h3 class="detail-section-title">Sustainopedia's Response</h3>
            <div class="detail-answer-text"></div>`;
        const answerEl = answerSection.querySelector('.detail-answer-text');
        if (window.markdownit) {
            const md = window.markdownit({ html: false, breaks: true, linkify: true });
            answerEl.className = 'detail-answer-text bot-message-prose';
            answerEl.innerHTML = md.render(record.answerText);
        } else {
            answerEl.textContent = record.answerText;
        }
        body.appendChild(answerSection);
    }

    const tableSection = document.createElement('div');
    tableSection.className = 'detail-section';
    tableSection.innerHTML = `<h3 class="detail-section-title">LCIA Results Table</h3>`;
    tableSection.appendChild(buildLciaDetailTable(record));
    body.appendChild(tableSection);

    const detailChartId = `detail-chart-${record.id}`;
    const detailPieId   = `detail-pie-${record.id}`;
    const hasStream = !!(record.data?.streamSummary);

    // ── Charts row (bar 60% + pie 40%) ─────────────────────────────────────
    const chartsDetailRow = document.createElement('div');
    chartsDetailRow.className = 'detail-charts-row';

    // Bar chart section
    const chartSection = document.createElement('div');
    chartSection.className = 'detail-section bar-chart-section';
    chartSection.innerHTML = `
        <h3 class="detail-section-title">Carbon Emission by Process</h3>
        <div class="detail-bar-canvas-wrapper">
            <canvas id="${detailChartId}"></canvas>
        </div>`;
    chartsDetailRow.appendChild(chartSection);

    // Pie chart section (only if streamSummary present)
    if (hasStream) {
        const pieSection = document.createElement('div');
        pieSection.className = 'detail-section pie-chart-section';
        pieSection.innerHTML = `
            <h3 class="detail-section-title">Process Distribution</h3>
            <div class="detail-pie-canvas-wrapper">
                <canvas id="${detailPieId}"></canvas>
            </div>`;
        chartsDetailRow.appendChild(pieSection);
    }

    body.appendChild(chartsDetailRow);

    const footer = document.createElement('div');
    footer.className = 'detail-footer';
    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn-small download';
    dlBtn.textContent = 'Download CSV';
    dlBtn.addEventListener('click', () => downloadRecordCSV(record));
    footer.appendChild(dlBtn);
    body.appendChild(footer);

    container.appendChild(body);
    container.dataset.detailChartId = detailChartId;
    container.dataset.detailPieId   = detailPieId;

    switchMainView('workspace');
    showWorkspacePanel('results');
    requestAnimationFrame(() => {
        renderDetailChart(detailChartId, record);
        if (record.data?.streamSummary) { renderStreamPieChart(detailPieId, record, true); }
    });

    initResultsChat(record);
}

// ─── Detail chart (full resolution, all processes) ───────────────────────────

function renderDetailChart(canvasId, record) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !record.data || !Array.isArray(record.data.processes)) return;

    if (charts[canvasId]) { charts[canvasId].destroy(); }

    const processes = record.data.processes;
    const labels    = processes.map(p => {
        const raw = p.process || '\u2014';
        return raw.split(':')[0].trim();
    });
    const values = processes.map(p => window.LciaUtils.toNumber(p.mean_impact));
    const total  = window.LciaUtils.toNumber(record.data.totalMeanImpact) || 1;

    const ctx      = canvas.getContext('2d');

    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Carbon Emission (kg CO\u2082-eq)',
                data: values,
                backgroundColor: values.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
                borderColor: '#fff',
                borderWidth: 1,
                borderRadius: 2,
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
                legend: false,
                // tooltip: {
                //     backgroundColor: 'rgba(27, 67, 50, 0.95)',
                //     titleColor: '#fff',
                //     bodyColor: '#d8f3dc',
                //     borderColor: '#367a5b',
                //     borderWidth: 1,
                //     padding: 12,
                //     callbacks: {
                //         title:      c => c[0].label,
                //         label:      c => `  ${c.parsed.y.toFixed(1)} kg CO\u2082-eq`,
                //         afterLabel: c => `  ${((c.parsed.y / total) * 100).toFixed(1)}% of total`
                //     }
                // }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Carbon Emission (kg CO\u2082-eq)', color: '#305C42', font: { size: 13, weight: '600' } },
                    grid:  { color: 'rgba(183, 228, 199, 0.30)' },
                    ticks: { color: '#305C42', font: { size: 11, weight: '600' }, callback: v => Math.round(v) }
                },
                x: { grid: { display: false }, ticks: { color: '#305C42', font: { size: 13, weight: '600' } } }
            }
        }
    });
}

// ─── Results-page chat ───────────────────────────────────────────────────────

// Polling state for the results chat (separate from the LCA job polling)
let _resultsChatPollTimer = null;
let _resultsChatJobId     = null;

function _stopResultsChatPolling() {
    if (_resultsChatPollTimer) { clearInterval(_resultsChatPollTimer); _resultsChatPollTimer = null; }
    _resultsChatJobId = null;
}

// Persist one message to the results-chat collection (fire-and-forget; errors are non-fatal).
async function _lcaResultsChatSave(recordId, role, content) {
    try {
        await apiReq('POST', `/api/lca-results-chat/${recordId}`, { role, content });
    } catch (err) {
        console.warn('[ResultsChat] Failed to save message:', err);
    }
}

// Load saved chat history for a record. Returns [] on error.
async function _lcaResultsChatLoad(recordId) {
    try {
        return await apiReq('GET', `/api/lca-results-chat/${recordId}`);
    } catch (err) {
        console.warn('[ResultsChat] Failed to load history:', err);
        return [];
    }
}

// Build a concise plain-text summary of the LCA record for LLM context.
function buildLcaContextText(record) {
    const lines = [
        `=== LCA Results Context ===`,
        `Product: ${record.product || 'Unknown'}`,
        `Generated: ${new Date(record.timestamp).toLocaleString('en-US')}`,
        `Total Carbon Emission: ${window.LciaUtils.toNumber(record.carbonEmission).toFixed(2)} kg CO2-eq`
    ];
    if (record.data?.processes?.length) {
        lines.push('');
        lines.push('Processes (kg CO2-eq each):');
        record.data.processes.forEach(p => {
            lines.push(`  - ${p.process}: ${window.LciaUtils.toNumber(p.mean_impact).toFixed(3)}`);
        });
    }
    if (record.answerText) {
        lines.push('');
        lines.push('Sustainopedia Analysis:');
        lines.push(record.answerText.slice(0, 800)); // cap to avoid oversized payloads
    }
    return lines.join('\n');
}

function initResultsChat(record) {
    const chatWindow  = document.getElementById('resultsChatWindow');
    const chatForm    = document.getElementById('resultsChatForm');
    const chatInput   = document.getElementById('resultsChatInput');
    const sendBtn     = chatForm?.querySelector('.results-chat-send-btn');
    if (!chatWindow || !chatForm || !chatInput) return;

    // Stop any previous chat polling and clear the window
    _stopResultsChatPolling();
    chatWindow.innerHTML = '';

    const lcaContext = buildLcaContextText(record);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const md = window.markdownit
        ? window.markdownit({ html: false, breaks: true, linkify: true })
        : null;

    function renderText(text) {
        return md ? md.render(text || '') : (text || '');
    }

    function appendChatMessage(role, text) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        const content = document.createElement('div');
        content.className = 'message-content';
        if (role === 'bot-message') {
            const rendered = renderText(text);
            const tmp = document.createElement('div');
            tmp.innerHTML = rendered;
            if (tmp.children.length === 0 && tmp.textContent.trim()) {
                const p = document.createElement('p');
                p.textContent = tmp.textContent;
                tmp.appendChild(p);
            }
            Array.from(tmp.children).forEach((child, i) => {
                child.classList.add('bot-block');
                child.style.animationDelay = `${i * 45}ms`;
                content.appendChild(child);
            });
        } else {
            content.textContent = text || '';
        }
        div.appendChild(content);
        chatWindow.appendChild(div);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function showChatTyping() {
        const div = document.createElement('div');
        div.className = 'message bot-typing';
        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = `
            <div class="typing-dots" aria-label="Bot is typing">
                <span></span><span></span><span></span>
            </div>`;
        div.appendChild(content);
        chatWindow.appendChild(div);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return div;
    }

    // ── Replace form early so input handler is fresh ──────────────────────────
    const freshForm = chatForm.cloneNode(true);
    chatForm.parentNode.replaceChild(freshForm, chatForm);
    const freshInput  = freshForm.querySelector('#resultsChatInput');
    const freshSend   = freshForm.querySelector('.results-chat-send-btn');

    freshInput.addEventListener('input', () => {
        freshInput.style.height = 'auto';
        freshInput.style.height = Math.min(freshInput.scrollHeight, 120) + 'px';
    });

    // ── Load history from MongoDB, show welcome only if none ─────────────────
    _lcaResultsChatLoad(record.id).then(history => {
        if (history.length > 0) {
            history.forEach(msg => {
                appendChatMessage(msg.role === 'user' ? 'user-message' : 'bot-message', msg.content);
            });
        } else {
            appendChatMessage('bot-message',
                `This is SustainOpedia Bot. I am here to assist with any questions you have about the generated LCA results for **${window.LciaUtils.escapeHtml(record.product)}**.`
            );
        }
    });

    freshForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userText = freshInput.value.trim();
        if (!userText) return;

        freshInput.value = '';
        freshInput.style.height = 'auto';
        if (freshSend) freshSend.disabled = true;

        appendChatMessage('user-message', userText);
        _lcaResultsChatSave(record.id, 'user', userText);

        // Build the context-enriched query
        const contextualQuery = `Question: ${userText}\n\nCurrent LCA Result Context for reference: ${lcaContext}`;

        const typingEl = showChatTyping();

        try {
            const resp = await fetch(`${FLASK_BASE}/api/jobs`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    question: contextualQuery,
                    product:  record.product || '',
                    mode:     'fast'
                })
            });

            if (!resp.ok) throw new Error(`Server error ${resp.status}`);
            const { jobId } = await resp.json();
            _resultsChatJobId = jobId;

            _resultsChatPollTimer = setInterval(async () => {
                try {
                    const pollResp = await fetch(`${FLASK_BASE}/api/jobs/${jobId}`);
                    if (pollResp.status === 404) {
                        _stopResultsChatPolling();
                        if (typingEl.parentNode) typingEl.remove();
                        appendChatMessage('bot-message', 'The session was reset. Please try again.');
                        if (freshSend) freshSend.disabled = false;
                        return;
                    }
                    const data = await pollResp.json();
                    if (data.status === 'done') {
                        _stopResultsChatPolling();
                        if (typingEl.parentNode) typingEl.remove();
                        const answer = data.answer_pack?.answer || 'No response received.';
                        appendChatMessage('bot-message', answer);
                        _lcaResultsChatSave(record.id, 'bot', answer);
                        if (freshSend) freshSend.disabled = false;
                    } else if (data.status === 'error') {
                        _stopResultsChatPolling();
                        if (typingEl.parentNode) typingEl.remove();
                        appendChatMessage('bot-message', `Error: ${data.error || 'Computation failed.'}`);
                        if (freshSend) freshSend.disabled = false;
                    }
                } catch (pollErr) {
                    console.error('[ResultsChat polling]', pollErr);
                }
            }, POLL_INTERVAL_MS);

        } catch (err) {
            if (typingEl.parentNode) typingEl.remove();
            appendChatMessage('bot-message', `Error: ${err.message}`);
            if (freshSend) freshSend.disabled = false;
        }
    });
}

// ─── Assessment form inputs summary ──────────────────────────────────────────

function buildFormInputsSection(form) {
    const BOUNDARY_LABELS = {
        'cradle-to-gate':   'Cradle-to-Gate',
        'cradle-to-grave':  'Cradle-to-Grave',
        'cradle-to-cradle': 'Cradle-to-Cradle',
        'gate-to-gate':     'Gate-to-Gate',
        'gate-to-grave':    'Gate-to-Grave'
    };

    // Resolve values using the same logic as buildStructuredLcaQuery
    const f = normalizeForm(form);
    const amount = toSafeNumber(f.functionalUnitAmount, 1);
    const nSimulations = f.runMc ? clampInt(f.nSimulations, 25, 1, 500) : 1;
    const usePhase = f.lifespan
        ? `${f.lifespan} years`
        : formatStructuredValue(f.usageRough, f.unknowns?.q6);
    const boundaryLabel = BOUNDARY_LABELS[f.systemBoundary] ||
        formatStructuredValue(f.systemBoundary, f.unknowns?.q8, 'cradle-to-gate');

    const groups = [
        {
            icon: '📦', label: 'Product',
            fields: [
                { label: 'Product',         value: formatStructuredValue(f.productDescription, f.unknowns?.q1), wide: true },
                { label: 'Amount',          value: `${amount} ${f.functionalUnitUnit || 'tonne'}` }
            ]
        },
        {
            icon: '🏭', label: 'Materials & Manufacturing',
            fields: [
                { label: 'Materials',              value: formatStructuredValue(f.materials, f.unknowns?.q3), wide: true },
                { label: 'Manufacturing Location', value: formatStructuredValue(f.manufacturingLocation, f.unknowns?.q4) }
            ]
        },
        {
            icon: '🚚', label: 'Distribution & Use',
            fields: [
                { label: 'Distribution', value: formatStructuredValue(f.distribution, f.unknowns?.q5), wide: true },
                { label: 'Use Phase',    value: usePhase },
                { label: 'End of Life',  value: formatStructuredValue(f.endOfLife, f.unknowns?.q7) }
            ]
        },
        {
            icon: '⚙️', label: 'Assessment Settings',
            fields: [
                { label: 'System Boundary',      value: boundaryLabel },
                { label: 'Impact Categories',    value: formatStructuredValue(f.impactCategories, f.unknowns?.q9, 'null') },
                { label: 'Simulations',          value: String(nSimulations) },
                { label: 'Additional Notes',     value: formatStructuredValue(f.furtherNotes, f.unknowns?.q11, 'null'), wide: true }
            ]
        }
    ];

    const section = document.createElement('div');
    section.className = 'detail-section form-inputs-section';

    const header = document.createElement('div');
    header.className = 'form-inputs-header';
    header.innerHTML = `
        <h3 class="detail-section-title" style="margin-bottom:2px;">Your Assessment Inputs</h3>`;
    section.appendChild(header);

    groups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'form-inputs-group';

        const groupLabel = document.createElement('div');
        groupLabel.className = 'form-inputs-group-label';
        groupLabel.innerHTML = `<span class="form-inputs-group-icon">${group.icon}</span>${window.LciaUtils.escapeHtml(group.label)}`;
        groupEl.appendChild(groupLabel);

        const fieldGrid = document.createElement('div');
        fieldGrid.className = 'form-inputs-field-grid';

        group.fields.forEach(field => {
            const item = document.createElement('div');
            item.className = 'form-inputs-item' + (field.wide ? ' wide' : '');
            const isUnspecified = !field.value || field.value === 'Not Specified' || field.value === 'null';
            item.innerHTML = `
                <span class="form-inputs-label">${window.LciaUtils.escapeHtml(field.label)}</span>
                <span class="form-inputs-value${isUnspecified ? ' form-inputs-value--empty' : ''}">${window.LciaUtils.escapeHtml(String(field.value))}</span>`;
            fieldGrid.appendChild(item);
        });

        groupEl.appendChild(fieldGrid);
        section.appendChild(groupEl);
    });

    return section;
}

// ─── LCIA detail table ────────────────────────────────────────────────────────

function buildLciaDetailTable(record) {
    const wrapper = document.createElement('div');
    wrapper.className = 'detail-table-wrapper';

    const table   = document.createElement('table');
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
            p.process, p.amount_location, p.unit_location, p.ref_product,
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

    const totalRow  = document.createElement('tr');
    totalRow.className = 'lcia-total-row';
    const labelCell = document.createElement('td');
    labelCell.colSpan   = 4;
    labelCell.textContent = 'Total Estimated Impact';
    const valueCell = document.createElement('td');
    valueCell.textContent = window.LciaUtils.toNumber(record.data.totalMeanImpact).toFixed(1)+' kg CO₂-eq';
    totalRow.appendChild(labelCell);
    totalRow.appendChild(valueCell);
    totalRow.appendChild(document.createElement('td'));
    totalRow.appendChild(document.createElement('td'));
    tbody.appendChild(totalRow);

    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

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

// ─── Delete backend record ────────────────────────────────────────────────────

async function deleteBackendRecord(recordId) {
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
    loadBackendHistory();
}

function renderConsole(logs) {
    const body = document.getElementById('lcaConsoleBody');
    if (!body) return;
    if (!logs || logs.length === 0) {
        body.innerHTML = '<p class="lca-console-empty"></p>';
        return;
    }
    body.innerHTML = '';
    logs.forEach(log => {
        const line = document.createElement('div');
        line.className = `lca-console-line ${log.level || ''}`.trim();
        line.textContent = `[${new Date(log.ts).toLocaleTimeString()}] ${log.message}`;
        body.appendChild(line);
    });
    body.scrollTop = body.scrollHeight;
}

function appendLog(message, level = '') {
    const record = getActiveRecord();
    if (!record) return;
    record.logs = record.logs || [];
    record.logs.push({ ts: Date.now(), level, message });
    saveActiveRecord();
    renderConsole(record.logs);
}

function toSafeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInt(value, fallback, min, max) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function formatStructuredValue(raw, unknownChecked, fallback = 'Not Specified') {
    const text = String(raw || '').trim();
    if (text) return text;
    return unknownChecked ? 'Not Specified' : fallback;
}

function inferProcessStream(processName) {
    const text = String(processName || '').toLowerCase();
    if (text.includes('transport') || text.includes('use ') || text.includes('use-phase') || text.includes('end-of-life') || text.includes('end of life')) {
        return 'downstream';
    }
    return 'upstream';
}

function normalizeAnswerPackToResult(answerPack, form) {
    let normalizedLcia = null;
    const productName = form?.productDescription || 'Unknown product';

    if (answerPack?.processed_json) {
        try {
            const parsed = typeof answerPack.processed_json === 'string'
                ? JSON.parse(answerPack.processed_json)
                : answerPack.processed_json;
            if (parsed && Array.isArray(parsed.processes)) {
                normalizedLcia = parsed;
            }
        } catch {
            normalizedLcia = null;
        }
    }

    if (!normalizedLcia && answerPack?.lcia_table && window.LciaUtils?.normalizeLciaPayload) {
        normalizedLcia = window.LciaUtils.normalizeLciaPayload(
            answerPack.lcia_table,
            answerPack.answer || '',
            productName
        );
    }

    const rawProcesses = Array.isArray(normalizedLcia?.processes) ? normalizedLcia.processes : [];
    const mapped = rawProcesses
        .map((proc, idx) => {
            const name = proc.process || proc.name || proc.matched_activity || `Process ${idx + 1}`;
            const impact = toSafeNumber(proc.mean_impact ?? proc.impact, 0);
            return {
                name,
                impact,
                quality: proc.db_version_code || proc.unit_location || 'modelled',
                stream: inferProcessStream(name)
            };
        })
        .filter(proc => proc.impact > 0);

    const computedTotal = mapped.reduce((sum, p) => sum + p.impact, 0);
    const totalImpact = toSafeNumber(normalizedLcia?.totalMeanImpact, computedTotal);
    const safeTotal = totalImpact > 0 ? totalImpact : computedTotal;

    const processes = mapped.map(proc => ({
        ...proc,
        share: safeTotal > 0 ? (proc.impact / safeTotal) * 100 : 0
    }));

    const upstreamTotal = processes
        .filter(proc => proc.stream === 'upstream')
        .reduce((sum, proc) => sum + proc.impact, 0);

    return {
        normalizedLcia,
        totalImpact: safeTotal,
        upstreamShare: safeTotal > 0 ? (upstreamTotal / safeTotal) * 100 : 0,
        processes,
        answerText: answerPack?.answer || ''
    };
}

function buildStructuredLcaQuery(form) {
    const f = normalizeForm(form);
    const amount = toSafeNumber(f.functionalUnitAmount, 1);
    const nSimulations = f.runMc ? clampInt(f.nSimulations, 25, 1, 500) : 1;
    const usePhase = f.lifespan
        ? `${f.lifespan} years`
        : formatStructuredValue(f.usageRough, f.unknowns?.q6);

    return [
        'intent: Computation',
        `product: ${formatStructuredValue(f.productDescription, f.unknowns?.q1)}`,
        `amount: ${amount} ${f.functionalUnitUnit || 'tonne'}`,
        `system_boundary: ${formatStructuredValue(f.systemBoundary, f.unknowns?.q8, 'cradle-to-gate')}`,
        `n_simulations: ${nSimulations}`,
        `region: ${formatStructuredValue(f.manufacturingLocation, f.unknowns?.q4)}`,
        `environmental_impact_categories: ${formatStructuredValue(f.impactCategories, f.unknowns?.q9, 'null')}`,
        `materials: ${formatStructuredValue(f.materials, f.unknowns?.q3)}`,
        `manufacturing_location: ${formatStructuredValue(f.manufacturingLocation, f.unknowns?.q4)}`,
        `distribution: ${formatStructuredValue(f.distribution, f.unknowns?.q5)}`,
        `use_phase: ${usePhase}`,
        `end_of_life: ${formatStructuredValue(f.endOfLife, f.unknowns?.q7)}`,
        `additional_notes: ${formatStructuredValue(f.furtherNotes, f.unknowns?.q11, 'null')}`
    ].join('\n');
}

function syncMonteCarloInputState() {
    const simsInput = document.getElementById('q10-sims');
    if (!simsInput) return;
    const runMc = getGroupActiveValue('monteCarloGroup') === 'true';
    simsInput.disabled = !runMc;
    if (!runMc && !simsInput.value.trim()) {
        simsInput.value = '25';
    }
}

function collectAndSaveForm() {
    const record = getActiveRecord();
    if (!record) return;
    record.form = readForm();
    record.updatedAt = Date.now();
    saveActiveRecord();
    setWorkspaceTitle(record);
    updateDataQualityUI(record.form);
}

async function saveDraft() {
    collectAndSaveForm();
    appendLog('Draft saved.', 'success');
}

async function generateResult(e) {
    e.preventDefault();

    const record = getActiveRecord();
    if (!record) return;

    collectAndSaveForm();
    record.status = STATUS.RUNNING;
    saveActiveRecord();

    const btn = document.getElementById('generateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

    const f        = normalizeForm(record.form);
    const question = buildStructuredLcaQuery(f);

    appendLog('Payload assembled from form data ✔');
    appendLog('Form Input Summary:\n' + question.split('\n').map(line => '- ' + line).join('\n'));
    appendLog('Submitting generation request to backend...');


    let resp;
    try {
        resp = await fetch(`${FLASK_BASE}/api/jobs`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                mode:     'full_lca',
                question:  question,
                product:  f.productDescription || 'Not Specified',
                recordId: record.id
            })
        });
    } catch (err) {
        record.status = STATUS.DRAFT;
        saveActiveRecord();
        appendLog(`Failed to reach backend: ${err.message}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Generate Result'; }
        return;
    }

    if (!resp.ok) {
        let errText = `Server error ${resp.status}`;
        try { const errJson = await resp.json(); errText = errJson.error || errText; } catch {}
        record.status = STATUS.DRAFT;
        saveActiveRecord();
        appendLog(`Generation failed: ${errText}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Generate Result'; }
        return;
    }

    const { jobId } = await resp.json();
    record.jobId = jobId;
    record.backendLogOffset = 0;
    saveActiveRecord();
    appendLog(`Backend job accepted (jobId: ${jobId}). Polling for result...`);

    _startLcaPolling(jobId, record, f, question);
}

function _stopLcaPolling() {
    if (_lcaPollTimer) { clearInterval(_lcaPollTimer); _lcaPollTimer = null; }
    _lcaActiveJobId = null;
}

function _startLcaPolling(jobId, record, f, question) {
    _lcaActiveJobId = jobId;
    let _consecutiveNetworkErrors = 0;
    let _backendLogOffset = record.backendLogOffset || 0;
    const MAX_NETWORK_ERRORS = 3; // ~7.5 s of consecutive failures before giving up

    // Flush any new backend log entries since the last poll tick.
    // Offset is persisted on the record so reconnecting after a page reload
    // picks up only new log entries without duplicating already-shown ones.
    function _flushBackendLogs(logs) {
        if (!Array.isArray(logs)) return;
        for (let i = _backendLogOffset; i < logs.length; i++) {
            appendLog(logs[i].message, logs[i].level || '');
        }
        _backendLogOffset = logs.length;
        record.backendLogOffset = _backendLogOffset;
        saveActiveRecord();
    }

    _lcaPollTimer = setInterval(async () => {
        try {
            const resp = await fetch(`${FLASK_BASE}/api/jobs/${jobId}`);
            _consecutiveNetworkErrors = 0;

            // Server restarted / job expired
            if (resp.status === 404) {
                _stopLcaPolling();
                record.status = STATUS.DRAFT;
                saveActiveRecord();
                appendLog('The computation session was reset. Please re-submit your query.', 'error');
                const btn = document.getElementById('generateBtn');
                if (btn) { btn.disabled = false; btn.textContent = 'Generate Result'; }
                return;
            }

            const data = await resp.json();
            _flushBackendLogs(data.logs);

            if (data.status === 'done') {
                _stopLcaPolling();
                appendLog('Result received. Processing...');
                await _onLcaJobDone(data.answer_pack, record, f, question);

            } else if (data.status === 'error') {
                _stopLcaPolling();
                record.status = STATUS.DRAFT;
                saveActiveRecord();
                appendLog(`Generation failed: ${data.error || 'Backend job failed.'}`, 'error');
                const btn = document.getElementById('generateBtn');
                if (btn) { btn.disabled = false; btn.textContent = 'Generate Result'; }
            }
            // else: still pending/running — backend logs already flushed above

        } catch (err) {
            if (err instanceof TypeError) {
                // Network failure — count consecutive misses before giving up
                _consecutiveNetworkErrors++;
                if (_consecutiveNetworkErrors >= MAX_NETWORK_ERRORS) {
                    _stopLcaPolling();
                    record.status = STATUS.DRAFT;
                    saveActiveRecord();
                    appendLog('The server is currently unreachable. Please try again later.', 'error');
                    const btn = document.getElementById('generateBtn');
                    if (btn) { btn.disabled = false; btn.textContent = 'Generate Result'; }
                }
            } else {
                console.error('[LCA Polling] Unexpected error:', err);
            }
        }
    }, POLL_INTERVAL_MS);
}

async function _onLcaJobDone(answerPack, record, f, question) {
    const resultData = normalizeAnswerPackToResult(answerPack, f);

    const lciaData = resultData.normalizedLcia || {
        processes:       [],
        totalMeanImpact: resultData.totalImpact
    };

    const backendPayload = {
        product:        f.productDescription || 'Unnamed Product',
        form:           f,
        data:           lciaData,
        carbonEmission: resultData.totalImpact,
        query:          question,
        answerText:     resultData.answerText || ''
    };

    appendLog('Saving result to database...');
    let savedId = null;
    try {
        const saved = await apiReq('POST', '/api/lca-records', backendPayload);
        savedId = saved?.id || null;
    } catch (saveErr) {
        console.error('Failed to save LCA record to backend:', saveErr);
        appendLog('Warning: backend save failed; result may not persist.', 'error');
    }

    record.status = STATUS.COMPLETE;
    record.updatedAt = Date.now();
    saveActiveRecord();
    appendLog('Result generated successfully.', 'success');

    const displayRecord = window.LciaUtils.normalizeRecord({
        id:             savedId || record.id,
        _id:            savedId || record.id,
        product:        backendPayload.product,
        form:           backendPayload.form,
        data:           lciaData,
        carbonEmission: backendPayload.carbonEmission,
        query:          backendPayload.query,
        answerText:     backendPayload.answerText,
        timestamp:      new Date().toISOString()
    });

    await loadBackendHistory();
    if (displayRecord) openBackendResultsInTab(displayRecord);

    const btn = document.getElementById('generateBtn');
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Result'; }
}

function bindOptionGroups() {
    document.querySelectorAll('.lca-option-group').forEach(group => {
        group.querySelectorAll('.lca-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.lca-option-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                syncMonteCarloInputState();
                collectAndSaveForm();
            });
        });
    });
}

function bindInputs() {
    document.querySelectorAll('#assessmentForm textarea, #assessmentForm input[type="text"], #assessmentForm select, #assessmentForm input[type="checkbox"]').forEach(el => {
        el.addEventListener('input', collectAndSaveForm);
        el.addEventListener('change', collectAndSaveForm);
    });
}

function bindUI() {
    document.getElementById('newLcaBtn')?.addEventListener('click', addNewRecord);
    document.getElementById('backToHistoryBtn')?.addEventListener('click', () => {
        _stopResultsChatPolling();
        const subtitleEl = document.getElementById('workspaceSubtitle');
        if (subtitleEl) subtitleEl.textContent = '';
        switchMainView('history');
        loadBackendHistory();
    });

    document.getElementById('saveDraftBtn')?.addEventListener('click', saveDraft);
    document.getElementById('assessmentForm')?.addEventListener('submit', generateResult);

    document.getElementById('clearConsoleBtn')?.addEventListener('click', () => {
        const record = getActiveRecord();
        if (!record) return;
        record.logs = [];
        saveActiveRecord();
        renderConsole(record.logs);
    });

    ['mobileMenuBtn', 'mobileMenuBtn2'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            document.querySelector('.left-nav')?.classList.toggle('open');
        });
    });
}

function initializePage() {
    bindUI();
    bindOptionGroups();
    bindInputs();
    syncMonteCarloInputState();
    loadState();
    loadBackendHistory();

    // If a generation job was running when the user left, restore the workspace
    // and resume polling so progress is not lost on page reload or navigation.
    const runningRecord = state.records.find(r => r.status === STATUS.RUNNING && r.jobId);
    if (runningRecord) {
        openRecord(runningRecord.id);
        appendLog('Welcome back. Please wait a second for updating you the latest progress...');
        const f = normalizeForm(runningRecord.form);
        const question = buildStructuredLcaQuery(f);
        _startLcaPolling(runningRecord.jobId, runningRecord, f, question);
    } else {
        switchMainView('history');
        showWorkspacePanel('form');
    }
}

document.addEventListener('DOMContentLoaded', initializePage);
