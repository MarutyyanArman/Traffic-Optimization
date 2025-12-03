// Smart Travel Planner Functions
let roadTypesLoaded = false;

function openSmartPlanner() {
    if (!startMarker || !endMarker) {
        showNotification("Please set start and end points on the map first", "warning");
        return;
    }

    showModal('smartPlannerModal');
    
    // Clear previous results
    const resultsContainer = document.getElementById('smartPlanResultsModal');
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'none';
    }

    // Load road types if not already loaded
    if (!roadTypesLoaded) {
        loadRoadTypes();
    }

    // Set default time window to current time ± 3 hours
    const now = new Date();
    const currentHour = now.getHours();

    const startHour = Math.max(0, currentHour - 2);
    const endHour = Math.min(23, currentHour + 4);

    document.getElementById('timeWindowStart').value = `${startHour.toString().padStart(2, '0')}:00`;
    document.getElementById('timeWindowEnd').value = `${endHour.toString().padStart(2, '0')}:00`;
}

// Load available road types
async function loadRoadTypes() {
    try {
        const container = document.getElementById('roadTypesList');
        container.innerHTML = '<div style="text-align: center; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Loading road types...</div>';

        const response = await axios.get('/available-road-types');
        const roadTypes = response.data.road_types;

        container.innerHTML = '';

        if (roadTypes.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-secondary);">No road types available</div>';
            return;
        }

        roadTypes.forEach(roadType => {
            const checkbox = document.createElement('div');
            checkbox.className = 'road-type-checkbox';
            checkbox.innerHTML = `
                <label style="display: flex; align-items: flex-start; gap: 10px; font-size: 0.9rem; cursor: pointer; padding: 8px; border-radius: 6px; transition: background-color 0.2s ease;">
                    <input type="checkbox" value="${roadType.type}" style="transform: scale(1.1); margin-top: 3px;">
                    <div style="flex: 1;">
                        <div class="road-type-name" style="font-weight: 600; color: var(--text-primary); margin-bottom: 2px;">
                            ${roadType.type}
                        </div>
                        <div class="road-type-desc" style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.3;">
                            ${roadType.description} • ${roadType.speed_limit} km/h limit
                        </div>
                    </div>
                </label>
            `;

            // Add hover effect
            checkbox.addEventListener('mouseenter', function () {
                this.style.backgroundColor = 'var(--card-bg)';
            });
            checkbox.addEventListener('mouseleave', function () {
                this.style.backgroundColor = 'transparent';
            });

            container.appendChild(checkbox);
        });

        roadTypesLoaded = true;

    } catch (error) {
        console.error('Error loading road types:', error);
        document.getElementById('roadTypesList').innerHTML =
            '<div style="color: var(--danger); text-align: center; padding: 10px;">Failed to load road types. Please try again.</div>';
    }
}

// Generate smart travel plan
async function generateSmartPlan() {
    if (!startMarker || !endMarker) {
        showNotification("Please set start and end points first", "warning");
        return;
    }

    // Show loading in modal
    showSmartPlanLoading();

    try {
        // Collect constraints
        const maxTravelTime = document.getElementById('maxTravelTime').value ?
            parseInt(document.getElementById('maxTravelTime').value) : null;

        // Get time window
        const timeStart = document.getElementById('timeWindowStart').value;
        const timeEnd = document.getElementById('timeWindowEnd').value;

        if (!timeStart || !timeEnd) {
            showNotification("Please set both start and end times for your travel window", "warning");
            hideSmartPlanLoading();
            return;
        }

        const timeWindowStart = timeStart ? parseInt(timeStart.split(':')[0]) : 0;
        const timeWindowEnd = timeEnd ? parseInt(timeEnd.split(':')[0]) : 23;

        if (timeWindowStart >= timeWindowEnd) {
            showNotification("End time must be after start time", "warning");
            hideSmartPlanLoading();
            return;
        }

        // Get road types to avoid
        const avoidRoadTypes = [];
        document.querySelectorAll('#roadTypesList input[type="checkbox"]:checked').forEach(checkbox => {
            avoidRoadTypes.push(checkbox.value);
        });

        // Get day type from existing control in main panel
        const dayType = document.getElementById('dayType').value;

        const constraints = {
            max_travel_time: maxTravelTime,
            avoid_road_types: avoidRoadTypes,
            time_window_start: timeWindowStart,
            time_window_end: timeWindowEnd,
            day_type: dayType
        };

        console.log('Sending constraints:', constraints);

        const response = await axios.post('/smart-travel-plan', {
            start: startMarker.getLatLng(),
            end: endMarker.getLatLng(),
            ...constraints
        });

        const result = response.data;

        if (result.success) {
            // Store the result globally for saving
            window.smartPlanResult = result;
            
            // Hide loading and show results in modal
            hideSmartPlanLoading();
            displaySmartPlanResultsInModal(result);
            drawSmartPlanRoute(result);
            showNotification("Smart plan generated successfully! 🎉", "success");
        } else {
            hideSmartPlanLoading();
            showNotification(result.message || "No suitable plan found with your constraints", "error");
        }

    } catch (error) {
        console.error('Smart plan error:', error);
        hideSmartPlanLoading();
        showNotification('Failed to generate smart plan: ' + (error.response?.data?.error || error.message), 'error');
    }
}

// Show loading in smart planner modal
function showSmartPlanLoading() {
    const modalContent = document.querySelector('#smartPlannerModal .modal-content');
    const loadingHTML = `
        <div id="smartPlanLoading" style="text-align: center; padding: 40px;">
            <i class="fas fa-spinner fa-spin fa-3x" style="color: var(--primary); margin-bottom: 20px;"></i>
            <h3 style="color: var(--modal-text); margin-bottom: 10px;">Generating Smart Plan</h3>
            <p style="color: var(--text-secondary);">Analyzing traffic patterns and finding optimal route...</p>
        </div>
    `;
    
    // Hide the form and show loading
    const formSection = modalContent.querySelector('div:last-child');
    if (formSection) {
        formSection.style.display = 'none';
    }
    
    modalContent.insertAdjacentHTML('beforeend', loadingHTML);
}

// Hide loading in smart planner modal
function hideSmartPlanLoading() {
    const loadingElement = document.getElementById('smartPlanLoading');
    if (loadingElement) {
        loadingElement.remove();
    }
    
    // Show the form again
    const modalContent = document.querySelector('#smartPlannerModal .modal-content');
    const formSection = modalContent.querySelector('div:last-child');
    if (formSection) {
        formSection.style.display = 'block';
    }
}

// Display smart plan results in the modal
function displaySmartPlanResultsInModal(result) {
    const optimal = result.optimal_departure_time;
    const route = result.recommended_route;

    // Create or get results container in modal
    let resultsContainer = document.getElementById('smartPlanResultsModal');
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.id = 'smartPlanResultsModal';
        resultsContainer.style.marginTop = '20px';
        resultsContainer.style.maxHeight = '400px';
        resultsContainer.style.overflowY = 'auto';
        
        const modalContent = document.querySelector('#smartPlannerModal .modal-content');
        modalContent.appendChild(resultsContainer);
    }

    let html = `
        <div class="route-info" style="background: var(--card-bg); border-radius: 10px; padding: 20px; border-left: 4px solid var(--success);">
            <h4 style="color: var(--modal-text); margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-check-circle" style="color: var(--success);"></i>
                Smart Plan Generated Successfully!
            </h4>
            
            <div style="margin-bottom: 20px;">
                <div style="background: var(--success); color: white; padding: 12px; border-radius: 8px; text-align: center; margin-bottom: 15px;">
                    <strong>🚀 Optimal Departure: ${optimal.time_display}</strong>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 0.9rem; color: var(--text-secondary);">Travel Time</div>
                        <div style="font-weight: bold; color: var(--modal-text); font-size: 1.2rem;">${optimal.travel_time_min.toFixed(1)} min</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 0.9rem; color: var(--text-secondary);">Congestion</div>
                        <div style="font-weight: bold; color: ${optimal.congestion_percent < 50 ? 'var(--success)' : optimal.congestion_percent < 70 ? 'var(--warning)' : 'var(--danger)'}; font-size: 1.2rem;">${optimal.congestion_percent.toFixed(1)}%</div>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <strong style="color: var(--modal-text);">Route Summary:</strong><br>
                    <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 5px;">
                        • Distance: ${route.total_distance_km.toFixed(1)} km<br>
                        • Road types used: ${Object.keys(route.road_types_used).join(', ')}<br>
                        • Estimated average speed: ${route.summary ? route.summary.average_speed_kmh + ' km/h' : 'N/A'}
                    </div>
                </div>
            </div>
    `;

    // Add recommendations
    if (result.recommendations && result.recommendations.length > 0) {
        html += `<div style="margin-bottom: 15px;"><strong style="color: var(--modal-text);">💡 Recommendations:</strong></div>`;
        result.recommendations.forEach(rec => {
            html += `<div style="font-size: 0.85rem; margin-bottom: 8px; padding-left: 12px; border-left: 3px solid var(--primary); color: var(--modal-text);">${rec}</div>`;
        });
    }

    // Add constraints used
    html += `
        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
                <strong>Constraints applied:</strong><br>
                ${result.constraints_used.max_travel_time ? `• Max time: ${result.constraints_used.max_travel_time} min<br>` : ''}
                ${result.constraints_used.avoid_road_types.length > 0 ? `• Avoided: ${result.constraints_used.avoid_road_types.join(', ')}<br>` : ''}
                • Time window: ${result.constraints_used.time_window_start}:00 - ${result.constraints_used.time_window_end}:00<br>
                • Day type: ${result.constraints_used.day_type}
            </div>
        </div>
        
        <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button onclick="closeModal('smartPlannerModal')" class="secondary" style="flex: 1; padding: 10px;">
                <i class="fas fa-times"></i>
                Close
            </button>
            <button onclick="useThisSmartPlan()" class="success" style="flex: 1; padding: 10px;">
                <i class="fas fa-check"></i>
                Use This Plan
            </button>
            <button onclick="saveCurrentRoute('smart_plan')" class="purple" style="flex: 1; padding: 10px;">
                <i class="fas fa-save"></i>
                Save Route
            </button>
        </div>
    `;

    html += `</div>`;
    resultsContainer.innerHTML = html;
    resultsContainer.style.display = 'block';
}

// Function to use the generated smart plan
function useThisSmartPlan() {
    closeModal('smartPlannerModal');
    showNotification("Smart plan applied to map! 🗺️", "success");
}

// Draw the smart plan route on map
function drawSmartPlanRoute(result) {
    // Clear existing routes
    Object.values(routeLines).forEach(line => {
        if (line) map.removeLayer(line);
    });

    const route = result.recommended_route;
    const coords = route.route_coords.map(p => [p[0], p[1]]);

    // Draw the smart route
    routeLines['smart'] = L.polyline(coords, {
        color: '#8b5cf6',
        weight: 6,
        opacity: 0.9,
        dashArray: null
    }).addTo(map);

    // Fit map to show the route
    map.fitBounds(routeLines['smart'].getBounds(), { padding: [20, 20] });

    // Update selected route
    selectedRoute = 'smart';
    updateDownloadButton();
}

// Smart Planner Modal Close Function
function closeSmartPlannerModal() {
    // Clear any results from previous runs
    const resultsContainer = document.getElementById('smartPlanResultsModal');
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'none';
    }
    
    // Hide any loading
    const loadingElement = document.getElementById('smartPlanLoading');
    if (loadingElement) {
        loadingElement.remove();
    }
    
    // Show the form section
    const modalContent = document.querySelector('#smartPlannerModal .modal-content');
    const formSection = modalContent.querySelector('div:last-child');
    if (formSection) {
        formSection.style.display = 'block';
    }
    
    closeModal('smartPlannerModal');
}