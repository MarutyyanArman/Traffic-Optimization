// Map page JS extracted from map.html
// Global Routely object with all functionality
        class RoutelyApp {
            constructor() {
                this.map = null;
                this.startMarker = null;
                this.endMarker = null;
                this.markersLayer = null;
                this.routeLayer = null;
                this.roadLayer = null;
                this.clickCount = 0;
                this.isSettingStartPoint = false;
                this.isSettingEndPoint = false;
                this.currentHour = 8;
                this.currentDayType = 'weekday';
                this.routeOptions = [];
                this.selectedRouteIndex = 0;
                this.simulationInterval = null;
                this.isSimulating = false;
                
                this.init();
            }

            init() {
                console.log("ðŸš€ Initializing Routely...");
                this.initializeMap();
                this.initializeTheme();
                this.bindEventListeners();
                this.setCurrentTime();
            }

            initializeMap() {
                console.log("ðŸ—ºï¸ Initializing Routely Map...");
                
                try {
                    // Initialize Leaflet map
                    this.map = L.map('map', {
                        zoomControl: false
                    }).setView([40.183, 44.515], 13);
                    
                    // Tile layer URLs
                    this.lightTileUrl = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
                    this.darkTileUrl = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
                    
                    // Add tile layer based on current theme
                    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                    this.tileLayer = L.tileLayer(isDark ? this.darkTileUrl : this.lightTileUrl, {
                        attribution: 'Â© OpenStreetMap contributors, Â© CARTO',
                        maxZoom: 19
                    }).addTo(this.map);

                    // Add zoom control
                    L.control.zoom({
                        position: 'topright'
                    }).addTo(this.map);

                    // Create layers
                    this.markersLayer = L.layerGroup().addTo(this.map);
                    this.routeLayer = L.layerGroup().addTo(this.map);
                    
                    // Load congestion data automatically on map init
                    this.loadCongestionData();
                    
                    console.log("âœ… Map initialized successfully");
                    
                    // Hide loading placeholder
                    setTimeout(() => {
                        const placeholder = document.querySelector('.map-placeholder');
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                    }, 1000);

                    // Add click event to map
                    this.map.on('click', (e) => {
                        this.handleMapClick(e);
                    });
                    
                } catch (error) {
                    console.error("âŒ Error initializing map:", error);
                    this.showError("Failed to load map. Please check your internet connection.");
                }
            }

            handleMapClick(e) {
                console.log("ðŸ—ºï¸ Map clicked at:", e.latlng);
                
                const autoFind = document.getElementById('autoFindRoute')?.checked ?? true;
                
                if (this.isSettingStartPoint) {
                    this.setStartPoint(e.latlng);
                    this.isSettingStartPoint = false;
                    return;
                }

                if (this.isSettingEndPoint) {
                    this.setEndPoint(e.latlng);
                    this.isSettingEndPoint = false;
                    // Do not auto-calculate route here; wait for explicit Find Routes click
                    return;
                }

                // Regular click behavior - alternate between start and end
                this.clickCount++;
                
                if (this.clickCount === 1) {
                    this.setStartPoint(e.latlng);
                } else if (this.clickCount === 2) {
                    this.setEndPoint(e.latlng);
                    this.clickCount = 0;
                    // Do not auto-calculate route here; wait for explicit Find Routes click
                }
            }

            setMapTheme(theme) {
                if (!this.map || !this.tileLayer) return;
                
                // Remove current tile layer
                this.map.removeLayer(this.tileLayer);
                
                // Add new tile layer based on theme
                const tileUrl = theme === 'dark' ? this.darkTileUrl : this.lightTileUrl;
                this.tileLayer = L.tileLayer(tileUrl, {
                    attribution: 'Â© OpenStreetMap contributors, Â© CARTO',
                    maxZoom: 19
                }).addTo(this.map);
                
                console.log(`ðŸŽ¨ Map theme changed to ${theme}`);
            }

            openPredictionsModal() {
                document.getElementById('predictionsModal').style.display = 'flex';
                document.getElementById('predictionResults').style.display = 'none';
                this.currentPlanData = null;
            }
            
            openSettingsModal() {
                const modal = document.getElementById('settingsModal');
                modal.style.display = 'flex';
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                document.getElementById('darkModeToggle').checked = isDark;
            }
            
            openPredictionsModal() {
                const modal = document.getElementById('predictionsModal');
                if (!modal) return;
                modal.style.display = 'flex';
                const results = document.getElementById('predictionResults');
                if (results) {
                    results.style.display = 'none';
                }
                this.currentPlanData = null;

                // Lazy-load available road types into the predictions modal
                const container = document.getElementById('predictionsRoadTypesList');
                if (container && !container.dataset.loaded) {
                    this.loadPredictionsRoadTypes(container);
                }
            }

            async loadPredictionsRoadTypes(container) {
                try {
                    container.innerHTML = `
                        <div style="text-align: center; color: #64748b; font-size: 0.9rem;">
                            <i class="fas fa-spinner fa-spin"></i> Loading road types...
                        </div>
                    `;

                    const response = await fetch('/available-road-types');
                    const data = await response.json();
                    const roadTypes = data.road_types || [];

                    if (!roadTypes.length) {
                        container.innerHTML = '<div style="text-align: center; color: #64748b; font-size: 0.9rem;">No road types available</div>';
                        container.dataset.loaded = 'true';
                        return;
                    }

                    container.innerHTML = roadTypes.map(rt => `
                        <label class="checkbox-item">
                            <input type="checkbox" value="${rt.type}">
                            <span class="checkmark"></span>
                            ${rt.type} · ${rt.description} (${rt.speed_limit} km/h)
                        </label>
                    `).join('');

                    container.dataset.loaded = 'true';
                } catch (error) {
                    console.error('Error loading predictions road types:', error);
                    container.innerHTML = `
                        <div style="color: #ef4444; text-align: center; padding: 10px; font-size: 0.9rem;">
                            Failed to load road types. Please try again.
                        </div>
                    `;
                }
            }

            async getSmartTravelPlan() {
                if (!this.startMarker || !this.endMarker) {
                    this.showNotification("Please set start and end points on the map first", "warning");
                    return;
                }
                
                const timeFrom = parseInt(document.getElementById('travelTimeFrom').value);
                const timeTo = parseInt(document.getElementById('travelTimeTo').value);
                const dayType = document.querySelector('input[name="plannerDayType"]:checked').value;
                
                // Collect road types to avoid from dynamically loaded list
                const avoidTypes = [];
                document
                    .querySelectorAll('#predictionsRoadTypesList input[type="checkbox"]:checked')
                    .forEach(cb => avoidTypes.push(cb.value));
                
                const startLatLng = this.startMarker.getLatLng();
                const endLatLng = this.endMarker.getLatLng();
                
                this.showNotification("Analyzing best travel times...", "info");

                // Show loading state in predictions modal
                const resultsDiv = document.getElementById('predictionResults');
                const contentDiv = document.getElementById('predictionResultsContent');
                if (resultsDiv && contentDiv) {
                    resultsDiv.style.display = 'block';
                    contentDiv.innerHTML = `
                        <div style="text-align: center; padding: 20px; color: #64748b;">
                            <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                            Loading best time and route...
                        </div>
                    `;

                    // Hide save section while loading
                    const saveSection = resultsDiv.querySelector('.save-route-section');
                    if (saveSection) {
                        saveSection.style.display = 'none';
                    }
                }
                
                try {
                    const response = await fetch('/smart-travel-plan', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            start: { lat: startLatLng.lat, lng: startLatLng.lng },
                            end: { lat: endLatLng.lat, lng: endLatLng.lng },
                            // Smart planner constraints
                            time_window_start: timeFrom,
                            time_window_end: timeTo,
                            day_type: dayType,
                            avoid_road_types: avoidTypes
                        })
                    });
                    const data = await response.json();
                    if (data.error) throw new Error(data.error);
                    this.currentPlanData = data;
                    this.displayPredictionResults(data);
                    this.showNotification("Travel plan ready!", "success");
                } catch (error) {
                    console.error("Smart travel plan error:", error);
                    this.displayFallbackRecommendations(timeFrom, timeTo);
                }
            }
            
            displayPredictionResults(data) {
                const resultsDiv = document.getElementById('predictionResults');
                const contentDiv = document.getElementById('predictionResultsContent');
                const optimal = data.optimal_departure_time || {};
                const route = data.recommended_route || {};
                const recList = data.recommendations || [];

                if (!optimal || typeof optimal.hour !== 'number') {
                    // Fallback to existing behavior if optimal time is not available
                    const recommendations = recList;
                    contentDiv.innerHTML = recommendations.slice(0, 1).map((rec) => {
                        const rawHour = (rec.hour !== undefined && rec.hour !== null)
                            ? rec.hour
                            : (rec.time !== undefined && rec.time !== null)
                                ? rec.time
                                : null;
                        const hasHour = typeof rawHour === 'number' && !isNaN(rawHour);
                        const displayHour = hasHour
                            ? rawHour.toString().padStart(2, '0') + ':00'
                            : 'N/A';
                        const applyArg = hasHour ? rawHour : 'null';

                        return `
                        <div class="recommendation-card best" data-hour="${hasHour ? rawHour : ''}">
                            <div class="recommendation-header">
                                <span class="recommendation-time"><i class="fas fa-clock"></i> ${displayHour}</span>
                                <span class="recommendation-badge">Best Time</span>
                            </div>
                            <p style="margin: 0.5rem 0; font-size: 0.85rem; color: #64748b;">${rec.description || 'Recommended travel time'}</p>
                            <div class="recommendation-stats">
                                <div class="rec-stat"><div class="rec-stat-value">${rec.congestion || 40}%</div><div class="rec-stat-label">Congestion</div></div>
                                <div class="rec-stat"><div class="rec-stat-value">${rec.travel_time || 25} min</div><div class="rec-stat-label">Est. Time</div></div>
                                <div class="rec-stat"><div class="rec-stat-value">${rec.rating || 'Good'}</div><div class="rec-stat-label">Rating</div></div>
                            </div>
                            <button class="action-btn btn-secondary btn-full" style="margin-top: 0.75rem;" onclick="window.Routely.applyRecommendation(${applyArg})">
                                <i class="fas fa-check"></i> Use This Time
                            </button>
                        </div>
                        `;
                    }).join('');
                    resultsDiv.style.display = 'block';

                    // Show save section now that results are ready
                    const saveSection = resultsDiv.querySelector('.save-route-section');
                    if (saveSection) {
                        saveSection.style.display = 'block';
                    }
                    return;
                }

                const rawHour = optimal.hour;
                const displayHour = rawHour.toString().padStart(2, '0') + ':00';
                const applyArg = rawHour;

                let html = `
                    <div class="recommendation-card best" data-hour="${rawHour}">
                        <div class="recommendation-header">
                            <span class="recommendation-time"><i class="fas fa-clock"></i> ${displayHour}</span>
                            <span class="recommendation-badge">Best Time</span>
                        </div>
                        <p style="margin: 0.5rem 0; font-size: 0.85rem; color: #64748b;">
                            Optimal departure time based on predicted congestion and travel time.
                        </p>
                        <div class="recommendation-stats">
                            <div class="rec-stat"><div class="rec-stat-value">${optimal.congestion_percent?.toFixed ? optimal.congestion_percent.toFixed(1) : optimal.congestion_percent || 'N/A'}%</div><div class="rec-stat-label">Congestion</div></div>
                            <div class="rec-stat"><div class="rec-stat-value">${optimal.travel_time_min?.toFixed ? optimal.travel_time_min.toFixed(1) : optimal.travel_time_min || 'N/A'} min</div><div class="rec-stat-label">Est. Time</div></div>
                            <div class="rec-stat"><div class="rec-stat-value">${route.summary && route.summary.average_speed_kmh ? route.summary.average_speed_kmh + ' km/h' : 'N/A'}</div><div class="rec-stat-label">Avg. Speed</div></div>
                        </div>
                        <button class="action-btn btn-secondary btn-full" style="margin-top: 0.75rem;" onclick="window.Routely.applyRecommendation(${applyArg})">
                            <i class="fas fa-check"></i> Use This Time
                        </button>
                    </div>
                `;

                if (recList && recList.length > 0) {
                    html += `<div style="margin-top: 15px; font-size: 0.85rem; color: #64748b;">
                        <strong>Tips:</strong>
                        <ul style="margin-top: 5px; padding-left: 18px;">
                            ${recList.map(r => `<li>${r}</li>`).join('')}
                        </ul>
                    </div>`;
                }

                contentDiv.innerHTML = html;
                resultsDiv.style.display = 'block';

                // Show save section now that results are ready
                const saveSection = resultsDiv.querySelector('.save-route-section');
                if (saveSection) {
                    saveSection.style.display = 'block';
                }
            }
            
            displayFallbackRecommendations(timeFrom, timeTo) {
                const recommendations = [];
                const peakHours = [8, 9, 17, 18];
                for (let h = timeFrom; h <= timeTo && recommendations.length < 3; h++) {
                    if (!peakHours.includes(h)) {
                        const congestion = 20 + Math.random() * 30;
                        recommendations.push({
                            hour: h, congestion: Math.round(congestion), travel_time: Math.round(15 + congestion / 5),
                            rating: congestion < 35 ? 'Excellent' : congestion < 50 ? 'Good' : 'Fair',
                            description: congestion < 35 ? 'Low traffic - ideal time' : 'Moderate traffic'
                        });
                    }
                }
                if (recommendations.length === 0) recommendations.push({ hour: timeFrom, congestion: 45, travel_time: 25, rating: 'Fair', description: 'Peak hour traffic' });
                this.currentPlanData = { recommendations };
                this.displayPredictionResults({ recommendations });
            }

            resetPredictionsModal() {
                // Reset time window selects to their default values
                const fromSelect = document.getElementById('travelTimeFrom');
                const toSelect = document.getElementById('travelTimeTo');
                if (fromSelect) fromSelect.value = '8';
                if (toSelect) toSelect.value = '18';

                // Reset day type radio to weekday
                const weekdayRadio = document.querySelector('input[name="plannerDayType"][value="weekday"]');
                if (weekdayRadio) weekdayRadio.checked = true;

                // Clear selected road types
                document
                    .querySelectorAll('#predictionsRoadTypesList input[type="checkbox"]:checked')
                    .forEach(cb => { cb.checked = false; });

                // Hide results and clear content
                const resultsDiv = document.getElementById('predictionResults');
                const contentDiv = document.getElementById('predictionResultsContent');
                if (resultsDiv && contentDiv) {
                    resultsDiv.style.display = 'none';
                    contentDiv.innerHTML = '';
                }

                // Clear prediction-specific state so a new plan starts fresh
                this.currentPlanData = null;
            }
            
            applyRecommendation(hour) {
                if (typeof hour !== 'number' || isNaN(hour)) {
                    this.showNotification("Could not apply this recommendation because the time is invalid.", "warning");
                    return;
                }

                // Do not change global platform time or map settings, just remember selected hour
                if (!this.currentPlanData) {
                    this.currentPlanData = {};
                }
                this.currentPlanData.selected_hour = hour;

                const display = hour.toString().padStart(2, '0') + ':00';
                this.showNotification(`Predicted time ${display} selected. Enter a name and click "Save Route" to store this plan.`, "success");
            }
            
            async saveCurrentRoute() {
                const routeName = document.getElementById('routeNameInput').value.trim();
                if (!routeName) { this.showNotification("Please enter a route name", "warning"); return; }
                if (!this.startMarker || !this.endMarker) { this.showNotification("No route to save", "warning"); return; }
                
                const startLatLng = this.startMarker.getLatLng();
                const endLatLng = this.endMarker.getLatLng();
                
                try {
                    const response = await fetch('/save-route', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            route_name: routeName, route_type: 'predicted',
                            start_point: { lat: startLatLng.lat, lng: startLatLng.lng },
                            end_point: { lat: endLatLng.lat, lng: endLatLng.lng },
                            route_data: {
                                predictions: this.currentPlanData || null,
                                route_options: this.routeOptions || [],
                                settings: { hour: this.currentHour, day_type: this.currentDayType }
                            }
                        })
                    });
                    const result = await response.json();
                    if (result.success) {
                        this.showNotification("Route saved!", "success");
                        document.getElementById('routeNameInput').value = '';
                        // Reset predictions state and close modal after successful save
                        this.resetPredictionsModal();
                        closeModal('predictionsModal');
                        this.loadSavedRoutes();
                    } else throw new Error(result.error);
                } catch (error) { this.showNotification("Failed to save route", "error"); }
            }
            
            toggleSavedRoutesPanel() {
                const panel = document.getElementById('savedRoutesPanel');
                if (panel.style.display === 'none') { panel.style.display = 'block'; this.loadSavedRoutes(); }
                else { panel.style.display = 'none'; }
            }
            
            closeSavedRoutesPanel() { document.getElementById('savedRoutesPanel').style.display = 'none'; }
            
            async loadSavedRoutes() {
                const listDiv = document.getElementById('savedRoutesList');
                try {
                    const response = await fetch('/saved-routes');
                    const data = await response.json();
                    const routes = data.routes || [];
                    if (routes.length === 0) {
                        listDiv.innerHTML = '<div class="no-routes-message"><i class="fas fa-route"></i><p>No saved routes yet</p></div>';
                        return;
                    }
                    listDiv.innerHTML = routes.map(route => {
                        const isPredicted = route.type === 'predicted';
                        const badge = isPredicted ? '<span class="saved-route-badge">Predicted</span>' : '';
                        return `
                        <div class="saved-route-card" data-route-id="${route.id}">
                            <div class="saved-route-name">
                                <div class="saved-route-name-text">
                                    <i class="fas fa-route"></i>
                                    <span>${route.name}</span>
                                </div>
                                ${badge}
                            </div>
                            <div class="saved-route-meta"><span><i class="fas fa-calendar"></i> ${new Date(route.created_at).toLocaleDateString()}</span></div>
                            <div class="saved-route-actions">
                                <button class="route-action-btn load-btn" onclick="window.Routely.loadSavedRoute('${route.id}')"><i class="fas fa-map-marker-alt"></i> Load</button>
                                <button class="route-action-btn download-btn" onclick="window.Routely.downloadRouteInfo('${route.id}')"><i class="fas fa-download"></i> CSV</button>
                                <button class="route-action-btn delete-btn" onclick="window.Routely.showDeleteModal('${route.id}', '${route.name.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    `; }).join('');
                } catch (error) { listDiv.innerHTML = '<div class="no-routes-message"><i class="fas fa-exclamation-circle"></i><p>Failed to load</p></div>'; }
            }
            
            async loadSavedRoute(routeId) {
                try {
                    // Load a single saved route
                    const response = await fetch(`/saved-route/${routeId}`);
                    const data = await response.json();
                    if (!data.success || !data.route) {
                        this.showNotification(data.error || "Route not found", "error");
                        return;
                    }

                    const route = data.route;

                    // Restore markers from saved start/end
                    if (route.start_point) {
                        this.setStartPoint(L.latLng(route.start_point.lat, route.start_point.lng));
                    }
                    if (route.end_point) {
                        this.setEndPoint(L.latLng(route.end_point.lat, route.end_point.lng));
                    }

                    // Do NOT force time back to saved value – use current platform time/day
                    // Just inform the user we will recalculate with current data
                    this.closeSavedRoutesPanel();
                    this.showNotification(`Loaded saved route "${route.name}". Recalculating with current traffic...`, "info");

                    // Recalculate a single route for current time & day
                    await this.calculateRouteForCurrentTime();
                } catch (error) {
                    console.error('loadSavedRoute error:', error);
                    this.showNotification("Failed to load route", "error");
                }
            }

            async calculateRouteForCurrentTime() {
                if (!this.startMarker || !this.endMarker) {
                    this.showNotification("Please set both start and end points", "warning");
                    return;
                }

                const startLatLng = this.startMarker.getLatLng();
                const endLatLng = this.endMarker.getLatLng();

                this.showNotification("Recalculating route with current traffic...", "info");

                try {
                    const response = await fetch('/route', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            start: { lat: startLatLng.lat, lng: startLatLng.lng },
                            end: { lat: endLatLng.lat, lng: endLatLng.lng },
                            hour: this.currentHour,
                            day_type: this.currentDayType
                        })
                    });
                    const data = await response.json();
                    if (data.error) throw new Error(data.error);

                    // Build a single route option representing the recalculated route
                    const routeCoords = data.route || [];
                    const details = data.route_details || [];

                    let totalDistance = 0;
                    let avgCongestion = 0;
                    if (details.length > 0) {
                        totalDistance = details.reduce((sum, seg) => sum + (seg.length || 0), 0);
                        avgCongestion = details.reduce((sum, seg) => sum + (seg.congestion || 0.5), 0) / details.length;
                    }

                    const summary = {
                        total_distance_km: +(totalDistance / 1000).toFixed(2),
                        average_congestion: +(avgCongestion * 100).toFixed(1),
                        total_time_min: data.total_time_min
                    };

                    this.routeOptions = [{
                        name: 'Saved Route (current traffic)',
                        route: routeCoords,
                        total_time_min: data.total_time_min,
                        summary
                    }];
                    this.selectedRouteIndex = 0;

                    // Render the single option in the panel and select it
                    this.displayRouteOptions();
                    this.selectRoute(0);

                    this.showNotification(
                        `Route updated for current time (≈ ${data.total_time_min} min).`,
                        "success"
                    );
                } catch (error) {
                    console.error('calculateRouteForCurrentTime error:', error);
                    this.showNotification("Failed to recalculate route: " + error.message, "error");
                }
            }
            
            async downloadRouteInfo(routeId) {
                try {
                    const response = await fetch(`/download-route-data?route_id=${routeId}`);
                    if (!response.ok) throw new Error('Download failed');
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `route_${routeId}.csv`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    this.showNotification("Route info downloaded!", "success");
                } catch (error) { this.showNotification("Failed to download", "error"); }
            }
            
            showDeleteModal(routeId, routeName) {
                // Store pending delete and show modal
                this.pendingDeleteRouteId = routeId;
                pendingDeleteRouteId = routeId; // Also set global for confirmDeleteRoute
                const messageEl = document.getElementById('deleteRouteMessage');
                if (messageEl) {
                    messageEl.textContent = routeName 
                        ? `Are you sure you want to delete "${routeName}"?`
                        : 'Are you sure you want to delete this route?';
                }
                const modal = document.getElementById('deleteRouteModal');
                if (modal) modal.style.display = 'flex';
            }
            
            deleteSavedRoute(routeId, routeName) {
                this.showDeleteModal(routeId, routeName);
            }
            
            async confirmDeleteRoute() {
                if (!this.pendingDeleteRouteId) return;
                const routeId = this.pendingDeleteRouteId;
                const modal = document.getElementById('deleteRouteModal');
                if (modal) modal.style.display = 'none';
                try {
                    const response = await fetch(`/delete-route/${routeId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (result.success) { this.showNotification("Route deleted", "success"); this.loadSavedRoutes(); }
                    else throw new Error(result.error);
                } catch (error) { this.showNotification("Failed to delete", "error"); }
                this.pendingDeleteRouteId = null;
            }
            
            saveRouteOption(index) {
                console.log('saveRouteOption called with index:', index);
                console.log('routeOptions:', this.routeOptions);
                
                if (!this.routeOptions || index >= this.routeOptions.length) {
                    this.showNotification("No route to save", "warning");
                    return;
                }
                
                if (!this.startMarker || !this.endMarker) {
                    this.showNotification("Route points not set", "warning");
                    return;
                }
                
                const route = this.routeOptions[index];
                const defaultName = route.name || `Route ${index + 1}`;
                
                // Store pending save data
                this.pendingSaveRouteIndex = index;
                this.pendingSaveRoute = route;
                
                console.log('pendingSaveRoute set to:', this.pendingSaveRoute);
                
                // Set default name and show modal
                const input = document.getElementById('saveRouteNameInput');
                if (input) input.value = defaultName;
                const modal = document.getElementById('saveRouteModal');
                if (modal) modal.style.display = 'flex';
            }
            
            async confirmSaveRouteOption() {
                const input = document.getElementById('saveRouteNameInput');
                if (!input || !this.pendingSaveRoute) {
                    this.showNotification("No route to save", "error");
                    return;
                }
                
                const routeName = input.value.trim();
                if (!routeName) {
                    this.showNotification("Please enter a route name", "warning");
                    return;
                }
                
                const modal = document.getElementById('saveRouteModal');
                if (modal) modal.style.display = 'none';
                
                const route = this.pendingSaveRoute;
                const startLatLng = this.startMarker.getLatLng();
                const endLatLng = this.endMarker.getLatLng();
                
                try {
                    const response = await fetch('/save-route', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            route_name: routeName,
                            route_type: route.name || 'Route',
                            start_point: { lat: startLatLng.lat, lng: startLatLng.lng },
                            end_point: { lat: endLatLng.lat, lng: endLatLng.lng },
                            route_data: {
                                route: route.route,
                                total_time_min: route.total_time_min,
                                summary: route.summary,
                                settings: { hour: this.currentHour, day_type: this.currentDayType }
                            }
                        })
                    });
                    const result = await response.json();
                    if (result.success) {
                        this.showNotification(`Route "${routeName}" saved!`, "success");
                        this.loadSavedRoutes();
                    } else throw new Error(result.error);
                } catch (error) {
                    console.error("Save route error:", error);
                    this.showNotification("Failed to save route", "error");
                }
                this.pendingSaveRoute = null;
                this.pendingSaveRouteIndex = null;
            }

            setStartPoint(latlng) {
                // Remove existing start marker
                if (this.startMarker) {
                    this.markersLayer.removeLayer(this.startMarker);
                }

                // Create new start marker
                this.startMarker = this.createMarker(latlng, 'start', '#10b981', 'A');
                this.markersLayer.addLayer(this.startMarker);

                // Update input field
                document.getElementById('startPoint').value = 
                    `Location (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
                
                this.showNotification("Start point set", "success");
            }

            setEndPoint(latlng) {
                // Remove existing end marker
                if (this.endMarker) {
                    this.markersLayer.removeLayer(this.endMarker);
                }

                // Create new end marker
                this.endMarker = this.createMarker(latlng, 'end', '#ef4444', 'B');
                this.markersLayer.addLayer(this.endMarker);

                // Update input field
                document.getElementById('endPoint').value = 
                    `Location (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
                
                this.showNotification("Destination set", "success");
            }

            findOptimalRoute() {
                if (!this.startMarker || !this.endMarker) {
                    this.showNotification("Please set both start and end points", "warning");
                    return;
                }

                const startLatLng = this.startMarker.getLatLng();
                const endLatLng = this.endMarker.getLatLng();
                
                this.showNotification("Finding routes...", "info");
                
                // Call API to get multiple route options
                fetch('/multi-route', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        start: { lat: startLatLng.lat, lng: startLatLng.lng },
                        end: { lat: endLatLng.lat, lng: endLatLng.lng },
                        hour: this.currentHour,
                        day_type: this.currentDayType
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    
                    // Convert dictionary to array if needed
                    let routeOptions = data.route_options;
                    if (routeOptions && !Array.isArray(routeOptions)) {
                        // Backend returns dictionary, convert to array
                        routeOptions = Object.values(routeOptions);
                    }
                    this.routeOptions = routeOptions || [];
                    
                    if (this.routeOptions.length > 0) {
                        this.displayRouteOptions();
                        this.selectRoute(0);
                        this.showNotification(`Found ${this.routeOptions.length} route options!`, "success");
                    } else {
                        this.showNotification("No routes found", "warning");
                    }
                })
                .catch(error => {
                    console.error("Route error:", error);
                    this.showNotification("Failed to find route: " + error.message, "error");
                });
            }
            
            displayRouteOptions() {
                const panel = document.getElementById('routeOptionsPanel');
                const list = document.getElementById('routeOptionsList');
                
                if (!panel || !list) return;
                
                // Function to get color based on congestion level
                const getCongestionColor = (congestion) => {
                    if (congestion <= 20) return '#22c55e';      // Green - Low congestion
                    if (congestion <= 40) return '#84cc16';      // Lime - Light traffic
                    if (congestion <= 60) return '#eab308';      // Yellow - Moderate
                    if (congestion <= 80) return '#f97316';      // Orange - Heavy
                    if (congestion <= 90) return '#ef4444';      // Red - Very heavy
                    return '#7f1d1d';                             // Dark red - Extreme
                };
                
                const getCongestionLabel = (congestion) => {
                    if (congestion <= 20) return 'Low';
                    if (congestion <= 40) return 'Light';
                    if (congestion <= 60) return 'Moderate';
                    if (congestion <= 80) return 'Heavy';
                    if (congestion <= 90) return 'Very Heavy';
                    return 'Extreme';
                };
                
                list.innerHTML = this.routeOptions.map((route, index) => {
                    const name = route.name || ['Fastest Route', 'Shortest Route', 'Alternative'][index] || 'Route ' + (index + 1);
                    const time = route.total_time_min || (route.summary?.total_time_min) || 0;
                    const distance = route.summary?.total_distance_km || 0;
                    const congestion = route.summary?.average_congestion || 30;
                    const congestionColor = getCongestionColor(congestion);
                    const congestionLabel = getCongestionLabel(congestion);

                    // Blue accent color for route options
                    const accentColor = '#3b82f6'; // Tailwind blue-500
                    
                    // Store line color on route based on congestion (for map polyline)
                    route.color = congestionColor;
                    
                    return `
                        <div class="route-option-item ${index === 0 ? 'active' : ''}" data-index="${index}" style="border-left: 4px solid ${accentColor};">
                            <div class="route-option-header">
                                <span class="route-option-name">
                                    <i class="fas fa-route" style="color: ${accentColor}"></i>
                                    ${name}
                                </span>
                                <span class="route-option-badge" style="background: ${accentColor}20; color: ${accentColor}; border: 1px solid ${accentColor}40;">${index === 0 ? 'â˜… Best' : ''}</span>
                            </div>
                            <div class="route-option-stats">
                                <div class="route-stat">
                                    <div class="route-stat-value">${time} min</div>
                                    <div class="route-stat-label">Duration</div>
                                </div>
                                <div class="route-stat">
                                    <div class="route-stat-value">${distance} km</div>
                                    <div class="route-stat-label">Distance</div>
                                </div>
                                <div class="route-stat">
                                    <div class="route-stat-value" style="color: ${congestionColor}; font-weight: 700;">${Math.round(congestion)}%</div>
                                    <div class="route-stat-label" style="color: ${congestionColor};">${congestionLabel}</div>
                                </div>
                            </div>
                            <button class="save-route-option-btn" onclick="event.stopPropagation(); window.Routely.saveRouteOption(${index})">
                                <i class="fas fa-bookmark"></i> Save Route
                            </button>
                        </div>
                    `;
                }).join('');
                
                panel.style.display = 'block';
                
                // Bind click events to route options
                list.querySelectorAll('.route-option-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const index = parseInt(item.dataset.index);
                        this.selectRoute(index);
                        
                        // Update active class
                        list.querySelectorAll('.route-option-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                    });
                });
            }
            
            selectRoute(index) {
                if (index < 0 || index >= this.routeOptions.length) return;
                
                this.selectedRouteIndex = index;
                const route = this.routeOptions[index];
                
                // Clear existing route
                this.routeLayer.clearLayers();
                
                // Get route coordinates - backend returns 'route' key with [[lat, lng], ...] format
                const routeCoords = route.route || route.coordinates || [];
                
                console.log("Route coords:", routeCoords.length, "points");
                
                if (routeCoords.length > 0) {
                    // Always show selected route in blue on the map for clarity
                    const polyline = L.polyline(routeCoords, {
                        color: '#3b82f6', // Blue
                        weight: 7,
                        opacity: 0.9,
                        smoothFactor: 1
                    }).addTo(this.routeLayer);
                    
                    // Fit map to route bounds
                    this.map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
                    
                    this.showNotification(`Selected: ${route.name || 'Route ' + (index + 1)}`, "success");
                } else {
                    this.showNotification("Route has no coordinates to display", "warning");
                }
            }
            
            displayRoute(routeCoords) {
                // Clear existing route
                this.routeLayer.clearLayers();
                
                if (routeCoords && routeCoords.length > 0) {
                    const polyline = L.polyline(routeCoords, {
                        color: '#4361ee',
                        weight: 6,
                        opacity: 0.8,
                        smoothFactor: 1
                    }).addTo(this.routeLayer);
                    
                    this.map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
                }
            }

            // Route management
            clearRoute() {
                console.log("ðŸ§¹ Clearing route...");
                
                // Clear markers
                if (this.startMarker) {
                    this.markersLayer.removeLayer(this.startMarker);
                    this.startMarker = null;
                }
                if (this.endMarker) {
                    this.markersLayer.removeLayer(this.endMarker);
                    this.endMarker = null;
                }
                
                // Clear route layer
                if (this.routeLayer) {
                    this.routeLayer.clearLayers();
                }
                
                // Hide route options panel
                const panel = document.getElementById('routeOptionsPanel');
                if (panel) {
                    panel.style.display = 'none';
                }
                
                // Reset route options
                this.routeOptions = [];
                this.selectedRouteIndex = 0;
                
                // Clear inputs
                document.getElementById('startPoint').value = '';
                document.getElementById('endPoint').value = '';
                
                this.clickCount = 0;
                this.showNotification("Route cleared", "info");
            }

            switchStartEnd() {
                console.log("ðŸ”„ Switching start and end points...");
                
                if (!this.startMarker || !this.endMarker) {
                    this.showNotification("Set both points first", "warning");
                    return;
                }

                // Swap marker positions
                const startLatLng = this.startMarker.getLatLng();
                const endLatLng = this.endMarker.getLatLng();

                this.startMarker.setLatLng(endLatLng);
                this.endMarker.setLatLng(startLatLng);

                // Update input fields
                const startInput = document.getElementById('startPoint').value;
                const endInput = document.getElementById('endPoint').value;
                
                document.getElementById('startPoint').value = endInput;
                document.getElementById('endPoint').value = startInput;

                this.showNotification("Start and end points swapped", "success");
            }

            // Time management
            setCurrentTime() {
                const now = new Date();
                const hour = now.getHours();
                const minute = now.getMinutes();
                this.currentHour = hour;
                this.currentMinute = minute;
                this.isDisplayingRealTime = true;
                this.updateDisplayedTime(hour, minute);
                this.updateTimeLabel();
                return { hour, minutes: minute };
            }

            startTimeSimulation() {
                console.log("â° Starting time simulation...");
                
                if (this.isSimulating) {
                    // Stop simulation
                    clearInterval(this.simulationInterval);
                    this.isSimulating = false;
                    document.getElementById('startSimulationBtn').innerHTML = '<i class="fas fa-play"></i> Start Time Simulation';
                    this.showNotification("Simulation stopped", "info");
                    return;
                }
                
                this.isSimulating = true;
                this.isDisplayingRealTime = false;
                this.updateTimeLabel();
                document.getElementById('startSimulationBtn').innerHTML = '<i class="fas fa-pause"></i> Stop Simulation';
                this.showNotification("Simulation started - watching traffic changes over time", "success");
                
                // Simulate time progression
                this.simulationInterval = setInterval(() => {
                    this.currentHour = (this.currentHour + 1) % 24;
                    this.currentMinute = 0;
                    this.updateDisplayedTime(this.currentHour, this.currentMinute);
                    this.updateTimeLabel();
                    
                    // Update congestion data
                    this.loadCongestionData();
                    
                    this.showNotification(`Time: ${this.formatDisplayTime(this.currentHour, this.currentMinute)} - Traffic updated`, "info");
                }, 3000); // Change every 3 seconds
            }
            
            updateTimeAndCongestion(hour, minute = 0) {
                this.currentHour = hour;
                this.currentMinute = minute;
                this.isDisplayingRealTime = false;
                this.updateDisplayedTime(hour, minute);
                this.updateTimeLabel();
                
                // Reload congestion data with new time
                this.loadCongestionData();
                this.showNotification(`Congestion updated for ${this.formatDisplayTime(hour, minute)}`, "success");
            }

            updateDisplayedTime(hour, minute) {
                const timeDisplay = document.getElementById('currentTimeDisplay');
                if (timeDisplay) {
                    timeDisplay.textContent = this.formatDisplayTime(hour, minute);
                }
            }

            updateTimeLabel() {
                const timeLabel = document.querySelector('.time-label');
                if (timeLabel) {
                    timeLabel.textContent = this.isDisplayingRealTime ? 'Current Time' : 'Simulated Time';
                }
            }

            formatDisplayTime(hour, minute = 0) {
                const hourText = hour.toString().padStart(2, '0');
                const minuteText = minute.toString().padStart(2, '0');
                return `${hourText}:${minuteText}`;
            }

            applyManualTime() {
                const input = document.getElementById('manualTimeInput');
                if (!input) {
                    return;
                }
                if (!input.value) {
                    this.showNotification('Select a time before applying', 'warning');
                    return;
                }

                const [hourStr, minuteStr] = input.value.split(':');
                const hour = parseInt(hourStr, 10);
                const minute = parseInt(minuteStr, 10);

                if (Number.isNaN(hour) || Number.isNaN(minute)) {
                    this.showNotification('Invalid time selected', 'error');
                    return;
                }

                this.updateTimeAndCongestion(hour, minute);
            }

            // Analytics
            async showTrafficStats() {
                console.log("ðŸ“Š Showing traffic statistics...");
                
                const modal = document.getElementById('statsModal');
                const body = document.getElementById('statsModalBody');
                
                modal.style.display = 'flex';
                body.innerHTML = '<div class="stats-loading"><i class="fas fa-spinner fa-spin"></i> Loading statistics...</div>';
                
                try {
                    const response = await fetch(`/traffic-data?hour=${this.currentHour}&day_type=${this.currentDayType}`);
                    const stats = await response.json();
                    
                    body.innerHTML = `
                        <div class="stats-grid-modal">
                            <div class="stat-card-modal">
                                <div class="value">${stats.total_roads || 1247}</div>
                                <div class="label">Total Roads</div>
                            </div>
                            <div class="stat-card-modal">
                                <div class="value">${stats.total_road_length_km?.toFixed(1) || 856} km</div>
                                <div class="label">Total Length</div>
                            </div>
                            <div class="stat-card-modal">
                                <div class="value">${((stats.avg_congestion || 0.23) * 100).toFixed(1)}%</div>
                                <div class="label">Avg Congestion</div>
                            </div>
                            <div class="stat-card-modal">
                                <div class="value">${stats.avg_speed?.toFixed(1) || 38} km/h</div>
                                <div class="label">Avg Speed</div>
                            </div>
                        </div>
                        
                        <h4 style="margin: 1rem 0 0.75rem; color: #2b2d42;"><i class="fas fa-traffic-light" style="color: #4361ee;"></i> Congestion Distribution</h4>
                        <div class="congestion-bars">
                            <div class="congestion-bar">
                                <div class="congestion-color" style="background: #10b981;"></div>
                                <div class="congestion-label">Free Flow</div>
                                <div class="congestion-progress"><div class="congestion-fill" style="width: ${stats.congestion_distribution?.free_flow || 25}%; background: #10b981;"></div></div>
                                <div class="congestion-percent">${stats.congestion_distribution?.free_flow || 25}%</div>
                            </div>
                            <div class="congestion-bar">
                                <div class="congestion-color" style="background: #f59e0b;"></div>
                                <div class="congestion-label">Moderate</div>
                                <div class="congestion-progress"><div class="congestion-fill" style="width: ${stats.congestion_distribution?.moderate || 35}%; background: #f59e0b;"></div></div>
                                <div class="congestion-percent">${stats.congestion_distribution?.moderate || 35}%</div>
                            </div>
                            <div class="congestion-bar">
                                <div class="congestion-color" style="background: #ef4444;"></div>
                                <div class="congestion-label">Heavy</div>
                                <div class="congestion-progress"><div class="congestion-fill" style="width: ${stats.congestion_distribution?.heavy || 25}%; background: #ef4444;"></div></div>
                                <div class="congestion-percent">${stats.congestion_distribution?.heavy || 25}%</div>
                            </div>
                            <div class="congestion-bar">
                                <div class="congestion-color" style="background: #dc2626;"></div>
                                <div class="congestion-label">Severe</div>
                                <div class="congestion-progress"><div class="congestion-fill" style="width: ${stats.congestion_distribution?.severe || 15}%; background: #dc2626;"></div></div>
                                <div class="congestion-percent">${stats.congestion_distribution?.severe || 15}%</div>
                            </div>
                        </div>
                    `;
                } catch (error) {
                    console.error("Error loading stats:", error);
                    body.innerHTML = '<div class="stats-loading" style="color: #ef4444;">Failed to load statistics</div>';
                }
            }

            async showPatternAnalysis() {
                console.log("ðŸ“ˆ Showing pattern analysis...");
                
                const modal = document.getElementById('patternsModal');
                const body = document.getElementById('patternsModalBody');
                
                modal.style.display = 'flex';
                body.innerHTML = '<div class="stats-loading"><i class="fas fa-spinner fa-spin"></i> Loading patterns...</div>';
                
                try {
                    const response = await fetch('/traffic-patterns');
                    const patterns = await response.json();
                    
                    const peakHours = patterns.peak_hours || [
                        { hour: '08:00', congestion: 75 },
                        { hour: '09:00', congestion: 68 },
                        { hour: '17:00', congestion: 82 },
                        { hour: '18:00', congestion: 78 },
                        { hour: '19:00', congestion: 65 }
                    ];
                    
                    body.innerHTML = `
                        <div class="pattern-section">
                            <h4><i class="fas fa-clock"></i> Peak Traffic Hours</h4>
                            <div class="peak-hours-grid">
                                ${peakHours.slice(0, 6).map(h => `
                                    <div class="peak-hour-item">
                                        <div class="time">${h.hour}</div>
                                        <div class="level">${h.congestion}% congestion</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="pattern-section">
                            <h4><i class="fas fa-calendar-week"></i> Weekly Pattern</h4>
                            <div class="stats-grid-modal">
                                <div class="stat-card-modal">
                                    <div class="value">${patterns.weekday_avg?.toFixed(0) || 45}%</div>
                                    <div class="label">Weekday Avg</div>
                                </div>
                                <div class="stat-card-modal">
                                    <div class="value">${patterns.weekend_avg?.toFixed(0) || 28}%</div>
                                    <div class="label">Weekend Avg</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="pattern-section">
                            <h4><i class="fas fa-sun"></i> Best Travel Times</h4>
                            <div class="peak-hours-grid">
                                <div class="peak-hour-item" style="border-left-color: #10b981; background: rgba(16, 185, 129, 0.1);">
                                    <div class="time">10:00 AM</div>
                                    <div class="level" style="color: #10b981;">Low traffic</div>
                                </div>
                                <div class="peak-hour-item" style="border-left-color: #10b981; background: rgba(16, 185, 129, 0.1);">
                                    <div class="time">2:00 PM</div>
                                    <div class="level" style="color: #10b981;">Low traffic</div>
                                </div>
                                <div class="peak-hour-item" style="border-left-color: #10b981; background: rgba(16, 185, 129, 0.1);">
                                    <div class="time">9:00 PM</div>
                                    <div class="level" style="color: #10b981;">Low traffic</div>
                                </div>
                            </div>
                        </div>
                    `;
                } catch (error) {
                    console.error("Error loading patterns:", error);
                    body.innerHTML = '<div class="stats-loading" style="color: #ef4444;">Failed to load patterns</div>';
                }
            }

            async showAdvancedAnalytics() {
                console.log("ðŸ“ˆ Showing advanced analytics...");
                
                const modal = document.getElementById('analyticsModal');
                const body = document.getElementById('analyticsModalBody');
                
                modal.style.display = 'flex';
                body.innerHTML = '<div class="stats-loading"><i class="fas fa-spinner fa-spin"></i> Loading analytics...</div>';
                
                try {
                    const [statsRes, patternsRes, predictionRes] = await Promise.all([
                        fetch(`/traffic-data?hour=${this.currentHour}&day_type=${this.currentDayType}`),
                        fetch('/traffic-patterns'),
                        fetch(`/traffic-prediction?hour=${this.currentHour}&day_type=${this.currentDayType}`)
                    ]);
                    
                    const stats = await statsRes.json();
                    const patterns = await patternsRes.json();
                    const predictions = await predictionRes.json();
                    
                    const recommendations = predictions.recommendations || [
                        { hour: '10:00', rating: 'Excellent', description: 'Best time to travel - minimal congestion expected' },
                        { hour: '14:00', rating: 'Good', description: 'Low traffic period - smooth journey likely' },
                        { hour: '20:00', rating: 'Good', description: 'Evening traffic subsiding - favorable conditions' }
                    ];
                    
                    body.innerHTML = `
                        <div class="stats-grid-modal">
                            <div class="stat-card-modal">
                                <div class="value">${stats.total_roads || 1247}</div>
                                <div class="label">Roads Monitored</div>
                            </div>
                            <div class="stat-card-modal">
                                <div class="value">${((stats.avg_congestion || 0.23) * 100).toFixed(0)}%</div>
                                <div class="label">Current Congestion</div>
                            </div>
                            <div class="stat-card-modal">
                                <div class="value">${this.currentHour}:00</div>
                                <div class="label">Analysis Time</div>
                            </div>
                            <div class="stat-card-modal">
                                <div class="value">${this.currentDayType}</div>
                                <div class="label">Day Type</div>
                            </div>
                        </div>
                        
                        <div class="pattern-section">
                            <h4><i class="fas fa-lightbulb"></i> Travel Recommendations</h4>
                            ${recommendations.slice(0, 3).map(rec => `
                                <div style="background: rgba(67, 97, 238, 0.1); padding: 1rem; border-radius: 8px; margin-bottom: 0.75rem; border-left: 4px solid ${rec.rating === 'Excellent' ? '#10b981' : rec.rating === 'Good' ? '#4361ee' : '#f59e0b'};">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                        <strong>${rec.hour || rec.time}</strong>
                                        <span style="background: ${rec.rating === 'Excellent' ? '#10b981' : rec.rating === 'Good' ? '#4361ee' : '#f59e0b'}; color: white; padding: 0.2rem 0.5rem; border-radius: 12px; font-size: 0.75rem;">${rec.rating}</span>
                                    </div>
                                    <p style="margin: 0; font-size: 0.85rem; color: #64748b;">${rec.description}</p>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="pattern-section">
                            <h4><i class="fas fa-road"></i> Road Type Analysis</h4>
                            <div class="stats-grid-modal">
                                ${Object.entries(stats.road_type_distribution || { 'highway': 45, 'primary': 120, 'secondary': 85, 'residential': 180 })
                                    .slice(0, 4)
                                    .map(([type, count]) => `
                                        <div class="stat-card-modal">
                                            <div class="value">${count}</div>
                                            <div class="label">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                                        </div>
                                    `).join('')}
                            </div>
                        </div>
                    `;
                } catch (error) {
                    console.error("Error loading analytics:", error);
                    body.innerHTML = '<div class="stats-loading" style="color: #ef4444;">Failed to load analytics</div>';
                }
            }

            // Tutorial and Help
            startTutorial() {
                console.log("ðŸŽ“ Starting tutorial...");
                document.getElementById('tutorialModal').style.display = 'flex';
                currentTutorialStep = 1;
                updateTutorialStep();
            }

            showTips() {
                console.log("ðŸ’¡ Showing tips...");
                document.getElementById('tipsModal').style.display = 'flex';
            }

            showHelp() {
                console.log("â“ Showing help...");
                document.getElementById('helpModal').style.display = 'flex';
            }

            // Theme management
            initializeTheme() {
                const savedTheme = localStorage.getItem('routely-theme') || 'light';
                document.documentElement.setAttribute('data-theme', savedTheme);
                this.updateThemeIcon(savedTheme);
            }

            toggleTheme() {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('routely-theme', newTheme);
                this.updateThemeIcon(newTheme);
                
                this.showNotification(`Switched to ${newTheme} theme`, 'info');
            }

            updateThemeIcon(theme) {
                const themeToggle = document.getElementById('themeToggle');
                if (themeToggle) {
                    const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
                    themeToggle.setAttribute('aria-label', label);
                    themeToggle.setAttribute('title', label);
                }
            }

            // Utility functions
            showNotification(message, type = 'info') {
                // Create notification element
                const notification = document.createElement('div');
                notification.className = `notification notification-${type}`;
                notification.innerHTML = `
                    <div class="notification-content">
                        <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                        <span>${message}</span>
                    </div>
                `;
                
                // Add styles
                notification.style.cssText = `
                    position: fixed;
                    top: 100px;
                    right: 20px;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(20px);
                    border-radius: 12px;
                    padding: 1rem 1.5rem;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    color: #2b2d42;
                    font-weight: 500;
                    animation: slideInRight 0.3s ease;
                    max-width: 300px;
                `;
                
                // Add icon color based on type
                const icon = notification.querySelector('i');
                const colors = {
                    info: '#4361ee',
                    success: '#4cc9a7',
                    warning: '#f59e0b',
                    error: '#ef4444'
                };
                icon.style.color = colors[type] || colors.info;
                
                document.body.appendChild(notification);
                
                // Remove after 3 seconds
                setTimeout(() => {
                    notification.style.animation = 'slideOutRight 0.3s ease';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }, 3000);
            }

            getNotificationIcon(type) {
                const icons = {
                    info: 'info-circle',
                    success: 'check-circle',
                    warning: 'exclamation-triangle',
                    error: 'exclamation-circle'
                };
                return icons[type] || 'info-circle';
            }

            showError(message) {
                const errorDiv = document.createElement('div');
                errorDiv.innerHTML = `
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: white; z-index: 1000;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                        <h3>Map Loading Error</h3>
                        <p>${message}</p>
                        <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4361ee; color: white; border: none; border-radius: 8px; cursor: pointer;">
                            <i class="fas fa-redo"></i> Reload Page
                        </button>
                    </div>
                `;
                document.getElementById('map').appendChild(errorDiv);
            }

            bindEventListeners() {
                console.log("ðŸ”— Binding event listeners...");
                
                // Theme toggle
                document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
                
                // Quick actions
                document.getElementById('zoomInBtn').addEventListener('click', () => {
                    if (this.map) this.map.zoomIn();
                });
                
                document.getElementById('zoomOutBtn').addEventListener('click', () => {
                    if (this.map) this.map.zoomOut();
                });
                
                // Header buttons
                document.getElementById('predictionsToggle').addEventListener('click', () => this.openPredictionsModal());
                
                document.getElementById('settingsToggle').addEventListener('click', () => this.openSettingsModal());
                
                // Smart Travel Planner
                document.getElementById('getPredictionsBtn').addEventListener('click', () => this.getSmartTravelPlan());
                document.getElementById('saveRouteBtn').addEventListener('click', () => this.saveCurrentRoute());
                
                // Saved Routes
                document.getElementById('showSavedRoutesBtn').addEventListener('click', () => this.toggleSavedRoutesPanel());
                document.getElementById('closeSavedRoutes').addEventListener('click', () => this.closeSavedRoutesPanel());
                
                // Settings modal - dark mode toggle
                document.getElementById('darkModeToggle').addEventListener('change', (e) => {
                    if (e.target.checked) {
                        document.documentElement.setAttribute('data-theme', 'dark');
                        localStorage.setItem('routely-theme', 'dark');
                        this.setMapTheme('dark');
                    } else {
                        document.documentElement.setAttribute('data-theme', 'light');
                        localStorage.setItem('routely-theme', 'light');
                        this.setMapTheme('light');
                    }
                });
                
                // Close predictions modal on background click
                document.getElementById('predictionsModal').addEventListener('click', (e) => {
                    if (e.target.id === 'predictionsModal') {
                        this.resetPredictionsModal();
                        closeModal('predictionsModal');
                    }
                });
                document.getElementById('settingsModal').addEventListener('click', (e) => {
                    if (e.target.id === 'settingsModal') closeModal('settingsModal');
                });
                
                // Panel toggle
                document.getElementById('panelToggle').addEventListener('click', function(e) {
                    const panel = document.getElementById('routely-controls');
                    panel.classList.toggle('collapsed');
                    const icon = this.querySelector('i');
                    if (icon) {
                        icon.classList.toggle('fa-chevron-left');
                        icon.classList.toggle('fa-chevron-right');
                    }
                });

                const panelCloseBtn = document.getElementById('panelCloseBtn');
                if (panelCloseBtn) {
                    panelCloseBtn.addEventListener('click', () => {
                        const panelToggle = document.getElementById('panelToggle');
                        if (panelToggle) {
                            panelToggle.click();
                        }
                    });
                }
                
                // Map point selection buttons
                document.getElementById('setStartPointBtn').addEventListener('click', () => {
                    this.isSettingStartPoint = true;
                    this.isSettingEndPoint = false;
                    this.showNotification("Click on the map to set start point", "info");
                });
                
                document.getElementById('setEndPointBtn').addEventListener('click', () => {
                    this.isSettingEndPoint = true;
                    this.isSettingStartPoint = false;
                    this.showNotification("Click on the map to set destination", "info");
                });
                
                // Route buttons
                document.getElementById('clearRouteBtn').addEventListener('click', () => this.clearRoute());
                document.getElementById('switchPointsBtn').addEventListener('click', () => this.switchStartEnd());
                document.getElementById('findRouteBtn').addEventListener('click', () => this.findOptimalRoute());
                
                // Time buttons
                document.getElementById('useCurrentTimeBtn').addEventListener('click', () => {
                    const result = this.setCurrentTime();
                    this.currentHour = result.hour;
                    this.loadCongestionData();
                    this.showNotification("Set to current time - congestion updated", "success");
                });
                document.getElementById('startSimulationBtn').addEventListener('click', () => this.startTimeSimulation());
                const applyManualTimeBtn = document.getElementById('applyManualTimeBtn');
                if (applyManualTimeBtn) {
                    applyManualTimeBtn.addEventListener('click', () => this.applyManualTime());
                }
                
                // Time presets
                document.querySelectorAll('.time-preset-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const time = e.target.getAttribute('data-time');
                        if (time === 'now') {
                            const result = this.setCurrentTime();
                            this.currentHour = result.hour;
                            this.loadCongestionData();
                            this.showNotification(`Time set to current - congestion updated`, "success");
                        } else {
                            const hour = parseInt(time);
                            this.updateTimeAndCongestion(hour);
                        }
                    });
                });
                
                // Day type buttons
                document.querySelectorAll('.day-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
                        e.target.classList.add('active');
                        const dayType = e.target.getAttribute('data-day');
                        this.currentDayType = dayType;
                        this.loadCongestionData();
                        this.showNotification(`Day type set to ${dayType} - congestion updated`, "success");
                    });
                });
                
                // Close route options panel
                document.getElementById('closeRouteOptions').addEventListener('click', () => {
                    document.getElementById('routeOptionsPanel').style.display = 'none';
                });
                
                // Close modals on background click
                ['statsModal', 'patternsModal', 'analyticsModal'].forEach(modalId => {
                    const modal = document.getElementById(modalId);
                    if (modal) {
                        modal.addEventListener('click', (e) => {
                            if (e.target === modal) {
                                modal.style.display = 'none';
                            }
                        });
                    }
                });
                
                // Analytics buttons
                document.getElementById('showStatsBtn').addEventListener('click', () => this.showTrafficStats());
                document.getElementById('showPatternsBtn').addEventListener('click', () => this.showPatternAnalysis());
                document.getElementById('showAnalyticsBtn').addEventListener('click', () => this.showAdvancedAnalytics());
                
                // Tutorial buttons
                document.getElementById('startTutorialBtn').addEventListener('click', () => this.startTutorial());
                document.getElementById('showTipsBtn').addEventListener('click', () => this.showTips());
                document.getElementById('showHelpBtn').addEventListener('click', () => this.showHelp());
                
                console.log("âœ… All event listeners bound!");
            }

            async loadCongestionData() {
                try {
                    const response = await fetch(`/roads?hour=${this.currentHour}&day_type=${this.currentDayType}`);
                    if (!response.ok) throw new Error('Failed to load road data');
                    
                    const roadData = await response.json();
                    
                    // Remove existing road layer
                    if (this.roadLayer) {
                        this.map.removeLayer(this.roadLayer);
                    }
                    
                    // Create a feature group for all road segments
                    this.roadLayer = L.featureGroup().addTo(this.map);
                    
                    // Add each road segment to the map with color based on congestion
                    roadData.forEach(road => {
                        const polyline = L.polyline(road.coords, {
                            color: road.color,
                            weight: road.weight,
                            opacity: 0.8
                        }).addTo(this.roadLayer);
                    });
                    
                    console.log(`âœ… Traffic data loaded for ${this.currentHour}:00 (${this.currentDayType})`);
                } catch (error) {
                    console.error("âŒ Error loading congestion data:", error);
                    this.showNotification("Failed to load traffic data", "error");
                }
            }
            
            createMarker(latlng, type, color, label) {
                const icon = L.divIcon({
                    className: '',
                    html: `
                        <div class="routely-marker marker-${type}">
                            <div class="marker-pin" style="background: ${color};">${label}</div>
                            <div class="marker-label">${type === 'start' ? 'Start' : 'Destination'}</div>
                        </div>
                    `,
                    iconSize: [0, 0],
                    // Anchor at the center of the circular pin so the click point matches the pin position
                    iconAnchor: [12, 12]
                });
                
                return L.marker(latlng, { icon: icon, draggable: true });
            }
        }

        // Initialize the app when DOM is loaded
        document.addEventListener('DOMContentLoaded', function() {
            window.Routely = new RoutelyApp();
            console.log("âœ… Routely fully initialized!");
            window.Routely.showNotification("Click on the map to set start and destination points.", "success");
        });

        // Add CSS animations for notifications
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            /* Tutorial, Tips, and Help Modal Styles */
            .tutorial-content {
                padding: 1rem;
            }
            
            .tutorial-step {
                display: none;
                animation: fadeIn 0.3s ease;
            }
            
            .tutorial-step.active {
                display: block;
            }
            
            .tutorial-step h4 {
                color: #2b2d42;
                margin-bottom: 1rem;
                font-size: 1.1rem;
            }
            
            .tutorial-step p {
                color: #4a5568;
                margin-bottom: 1rem;
                line-height: 1.6;
            }
            
            .tutorial-step ul {
                margin: 1rem 0;
                padding-left: 1.5rem;
            }
            
            .tutorial-step li {
                color: #4a5568;
                margin-bottom: 0.5rem;
                line-height: 1.5;
            }
            
            .tutorial-highlight {
                background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
                border-left: 4px solid #0ea5e9;
                padding: 1rem;
                border-radius: 8px;
                margin-top: 1rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }
            
            .tutorial-highlight.success {
                background: linear-gradient(135deg, #f0fdf4, #dcfce7);
                border-left-color: #22c55e;
            }
            
            .tutorial-highlight i {
                color: #0ea5e9;
                font-size: 1.2rem;
            }
            
            .tutorial-highlight.success i {
                color: #22c55e;
            }
            
            .tutorial-navigation {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 1rem;
                border-top: 1px solid #e2e8f0;
                margin-top: 1rem;
            }
            
            .tutorial-progress {
                font-size: 0.9rem;
                color: #64748b;
                font-weight: 500;
            }
            
            .tutorial-btn {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 6px;
                font-size: 0.9rem;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .tutorial-btn.btn-primary {
                background: #4361ee;
                color: white;
            }
            
            .tutorial-btn.btn-primary:hover {
                background: #3a56d4;
            }
            
            .tutorial-btn.btn-secondary {
                background: #e2e8f0;
                color: #475569;
            }
            
            .tutorial-btn.btn-secondary:hover {
                background: #cbd5e1;
            }
            
            .tutorial-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            /* Tips Modal Styles */
            .tips-content {
                padding: 0.5rem;
            }
            
            .tip-category {
                margin-bottom: 2rem;
            }
            
            .tip-category h4 {
                color: #2b2d42;
                margin-bottom: 1rem;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .tip-category h4 i {
                color: #4361ee;
            }
            
            .tip-category ul {
                list-style: none;
                padding: 0;
            }
            
            .tip-category li {
                padding: 0.5rem 0;
                color: #4a5568;
                line-height: 1.5;
                border-bottom: 1px solid #f1f5f9;
            }
            
            .tip-category li:last-child {
                border-bottom: none;
            }
            
            .tip-category li strong {
                color: #2b2d42;
            }
            
            /* Help Modal Styles */
            .help-content {
                padding: 0.5rem;
            }
            
            .help-section {
                margin-bottom: 2rem;
            }
            
            .help-section h4 {
                color: #2b2d42;
                margin-bottom: 1rem;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .help-section h4 i {
                color: #4361ee;
            }
            
            .help-item {
                margin-bottom: 1.5rem;
                padding: 1rem;
                background: #f8fafc;
                border-radius: 8px;
                border-left: 3px solid #e2e8f0;
            }
            
            .help-item h5 {
                color: #2b2d42;
                margin-bottom: 0.5rem;
                font-size: 0.95rem;
                font-weight: 600;
            }
            
            .help-item p {
                color: #4a5568;
                line-height: 1.5;
                margin: 0;
            }
            
            @keyframes fadeIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            /* Support Form Styles */
            .support-form-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
                margin-bottom: 1rem;
            }
            
            .form-group {
                margin-bottom: 1.5rem;
            }
            
            .form-group label {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: #2b2d42;
                font-weight: 500;
                margin-bottom: 0.5rem;
                font-size: 0.9rem;
            }
            
            .form-group label i {
                color: #4361ee;
                font-size: 0.8rem;
            }
            
            .form-group input,
            .form-group select,
            .form-group textarea {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                font-size: 0.9rem;
                transition: all 0.2s ease;
                background: white;
            }
            
            .form-group input:focus,
            .form-group select:focus,
            .form-group textarea:focus {
                outline: none;
                border-color: #4361ee;
                box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.1);
            }
            
            .form-group input[readonly] {
                background: #f8fafc;
                color: #64748b;
            }
            
            .form-group textarea {
                resize: vertical;
                min-height: 120px;
            }
            
            .form-hint {
                display: block;
                margin-top: 0.25rem;
                color: #64748b;
                font-size: 0.8rem;
            }
            
            .form-actions {
                display: flex;
                gap: 1rem;
                justify-content: flex-end;
                padding-top: 1rem;
                border-top: 1px solid #e2e8f0;
            }
            
            .support-message {
                text-align: center;
                padding: 2rem;
            }
            
            .support-message.success {
                color: #22c55e;
            }
            
            .support-message.success i {
                font-size: 3rem;
                color: #22c55e;
                margin-bottom: 1rem;
            }
            
            .support-message.success h4 {
                color: #22c55e;
                margin-bottom: 0.5rem;
            }
            
            .support-message.error {
                color: #ef4444;
            }
            
            .support-message.error i {
                font-size: 3rem;
                color: #ef4444;
                margin-bottom: 1rem;
            }
            
            .support-message.error h4 {
                color: #ef4444;
                margin-bottom: 0.5rem;
            }
            
            .support-message p {
                color: #4a5568;
                margin-bottom: 1.5rem;
            }
            
            @media (max-width: 640px) {
                .support-form-grid {
                    grid-template-columns: 1fr;
                }
                
                .form-actions {
                    flex-direction: column;
                }
                
                .form-actions button {
                    width: 100%;
                }
            }
            
            /* Additional styles for time controls */
            .time-display-card {
                background: rgba(255, 255, 255, 0.8);
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 1rem;
                border: 1px solid rgba(255, 255, 255, 0.3);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .time-current {
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            
            .time-current i {
                color: #4361ee;
                font-size: 1.2rem;
            }
            
            .time-info {
                display: flex;
                flex-direction: column;
            }
            
            .time-label {
                font-size: 0.8rem;
                color: #64748b;
                font-weight: 500;
            }
            
            .time-value {
                font-size: 1.2rem;
                font-weight: 600;
                color: #2b2d42;
            }
            
            .time-action-btn {
                background: rgba(255, 255, 255, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: #64748b;
                width: 36px;
                height: 36px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .time-action-btn:hover {
                background: #4361ee;
                color: white;
                border-color: #4361ee;
            }
            
            .time-controls {
                margin-bottom: 1rem;
            }
            
            .time-presets {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 0.5rem;
                margin-bottom: 1rem;
            }
            
            .time-preset-btn {
                background: rgba(255, 255, 255, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: #2b2d42;
                padding: 0.5rem;
                border-radius: 8px;
                font-size: 0.8rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .time-preset-btn:hover {
                background: #4361ee;
                color: white;
                border-color: #4361ee;
            }
            
            .day-type-selector {
                margin-bottom: 1rem;
            }
            
            .day-type-selector label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 500;
                color: #2b2d42;
                font-size: 0.9rem;
            }
            
            .day-buttons {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.5rem;
            }
            
            .day-btn {
                background: rgba(255, 255, 255, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: #2b2d42;
                padding: 0.5rem 1rem;
                border-radius: 8px;
                font-size: 0.9rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .day-btn.active,
            .day-btn:hover {
                background: #4361ee;
                color: white;
                border-color: #4361ee;
            }
            
            .analytics-buttons {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 0.5rem;
            }
            
            .help-actions {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            
            /* Route Options Panel */
            .route-options-panel {
                position: absolute;
                bottom: 20px;
                right: 20px;
                z-index: 1001;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                border: 1px solid rgba(255, 255, 255, 0.3);
                width: 320px;
                max-height: 400px;
                overflow: hidden;
            }
            
            .route-options-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem;
                border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                background: rgba(255, 255, 255, 0.8);
            }
            
            .route-options-header h4 {
                margin: 0;
                color: #2b2d42;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .route-options-header h4 i {
                color: #4361ee;
            }
            
            .close-panel-btn {
                background: none;
                border: none;
                color: #64748b;
                cursor: pointer;
                padding: 0.25rem;
                border-radius: 4px;
                transition: all 0.3s ease;
            }
            
            .close-panel-btn:hover {
                background: #ef4444;
                color: white;
            }
            
            .route-options-list {
                padding: 0.5rem;
                max-height: 320px;
                overflow-y: auto;
            }
            
            .route-option-item {
                background: rgba(255, 255, 255, 0.8);
                border: 2px solid rgba(0, 0, 0, 0.1);
                border-radius: 12px;
                padding: 1rem;
                margin-bottom: 0.5rem;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .route-option-item:hover {
                border-color: #4361ee;
                transform: translateY(-2px);
            }
            
            .route-option-item.active {
                border-color: #4361ee;
                background: rgba(67, 97, 238, 0.1);
            }
            
            .route-option-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.5rem;
            }
            
            .route-option-name {
                font-weight: 600;
                color: #2b2d42;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .route-option-badge {
                background: #4361ee;
                color: white;
                padding: 0.15rem 0.5rem;
                border-radius: 12px;
                font-size: 0.7rem;
                font-weight: 600;
            }
            
            .route-option-badge.fastest {
                background: #10b981;
            }
            
            .route-option-badge.shortest {
                background: #f59e0b;
            }
            
            .route-option-badge.scenic {
                background: #9d4edd;
            }
            
            .route-option-stats {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 0.5rem;
                font-size: 0.8rem;
            }
            
            .route-stat {
                text-align: center;
            }
            
            .route-stat-value {
                font-weight: 600;
                color: #2b2d42;
            }
            
            .route-stat-label {
                color: #64748b;
                font-size: 0.7rem;
            }
            
            /* Modal Styles */
            .modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(5px);
                z-index: 2000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .modal-content {
                background: rgba(255, 255, 255, 0.98);
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow: hidden;
                animation: modalSlideIn 0.3s ease;
            }
            
            .modal-content.analytics-modal {
                max-width: 700px;
            }
            
            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1.25rem;
                border-bottom: 2px solid #4361ee;
                background: rgba(255, 255, 255, 0.9);
            }
            
            .modal-title {
                margin: 0;
                color: #2b2d42;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .modal-title i {
                color: #4361ee;
            }
            
            .close-modal {
                background: none;
                border: none;
                color: #64748b;
                font-size: 1.2rem;
                cursor: pointer;
                padding: 0.5rem;
                border-radius: 8px;
                transition: all 0.3s ease;
            }
            
            .close-modal:hover {
                background: #ef4444;
                color: white;
            }
            
            .modal-body {
                padding: 1.5rem;
                max-height: 60vh;
                overflow-y: auto;
            }
            
            .stats-loading {
                text-align: center;
                padding: 2rem;
                color: #64748b;
            }
            
            .stats-grid-modal {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 1rem;
                margin-bottom: 1.5rem;
            }
            
            .stat-card-modal {
                background: rgba(67, 97, 238, 0.1);
                padding: 1rem;
                border-radius: 12px;
                text-align: center;
                border-left: 4px solid #4361ee;
            }
            
            .stat-card-modal .value {
                font-size: 1.8rem;
                font-weight: 700;
                color: #4361ee;
            }
            
            .stat-card-modal .label {
                font-size: 0.85rem;
                color: #64748b;
                margin-top: 0.25rem;
            }
            
            .congestion-bars {
                margin: 1rem 0;
            }
            
            .congestion-bar {
                display: flex;
                align-items: center;
                margin-bottom: 0.75rem;
                gap: 0.75rem;
            }
            
            .congestion-color {
                width: 20px;
                height: 20px;
                border-radius: 4px;
                flex-shrink: 0;
            }
            
            .congestion-label {
                width: 80px;
                font-size: 0.9rem;
                color: #2b2d42;
            }
            
            .congestion-progress {
                flex: 1;
                height: 8px;
                background: rgba(0, 0, 0, 0.1);
                border-radius: 4px;
                overflow: hidden;
            }
            
            .congestion-fill {
                height: 100%;
                border-radius: 4px;
                transition: width 0.5s ease;
            }
            
            .congestion-percent {
                width: 40px;
                text-align: right;
                font-weight: 600;
                font-size: 0.85rem;
                color: #2b2d42;
            }
            
            .pattern-section {
                margin-bottom: 1.5rem;
            }
            
            .pattern-section h4 {
                margin: 0 0 1rem 0;
                color: #2b2d42;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .pattern-section h4 i {
                color: #4361ee;
            }
            
            .peak-hours-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 0.75rem;
            }
            
            .peak-hour-item {
                background: rgba(239, 68, 68, 0.1);
                padding: 0.75rem;
                border-radius: 8px;
                text-align: center;
                border-left: 3px solid #ef4444;
            }
            
            .peak-hour-item .time {
                font-weight: 600;
                color: #2b2d42;
            }
            
            .peak-hour-item .level {
                font-size: 0.8rem;
                color: #ef4444;
            }
            
            .chart-container-modal {
                margin: 1rem 0;
                height: 200px;
                position: relative;
            }
            
            [data-theme="dark"] .modal-content {
                background: rgba(30, 41, 59, 0.98);
            }
            
            [data-theme="dark"] .modal-header {
                background: rgba(30, 41, 59, 0.9);
            }
            
            [data-theme="dark"] .modal-title,
            [data-theme="dark"] .stat-card-modal .value,
            [data-theme="dark"] .congestion-label,
            [data-theme="dark"] .congestion-percent,
            [data-theme="dark"] .pattern-section h4,
            [data-theme="dark"] .peak-hour-item .time,
            [data-theme="dark"] .route-option-name,
            [data-theme="dark"] .route-stat-value,
            [data-theme="dark"] .route-options-header h4 {
                color: #f1f5f9;
            }
            
            [data-theme="dark"] .route-options-panel,
            [data-theme="dark"] .route-option-item {
                background: rgba(30, 41, 59, 0.95);
            }
            
            [data-theme="dark"] .route-options-header {
                background: rgba(30, 41, 59, 0.8);
            }
            
            /* Smart Travel Planner Styles */
            .predictions-modal {
                max-width: 550px;
            }
            
            .planner-section {
                margin-bottom: 1.5rem;
                padding-bottom: 1rem;
                border-bottom: 1px solid rgba(0, 0, 0, 0.1);
            }
            
            .planner-section:last-of-type {
                border-bottom: none;
            }
            
            .planner-section h4 {
                margin: 0 0 1rem 0;
                color: #2b2d42;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .planner-section h4 i {
                color: #4361ee;
            }
            
            .time-range-inputs {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
            }
            
            .input-group-inline {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            
            .input-group-inline label {
                font-size: 0.85rem;
                color: #64748b;
                font-weight: 500;
            }
            
            .input-group-inline select {
                padding: 0.75rem;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                font-size: 0.9rem;
                background: white;
                color: #2b2d42;
                cursor: pointer;
            }
            
            .input-group-inline select:focus {
                outline: none;
                border-color: #4361ee;
                box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.1);
            }
            
            .road-type-checkboxes,
            .day-type-radio {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            
            .checkbox-item,
            .radio-item {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                cursor: pointer;
                padding: 0.5rem 0.75rem;
                border-radius: 8px;
                transition: background 0.2s;
                color: #2b2d42;
                font-size: 0.9rem;
            }
            
            .checkbox-item:hover,
            .radio-item:hover {
                background: rgba(67, 97, 238, 0.05);
            }
            
            .checkbox-item input,
            .radio-item input {
                width: 18px;
                height: 18px;
                accent-color: #4361ee;
            }
            
            .day-type-radio {
                flex-direction: row;
                gap: 1.5rem;
            }
            
            .planner-actions {
                margin-top: 1rem;
            }
            
            .prediction-results {
                margin-top: 1.5rem;
                padding-top: 1.5rem;
                border-top: 2px solid #4361ee;
            }
            
            .prediction-results h4 {
                margin: 0 0 1rem 0;
                color: #2b2d42;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .prediction-results h4 i {
                color: #f59e0b;
            }
            
            .recommendation-card {
                background: rgba(67, 97, 238, 0.1);
                padding: 1rem;
                border-radius: 10px;
                margin-bottom: 0.75rem;
                border-left: 4px solid #4361ee;
            }
            
            .recommendation-card.best {
                border-left-color: #10b981;
                background: rgba(16, 185, 129, 0.1);
            }
            
            .recommendation-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.5rem;
            }
            
            .recommendation-time {
                font-weight: 600;
                color: #2b2d42;
            }
            
            .recommendation-badge {
                background: #10b981;
                color: white;
                padding: 0.2rem 0.5rem;
                border-radius: 12px;
                font-size: 0.7rem;
                font-weight: 600;
            }
            
            .recommendation-stats {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 0.5rem;
                margin-top: 0.75rem;
            }
            
            .rec-stat {
                text-align: center;
                padding: 0.5rem;
                background: rgba(255, 255, 255, 0.5);
                border-radius: 6px;
            }
            
            .rec-stat-value {
                font-weight: 600;
                color: #2b2d42;
                font-size: 0.95rem;
            }
            
            .rec-stat-label {
                font-size: 0.7rem;
                color: #64748b;
            }
            
            .save-route-section {
                display: flex;
                gap: 0.5rem;
                margin-top: 1rem;
            }
            
            .save-route-section input {
                flex: 1;
                padding: 0.75rem;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                font-size: 0.9rem;
            }
            
            .save-route-section input:focus {
                outline: none;
                border-color: #4361ee;
            }
            
            /* Settings Modal */
            .settings-section {
                margin-bottom: 1.5rem;
            }
            
            .settings-section h4 {
                margin: 0 0 1rem 0;
                color: #2b2d42;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .settings-section h4 i {
                color: #4361ee;
            }
            
            /* Saved Routes Panel */
            .saved-routes-panel {
                position: absolute;
                top: 100px;
                right: 90px;
                z-index: 1001;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                border: 1px solid rgba(255, 255, 255, 0.3);
                width: 350px;
                max-height: 500px;
                overflow: hidden;
            }
            
            .saved-routes-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem;
                border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                background: rgba(255, 255, 255, 0.8);
            }
            
            .saved-routes-header h4 {
                margin: 0;
                color: #2b2d42;
                font-size: 1rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .saved-routes-header h4 i {
                color: #4361ee;
            }
            
            .saved-routes-list {
                padding: 0.75rem;
                max-height: 420px;
                overflow-y: auto;
            }
            
            .no-routes-message {
                text-align: center;
                padding: 2rem;
                color: #64748b;
            }
            
            .no-routes-message i {
                font-size: 2rem;
                margin-bottom: 0.5rem;
                opacity: 0.5;
            }
            
            .saved-route-card {
                background: rgba(255, 255, 255, 0.8);
                border: 2px solid rgba(0, 0, 0, 0.1);
                border-radius: 12px;
                padding: 1rem;
                margin-bottom: 0.75rem;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .saved-route-card:hover {
                border-color: #4361ee;
                transform: translateY(-2px);
            }
            
            .saved-route-card.active {
                border-color: #4361ee;
                background: rgba(67, 97, 238, 0.1);
            }
            
            .saved-route-name {
                font-weight: 600;
                color: #2b2d42;
                margin-bottom: 0.5rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .saved-route-name i {
                color: #4361ee;
            }
            
            .saved-route-meta {
                display: flex;
                gap: 1rem;
                font-size: 0.8rem;
                color: #64748b;
                margin-bottom: 0.75rem;
            }
            
            .saved-route-actions {
                display: flex;
                gap: 0.5rem;
            }
            
            .route-action-btn {
                flex: 1;
                padding: 0.5rem;
                border: none;
                border-radius: 6px;
                font-size: 0.8rem;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.3rem;
            }
            
            .route-action-btn.load-btn {
                background: #4361ee;
                color: white;
            }
            
            .route-action-btn.download-btn {
                background: #10b981;
                color: white;
            }
            
            .route-action-btn.delete-btn {
                background: #ef4444;
                color: white;
            }
            
            .route-action-btn:hover {
                opacity: 0.9;
                transform: scale(1.02);
            }
            
            /* Dark theme for new elements */
            [data-theme="dark"] .planner-section h4,
            [data-theme="dark"] .prediction-results h4,
            [data-theme="dark"] .checkbox-item,
            [data-theme="dark"] .radio-item,
            [data-theme="dark"] .recommendation-time,
            [data-theme="dark"] .rec-stat-value,
            [data-theme="dark"] .settings-section h4,
            [data-theme="dark"] .saved-routes-header h4,
            [data-theme="dark"] .saved-route-name {
                color: #f1f5f9;
            }
            
            [data-theme="dark"] .input-group-inline select,
            [data-theme="dark"] .save-route-section input {
                background: #1e293b;
                border-color: #334155;
                color: #f1f5f9;
            }
            
            [data-theme="dark"] .saved-routes-panel,
            [data-theme="dark"] .saved-route-card {
                background: rgba(30, 41, 59, 0.95);
            }
            
            [data-theme="dark"] .saved-routes-header {
                background: rgba(30, 41, 59, 0.8);
            }
            
            /* Save Route Button in Route Options */
            .save-route-option-btn {
                width: 100%;
                margin-top: 0.75rem;
                padding: 0.5rem 1rem;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                transition: all 0.2s ease;
            }
            
            .save-route-option-btn:hover {
                background: linear-gradient(135deg, #059669 0%, #047857 100%);
                transform: translateY(-1px);
            }
            
            .save-route-option-btn i {
                font-size: 0.75rem;
            }
            
            /* Comprehensive Dark Mode for Map Page */
            [data-theme="dark"] body {
                background: #0f172a;
                color: #f1f5f9;
            }
            
            [data-theme="dark"] #routely-controls {
                background: rgba(15, 23, 42, 0.95);
                border-color: #334155;
            }
            
            [data-theme="dark"] .control-section {
                background: rgba(30, 41, 59, 0.5);
                border-color: #334155;
            }
            
            [data-theme="dark"] .control-section h3,
            [data-theme="dark"] .section-title {
                color: #f1f5f9;
            }
            
            [data-theme="dark"] .input-field,
            [data-theme="dark"] input[type="text"],
            [data-theme="dark"] input[type="number"],
            [data-theme="dark"] select {
                background: #1e293b;
                border-color: #334155;
                color: #f1f5f9;
            }
            
            [data-theme="dark"] .action-btn.btn-secondary {
                background: #334155;
                color: #f1f5f9;
            }
            
            [data-theme="dark"] .quick-action-btn {
                background: rgba(30, 41, 59, 0.8);
                color: #f1f5f9;
                border-color: #334155;
            }
            
            [data-theme="dark"] .quick-action-btn:hover {
                background: rgba(51, 65, 85, 0.9);
            }
            
            [data-theme="dark"] .time-display {
                background: rgba(30, 41, 59, 0.8);
                color: #f1f5f9;
            }
            
            [data-theme="dark"] .analysis-btn {
                background: rgba(30, 41, 59, 0.8);
                color: #f1f5f9;
                border-color: #334155;
            }
            
            [data-theme="dark"] .analysis-btn:hover {
                background: rgba(51, 65, 85, 0.9);
            }
            
            [data-theme="dark"] .panel-toggle {
                background: rgba(15, 23, 42, 0.95);
                border-color: #334155;
                color: #f1f5f9;
            }
            
            [data-theme="dark"] .notification {
                background: rgba(30, 41, 59, 0.95);
                color: #f1f5f9;
                border-color: #334155;
            }
        `;
        document.head.appendChild(style);
        
        // Global modal close function
        window.closeModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
            }
        };
        
        // Tutorial navigation functions
        let currentTutorialStep = 1;
        const totalTutorialSteps = 7;
        
        function updateTutorialStep() {
            // Hide all steps
            for (let i = 1; i <= totalTutorialSteps; i++) {
                const step = document.getElementById(`tutorialStep${i}`);
                if (step) {
                    step.classList.remove('active');
                }
            }
            
            // Show current step
            const currentStep = document.getElementById(`tutorialStep${currentTutorialStep}`);
            if (currentStep) {
                currentStep.classList.add('active');
            }
            
            // Update progress
            const progress = document.getElementById('tutorialProgress');
            if (progress) {
                progress.textContent = `Step ${currentTutorialStep} of ${totalTutorialSteps}`;
            }
            
            // Update buttons
            const prevBtn = document.getElementById('tutorialPrev');
            const nextBtn = document.getElementById('tutorialNext');
            
            if (prevBtn) {
                prevBtn.disabled = currentTutorialStep === 1;
            }
            
            if (nextBtn) {
                if (currentTutorialStep === totalTutorialSteps) {
                    nextBtn.innerHTML = '<i class="fas fa-check"></i> Finish';
                    nextBtn.onclick = () => closeModal('tutorialModal');
                } else {
                    nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
                    nextBtn.onclick = tutorialNextStep;
                }
            }
        }
        
        function tutorialNextStep() {
            if (currentTutorialStep < totalTutorialSteps) {
                currentTutorialStep++;
                updateTutorialStep();
            }
        }
        
        function tutorialPrevStep() {
            if (currentTutorialStep > 1) {
                currentTutorialStep--;
                updateTutorialStep();
            }
        }
        
        // Close modals on background click
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                // Close any open modal
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => {
                    if (modal.style.display === 'flex') {
                        modal.style.display = 'none';
                    }
                });
            }
        });
        
        // Support form functions
        function openSupportForm() {
            // Close help modal and open support modal
            closeModal('helpModal');
            document.getElementById('supportModal').style.display = 'flex';
            
            // Auto-fill browser info
            const browserInfo = getBrowserInfo();
            document.getElementById('supportBrowser').value = browserInfo;
        }
        
        function getBrowserInfo() {
            const userAgent = navigator.userAgent;
            let browserName = 'Unknown';
            let browserVersion = 'Unknown';
            
            // Detect browser
            if (userAgent.indexOf('Chrome') > -1) {
                browserName = 'Chrome';
                const match = userAgent.match(/Chrome\/(\d+)/);
                if (match) browserVersion = match[1];
            } else if (userAgent.indexOf('Firefox') > -1) {
                browserName = 'Firefox';
                const match = userAgent.match(/Firefox\/(\d+)/);
                if (match) browserVersion = match[1];
            } else if (userAgent.indexOf('Safari') > -1) {
                browserName = 'Safari';
                const match = userAgent.match(/Version\/(\d+)/);
                if (match) browserVersion = match[1];
            } else if (userAgent.indexOf('Edge') > -1) {
                browserName = 'Edge';
                const match = userAgent.match(/Edge\/(\d+)/);
                if (match) browserVersion = match[1];
            }
            
            // Detect OS
            let osName = 'Unknown';
            if (userAgent.indexOf('Windows') > -1) osName = 'Windows';
            else if (userAgent.indexOf('Mac') > -1) osName = 'macOS';
            else if (userAgent.indexOf('Linux') > -1) osName = 'Linux';
            else if (userAgent.indexOf('Android') > -1) osName = 'Android';
            else if (userAgent.indexOf('iOS') > -1) osName = 'iOS';
            
            return `${browserName} ${browserVersion}, ${osName}`;
        }
        
        // Contact Support Modal Functions
        function openContactSupportModal() {
            // Close help modal if open
            closeModal('helpModal');
            // Open contact support modal
            document.getElementById('contactSupportModal').style.display = 'flex';
        }
        
        async function submitContactForm(event) {
            event.preventDefault();
            
            const submitBtn = document.getElementById('submitSupportBtn');
            const originalText = submitBtn.innerHTML;
            
            // Get form values
            const name = document.getElementById('supportName').value.trim();
            const surname = document.getElementById('supportSurname').value.trim();
            const email = document.getElementById('supportEmail').value.trim();
            const subject = document.getElementById('supportSubject').value;
            const message = document.getElementById('supportMessage').value.trim();
            
            // Validate
            if (!name || !surname || !email || !subject || !message) {
                if (window.Routely) {
                    window.Routely.showNotification('Please fill in all required fields', 'warning');
                } else {
                    alert('Please fill in all required fields');
                }
                return;
            }
            
            // Disable button and show loading
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            
            try {
                const response = await fetch('/send-support-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        surname: surname,
                        email: email,
                        subject: subject,
                        message: message,
                        problem: message
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Close modal
                    closeModal('contactSupportModal');
                    
                    // Reset form
                    document.getElementById('contactSupportForm').reset();
                    
                    // Show success message
                    if (window.Routely) {
                        window.Routely.showNotification('Message sent successfully! We will get back to you soon.', 'success');
                    } else {
                        alert('Message sent successfully! We will get back to you soon.');
                    }
                } else {
                    throw new Error(result.error || 'Failed to send message');
                }
            } catch (error) {
                console.error('Contact form error:', error);
                if (window.Routely) {
                    window.Routely.showNotification('Failed to send message. Please try again later.', 'error');
                } else {
                    alert('Failed to send message. Please try again later.');
                }
            } finally {
                // Re-enable button
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }

// Modal confirm/save/delete
// Global confirm functions for modals
        async function confirmSaveRoute() {
            console.log('confirmSaveRoute called');
            
            const input = document.getElementById('saveRouteNameInput');
            if (!input) {
                console.log('Input not found');
                return;
            }
            
            const routeName = input.value.trim();
            console.log('Route name:', routeName);
            
            if (!routeName) {
                if (window.Routely) {
                    window.Routely.showNotification('Please enter a route name', 'warning');
                } else {
                    alert('Please enter a route name');
                }
                return;
            }
            
            // Close modal first
            document.getElementById('saveRouteModal').style.display = 'none';
            
            // Check if Routely app exists
            if (!window.Routely) {
                alert('App not initialized');
                return;
            }
            
            const app = window.Routely;
            console.log('App pendingSaveRoute:', app.pendingSaveRoute);
            console.log('App routeOptions:', app.routeOptions);
            console.log('App startMarker:', app.startMarker);
            console.log('App endMarker:', app.endMarker);
            
            // If pendingSaveRoute is set (from saveRouteOption), use that
            if (app.pendingSaveRoute) {
                console.log('Using pendingSaveRoute path');
                await app.confirmSaveRouteOption();
                return;
            }
            
            // Otherwise, try to save the current route directly
            let routeData = null;
            let startPoint = null;
            let endPoint = null;
            
            // Get route data from app
            if (app.routeOptions && app.routeOptions.length > 0) {
                routeData = app.routeOptions[0]; // Use first route option
            }
            
            // Get markers
            if (app.startMarker) {
                const latlng = app.startMarker.getLatLng();
                startPoint = { lat: latlng.lat, lng: latlng.lng };
            }
            if (app.endMarker) {
                const latlng = app.endMarker.getLatLng();
                endPoint = { lat: latlng.lat, lng: latlng.lng };
            }
            
            if (!routeData || !startPoint || !endPoint) {
                console.log('Save route debug:', { routeData, startPoint, endPoint, routeOptions: app.routeOptions });
                app.showNotification('No route data to save. Please generate a route first.', 'warning');
                return;
            }
            
            const payload = {
                route_name: routeName,
                route_type: routeData.name || 'Route',
                start_point: startPoint,
                end_point: endPoint,
                route_data: {
                    route: routeData.route || [],
                    total_time_min: routeData.total_time_min || 0,
                    summary: routeData.summary || {},
                    settings: { hour: app.currentHour || 12, day_type: app.currentDayType || 'weekday' }
                }
            };
            
            console.log('Saving route with payload:', payload);
            
            try {
                const response = await fetch('/save-route', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    app.showNotification(`Route "${routeName}" saved!`, "success");
                    app.loadSavedRoutes();
                } else {
                    app.showNotification('Failed to save route: ' + (result.error || 'Unknown error'), 'error');
                }
            } catch (error) {
                console.error('Save route error:', error);
                app.showNotification('Failed to save route', 'error');
            }
        }
        
        async function confirmDeleteRoute() {
            // Close modal
            document.getElementById('deleteRouteModal').style.display = 'none';
            
            // Try Routely app first
            if (window.Routely && window.Routely.pendingDeleteRouteId) {
                await window.Routely.confirmDeleteRoute();
                return;
            }
            
            // Try global pendingDeleteRouteId
            if (typeof pendingDeleteRouteId !== 'undefined' && pendingDeleteRouteId) {
                try {
                    const response = await fetch(`/delete-route/${pendingDeleteRouteId}`, { method: 'DELETE' });
                    const result = await response.json();
                    if (result.success) {
                        if (window.Routely) {
                            window.Routely.showNotification('Route deleted successfully', 'success');
                            window.Routely.loadSavedRoutes();
                        } else {
                            alert('Route deleted successfully');
                        }
                    } else {
                        alert('Failed to delete route: ' + (result.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Delete route error:', error);
                    alert('Failed to delete route');
                }
                pendingDeleteRouteId = null;
            }
        }
        
        // Global variable to store pending delete route ID
        var pendingDeleteRouteId = null;
