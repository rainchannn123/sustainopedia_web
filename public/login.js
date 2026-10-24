// Public login logic

// If a valid (non-expired) token is already stored, skip the login page entirely.
(function redirectIfAuthenticated() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && Date.now() / 1000 < payload.exp) {
            window.location.replace('/index.html');
        }
    } catch {  }
})();

const loginForm = document.getElementById('loginForm');

const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
// const loginLoading = document.getElementById('loginLoading');

// Determine API endpoint
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : window.location.origin;

function showError(element, message) {
    element.textContent = message;
    element.classList.add('show');
}

function hideError(element) {
    element.classList.remove('show');
}

// Login Form Submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();

    if (!username || !password) {
        showError(loginError, 'Please enter username and password');
        return;
    }

    hideError(loginError);
    // loginLoading.classList.add('show');
    // loginLoading.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showError(loginError, data.message || 'Login failed. Please try again.');
            return;
        }

        // Store token and user data
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('username', data.username);
        
        // Signal to index.html that the user just logged in
        sessionStorage.setItem('justLoggedIn', '1');
        // Redirect to main app
        window.location.href = '/index.html';
    } catch (error) {
        console.error('Login error:', error);
        showError(loginError, 'Connection error. Please try again.');
    } finally {
        // loginLoading.style.display = 'none';
        // loginLoading.classList.remove('show');
    }
});

// Check if already logged in
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/index.html';
    }
});

