// Map Event Handlers
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

function initializeEventListeners() {
    console.log('Initializing event listeners...');
    
    // Point selection buttons
    const selectStartBtn = document.getElementById('selectStartBtn');
    const selectEndBtn = document.getElementById('selectEndBtn');
    const clearPointsBtn = document.getElementById('clearPointsBtn');
    
    if (selectStartBtn) {
        selectStartBtn.addEventListener('click', function() {
            window.selectingStart = true;
            window.selectingEnd = false;
            updateSelectionUI();
            showNotification('Click on the map to set start point', 'info');
        });
    }
    
    if (selectEndBtn) {
        selectEndBtn.addEventListener('click', function() {
            window.selectingEnd = true;
            window.selectingStart = false;
            updateSelectionUI();
            showNotification('Click on the map to set end point', 'info');
        });
    }
    
    if (clearPointsBtn) {
        clearPointsBtn.addEventListener('click', clearAll);
    }
    
    // Route finding button
    const findRoutesBtn = document.getElementById('findRoutesBtn');
    if (findRoutesBtn) {
        findRoutesBtn.addEventListener('click', findRoutes);
    }
    
    // Congestion controls
    const timeInput = document.getElementById('timeInput');
    const dayTypeSelect = document.getElementById('dayType');
    
    if (timeInput) {
        timeInput.addEventListener('change', updateCongestionOverlay);
    }
    
    if (dayTypeSelect) {
        dayTypeSelect.addEventListener('change', updateCongestionOverlay);
    }
    
    // Analytics buttons
    const statsBtn = document.getElementById('statsBtn');
    const speedBtn = document.getElementById('speedBtn');
    const predictionsBtn = document.getElementById('predictionsBtn');
    const patternsBtn = document.getElementById('patternsBtn');
    const analyticsBtn = document.getElementById('analyticsBtn');
    const downloadTrafficBtn = document.getElementById('downloadTrafficBtn');
    const downloadRouteBtn = document.getElementById('downloadRouteBtn');
    
    if (statsBtn) statsBtn.addEventListener('click', showStats);
    if (speedBtn) speedBtn.addEventListener('click', showSpeedCongestionChart);
    if (predictionsBtn) predictionsBtn.addEventListener('click', showTrafficPredictions);
    if (patternsBtn) patternsBtn.addEventListener('click', showPatternAnalysis);
    if (analyticsBtn) analyticsBtn.addEventListener('click', showAnalyticsDashboard);
    if (downloadTrafficBtn) downloadTrafficBtn.addEventListener('click', downloadTrafficData);
    if (downloadRouteBtn) downloadRouteBtn.addEventListener('click', downloadRouteData);
    
    // Settings and other buttons
    const settingsBtn = document.getElementById('settingsBtn');
    const tutorialBtn = document.getElementById('tutorialBtn');
    const tipsBtn = document.getElementById('tipsBtn');
    
    if (settingsBtn) settingsBtn.addEventListener('click', showSettings);
    if (tutorialBtn) tutorialBtn.addEventListener('click', showTutorial);
    if (tipsBtn) tipsBtn.addEventListener('click', showTips);
    
    // Modal close buttons
    const closeButtons = document.querySelectorAll('.close-modal, .modal-close');
    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    console.log('Event listeners initialized');
}

// Settings modal
function showSettings() {
    showModal('settingsModal');
}

// Tutorial modal
function showTutorial() {
    showModal('tutorialModal');
}

// Tips modal
function showTips() {
    showModal('tipsModal');
}

// Analytics dashboard
function showAnalyticsDashboard() {
    showModal('analyticsModal');
}

// Modal helper functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    } else {
        console.error('Modal not found:', modalId);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Loading indicators
function showLoading() {
    // Create or show loading indicator
    let loading = document.getElementById('loadingIndicator');
    if (!loading) {
        loading = document.createElement('div');
        loading.id = 'loadingIndicator';
        loading.innerHTML = `
            <div class="loading-overlay">
                <div class="loading-spinner"></div>
                <p>Loading...</p>
            </div>
        `;
        document.body.appendChild(loading);
    }
    loading.style.display = 'flex';
}

function hideLoading() {
    const loading = document.getElementById('loadingIndicator');
    if (loading) {
        loading.style.display = 'none';
    }
}

// Utility function to calculate speed based on congestion
function calculateSpeed(congestion) {
    // Simple speed calculation based on congestion
    const maxSpeed = 60; // km/h
    return maxSpeed * (1 - congestion / 100);
}

// Initialize global variables
window.selectingStart = false;
window.selectingEnd = false;
window.startPoint = null;
window.endPoint = null;
window.map = null;