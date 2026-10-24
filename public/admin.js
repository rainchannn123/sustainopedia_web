'use strict';

const ADMIN_TOKEN_KEY = 'sustainopediaAdminToken';
const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin;

const loginPanel = document.getElementById('adminLoginPanel');
const usersPanel = document.getElementById('adminUsersPanel');
const loginForm = document.getElementById('adminLoginForm');
const loginStatus = document.getElementById('adminLoginStatus');
const createUserForm = document.getElementById('createUserForm');
const createUserStatus = document.getElementById('createUserStatus');

function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('error', isError);
}

function showLogin(message = '') {
    usersPanel.hidden = true;
    loginPanel.hidden = false;
    setStatus(loginStatus, message, Boolean(message));
}

function showUsersPanel(username) {
    loginPanel.hidden = true;
    usersPanel.hidden = false;
    document.getElementById('signedInAdmin').textContent = username;
    setStatus(loginStatus, '');
}

async function adminRequest(url, options = {}) {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...options.headers
        }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            sessionStorage.removeItem(ADMIN_TOKEN_KEY);
            showLogin('Your administrator session has expired. Sign in again.');
        }
        throw new Error(data.message || 'The request failed.');
    }
    return data;
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(loginStatus, 'Signing in...');

    try {
        const response = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('adminUsername').value,
                password: document.getElementById('adminPassword').value
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Sign in failed.');

        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        loginForm.reset();
        showUsersPanel(data.username);
    } catch (error) {
        setStatus(loginStatus, error.message || 'Could not connect to the server.', true);
    } finally {
        button.disabled = false;
    }
});

createUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    if (password !== confirmPassword) {
        setStatus(createUserStatus, 'Passwords do not match.', true);
        return;
    }

    const button = document.getElementById('createUserButton');
    button.disabled = true;
    setStatus(createUserStatus, 'Creating account...');
    try {
        const user = await adminRequest('/api/admin/users', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('newUsername').value,
                email: document.getElementById('newEmail').value,
                password
            })
        });
        createUserForm.reset();
        setStatus(createUserStatus, `Account created for ${user.username} (${user.email}).`);
        document.getElementById('newUsername').focus();
    } catch (error) {
        setStatus(createUserStatus, error.message || 'Could not create the account.', true);
    } finally {
        button.disabled = false;
    }
});

document.getElementById('adminLogoutButton').addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    createUserForm.reset();
    setStatus(createUserStatus, '');
    showLogin();
});

async function restoreAdminSession() {
    if (!sessionStorage.getItem(ADMIN_TOKEN_KEY)) return;
    try {
        const session = await adminRequest('/api/admin/session');
        showUsersPanel(session.username);
    } catch {
        // adminRequest clears expired or invalid sessions and displays the login form.
    }
}

restoreAdminSession();
