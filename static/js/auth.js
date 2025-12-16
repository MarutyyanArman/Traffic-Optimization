/**
 * Authentication Module for Routely
 */

// Current user state
let currentUser = null;

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    initAuthUI();
});

// Check if user is logged in
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/user');
        const data = await response.json();
        
        if (data.success && data.user) {
            currentUser = data.user;
            updateUIForLoggedInUser(data.user);
        } else {
            currentUser = null;
            updateUIForGuest();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        updateUIForGuest();
    }
}

// Initialize auth UI elements
function initAuthUI() {
    // Close modal when clicking outside
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.addEventListener('click', function(e) {
            if (e.target === authModal) {
                closeAuthModal();
            }
        });
    }
    
    // Close modal with escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAuthModal();
        }
    });
}

// Show auth modal
function showAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Switch to correct tab
        if (mode === 'register') {
            switchAuthTab('register');
        } else {
            switchAuthTab('login');
        }
        
        // Focus first input
        setTimeout(() => {
            const firstInput = modal.querySelector('input:not([type="hidden"])');
            if (firstInput) firstInput.focus();
        }, 100);
    }
}

// Close auth modal
function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        // Clear form
        const forms = modal.querySelectorAll('form');
        forms.forEach(form => form.reset());
        
        // Clear errors
        const errors = modal.querySelectorAll('.auth-error');
        errors.forEach(err => err.style.display = 'none');
    }
}

// Switch between login and register tabs
function switchAuthTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (tab === 'login') {
        loginTab?.classList.add('active');
        registerTab?.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginTab?.classList.remove('active');
        registerTab?.classList.add('active');
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

// Handle login form submission
async function handleLogin(event) {
    event.preventDefault();
    
    const form = event.target;
    const email = form.querySelector('#loginEmail').value;
    const password = form.querySelector('#loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUIForLoggedInUser(data.user);
            closeAuthModal();
            if (window.Routely && typeof window.Routely.clearTripHistory === 'function') {
                window.Routely.clearTripHistory();
            }
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = 'Connection error. Please try again.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
}

// Handle register form submission
async function handleRegister(event) {
    event.preventDefault();
    
    const form = event.target;
    const name = form.querySelector('#registerName').value;
    const email = form.querySelector('#registerEmail').value;
    const password = form.querySelector('#registerPassword').value;
    const confirmPassword = form.querySelector('#registerConfirmPassword').value;
    const errorDiv = document.getElementById('registerError');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Validate passwords match
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            updateUIForLoggedInUser(data.user);
            closeAuthModal();
        } else {
            errorDiv.textContent = data.error || 'Registration failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Registration error:', error);
        errorDiv.textContent = 'Connection error. Please try again.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
    }
}

// Handle logout
async function handleLogout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = null;
            updateUIForGuest();
            if (window.Routely && typeof window.Routely.clearTripHistory === 'function') {
                window.Routely.clearTripHistory();
            }
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Update UI for logged in user
function updateUIForLoggedInUser(user) {
    // Hide sign in button, show user profile
    const signInBtn = document.getElementById('signInBtn');
    const userProfile = document.getElementById('userProfileSection');
    const userName = document.getElementById('profileUserName');
    const userId = document.getElementById('profileUserId');
    const userEmail = document.getElementById('profileUserEmail');
    const userAvatarBtn = document.querySelector('.user-avatar-btn');
    
    if (signInBtn) signInBtn.style.display = 'none';
    if (userProfile) userProfile.style.display = 'block';
    if (userName) userName.textContent = user.name;
    if (userId) userId.textContent = 'ID: ' + user.id;
    if (userEmail) userEmail.textContent = user.email;

    if (userAvatarBtn) {
        userAvatarBtn.textContent = String(user.id);
    }
}

// Update UI for guest (not logged in)
function updateUIForGuest() {
    const signInBtn = document.getElementById('signInBtn');
    const userProfile = document.getElementById('userProfileSection');
    
    if (signInBtn) signInBtn.style.display = 'flex';
    if (userProfile) userProfile.style.display = 'none';

    if (window.Routely && typeof window.Routely.clearTripHistory === 'function') {
        window.Routely.clearTripHistory();
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `auth-notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Remove after delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Get current user
function getCurrentUser() {
    return currentUser;
}

// ================== Saved Routes for Homepage ==================

let savedRoutesData = [];

// Show saved routes modal
function showSavedRoutesModal() {
    const modal = document.getElementById('savedRoutesModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        loadSavedRoutesForHomepage();
    }
}

// Close saved routes modal
function closeSavedRoutesModal() {
    const modal = document.getElementById('savedRoutesModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// Load saved routes from server
async function loadSavedRoutesForHomepage() {
    const container = document.getElementById('savedRoutesList');
    if (!container) return;
    
    // Show loading
    container.innerHTML = `
        <div class="loading-routes" style="text-align: center; padding: 40px; color: var(--text-secondary, #94a3b8);">
            <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i>
            <p>Loading saved routes...</p>
        </div>
    `;
    
    try {
        const response = await fetch('/saved-routes');
        const data = await response.json();
        
        if (data.success) {
            savedRoutesData = data.routes;
            displaySavedRoutesHomepage(savedRoutesData);
        } else {
            container.innerHTML = `
                <div class="no-routes-message" style="text-align: center; padding: 40px; color: var(--text-secondary, #94a3b8);">
                    <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p>Failed to load routes</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading saved routes:', error);
        container.innerHTML = `
            <div class="no-routes-message" style="text-align: center; padding: 40px; color: var(--text-secondary, #94a3b8);">
                <i class="fas fa-wifi-slash" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p>Connection error. Please try again.</p>
            </div>
        `;
    }
}

// Display saved routes in the homepage modal
function displaySavedRoutesHomepage(routes) {
    const container = document.getElementById('savedRoutesList');
    if (!container) return;
    
    if (!routes || routes.length === 0) {
        container.innerHTML = `
            <div class="no-routes-message" style="text-align: center; padding: 40px; color: var(--text-secondary, #94a3b8);">
                <i class="fas fa-route" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p style="font-size: 16px; margin-bottom: 8px;">No saved routes yet</p>
                <small>Save your favorite routes from the Map page to access them here</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    routes.forEach(route => {
        const createdDate = new Date(route.created_at).toLocaleDateString();
        const routeTypeIcon = getRouteTypeIconHome(route.type);
        const routeTypeColor = getRouteTypeColorHome(route.type);
        const time = getRouteTimeHome(route);
        const distance = getRouteDistanceHome(route);
        
        html += `
            <div class="saved-route-item" style="background: var(--card-bg-secondary, rgba(0,0,0,0.2)); border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 1px solid var(--border-color, #334155);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="font-size: 20px;">${routeTypeIcon}</span>
                            <span style="font-weight: 600; color: var(--text-primary, #f8fafc);">${route.name}</span>
                        </div>
                        <div style="display: flex; gap: 16px; font-size: 13px; color: var(--text-secondary, #94a3b8);">
                            <span><i class="fas fa-clock"></i> ${time}</span>
                            <span><i class="fas fa-road"></i> ${distance}</span>
                        </div>
                        <div style="margin-top: 8px; font-size: 12px; color: var(--text-muted, #64748b);">
                            <span style="background: ${routeTypeColor}22; color: ${routeTypeColor}; padding: 2px 8px; border-radius: 4px;">${formatRouteTypeHome(route.type)}</span>
                            <span style="margin-left: 8px;">Saved: ${createdDate}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <a href="/map?route=${route.id}" class="route-action-btn" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #3b82f6; color: white; border-radius: 8px; text-decoration: none;" title="Open in Map">
                            <i class="fas fa-map-marker-alt"></i>
                        </a>
                        <button onclick="deleteRouteFromHomepage('${route.id}', '${route.name.replace(/'/g, "\\'")}')" class="route-action-btn" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: none; border-radius: 8px; cursor: pointer;" title="Delete Route">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Pending delete data
let pendingDeleteId = null;
let pendingDeleteName = null;

// Delete route from homepage - show confirmation modal
function deleteRouteFromHomepage(routeId, routeName) {
    pendingDeleteId = routeId;
    pendingDeleteName = routeName;
    
    // Update the message in the modal
    const messageEl = document.getElementById('deleteRouteMessage');
    if (messageEl) {
        messageEl.textContent = `Are you sure you want to delete "${routeName}"?`;
    }
    
    // Show the delete confirmation modal
    const modal = document.getElementById('deleteRouteConfirmModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

// Close delete confirmation modal
function closeDeleteConfirmModal() {
    const modal = document.getElementById('deleteRouteConfirmModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    pendingDeleteId = null;
    pendingDeleteName = null;
}

// Confirm delete route - called when user clicks Delete in modal
async function confirmDeleteRouteFromHomepage() {
    if (!pendingDeleteId) {
        showNotification('No route selected for deletion', 'warning');
        return;
    }
    
    const routeId = pendingDeleteId;
    
    // Close modal
    closeDeleteConfirmModal();
    
    try {
        const response = await fetch(`/delete-route/${routeId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            showNotification('Route deleted successfully', 'success');
            loadSavedRoutesForHomepage(); // Refresh list
        } else {
            showNotification('Failed to delete route: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting route:', error);
        showNotification('Error deleting route', 'error');
    }
}

// Helper functions for route display
function getRouteTypeIconHome(routeType) {
    const icons = {
        'smart_plan': '🧠',
        'fastest': '⚡',
        'shortest': '📏',
        'least_congested': '😌'
    };
    return icons[routeType] || '📍';
}

function getRouteTypeColorHome(routeType) {
    const colors = {
        'smart_plan': '#8b5cf6',
        'fastest': '#2563eb',
        'shortest': '#10b981',
        'least_congested': '#8b5cf6'
    };
    return colors[routeType] || '#64748b';
}

function formatRouteTypeHome(routeType) {
    return routeType.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function getRouteTimeHome(route) {
    if (route.route_data?.optimal_departure_time?.travel_time_min) {
        return route.route_data.optimal_departure_time.travel_time_min.toFixed(1) + ' min';
    } else if (route.route_data?.total_time_min) {
        return route.route_data.total_time_min.toFixed(1) + ' min';
    } else if (route.route_data?.recommended_route?.total_time_min) {
        return route.route_data.recommended_route.total_time_min.toFixed(1) + ' min';
    }
    return 'N/A';
}

function getRouteDistanceHome(route) {
    if (route.route_data?.recommended_route?.total_distance_km) {
        return route.route_data.recommended_route.total_distance_km.toFixed(1) + ' km';
    } else if (route.route_data?.summary?.total_distance_km) {
        return route.route_data.summary.total_distance_km.toFixed(1) + ' km';
    }
    return 'N/A';
}

// Close modals when clicking outside
document.addEventListener('click', function(e) {
    const savedRoutesModal = document.getElementById('savedRoutesModal');
    if (e.target === savedRoutesModal) {
        closeSavedRoutesModal();
    }
    
    const deleteConfirmModal = document.getElementById('deleteRouteConfirmModal');
    if (e.target === deleteConfirmModal) {
        closeDeleteConfirmModal();
    }
});
