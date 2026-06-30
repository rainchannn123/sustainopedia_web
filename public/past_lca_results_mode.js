// past_lca_results_mode.js
// Past LCA Results is history/review only.
// Clicking a draft card should route back to Full LCA form with that draft loaded.

document.addEventListener('DOMContentLoaded', () => {
    // Safety: this page should not expose a "new assessment" action.
    const newBtn = document.getElementById('newLcaBtn');
    if (newBtn) newBtn.remove();

    // Override draft opening behavior from full_lca.js:
    // local draft cards call openRecord(recordId) -> redirect to editable form page.
    const openDraftInFullLca = (recordId) => {
        window.location.href = `/full_lca.html?draftId=${encodeURIComponent(recordId)}`;
    };

    try {
        window.openRecord = openDraftInFullLca;
        // Keep global binding aligned for non-window calls.
        openRecord = openDraftInFullLca;
    } catch {
        // no-op
    }

    const params = new URLSearchParams(window.location.search);
    const requestedRecordId = (params.get('recordId') || '').trim();

    const openRequestedRecord = async () => {
        if (!requestedRecordId) return;
        if (typeof apiReq !== 'function' || typeof openBackendResultsInTab !== 'function') return;

        try {
            const raw = await apiReq('GET', '/api/lca-records');
            const normalized = Array.isArray(raw)
                ? raw.map(window.LciaUtils.normalizeRecord).filter(Boolean)
                : [];

            const record = normalized.find(r => String(r.id || r._id) === requestedRecordId);
            if (!record) return;

            openBackendResultsInTab(record);
            params.delete('recordId');
            const next = params.toString();
            const cleanUrl = `${window.location.pathname}${next ? `?${next}` : ''}`;
            window.history.replaceState({}, '', cleanUrl);
        } catch (err) {
            console.error('Failed to open requested result record:', err);
        }
    };

    // Keep this page focused on the history list view, then open requested record if present.
    setTimeout(async () => {
        if (typeof switchMainView === 'function') {
            switchMainView('history');
        }
        if (typeof loadBackendHistory === 'function') {
            await loadBackendHistory();
        }
        await openRequestedRecord();
    }, 0);
});
