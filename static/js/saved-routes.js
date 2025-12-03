// Saved Routes System
let savedRoutes = [];
let currentSavedRoute = null;

// Initialize saved routes system
function initializeSavedRoutes() {
    loadSavedRoutes();
}

// Load all saved routes from server
async function loadSavedRoutes() {
    try {
        const response = await axios.get('/saved-routes');
        if (response.data.success) {
            savedRoutes = response.data.routes;
            displaySavedRoutes();
        } else {
            console.error('Failed to load saved routes:', response.data.error);
        }
    } catch (error) {
        console.error('Error loading saved routes:', error);
    }
}

// Display saved routes in the UI
function displaySavedRoutes() {
    const container = document.getElementById('savedRoutesList');
    if (!container) return;

    if (savedRoutes.length === 0) {
        container.innerHTML = `
            <div class="no-routes-message">
                <i class="fas fa-route"></i>
                <p>No saved routes yet</p>
                <small>Save your favorite routes to access them later</small>
            </div>
        `;
        return;
    }

    let html = '';
    savedRoutes.forEach(route => {
        const createdDate = new Date(route.created_at).toLocaleDateString();
        const routeTypeIcon = getRouteTypeIcon(route.type);
        const routeColor = getRouteTypeColor(route.type);
        
        html += `
            <div class="saved-route-item" data-route-id="${route.id}">
                <div class="saved-route-header">
                    <div class="saved-route-info">
                        <div class="saved-route-name">
                            <span class="route-type-icon" style="color: ${routeColor}">${routeTypeIcon}</span>
                            ${route.name}
                        </div>
                        <div class="saved-route-meta">
                            <span class="route-type">${formatRouteType(route.type)}</span>
                            <span class="route-date">Saved: ${createdDate}</span>
                        </div>
                    </div>
                    <div class="saved-route-actions">
                        <button class="route-action-btn load-route" onclick="loadSavedRoute('${route.id}')" 
                                title="Load this route">
                            <i class="fas fa-map-marker-alt"></i>
                        </button>
                        <button class="route-action-btn delete-route" onclick="deleteSavedRoute('${route.id}', '${route.name.replace(/'/g, "\\'")}')" 
                                title="Delete this route">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="saved-route-preview">
                    <div class="route-stats-preview">
                        <span class="stat">
                            <i class="fas fa-clock"></i>
                            ${getRouteTime(route)}
                        </span>
                        <span class="stat">
                            <i class="fas fa-road"></i>
                            ${getRouteDistance(route)}
                        </span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Helper functions to extract route information
function getRouteTime(route) {
    if (route.route_data.optimal_departure_time) {
        return route.route_data.optimal_departure_time.travel_time_min + ' min';
    } else if (route.route_data.total_time_min) {
        return route.route_data.total_time_min + ' min';
    } else if (route.route_data.recommended_route && route.route_data.recommended_route.total_time_min) {
        return route.route_data.recommended_route.total_time_min + ' min';
    }
    return 'N/A';
}

function getRouteDistance(route) {
    if (route.route_data.recommended_route && route.route_data.recommended_route.total_distance_km) {
        return route.route_data.recommended_route.total_distance_km + ' km';
    } else if (route.route_data.summary && route.route_data.summary.total_distance_km) {
        return route.route_data.summary.total_distance_km + ' km';
    }
    return 'N/A';
}

// Pending save/delete data
let pendingSavePayload = null;
let pendingDeleteRouteId = null;

// Save current route - opens modal
function saveCurrentRoute(routeType = 'smart_plan') {
    // Determine which route data to save
    let routeData;
    if (window.smartPlanResult) {
        routeData = window.smartPlanResult;
        routeType = 'smart_plan';
    } else if (window.selectedRouteData) {
        routeData = window.selectedRouteData;
        // Determine route type from the selected route
        if (window.selectedRoute === 'fastest') routeType = 'fastest';
        else if (window.selectedRoute === 'shortest') routeType = 'shortest';
        else if (window.selectedRoute === 'least_congested') routeType = 'least_congested';
    } else {
        showNotification('Please generate a route or smart plan first', 'warning');
        return;
    }

    if (!routeData) {
        showNotification('No route data available to save', 'error');
        return;
    }

    // Store pending payload and open modal
    const defaultName = `My ${formatRouteType(routeType)} Route - ${new Date().toLocaleDateString()}`;
    pendingSavePayload = {
        route_data: routeData,
        route_name: defaultName,
        route_type: routeType
    };

    // Set default name in input and show modal
    const input = document.getElementById('saveRouteNameInput');
    if (input) {
        input.value = defaultName;
    }
    
    const modal = document.getElementById('saveRouteModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Confirm save route - called when user clicks Save in modal
async function confirmSaveRoute() {
    const input = document.getElementById('saveRouteNameInput');
    if (!input || !pendingSavePayload) {
        showNotification('No route ready to save', 'error');
        return;
    }
    
    const routeName = input.value.trim();
    if (!routeName) {
        showNotification('Please enter a route name', 'warning');
        return;
    }
    
    pendingSavePayload.route_name = routeName;
    
    // Close modal
    const modal = document.getElementById('saveRouteModal');
    if (modal) {
        modal.style.display = 'none';
    }

    try {
        // Add start and end points if available
        if (typeof startMarker !== 'undefined' && startMarker) {
            pendingSavePayload.start_point = {
                lat: startMarker.getLatLng().lat,
                lng: startMarker.getLatLng().lng
            };
        }
        if (typeof endMarker !== 'undefined' && endMarker) {
            pendingSavePayload.end_point = {
                lat: endMarker.getLatLng().lat,
                lng: endMarker.getLatLng().lng
            };
        }

        console.log('Saving route with payload:', pendingSavePayload);
        const response = await axios.post('/save-route', pendingSavePayload);
        
        if (response.data.success) {
            showNotification('Route saved successfully! 📍', 'success');
            await loadSavedRoutes(); // Refresh the list
        } else {
            showNotification('Failed to save route: ' + response.data.error, 'error');
        }
    } catch (error) {
        console.error('Error saving route:', error);
        showNotification('Error saving route: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
        pendingSavePayload = null;
    }
}

// Load a saved route
async function loadSavedRoute(routeId) {
    try {
        const response = await axios.get(`/saved-route/${routeId}`);
        if (response.data.success) {
            const route = response.data.route;
            currentSavedRoute = route;

            // Clear existing route
            clearRoute();

            // Set start and end markers if available
            if (route.start_point) {
                const startLatLng = L.latLng(route.start_point.lat, route.start_point.lng);
                startMarker = addMarker(startLatLng, "#10b981", "start");
            }
            if (route.end_point) {
                const endLatLng = L.latLng(route.end_point.lat, route.end_point.lng);
                endMarker = addMarker(endLatLng, "#ef4444", "end");
            }

            // Draw the route on map
            drawSavedRoute(route);

            // Display route details
            displaySavedRouteDetails(route);

            showNotification(`Loaded route: ${route.name}`, 'success');
        } else {
            showNotification('Failed to load route: ' + response.data.error, 'error');
        }
    } catch (error) {
        console.error('Error loading saved route:', error);
        showNotification('Error loading route: ' + (error.response?.data?.error || error.message), 'error');
    }
}

// Draw saved route on map
function drawSavedRoute(route) {
    const routeData = route.route_data;
    let coords = [];

    if (routeData.recommended_route && routeData.recommended_route.route_coords) {
        // Smart plan route
        coords = routeData.recommended_route.route_coords.map(p => [p[0], p[1]]);
    } else if (routeData.route) {
        // Regular route
        coords = routeData.route.map(p => [p[0], p[1]]);
    }

    if (coords.length > 0) {
        // Clear existing routes
        Object.values(routeLines).forEach(line => {
            if (line && map) map.removeLayer(line);
        });

        // Draw saved route
        routeLines['saved'] = L.polyline(coords, {
            color: '#FF6B35',
            weight: 6,
            opacity: 0.9,
            dashArray: null
        }).addTo(map);

        // Fit map to show the route
        if (coords.length > 1) {
            map.fitBounds(routeLines['saved'].getBounds(), { padding: [20, 20] });
        }

        selectedRoute = 'saved';
        updateDownloadButton();
    }
}

// Display saved route details
function displaySavedRouteDetails(route) {
    const routeData = route.route_data;
    const container = document.getElementById('savedRouteDetails');
    if (!container) return;

    let html = '';

    if (routeData.optimal_departure_time) {
        // Smart plan route
        const optimal = routeData.optimal_departure_time;
        html = `
            <div class="saved-route-details">
                <h4><i class="fas fa-star" style="color: #FF6B35;"></i> ${route.name}</h4>
                <div class="route-detail-item">
                    <strong>Optimal Departure:</strong> ${optimal.time_display}
                </div>
                <div class="route-detail-item">
                    <strong>Travel Time:</strong> ${optimal.travel_time_min} minutes
                </div>
                <div class="route-detail-item">
                    <strong>Congestion:</strong> ${optimal.congestion_percent}%
                </div>
                ${routeData.recommendations ? `
                <div class="route-detail-item">
                    <strong>Recommendations:</strong>
                    <ul>
                        ${routeData.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
            </div>
        `;
    } else {
        // Regular route
        const summary = routeData.summary || {};
        html = `
            <div class="saved-route-details">
                <h4><i class="fas fa-route" style="color: #FF6B35;"></i> ${route.name}</h4>
                <div class="route-detail-item">
                    <strong>Travel Time:</strong> ${routeData.total_time_min} minutes
                </div>
                <div class="route-detail-item">
                    <strong>Route Type:</strong> ${formatRouteType(route.type)}
                </div>
                <div class="route-detail-item">
                    <strong>Distance:</strong> ${summary.total_distance_km || 'N/A'} km
                </div>
                <div class="route-detail-item">
                    <strong>Average Congestion:</strong> ${summary.average_congestion || 'N/A'}%
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
    container.style.display = 'block';
}

// Delete a saved route - opens confirmation modal
function deleteSavedRoute(routeId, routeName) {
    pendingDeleteRouteId = routeId;
    
    // Update the message in the modal
    const messageEl = document.getElementById('deleteRouteMessage');
    if (messageEl) {
        messageEl.textContent = routeName 
            ? `Are you sure you want to delete "${routeName}"?`
            : 'Are you sure you want to delete this saved route?';
    }
    
    // Show the delete confirmation modal
    const modal = document.getElementById('deleteRouteModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Confirm delete route - called when user clicks Delete in modal
async function confirmDeleteRoute() {
    if (!pendingDeleteRouteId) {
        showNotification('No route selected for deletion', 'warning');
        return;
    }
    
    const routeId = pendingDeleteRouteId;
    
    // Close modal
    const modal = document.getElementById('deleteRouteModal');
    if (modal) {
        modal.style.display = 'none';
    }

    try {
        const response = await axios.delete(`/delete-route/${routeId}`);
        if (response.data.success) {
            showNotification('Route deleted successfully', 'success');
            await loadSavedRoutes(); // Refresh the list
            
            // If the deleted route was currently loaded, clear it
            if (currentSavedRoute && currentSavedRoute.id === routeId) {
                clearRoute();
                const detailsContainer = document.getElementById('savedRouteDetails');
                if (detailsContainer) detailsContainer.style.display = 'none';
                currentSavedRoute = null;
            }
        } else {
            showNotification('Failed to delete route: ' + response.data.error, 'error');
        }
    } catch (error) {
        console.error('Error deleting route:', error);
        showNotification('Error deleting route: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
        pendingDeleteRouteId = null;
    }
}

// Utility functions
function getRouteTypeIcon(routeType) {
    const icons = {
        'smart_plan': '🧠',
        'fastest': '⚡',
        'shortest': '📏',
        'least_congested': '😌'
    };
    return icons[routeType] || '📍';
}

function getRouteTypeColor(routeType) {
    const colors = {
        'smart_plan': '#8b5cf6',
        'fastest': '#2563eb',
        'shortest': '#10b981',
        'least_congested': '#8b5cf6'
    };
    return colors[routeType] || '#666';
}

function formatRouteType(routeType) {
    return routeType.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Show saved routes modal
function showSavedRoutesModal() {
    showModal('savedRoutesModal');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeSavedRoutes();
});