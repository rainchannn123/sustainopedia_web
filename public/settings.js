// settings.js — Settings page logic. Depends on shared.js (apiReq global).

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) return;

    const username = localStorage.getItem('username');
    const settingsUsername = document.getElementById('settingsUsername');
    const settingsEmail    = document.getElementById('settingsEmail');

    if (settingsUsername) settingsUsername.textContent = username;
    if (settingsEmail)    settingsEmail.textContent    = localStorage.getItem('email') || 'Not set';

    const exportDataBtn = document.getElementById('exportDataBtn');
    const clearDataBtn  = document.getElementById('clearDataBtn');

    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', async () => {
            try {
                const [chatHistories, lcaRecords] = await Promise.all([
                    apiReq('GET', '/api/chat-histories'),
                    apiReq('GET', '/api/lca-records')
                ]);
                const blob = new Blob(
                    [JSON.stringify({ chatHistories, lcaRecords, exportDate: new Date().toISOString(), username }, null, 2)],
                    { type: 'application/json' }
                );
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `sustainopedia-export-${Date.now()}.json`;
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (err) {
                console.error('Export failed:', err);
                alert('Export failed. Please try again.');
            }
        });
    }

    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to permanently delete ALL your conversations and LCA records? This cannot be undone.')) return;
            try {
                await Promise.all([
                    apiReq('DELETE', '/api/chat-histories'),
                    apiReq('DELETE', '/api/lca-records')
                ]);
                alert('All data deleted successfully.');
            } catch (err) {
                console.error('Clear data failed:', err);
                alert('Failed to delete data. Please try again.');
            }
        });
    }
});
