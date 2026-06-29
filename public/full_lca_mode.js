// full_lca_mode.js
// Enforces the "new Full LCA workflow": direct form on open.
// - Direct tab entry => always start with a fresh form.
// - Draft re-entry from Past LCA Results => open the selected draft.

document.addEventListener('DOMContentLoaded', () => {
    const formPanel = document.getElementById('workspaceFormPanel');
    const resultsPanel = document.getElementById('workspaceResultsPanel');
    if (formPanel) formPanel.classList.add('active');
    if (resultsPanel) resultsPanel.classList.remove('active');

    if (typeof showWorkspacePanel === 'function') {
        showWorkspacePanel('form');
    }

    const params = new URLSearchParams(window.location.search);
    const draftId = params.get('draftId');

    // Re-open selected draft when routed from Past LCA Results.
    if (draftId && typeof openRecord === 'function' && typeof getActiveRecord === 'function') {
        openRecord(draftId);
        const opened = getActiveRecord();
        if (opened && opened.id === draftId) {
            return;
        }
    }

    // Default behavior for Full LCA tab: always start a brand-new form.
    if (typeof addNewRecord === 'function') {
        addNewRecord();
    }
});
