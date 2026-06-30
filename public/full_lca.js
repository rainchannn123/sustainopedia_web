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

const FLASK_BASE = window.FLASK_BASE || 'http://localhost:5052';
const POLL_INTERVAL_MS = 3000;

// ── Job polling state ────────────────────────────────────────────────────────
let _lcaPollTimer        = null;
let _lcaActiveJobId      = null;
let _cancelClickHandler  = null; // stored reference so _setBtnState('idle') can remove it
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

const SCOPE_KEYS = ['scope1', 'scope2', 'scope3'];
const scopeReportStateByRecordId = new Map();

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
            unknowns: {},
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
        unknowns: {},
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
        manufacturingLocation: getGroupActiveValue('manufacturingLocationGroup') || 'GLO',
        distribution: document.getElementById('q5')?.value.trim() || '',
        lifespan: document.getElementById('q6-lifespan')?.value.trim() || '',
        usageRough: document.getElementById('q6-rough')?.value || '',
        endOfLife: document.getElementById('q7')?.value.trim() || '',
        systemBoundary: getGroupActiveValue('systemBoundaryGroup') || 'cradle-to-gate',
        impactCategories: document.getElementById('q9')?.value.trim() || '',
        runMc: getGroupActiveValue('monteCarloGroup') === 'true',
        nSimulations: document.getElementById('q10-sims')?.value.trim() || '',
        furtherNotes: document.getElementById('q11')?.value.trim() || '',
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
    setGroupActiveValue('manufacturingLocationGroup', data.manufacturingLocation || 'GLO');
    setValue('q5', data.distribution);
    setValue('q6-lifespan', data.lifespan);
    setValue('q6-rough', data.usageRough);
    setValue('q7', data.endOfLife);
    setValue('q9', data.impactCategories);
    setValue('q10-sims', data.nSimulations);
    setValue('q11', data.furtherNotes);

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
        data.productDescription,
        data.functionalUnitAmount,
        data.materials,
        data.manufacturingLocation,
        data.distribution,
        data.lifespan || data.usageRough,
        data.endOfLife,
        data.systemBoundary,
        data.impactCategories,
        data.runMc ? (data.nSimulations || '25') : 'No Monte Carlo',
        data.furtherNotes
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

function createLocalDraftCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card record-card--row';
    card.title = 'Click to open draft';

    const ts      = record.updatedAt || record.createdAt || Date.now();
    const date    = new Date(ts);
    const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const isRunning = record.status === STATUS.RUNNING;
    const badgeClass = isRunning ? 'running' : 'draft';
    const badgeText  = isRunning ? 'LCA on Progress...' : 'Draft';

    const info = document.createElement('div');
    info.className = 'record-info';
    info.innerHTML = `
        <div class="record-product">${window.LciaUtils.escapeHtml(record.form?.productDescription || 'Untitled Assessment')}</div>
        <div class="record-date">${dateStr} at ${timeStr}</div>
        <div class="record-status-badge ${badgeClass}">${badgeText}</div>`;
    card.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'record-actions record-actions--row';
    actions.innerHTML = `<span class="record-date">${dateStr} at ${timeStr}</span>`;

    const deleteBtn = document.createElement('button');

    deleteBtn.className = 'btn-small delete';
    deleteBtn.textContent = 'Delete';

    deleteBtn.addEventListener('click',   e => { e.stopPropagation(); deleteDraftRecord(record.id); });

    actions.appendChild(deleteBtn);

    card.appendChild(actions);

    card.addEventListener('click', () => openRecord(record.id));
    return card;
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

    // Local draft / running records pinned above completed MongoDB records.
    const localRecords = state.records
        .filter(r => r.status === STATUS.RUNNING || (r.savedByUser && r.status === STATUS.DRAFT))
        .filter(r => !term || (r.form?.productDescription || '').toLowerCase().includes(term));

    container.innerHTML = '';
    if (localRecords.length === 0 && filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No LCA records yet.</p>
            </div>`;
        return;
    }
    localRecords.forEach(r => container.appendChild(createLocalDraftCard(r)));
    filtered.forEach(record => container.appendChild(createHistoryCard(record)));
}

function createHistoryCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card record-card--row';
    card.title = 'Click to view full details';

    const date    = new Date(record.timestamp);
    const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const sourceKey = record.source ? String(record.source).toLowerCase() : 'chat';
    const sourceLabel = sourceKey === 'workbench' ? 'WORKBENCH' : 'FULL LCA PROCESS';
    const sourceBadgeClass = sourceKey === 'workbench'
        ? 'hist-source-badge hist-source-badge--workbench'
        : 'hist-source-badge hist-source-badge--full-lca';
    const fuAmount = record.form?.functionalUnitAmount || '';

    const fuUnit = record.form?.functionalUnitUnit || '';
    const fuText = `${fuAmount} ${fuUnit}`.trim();
    const boundary = record.form?.systemBoundary || '';
    const processCount = Array.isArray(record.data?.processes) ? record.data.processes.length : 0;

    const metaParts = [];
    if (fuText) metaParts.push(`FU: ${window.LciaUtils.escapeHtml(fuText)}`);
    if (boundary) metaParts.push(`Boundary: ${window.LciaUtils.escapeHtml(boundary)}`);
    if (processCount > 0) metaParts.push(`${processCount} process${processCount !== 1 ? 'es' : ''}`);

    const info = document.createElement('div');
    info.className = 'record-info';
    info.innerHTML = `
        <div class="record-product">
            ${window.LciaUtils.escapeHtml(record.product)}
                <span class="${sourceBadgeClass}">${window.LciaUtils.escapeHtml(sourceLabel)}</span>

        </div>
        <div class="record-row-meta">${metaParts.join(' &nbsp;·&nbsp; ') || 'No metadata available'}</div>
        <div class="record-row-impact">Total: ${window.LciaUtils.toNumber(record.carbonEmission).toFixed(1)} kg CO<sub>2</sub>-eq</div>`;

    card.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'record-actions record-actions--row';
    actions.innerHTML = `<span class="record-date">${dateStr} at ${timeStr}</span>`;

    const deleteBtn = document.createElement('button');

    deleteBtn.className = 'btn-small delete';
    deleteBtn.textContent = 'Delete';

    deleteBtn.addEventListener('click',   e => { e.stopPropagation(); deleteBackendRecord(record.id); });

    actions.appendChild(deleteBtn);

    card.appendChild(actions);

    card.addEventListener('click', () => openBackendResultsInTab(record));
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

    _seedScopeReportFromRecord(record);

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

    if (subtitleEl && record.source) {
    subtitleEl.textContent += `  •  Source: ${window.LciaUtils.escapeHtml(String(record.source).toLowerCase())}`;
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
        const answerTitle = document.createElement('h3');
        answerTitle.className = 'detail-section-title';
        answerTitle.textContent = "Sustainopedia's Response";
        answerSection.appendChild(answerTitle);
        const answerEl = document.createElement('div');
        answerSection.appendChild(answerEl);
        if (window.markdownit) {
            const md = window.markdownit({ html: false, breaks: true, linkify: true });
            md.core.ruler.push('sanitize_links', state => {
                state.tokens.forEach(tok => {
                    if (tok.type === 'inline' && tok.children) {
                        tok.children.forEach(child => {
                            if (child.type === 'link_open') {
                                const href = child.attrGet('href') || '';
                                if (/^javascript:|^data:/i.test(href.trim())) child.attrSet('href', '#');
                            }
                        });
                    }
                });
            });
            answerEl.className = 'detail-answer-text bot-message-prose';
            answerEl.innerHTML = md.render(record.answerText);
        } else {
            answerEl.className = 'detail-answer-text';
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

    const scopeSection = buildScopeClassificationSection(record);
    if (scopeSection) body.appendChild(scopeSection);

    const footer = document.createElement('div');

    footer.className = 'detail-footer';
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
    if (md) {
        md.core.ruler.push('sanitize_links', state => {
            state.tokens.forEach(tok => {
                if (tok.type === 'inline' && tok.children) {
                    tok.children.forEach(child => {
                        if (child.type === 'link_open') {
                            const href = child.attrGet('href') || '';
                            if (/^javascript:|^data:/i.test(href.trim())) child.attrSet('href', '#');
                        }
                    });
                }
            });
        });
    }

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

    const REGION_LABELS = {
        'GLO': 'Global (GLO)',
        'RER': 'Europe (RER)',
        'WEU': 'Western Europe (WEU)',
        'EEU': 'Eastern Europe (EEU)',
        'MEA': 'Middle East & Africa (MEA)',
        'ASI': 'Asia (ASI)',
        'NAM': 'North America (NAM)',
        'SAM': 'South America (SAM)',
        'CN':  'China (CN)',
        'US':  'United States (US)',
        'CH':  'Switzerland (CH)',
        'BR':  'Brazil (BR)',
        'IN':  'India (IN)',
        'RoW': 'Rest of World (RoW)'
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
                { label: 'Manufacturing Location', value: REGION_LABELS[f.manufacturingLocation] || formatStructuredValue(f.manufacturingLocation) }
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

function _collectScopeActivities(record) {
    const processes = Array.isArray(record?.data?.processes) ? record.data.processes : [];
    return processes.map((p, idx) => {
        const name = String(p.process || p.name || p.matched_activity || `Process ${idx + 1}`).trim();
        return {
            id: `${idx}::${name}`,
            process: name,
            mean_impact: window.LciaUtils.toNumber(p.mean_impact ?? p.impact),
            amount_location: p.amount_location || '',
            unit_location: p.unit_location || '',
            ref_product: p.ref_product || '',
            percentile: p.percentile || ''
        };
    }).filter(a => a.process);
}

function _initializeScopeState(recordId, activities, persistedReport = null) {
    const prev = scopeReportStateByRecordId.get(recordId) || { assignments: {}, latestReport: null };
    const assignments = {};
    activities.forEach(a => {
        const prior = prev.assignments?.[a.id];
        assignments[a.id] = SCOPE_KEYS.includes(prior) ? prior : '';
    });
    const next = { assignments, latestReport: prev.latestReport || persistedReport || null };
    scopeReportStateByRecordId.set(recordId, next);
    return next;
}

async function _downloadScopePdf(report, record, triggerBtn = null) {
    if (!report) return;

    const originalText = triggerBtn?.textContent || '';
    if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.textContent = 'Generating PDF...';
    }

    try {
        const resp = await fetch(`${FLASK_BASE}/api/esg/scope-report/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                report,
                product: record?.product || report?.preview?.product || 'scope_report',
                company_name: record?.company || report?.preview?.company_name || 'Reporting Entity',
                system_boundary: record?.form?.systemBoundary || report?.preview?.system_boundary || 'N/A'
            })
        });

        if (!resp.ok) {
            const errorBody = await resp.json().catch(() => ({}));
            throw new Error(errorBody?.error || 'Failed to generate PDF report');
        }

        const blob = await resp.blob();
        const safeBase = String(record?.product || report?.preview?.product || 'scope_report')
            .replace(/[^a-z0-9._-]+/gi, '_')
            .replace(/^[_\.]+|[_\.]+$/g, '') || 'scope_report';

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${safeBase}_${record?.id || Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (err) {
        console.error('Scope PDF download failed:', err);
        alert(`Failed to download PDF report: ${err.message || 'Unknown error'}`);
    } finally {
        if (triggerBtn) {
            triggerBtn.disabled = false;
            triggerBtn.textContent = originalText || 'Download PDF';
        }
    }
}

function _seedScopeReportFromRecord(record) {
    if (!record?.id) return;
    const persisted = (record.scopeReport && typeof record.scopeReport === 'object') ? record.scopeReport : null;
    if (!persisted?.latex) return;

    const prev = scopeReportStateByRecordId.get(record.id) || { assignments: {}, latestReport: null };
    if (!prev.latestReport) {
        prev.latestReport = persisted;
        scopeReportStateByRecordId.set(record.id, prev);
    }
}

async function _persistScopeReportForRecord(recordId, scopeReport) {
    if (!recordId || !scopeReport?.latex) return null;

    const token = localStorage.getItem('token');
    const resp = await fetch(`/api/lca-records/${encodeURIComponent(recordId)}/scope-report`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ scopeReport })
    });

    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        throw new Error(body?.message || 'Failed to save scope report');
    }

    return body?.scopeReport || scopeReport;
}

const SCOPE_LOCATION_DISPLAY_MAP = {
    GLO: 'Global (GLO)',
    RER: 'Europe (RER)',
    WEU: 'Western Europe (WEU)',
    EEU: 'Eastern Europe (EEU)',
    MEA: 'Middle East & Africa (MEA)',
    ASI: 'Asia (ASI)',
    NAM: 'North America (NAM)',
    SAM: 'South America (SAM)',
    CN: 'China (CN)',
    US: 'United States (US)',
    CH: 'Switzerland (CH)',
    BR: 'Brazil (BR)',
    IN: 'India (IN)',
    RoW: 'Rest of World (RoW)'
};

const SCOPE_LOCATION_CODES = Object.keys(SCOPE_LOCATION_DISPLAY_MAP).sort((a, b) => b.length - a.length);

function _cleanScopeActivityName(value, fallback = 'Activity') {
    const raw = String(value || fallback).trim();
    const cleaned = raw.replace(/^\s*Process\s*\d+\s*:\s*/i, '').trim();
    return cleaned || fallback;
}

function _extractScopeLocationCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    for (const code of SCOPE_LOCATION_CODES) {
        const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(`(?:\\(\\s*${escaped}\\s*\\)|(?:[\\/|,]|\\s+-\\s+|\\s+)${escaped})\\s*$`, 'i');
        if (rx.test(raw)) return code;
        if (raw.toLowerCase() === code.toLowerCase()) return code;
    }

    return '';
}

function _expandScopeLocation(value) {
    const code = _extractScopeLocationCode(value);
    if (!code) return String(value || '').trim();
    return SCOPE_LOCATION_DISPLAY_MAP[code] || code;
}

function _parseScopeAmountAndLocation(activity) {
    const rawAmountLocation = String(activity?.amount_location || '').trim();
    const rawUnitLocation = String(activity?.unit_location || '').trim();

    const locationCode = _extractScopeLocationCode(rawAmountLocation) || _extractScopeLocationCode(rawUnitLocation);

    let amount = rawAmountLocation;
    if (locationCode && rawAmountLocation) {
        const escaped = locationCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        amount = amount
            .replace(new RegExp(`\\(\\s*${escaped}\\s*\\)\\s*$`, 'i'), '')
            .replace(new RegExp(`(?:[\\/|,]|\\s+-\\s+)\\s*${escaped}\\s*$`, 'i'), '')
            .trim();
    }

    const location = locationCode
        ? (SCOPE_LOCATION_DISPLAY_MAP[locationCode] || locationCode)
        : (_expandScopeLocation(rawUnitLocation) || '-');

    return {
        amount: amount || rawAmountLocation || '-',
        location: location || '-'
    };
}

function openScopeReportPreview(report, record) {
    if (!report) return;
    document.getElementById('scopeReportPreviewOverlay')?.remove();

    const preview = report.preview || {};
    const sections = Array.isArray(preview.sections) ? preview.sections : [];

    const sectionHtml = sections.map(sec => {
        const acts = Array.isArray(sec.activities) ? sec.activities : [];
        const rows = acts.map(a => {
            const parsed = _parseScopeAmountAndLocation(a);
            return `
            <tr>
                <td>${window.LciaUtils.escapeHtml(_cleanScopeActivityName(a.process || a.name || 'Activity'))}</td>
                <td>${window.LciaUtils.escapeHtml(parsed.amount)}</td>
                <td>${window.LciaUtils.escapeHtml(parsed.location)}</td>
                <td>${window.LciaUtils.toNumber(a.mean_impact).toFixed(1)}</td>
            </tr>`;
        }).join('');

        return `
            <section class="scope-doc-section">
                <h3>${window.LciaUtils.escapeHtml(sec.label || sec.scope || '')}</h3>
                <p><strong>Reported total:</strong> ${window.LciaUtils.toNumber(sec.total_kg_co2eq).toFixed(3)} kg CO<sub>2</sub>-eq</p>
                <p>${window.LciaUtils.escapeHtml(sec.paragraph || '').replace(/\n/g, '<br>')}</p>
                <table class="scope-doc-table">
                    <thead>
                        <tr><th>Activity</th><th>Amount</th><th>Location</th><th>Mean Impact (kg CO<sub>2</sub>-eq)</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </section>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'scopeReportPreviewOverlay';
    overlay.className = 'scope-report-preview-overlay';
    overlay.innerHTML = `
        <div class="scope-report-preview-shell">
            <div class="scope-report-preview-toolbar">
                <button type="button" class="btn-small download" id="scopePreviewDownloadBtn">Download PDF</button>
                <button type="button" class="btn-small delete" id="scopePreviewCloseBtn">Close Preview</button>
            </div>
            <article class="scope-report-paper">
                <h1>ESG Scope Emissions Report</h1>
                <p><strong>Product:</strong> ${window.LciaUtils.escapeHtml(preview.product || record?.product || 'N/A')}</p>
                <p><strong>System boundary:</strong> ${window.LciaUtils.escapeHtml(preview.system_boundary || record?.form?.systemBoundary || 'N/A')}</p>
                <p><strong>Total reported emissions:</strong> ${window.LciaUtils.toNumber(preview.total_kg_co2eq).toFixed(3)} kg CO<sub>2</sub>-eq</p>
                ${sectionHtml}
            </article>
        </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#scopePreviewCloseBtn')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#scopePreviewDownloadBtn')?.addEventListener('click', (e) => _downloadScopePdf(report, record, e.currentTarget));
}

function buildScopeClassificationSection(record) {
    const activities = _collectScopeActivities(record);

    const section = document.createElement('section');
    section.className = 'detail-section scope-report-section';
    section.innerHTML = `
        <h3 class="detail-section-title">ESG Scope Classification (Scope 1 / 2 / 3)</h3>`;

    if (!activities.length) {
        const empty = document.createElement('p');
        empty.className = 'scope-report-empty';
        empty.textContent = 'No activity-level LCIA data is available for scope classification.';
        section.appendChild(empty);
        return section;
    }

    const persistedScopeReport = (record.scopeReport && typeof record.scopeReport === 'object') ? record.scopeReport : null;
    const stateForRecord = _initializeScopeState(record.id, activities, persistedScopeReport);

    const summary = document.createElement('div');
    summary.className = 'scope-report-summary';
    section.appendChild(summary);

    const board = document.createElement('div');
    board.className = 'scope-board-grid';
    section.appendChild(board);

    const actions = document.createElement('div');
    actions.className = 'scope-report-actions';
    actions.innerHTML = `
        <div class="scope-report-status" id="scopeReportStatus-${record.id}"></div>
        <div class="scope-report-btns">
            <button type="button" class="btn-small view" id="scopeGenerateBtn-${record.id}">Generate Report</button>
            <button type="button" class="btn-small download" id="scopeOpenBtn-${record.id}" ${stateForRecord.latestReport ? '' : 'hidden'}>Open Report Preview</button>
        </div>`;
    section.appendChild(actions);

    const statusEl = actions.querySelector(`#scopeReportStatus-${record.id}`);
    const generateBtn = actions.querySelector(`#scopeGenerateBtn-${record.id}`);
    const openBtn = actions.querySelector(`#scopeOpenBtn-${record.id}`);

    const dragState = { activityId: '' };
    const columns = {
        unassigned: { label: 'Unassigned' },
        scope1: { label: 'Scope 1' },
        scope2: { label: 'Scope 2' },
        scope3: { label: 'Scope 3' }
    };

    function createCard(activity) {
        const card = document.createElement('article');
        card.className = 'scope-activity-card';
        card.draggable = true;
        card.dataset.activityId = activity.id;
        card.innerHTML = `
            <div class="scope-activity-name">${window.LciaUtils.escapeHtml(activity.process)}</div>
            <div class="scope-activity-meta">${window.LciaUtils.escapeHtml(activity.amount_location || 'No amount/location provided')}</div>
            <div class="scope-activity-impact">${window.LciaUtils.toNumber(activity.mean_impact).toFixed(2)} kg CO₂-eq</div>
            <div class="scope-quick-actions">
                <button type="button" data-scope="scope1">S1</button>
                <button type="button" data-scope="scope2">S2</button>
                <button type="button" data-scope="scope3">S3</button>
            </div>`;

        card.addEventListener('dragstart', e => {
            dragState.activityId = activity.id;
            card.classList.add('dragging');
            e.dataTransfer?.setData('text/plain', activity.id);
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));

        card.querySelectorAll('.scope-quick-actions button').forEach(btn => {
            btn.addEventListener('click', () => {
                stateForRecord.assignments[activity.id] = btn.dataset.scope || '';
                renderBoard();
            });
        });

        return card;
    }

    function createColumn(scopeKey, label) {
        const col = document.createElement('section');
        col.className = 'scope-drop-column';
        col.dataset.scope = scopeKey;
        col.innerHTML = `
            <header class="scope-drop-column-head">
                <span>${window.LciaUtils.escapeHtml(label)}</span>
                <span class="scope-drop-column-count" data-count-for="${scopeKey}">0</span>
            </header>
            <div class="scope-card-list" data-list-for="${scopeKey}"></div>`;

        col.addEventListener('dragover', e => {
            e.preventDefault();
            col.classList.add('scope-drop-column--active');
        });
        col.addEventListener('dragleave', () => col.classList.remove('scope-drop-column--active'));
        col.addEventListener('drop', e => {
            e.preventDefault();
            col.classList.remove('scope-drop-column--active');
            const dragged = e.dataTransfer?.getData('text/plain') || dragState.activityId;
            if (!dragged) return;
            stateForRecord.assignments[dragged] = scopeKey === 'unassigned' ? '' : scopeKey;
            renderBoard();
        });

        return col;
    }

    Object.entries(columns).forEach(([key, value]) => board.appendChild(createColumn(key, value.label)));

    function renderBoard() {
        const buckets = { unassigned: [], scope1: [], scope2: [], scope3: [] };
        activities.forEach(activity => {
            const scope = stateForRecord.assignments[activity.id];
            if (SCOPE_KEYS.includes(scope)) buckets[scope].push(activity);
            else buckets.unassigned.push(activity);
        });

        Object.keys(buckets).forEach(scopeKey => {
            const listEl = board.querySelector(`[data-list-for="${scopeKey}"]`);
            const countEl = board.querySelector(`[data-count-for="${scopeKey}"]`);
            if (!listEl || !countEl) return;
            listEl.innerHTML = '';
            buckets[scopeKey].forEach(a => listEl.appendChild(createCard(a)));
            if (!buckets[scopeKey].length) {
                const hint = document.createElement('div');
                hint.className = 'scope-card-empty';
                hint.textContent = scopeKey === 'unassigned' ? 'Drag card here to unassign' : 'Drop activity here';
                listEl.appendChild(hint);
            }
            countEl.textContent = String(buckets[scopeKey].length);
        });

        const totals = SCOPE_KEYS.map(scope => {
            const total = buckets[scope].reduce((sum, a) => sum + window.LciaUtils.toNumber(a.mean_impact), 0);
            return `${scope.toUpperCase()}: ${total.toFixed(2)} kg CO₂-eq`;
        });

        summary.innerHTML = `<div><strong>Assigned:</strong> ${activities.length - buckets.unassigned.length}/${activities.length}</div><div>${totals.join(' &nbsp;•&nbsp; ')}</div>`;

        const ready = buckets.unassigned.length === 0;
        generateBtn.disabled = !ready;
        statusEl.textContent = ready
            ? 'Ready to generate report.'
            : `Please assign ${buckets.unassigned.length} remaining activit${buckets.unassigned.length === 1 ? 'y' : 'ies'}.`;
    }

    generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        const originalText = generateBtn.textContent;
        generateBtn.textContent = 'Generating...';
        statusEl.textContent = 'Generating scope report...';

        const grouped = { scope1: [], scope2: [], scope3: [] };
        activities.forEach(a => {
            const scope = stateForRecord.assignments[a.id];
            if (SCOPE_KEYS.includes(scope)) grouped[scope].push(a);
        });

        try {
            const resp = await fetch(`${FLASK_BASE}/api/esg/scope-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product: record.product,
                    form: record.form || {},
                    system_boundary: record.form?.systemBoundary || record.intentParams?.system_boundary || 'cradle-to-gate',
                    scope_assignments: grouped
                })
            });

            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data?.error || 'Failed to generate report');
            }

                        stateForRecord.latestReport = data;
            scopeReportStateByRecordId.set(record.id, stateForRecord);

            try {
                const persisted = await _persistScopeReportForRecord(record.id || record._id, data);
                if (persisted?.latex) {
                    stateForRecord.latestReport = persisted;
                    scopeReportStateByRecordId.set(record.id, stateForRecord);
                    record.scopeReport = persisted;
                }
                statusEl.textContent = 'Report generated and saved successfully. Click "Open Report Preview" to view it.';
            } catch (persistErr) {
                console.error('Scope report persistence failed:', persistErr);
                statusEl.textContent = `Report generated, but failed to save to database: ${persistErr.message || 'Unknown error'}`;
            }

            openBtn.hidden = false;
        } catch (err) {
            console.error('Scope report generation failed:', err);
            statusEl.textContent = `Report generation failed: ${err.message || 'Unknown error'}`;
        } finally {
            generateBtn.textContent = originalText;
            renderBoard();
        }
    });

    openBtn.addEventListener('click', () => {
        if (!stateForRecord.latestReport) return;
        openScopeReportPreview(stateForRecord.latestReport, record);
    });

    renderBoard();
    return section;
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

async function deleteDraftRecord(recordId) {
    const idx = state.records.findIndex(r => r.id === recordId);
    if (idx < 0) return;

    const record = state.records[idx];
    const isRunning = record.status === STATUS.RUNNING;
    const ok = confirm(isRunning
        ? 'This draft is still generating. Delete it and stop tracking this run?'
        : 'Are you sure you want to delete this draft?');
    if (!ok) return;

    if (isRunning && record.jobId) {
        try {
            await fetch(`${FLASK_BASE}/api/jobs/${record.jobId}`, { method: 'DELETE' });
        } catch (err) {
            console.warn('Failed to cancel background draft job before deletion:', err);
        }
    }

    state.records.splice(idx, 1);
    if (state.activeRecordId === recordId) {
        state.activeRecordId = null;
    }
    persistState();

    await loadBackendHistory();
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

function formatStructuredValue(raw, fallback = 'Not Specified') {
    const text = String(raw || '').trim();
    if (text) return text;
    return fallback;
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
        : formatStructuredValue(f.usageRough);

    return [
        'intent: Computation',
        `product: ${formatStructuredValue(f.productDescription)}`,
        `amount: ${amount} ${f.functionalUnitUnit || 'tonne'}`,
        `system_boundary: ${formatStructuredValue(f.systemBoundary, 'cradle-to-gate')}`,
        `n_simulations: ${nSimulations}`,
        `region: ${formatStructuredValue(f.manufacturingLocation)}`,
        `environmental_impact_categories: ${formatStructuredValue(f.impactCategories, 'null')}`,
        `materials: ${formatStructuredValue(f.materials)}`,
        `manufacturing_location: ${formatStructuredValue(f.manufacturingLocation)}`,
        `distribution: ${formatStructuredValue(f.distribution)}`,
        `use_phase: ${usePhase}`,
        `end_of_life: ${formatStructuredValue(f.endOfLife)}`,
        `additional_notes: ${formatStructuredValue(f.furtherNotes, 'null')}`
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

// ─── Form validation ─────────────────────────────────────────────────────────

const _REQUIRED_QUESTIONS = [
    { q: 1,  check: () => !!document.getElementById('q1')?.value.trim()           },
    { q: 2,  check: () => !!document.getElementById('q2-amount')?.value.trim()    },
    { q: 4,  check: () => !!getGroupActiveValue('manufacturingLocationGroup')       },
    { q: 5,  check: () => !!document.getElementById('q5')?.value.trim()           },
    { q: 6,  check: () => !!document.getElementById('q6-lifespan')?.value.trim()
                       || !!document.getElementById('q6-rough')?.value            },
    { q: 10, check: () => !!getGroupActiveValue('monteCarloGroup')                 },
];

function validateForm() {
    return _REQUIRED_QUESTIONS
        .filter(({ check }) => !check())
        .map(({ q }) => q);
}

function _getQuestionCard(qNum) {
    for (const card of document.querySelectorAll('.question-card')) {
        const numEl = card.querySelector('.q-number');
        if (numEl && numEl.textContent.trim() === `${qNum}.`) return card;
    }
    return null;
}

function _markValidationErrors(failingQs) {
    // Clear stale errors first
    document.querySelectorAll('.question-card.lca-field-error').forEach(card => {
        card.classList.remove('lca-field-error');
        card.querySelector('.lca-error-msg')?.remove();
    });
    for (const qNum of failingQs) {
        const card = _getQuestionCard(qNum);
        if (!card) continue;
        card.classList.add('lca-field-error');
        const msg = document.createElement('p');
        msg.className = 'lca-error-msg';
        msg.textContent = 'You are required to provide information for this question.';
        card.appendChild(msg);
    }
}

// Called on every form change — clears error state from cards that now pass.
function _refreshValidationErrors() {
    if (!document.querySelector('.question-card.lca-field-error')) return;
    const failing = new Set(validateForm());
    document.querySelectorAll('.question-card.lca-field-error').forEach(card => {
        const qNum = parseInt(card.querySelector('.q-number')?.textContent);
        if (qNum && !failing.has(qNum)) {
            card.classList.remove('lca-field-error');
            card.querySelector('.lca-error-msg')?.remove();
        }
    });
}

// ─── Generate / Stop button helpers ──────────────────────────────────────────────

// Switch the Generate button between idle (green submit) and running (red cancel).
function _setBtnState(btn, mode) {
    if (!btn) btn = document.getElementById('generateBtn');
    if (!btn) return;
    if (mode === 'running') {
        btn.type = 'button'; // prevent accidental form re-submit
        btn.classList.add('lca-cancel-mode');
        btn.textContent = 'Stop Generation';
        btn.disabled = false;
    } else {
        if (_cancelClickHandler) {
            btn.removeEventListener('click', _cancelClickHandler);
            _cancelClickHandler = null;
        }
        btn.type = 'submit';
        btn.classList.remove('lca-cancel-mode');
        btn.textContent = 'Generate Result';
        btn.disabled = false;
    }
}

// Send a DELETE request to the backend to abort the job, then reset the UI.
async function _cancelCurrentJob(jobId) {
    const btn = document.getElementById('generateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Stopping…'; }

    _stopLcaPolling();

    const record = getActiveRecord();
    if (record) {
        record.status = STATUS.DRAFT;
        record.jobId  = null;
        saveActiveRecord();
    }

    try {
        await fetch(`${FLASK_BASE}/api/jobs/${jobId}`, { method: 'DELETE' });
    } catch (err) {
        console.warn('[LCA] Cancel request failed (network):', err.message);
    }

    appendLog('Generation cancelled by user.', 'warning');
    _setBtnState(btn, 'idle');
}

function collectAndSaveForm() {
    const record = getActiveRecord();
    if (!record) return;
    record.form = readForm();
    record.updatedAt = Date.now();
    saveActiveRecord();
    setWorkspaceTitle(record);
    updateDataQualityUI(record.form);
    _refreshValidationErrors();
}

async function saveDraft() {
    const record = getActiveRecord();
    if (record) { record.savedByUser = true; }
    collectAndSaveForm();
    appendLog('Draft saved.', 'success');
}

async function generateResult(e) {
    e.preventDefault();

    const record = getActiveRecord();
    if (!record) return;

    // Validate required questions before submitting
    const failingQs = validateForm();
    if (failingQs.length > 0) {
        _markValidationErrors(failingQs);
        _getQuestionCard(failingQs[0])?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    collectAndSaveForm();
    record.status    = STATUS.RUNNING;
    record.savedByUser = true;
    saveActiveRecord();

    const btn = document.getElementById('generateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }

    const f        = normalizeForm(record.form);
    const question = buildStructuredLcaQuery(f);

    appendLog('Payload assembled from form data ✔');
    appendLog('Form Input Summary:\n' + question.split('\n').map(line => '- ' + line).join('\n'));
    appendLog('Submitting generation request to backend...');
    appendLog('Average response time is around 15 mins, it will take longer if the no. of Monte Carlo simulations is high. You can safely leave this page and come back later.');

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
        _setBtnState(btn, 'idle');
        return;
    }

    if (!resp.ok) {
        let errText = `Server error ${resp.status}`;
        try { const errJson = await resp.json(); errText = errJson.error || errText; } catch {}
        record.status = STATUS.DRAFT;
        saveActiveRecord();
        appendLog(`Generation failed: ${errText}`, 'error');
        _setBtnState(btn, 'idle');
        return;
    }

    const { jobId } = await resp.json();
    record.jobId = jobId;
    record.backendLogOffset = 0;
    saveActiveRecord();
    appendLog(`Backend job accepted (jobId: ${jobId}). Polling for result...`);

    // Arm the Stop Generation button
    const cancelHandler = () => _cancelCurrentJob(jobId);
    _cancelClickHandler = cancelHandler;
    if (btn) btn.addEventListener('click', cancelHandler);
    _setBtnState(btn, 'running');

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
                _setBtnState(null, 'idle');
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
                _setBtnState(null, 'idle');
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
                    _setBtnState(null, 'idle');
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
        source:         'full_lca',
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
        source:         backendPayload.source,
        timestamp:      new Date().toISOString()

    });

    await loadBackendHistory();
    if (displayRecord) openBackendResultsInTab(displayRecord);

    _setBtnState(null, 'idle');
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
        // Restore the Stop Generation button before polling starts so the user
        // can cancel even if the first poll tick hasn't fired yet.
        const btn = document.getElementById('generateBtn');
        const cancelHandler = () => _cancelCurrentJob(runningRecord.jobId);
        _cancelClickHandler = cancelHandler;
        if (btn) btn.addEventListener('click', cancelHandler);
        _setBtnState(btn, 'running');
        _startLcaPolling(runningRecord.jobId, runningRecord, f, question);
    } else {
        switchMainView('history');
        showWorkspacePanel('form');
    }
}

document.addEventListener('DOMContentLoaded', initializePage);
