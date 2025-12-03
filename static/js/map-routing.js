// Map Routing Functions
let routeLayers = [];
let selectedRoute = null;
let routeOptions = {};

// Initialize routing
function initRouting() {
    console.log('Initializing routing system...');
    routeLayers = [];
    selectedRoute = null;
    routeOptions = {};
}

// Find and display routes
async function findRoutes() {
    if (!window.startPoint || !window.endPoint) {
        alert('Please select both start and end points on the map');
        return;
    }

    try {
        showLoading();
        console.log('Finding routes from:', window.startPoint, 'to:', window.endPoint);

        const response = await fetch('/multi-route', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start: window.startPoint,
                end: window.endPoint
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Routes received:', data);

        if (data.route_options && data.route_options.length > 0) {
            displayRoutes(data.route_options);
            showNotification(`Found ${data.route_options.length} route options`, 'success');
        } else {
            throw new Error('No routes found');
        }

        hideLoading();
    } catch (error) {
        console.error('Error finding routes:', error);
        hideLoading();
        showNotification('Error finding routes: ' + error.message, 'error');
    }
}

// Display routes on map and in results panel
function displayRoutes(routes) {
    // Clear existing routes
    clearRoutes();
    
    if (!routes || routes.length === 0) {
        console.error('No routes to display');
        return;
    }

    console.log('Displaying routes:', routes);
    routeOptions = {};
    
    // Colors for different routes
    const colors = ['#007bff', '#28a745', '#dc3545']; // blue, green, red
    
    routes.forEach((route, index) => {
        if (route.path && route.path.length > 0) {
            // Store route data
            routeOptions[index] = route;
            
            // Create polyline for the route
            const polyline = L.polyline(route.path, {
                color: colors[index],
                weight: 6,
                opacity: 0.8,
                className: `route-line route-${index}`
            }).addTo(window.map);
            
            // Add click handler to select route
            polyline.on('click', function() {
                selectRoute(index);
            });
            
            // Store reference
            routeLayers.push({
                polyline: polyline,
                index: index
            });
            
            // Add to results panel
            addRouteToPanel(route, index);
        }
    });
    
    // Show results panel
    showRouteResults();
    
    // Update download button
    updateDownloadButton();
}

// Add route to results panel
function addRouteToPanel(route, index) {
    const resultsPanel = document.getElementById('route-results');
    if (!resultsPanel) {
        console.error('Route results panel not found');
        return;
    }

    const colors = ['#007bff', '#28a745', '#dc3545'];
    const routeElement = document.createElement('div');
    routeElement.className = 'route-option';
    routeElement.setAttribute('data-route-index', index);
    routeElement.innerHTML = `
        <div class="route-header">
            <div class="route-color-indicator" style="background-color: ${colors[index]}"></div>
            <h4>Route ${index + 1}</h4>
        </div>
        <div class="route-details">
            <div class="route-stat">
                <span class="stat-label">Distance:</span>
                <span class="stat-value">${(route.distance / 1000).toFixed(2)} km</span>
            </div>
            <div class="route-stat">
                <span class="stat-label">Duration:</span>
                <span class="stat-value">${Math.round(route.duration / 60)} min</span>
            </div>
            <div class="route-stat">
                <span class="stat-label">Congestion:</span>
                <span class="stat-value">${(route.avg_congestion * 100).toFixed(1)}%</span>
            </div>
        </div>
        <button class="btn-select-route" onclick="selectRoute(${index})">
            Select This Route
        </button>
    `;
    
    resultsPanel.appendChild(routeElement);
}

// Select a specific route
function selectRoute(index) {
    console.log('Selecting route:', index);
    
    // Update visual selection
    routeLayers.forEach((layer, i) => {
        if (i === index) {
            // Highlight selected route
            layer.polyline.setStyle({
                weight: 8,
                opacity: 1,
                color: '#ffeb3b' // yellow for selected
            });
            
            // Update route option UI
            const routeElement = document.querySelector(`.route-option[data-route-index="${index}"]`);
            if (routeElement) {
                routeElement.classList.add('selected');
            }
        } else {
            // Dim other routes
            layer.polyline.setStyle({
                weight: 4,
                opacity: 0.5
            });
            
            const routeElement = document.querySelector(`.route-option[data-route-index="${i}"]`);
            if (routeElement) {
                routeElement.classList.remove('selected');
            }
        }
    });
    
    selectedRoute = index;
    updateDownloadButton();
    
    showNotification(`Route ${index + 1} selected`, 'success');
}

// Clear all routes from map
function clearRoutes() {
    console.log('Clearing routes...');
    
    routeLayers.forEach(layer => {
        if (layer.polyline && window.map) {
            window.map.removeLayer(layer.polyline);
        }
    });
    
    routeLayers = [];
    selectedRoute = null;
    
    // Clear results panel
    const resultsPanel = document.getElementById('route-results');
    if (resultsPanel) {
        resultsPanel.innerHTML = '';
    }
    
    hideRouteResults();
}

// Show route results panel
function showRouteResults() {
    const resultsPanel = document.getElementById('route-results');
    const resultsContainer = document.getElementById('route-results-container');
    
    if (resultsPanel && resultsContainer) {
        resultsContainer.style.display = 'block';
        resultsPanel.style.display = 'block';
    }
}

// Hide route results panel
function hideRouteResults() {
    const resultsContainer = document.getElementById('route-results-container');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
    }
}

// Update download button state
function updateDownloadButton() {
    const downloadBtn = document.getElementById('downloadRouteBtn');
    if (!downloadBtn) return;
    
    if (selectedRoute !== null && routeOptions[selectedRoute]) {
        downloadBtn.disabled = false;
        downloadBtn.style.opacity = '1';
        downloadBtn.title = 'Download detailed data for the selected route';
    } else {
        downloadBtn.disabled = true;
        downloadBtn.style.opacity = '0.6';
        downloadBtn.title = 'Please select a route first';
    }
}

// Export route data for download
function getSelectedRouteData() {
    if (selectedRoute === null || !routeOptions[selectedRoute]) {
        return null;
    }
    return routeOptions[selectedRoute];
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    initRouting();
    console.log('Routing system initialized');
});

// Make functions available globally
window.findRoutes = findRoutes;
window.selectRoute = selectRoute;
window.clearRoutes = clearRoutes;
window.showRouteResults = showRouteResults;
window.hideRouteResults = hideRouteResults;
window.updateDownloadButton = updateDownloadButton;