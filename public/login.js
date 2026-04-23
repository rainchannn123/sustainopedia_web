// Login and Registration Logic

// If a valid (non-expired) token is already stored, skip the login page entirely.
(function redirectIfAuthenticated() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && Date.now() / 1000 < payload.exp) {
            window.location.replace('/index.html');
        }
    } catch { /* malformed token — fall through to login page */ }
})();

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const toggleToRegister = document.getElementById('toggleToRegister');
const toggleToLogin = document.getElementById('toggleToLogin');

const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
// const loginLoading = document.getElementById('loginLoading');

const registerUsername = document.getElementById('registerUsername');
const registerEmail = document.getElementById('registerEmail');
const registerPassword = document.getElementById('registerPassword');
const registerConfirmPassword = document.getElementById('registerConfirmPassword');
const registerError = document.getElementById('registerError');
const registerLoading = document.getElementById('registerLoading');

// Determine API endpoint
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : window.location.origin;

// Form Switching
toggleToRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
    clearErrors();
});

toggleToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.remove('active');
    loginForm.classList.add('active');
    clearErrors();
});

function clearErrors() {
    loginError.classList.remove('show');
    registerError.classList.remove('show');
    loginError.textContent = '';
    registerError.textContent = '';
}

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

// Register Form Submission
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = registerUsername.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value.trim();
    const confirmPassword = registerConfirmPassword.value.trim();

    // Validation
    if (!username || !email || !password || !confirmPassword) {
        showError(registerError, 'All fields are required');
        return;
    }

    if (username.length < 3) {
        showError(registerError, 'Username must be at least 3 characters');
        return;
    }

    if (password.length < 6) {
        showError(registerError, 'Password must be at least 6 characters');
        return;
    }

    if (password !== confirmPassword) {
        showError(registerError, 'Passwords do not match');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showError(registerError, 'Please enter a valid email');
        return;
    }

    hideError(registerError);
    registerLoading.classList.add('show');
    registerLoading.style.display = 'block';

    try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showError(registerError, data.message || 'Registration failed. Please try again.');
            return;
        }

        // Store token and user data
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('username', data.username);

        // Redirect to main app
        window.location.href = '/index.html';
    } catch (error) {
        console.error('Registration error:', error);
        showError(registerError, 'Connection error. Please try again.');
    } finally {
        registerLoading.style.display = 'none';
        registerLoading.classList.remove('show');
    }
});

// Check if already logged in
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/index.html';
    }
});
