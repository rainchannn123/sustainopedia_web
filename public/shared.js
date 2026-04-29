// shared.js — Loaded on every authenticated page before page-specific scripts.
// Provides globals: checkAuth(), apiReq()
// Also wires up the common header (username display, user dropdown, logout).

// Decode a JWT payload without a library (verification happens server-side).
function _jwtExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp ? Date.now() / 1000 > payload.exp : false;
    } catch {
        return true; // malformed token — treat as expired
    }
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token || !localStorage.getItem('username')) {
        window.location.href = '/welcome.html';
        return false;
    }
    if (_jwtExpired(token)) {
        ['token', 'userId', 'username', 'email'].forEach(k => localStorage.removeItem(k));
        window.location.href = '/welcome.html';
        return false;
    }
    return true;
}

async function apiReq(method, url, body) {
    const token = localStorage.getItem('token');
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) { window.location.href = '/welcome.html'; throw new Error('Unauthorized'); }
    return res.json();
}

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

    const username = localStorage.getItem('username');
    const usernameEl      = document.getElementById('username');
    const topbarUsernameEl = document.getElementById('topbarUsername');
    const navUsernameEl   = document.getElementById('navUsername');
    const userAvatar      = document.querySelector('.user-avatar');
    const userDropdown    = document.getElementById('userDropdown');
    const logoutBtn       = document.getElementById('logoutBtn');

    if (usernameEl) usernameEl.textContent = username;
    if (topbarUsernameEl) topbarUsernameEl.textContent = 'User: ' + username;
    if (navUsernameEl) navUsernameEl.textContent = 'Beta user: ' + username;

    if (userAvatar && userDropdown) {
        userAvatar.addEventListener('click', () => userDropdown.classList.toggle('show'));
        document.addEventListener('click', (e) => {
            if (!userAvatar.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('username');
            localStorage.removeItem('email');
            window.location.href = '/login.html';
        });
    }

    // ── Mobile navigation ────────────────────────────────────────────────────
    const leftNav = document.querySelector('.left-nav');
    const menuBtn = document.getElementById('mobileMenuBtn');

    if (menuBtn && leftNav) {
        // Inject semi-transparent overlay that closes the nav when tapped
        const overlay = document.createElement('div');
        overlay.className = 'mobile-nav-overlay';
        document.body.appendChild(overlay);

        const closeNav = () => document.body.classList.remove('nav-open');
        menuBtn.addEventListener('click', () => document.body.classList.add('nav-open'));
        overlay.addEventListener('click', closeNav);
        leftNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNav));
    }

    // ── Dark mode toggle ─────────────────────────────────────────────────────
    const darkModeBtn = document.getElementById('darkModeBtn');
    if (darkModeBtn) {
        darkModeBtn.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark-mode');
            localStorage.setItem('darkMode', isDark);
        });
    }
});
