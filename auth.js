document.addEventListener('DOMContentLoaded', function() {
    const loginScreen = document.getElementById('loginScreen');
    const signupScreen = document.getElementById('signupScreen');
    const mainApp = document.getElementById('mainApp');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignupLink = document.getElementById('showSignup');
    const showLoginLink = document.getElementById('showLogin');

    // Toggle between login and signup screens
    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginScreen.style.display = 'none';
        signupScreen.style.display = 'block';
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        signupScreen.style.display = 'none';
        loginScreen.style.display = 'block';
    });

    // Handle signup
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;

        // Simple validation
        if (validateForm(email, password)) {
            // Store user data (in real app, this would be handled by a backend)
            localStorage.setItem('user', JSON.stringify({ name, email }));
            showMainApp();
        }
    });

    // Handle login
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        // Simple validation
        if (validateForm(email, password)) {
            // In a real app, this would verify credentials with a backend
            showMainApp();
        }
    });

    function validateForm(email, password) {
        if (!email || !password) {
            alert('Please fill in all fields');
            return false;
        }
        if (!isValidEmail(email)) {
            alert('Please enter a valid email address');
            return false;
        }
        if (password.length < 6) {
            alert('Password must be at least 6 characters long');
            return false;
        }
        return true;
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function showMainApp() {
        document.getElementById('authScreens').style.display = 'none';
        mainApp.style.display = 'block';
    }

    // Check if user is already logged in
    const user = localStorage.getItem('user');
    if (user) {
        showMainApp();
    }
});
