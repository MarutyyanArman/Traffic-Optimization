// Route Planning Functions
function clearRoute() {
    if (startMarker && map) map.removeLayer(startMarker);
    if (endMarker && map) map.removeLayer(endMarker);

    Object.values(routeLines).forEach(line => {
        if (line && map) map.removeLayer(line);
    });

    startMarker = null;
    endMarker = null;
    routeLines = {};
    selectedRoute = null;
    clickCount = 0;

    document.getElementById('routeOptions').style.display = 'none';
    document.getElementById('selectedRouteInfo').style.display = 'none';
    updateDownloadButton();
}

async function switchStartEnd() {
    if (startMarker && endMarker && map) {
        const startLatLng = startMarker.getLatLng();
        const endLatLng = endMarker.getLatLng();

        startMarker.setLatLng(endLatLng);
        endMarker.setLatLng(startLatLng);

        await calculateMultiRoute();
    }
}

async function calculateMultiRoute() {
    if (routeCalculationInProgress) {
        console.log('Route calculation already in progress');
        return;
    }

    if (!startMarker || !endMarker) {
        showNotification("Please set start and end points first");
        return;
    }

    routeCalculationInProgress = true;
    showLoading();

    try {
        const timeInput = document.getElementById('timeInput');
        const dayTypeSelect = document.getElementById('dayType');
        
        const timeValue = timeInput ? timeInput.value : '08:00';
        const [hours] = timeValue.split(':').map(Number);
        const dayType = dayTypeSelect ? dayTypeSelect.value : 'weekday';

        console.log('=== CALCULATING ROUTES ===');
        console.log('Start:', startMarker.getLatLng());
        console.log('End:', endMarker.getLatLng());
        console.log('Time - hour:', hours, 'dayType:', dayType);

        const startTime = performance.now();

        const res = await axios.post("/multi-route", {
            start: startMarker.getLatLng(),
            end: endMarker.getLatLng(),
            hour: hours,
            day_type: dayType
        });

        const endTime = performance.now();
        console.log(`Routes calculated in ${(endTime - startTime).toFixed(2)}ms`);

        if (res.data.route_options) {
            console.log('Route options keys:', Object.keys(res.data.route_options));

            const routeOptions = res.data.route_options;
            displayRouteOptions(routeOptions);
            drawAllRoutes(routeOptions);

            const firstRouteKey = Object.keys(routeOptions)[0];
            if (firstRouteKey) {
                selectRoute(firstRouteKey, routeOptions[firstRouteKey]);
            }
        } else {
            console.error('No route_options in response');
            alert("No routes found between the selected points.");
        }
    } catch (error) {
        console.error('Multi-route calculation error:', error);
        if (error.response) {
            alert('Error: ' + (error.response.data.error || 'Calculating routes'));
        } else {
            alert('Error calculating routes: ' + error.message);
        }
    } finally {
        routeCalculationInProgress = false;
        hideLoading();
    }
}

// Route Display Functions
function calculateSpeed(congestionPercent) {
    const congestion = congestionPercent / 100;
    const maxSpeed = 60;
    const minSpeed = 5;

    if (congestion < 0.3) {
        return maxSpeed;
    } else if (congestion < 0.6) {
        return maxSpeed * 0.7;
    } else if (congestion < 0.8) {
        return maxSpeed * 0.5;
    } else {
        return maxSpeed * 0.3;
    }
}

function displayRouteOptions(routeOptions) {
    const routeOptionsContainer = document.getElementById('routeOptions');
    routeOptionsContainer.innerHTML = '<h4 style="margin-bottom: 10px; color: var(--text-primary);">Route Options:</h4>';

    window.routeOptions = routeOptions;

    Object.entries(routeOptions).forEach(([key, route]) => {
        const summary = route.summary || {};
        const congestion = summary.average_congestion || 0;
        const adjustedSpeed = calculateSpeed(congestion);

        const routeElement = document.createElement('div');
        routeElement.className = 'route-option';
        routeElement.setAttribute('data-route-key', key);

        routeElement.addEventListener('click', function () {
            console.log('Route option clicked:', key);
            selectRoute(key, route);
        });

        routeElement.innerHTML = `
            <div class="route-header">
                <div class="route-icon">${route.icon || '📍'}</div>
                <div class="route-name">${route.name}</div>
                <div class="route-time">${route.total_time_min} min</div>
            </div>
            <div class="route-details">
                <div class="route-detail-item">
                    <span>Distance:</span>
                    <span>${summary.total_distance_km || '?'} km</span>
                </div>
                <div class="route-detail-item">
                    <span>Congestion:</span>
                    <span>${congestion}%</span>
                </div>
                <div class="route-detail-item">
                    <span>Avg. Speed:</span>
                    <span>${adjustedSpeed.toFixed(0)} km/h</span>
                </div>
            </div>
            <div class="route-stats">
                <div class="stat-item">
                    <div class="stat-value">${summary.estimated_turns || '?'}</div>
                    <div class="stat-label">Turns</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${summary.estimated_traffic_lights || '?'}</div>
                    <div class="stat-label">Lights</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${congestion}%</div>
                    <div class="stat-label">Congestion</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${Object.keys(summary.road_type_breakdown || {}).length || '?'}</div>
                    <div class="stat-label">Road Types</div>
                </div>
            </div>
        `;

        routeOptionsContainer.appendChild(routeElement);
    });

    routeOptionsContainer.style.display = 'block';
}

function drawAllRoutes(routeOptions) {
    Object.values(routeLines).forEach(line => {
        if (line) map.removeLayer(line);
    });
    routeLines = {};

    Object.entries(routeOptions).forEach(([key, route]) => {
        if (route.route && route.route.length > 0) {
            const coords = route.route.map(p => [p[0], p[1]]);
            routeLines[key] = L.polyline(coords, {
                color: route.color || '#666',
                weight: 4,
                opacity: 0.7,
                dashArray: key === selectedRoute ? null : '5, 5'
            }).addTo(map);
        }
    });

    const visibleLines = Object.values(routeLines).filter(line => line);
    if (visibleLines.length > 0) {
        const group = new L.featureGroup(visibleLines);
        map.fitBounds(group.getBounds(), { padding: [20, 20] });
    }
}

function selectRoute(routeKey, route) {
    console.log('=== SELECT ROUTE CALLED ===', routeKey);

    if (!route && window.routeOptions && window.routeOptions[routeKey]) {
        route = window.routeOptions[routeKey];
    }

    if (!route) {
        console.error('No route data found for:', routeKey);
        showNotification('Route data not available', 'error');
        return;
    }

    document.querySelectorAll('.route-option').forEach(option => {
        option.classList.remove('active');
    });

    const selectedOption = document.querySelector(`[data-route-key="${routeKey}"]`);
    if (selectedOption) {
        selectedOption.classList.add('active');
    }

    Object.entries(routeLines).forEach(([key, line]) => {
        if (line && line instanceof L.Polyline) {
            if (key === routeKey) {
                line.setStyle({
                    weight: 8,
                    opacity: 0.9,
                    dashArray: null,
                    color: route.color || '#2563eb'
                });
                line.bringToFront();
            } else {
                line.setStyle({
                    weight: 3,
                    opacity: 0.4,
                    dashArray: '5, 5',
                    color: (window.routeOptions[key] && window.routeOptions[key].color) || '#666'
                });
            }
        }
    });

    selectedRoute = routeKey;
    window.selectedRouteData = route;

    showRouteDetails(route);
    updateDownloadButton();

    showNotification(`Selected: ${route.name}`, 'success');
}

function showRouteDetails(route) {
    const summary = route.summary || {};
    const congestion = summary.average_congestion || 0;
    const adjustedSpeed = calculateSpeed(congestion);

    const detailsContainer = document.getElementById('selectedRouteDetails');
    const infoPanel = document.getElementById('selectedRouteInfo');

    let detailsHTML = `
        <div style="margin-bottom: 10px;">
            <strong>Travel Time:</strong> ${route.total_time_min} minutes<br>
            <strong>Total Distance:</strong> ${summary.total_distance_km || '?'} km<br>
            <strong>Average Speed:</strong> ${adjustedSpeed.toFixed(0)} km/h (max: 60 km/h)<br>
            <strong>Average Congestion:</strong> ${congestion}%
        </div>
        <div style="margin-bottom: 10px;">
            <strong>Speed Impact:</strong><br>
            • Free flow: 60 km/h<br>
            • Current: ${adjustedSpeed.toFixed(0)} km/h<br>
            • Speed reduction: ${(60 - adjustedSpeed).toFixed(0)} km/h
        </div>
        <div style="margin-bottom: 10px;">
            <strong>Route Statistics:</strong><br>
            • Estimated Turns: ${summary.estimated_turns || '?'}<br>
            • Traffic Lights: ${summary.estimated_traffic_lights || '?'}<br>
            • Road Types: ${Object.keys(summary.road_type_breakdown || {}).join(', ') || '?'}
        </div>
    `;

    if (summary.road_type_breakdown) {
        detailsHTML += `<div><strong>Road Type Breakdown:</strong><br>`;
        Object.entries(summary.road_type_breakdown).forEach(([type, count]) => {
            detailsHTML += `• ${type}: ${count} segments<br>`;
        });
        detailsHTML += `</div>`;
    }

    detailsContainer.innerHTML = detailsHTML;
    infoPanel.style.display = 'block';
}
