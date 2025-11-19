// Analytics and Modal Functions
function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modals = ['statsModal', 'speedModal', 'predictionModal', 'patternModal', 'smartPlannerModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target === modal) closeModal(modalId);
    });
}

// Traffic Statistics
async function showStats() {
    try {
        const timeInput = document.getElementById('timeInput').value;
        const [hours] = timeInput.split(':').map(Number);
        const dayType = document.getElementById('dayType').value;

        const res = await axios.get(`/traffic-data?hour=${hours}&day_type=${dayType}`);
        const stats = res.data;

        let statsHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${stats.total_roads}</div>
                    <div class="stat-label">Total Roads</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.total_road_length_km}</div>
                    <div class="stat-label">Road Length (km)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${(stats.avg_congestion * 100).toFixed(1)}%</div>
                    <div class="stat-label">Avg Congestion</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.total_nodes}</div>
                    <div class="stat-label">Intersections</div>
                </div>
            </div>

            <div class="congestion-bars">
                <h3 style="margin-bottom: 15px; color: var(--modal-text);">Congestion Distribution</h3>
                <div class="congestion-bar">
                    <div class="congestion-color" style="background:#4CAF50"></div>
                    <div class="congestion-label">Low (&lt;30%)</div>
                    <div class="congestion-count">${stats.congestion_distribution.low} roads</div>
                </div>
                <div class="congestion-bar">
                    <div class="congestion-color" style="background:#FF9800"></div>
                    <div class="congestion-label">Medium (30-60%)</div>
                    <div class="congestion-count">${stats.congestion_distribution.medium} roads</div>
                </div>
                <div class="congestion-bar">
                    <div class="congestion-color" style="background:#F44336"></div>
                    <div class="congestion-label">High (&gt;60%)</div>
                    <div class="congestion-count">${stats.congestion_distribution.high} roads</div>
                </div>
            </div>

            <div class="road-type-stats">
                <h3 style="margin-bottom: 15px; color: var(--modal-text);">Road Types</h3>
        `;

        Object.entries(stats.road_type_distribution).forEach(([type, count]) => {
            const avgCongestion = stats.avg_congestion_by_type[type] || 0;
            statsHTML += `
                <div class="road-type-item">
                    <span class="road-type-name">${type}</span>
                    <span class="road-type-value">${count} roads (${(avgCongestion * 100).toFixed(1)}%)</span>
                </div>
            `;
        });

        statsHTML += `</div>`;

        document.getElementById('statsContent').innerHTML = statsHTML;
        showModal('statsModal');
    } catch (error) {
        console.error('Stats error:', error);
        alert('Error loading traffic statistics');
    }
}

// Speed vs Congestion Chart
function showSpeedCongestionChart() {
    let chartHTML = `
        <div class="speed-chart">
            <h3 style="margin-bottom: 15px; color: var(--modal-text);">🚗 Speed vs Congestion Relationship</h3>
            <p style="margin-bottom: 20px; color: var(--text-secondary);">Max Speed Limit: 60 km/h</p>
    `;

    for (let congestion = 0; congestion <= 100; congestion += 10) {
        const speed = calculateSpeed(congestion);
        const color = congestion < 30 ? '#4CAF50' : congestion < 60 ? '#FF9800' : '#F44336';

        chartHTML += `
            <div class="speed-item" style="border-left-color: ${color}">
                <span class="speed-congestion">Congestion ${congestion}%</span>
                <span class="speed-value">→ ${speed.toFixed(0)} km/h</span>
            </div>
        `;
    }

    chartHTML += `
            <div style="margin-top: 20px; padding: 15px; background: var(--card-bg); border-radius: 10px;">
                <p style="color: var(--text-secondary); margin: 0;">
                    <strong>Note:</strong> Speed decreases as congestion increases. At night (low congestion), 
                    roads show green and vehicles can travel at maximum speed limits.
                </p>
            </div>
        </div>
    `;

    document.getElementById('speedContent').innerHTML = chartHTML;
    showModal('speedModal');
}

// Traffic Predictions
async function showTrafficPredictions() {
    try {
        const timeInput = document.getElementById('timeInput').value;
        const [hours] = timeInput.split(':').map(Number);
        const dayType = document.getElementById('dayType').value;

        const res = await axios.get(`/traffic-prediction?hour=${hours}&day_type=${dayType}`);
        const data = res.data;

        let predictionHTML = `
            <div style="margin-bottom: 20px;">
                <h3 style="color: var(--modal-text); margin-bottom: 10px;">Best Times to Travel</h3>
                <p style="color: var(--text-secondary);">Based on current time: ${data.current_time}</p>
            </div>
        `;

        if (data.recommendations && data.recommendations.length > 0) {
            data.recommendations.slice(0, 6).forEach(rec => {
                predictionHTML += `
                    <div class="prediction-card ${rec.rating.toLowerCase()}">
                        <div class="prediction-header">
                            <span class="prediction-time">${rec.hour}:00</span>
                            <span class="prediction-rating" style="background: ${rec.color}">${rec.rating}</span>
                        </div>
                        <div class="prediction-description">
                            ${rec.description} (${rec.congestion}% congestion)
                        </div>
                    </div>
                `;
            });

            if (data.best_time) {
                predictionHTML += `
                    <div style="margin-top: 20px; padding: 15px; background: var(--card-bg); border-radius: 10px;">
                        <h4 style="color: var(--primary); margin-bottom: 8px;">💡 Best Time to Travel</h4>
                        <p style="color: var(--modal-text); margin: 0;">
                            <strong>${data.best_time.hour}:00</strong> - ${data.best_time.description}<br>
                            Only ${data.best_time.congestion}% congestion expected
                        </p>
                    </div>
                `;
            }
        } else {
            predictionHTML += `<p style="color: var(--text-secondary); text-align: center;">No prediction data available</p>`;
        }

        document.getElementById('predictionContent').innerHTML = predictionHTML;
        showModal('predictionModal');
    } catch (error) {
        console.error('Prediction error:', error);
        alert('Error loading traffic predictions');
    }
}

// Pattern Analysis
async function showPatternAnalysis() {
    try {
        const res = await axios.get('/traffic-patterns');
        const patterns = res.data;

        let patternHTML = `
            <div style="margin-bottom: 20px;">
                <h3 style="color: var(--modal-text); margin-bottom: 15px;">Traffic Pattern Analysis</h3>
                
                <div class="pattern-grid">
                    <div class="pattern-card">
                        <div class="pattern-value">${patterns.peak_hours[0]?.hour || 8}:00</div>
                        <div class="pattern-label">Peak Hour</div>
                    </div>
                    <div class="pattern-card">
                        <div class="pattern-value">${patterns.peak_hours[0]?.congestion || 65}%</div>
                        <div class="pattern-label">Max Congestion</div>
                    </div>
                </div>
            </div>
        `;

        // Peak Hours
        patternHTML += `<h4 style="color: var(--modal-text); margin-bottom: 10px;">🚦 Peak Traffic Hours</h4>`;
        patterns.peak_hours.forEach((peak, index) => {
            patternHTML += `
                <div class="hotspot-item">
                    <span class="hotspot-name">${peak.hour}:00</span>
                    <span class="hotspot-congestion">${peak.congestion}% congestion</span>
                </div>
            `;
        });

        // Congestion Hotspots
        patternHTML += `<h4 style="color: var(--modal-text); margin-top: 20px; margin-bottom: 10px;">📍 Congestion Hotspots</h4>`;
        patterns.congestion_hotspots.forEach(hotspot => {
            const trendIcon = hotspot.trend === 'increasing' ? '📈' :
                hotspot.trend === 'decreasing' ? '📉' : '➡️';
            const trendClass = hotspot.trend === 'increasing' ? 'trend-up' :
                hotspot.trend === 'decreasing' ? 'trend-down' : 'trend-stable';

            patternHTML += `
                <div class="hotspot-item">
                    <div>
                        <div class="hotspot-name">${hotspot.name}</div>
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">${hotspot.type}</div>
                    </div>
                    <div class="${trendClass}">
                        ${hotspot.congestion}% ${trendIcon}
                    </div>
                </div>
            `;
        });

        // Daily Trends Chart
        patternHTML += `
            <h4 style="color: var(--modal-text); margin-top: 20px; margin-bottom: 10px;">📊 Daily Traffic Patterns</h4>
            <div class="chart-container">
                <canvas id="dailyPatternChart"></canvas>
            </div>
        `;

        document.getElementById('patternContent').innerHTML = patternHTML;
        showModal('patternModal');

        // Render chart after modal is shown
        setTimeout(() => {
            renderDailyPatternChart(patterns.daily_trends);
        }, 100);

    } catch (error) {
        console.error('Pattern analysis error:', error);
        alert('Error loading traffic patterns');
    }
}

function renderDailyPatternChart(dailyTrends) {
    const ctx = document.getElementById('dailyPatternChart').getContext('2d');

    const hours = dailyTrends.map(d => d.hour);
    const weekdayData = dailyTrends.map(d => d.weekday);
    const weekendData = dailyTrends.map(d => d.weekend);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: hours.map(h => `${h}:00`),
            datasets: [
                {
                    label: 'Weekday',
                    data: weekdayData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Weekend',
                    data: weekendData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Congestion (%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time of Day'
                    }
                }
            }
        }
    });
}

// Data Export Functions
async function downloadTrafficData() {
    try {
        const timeInput = document.getElementById('timeInput').value;
        const [hours] = timeInput.split(':').map(Number);
        const dayType = document.getElementById('dayType').value;

        showLoading();

        const response = await fetch(`/download-traffic-data?hour=${hours}&day_type=${dayType}`);

        if (!response.ok) {
            throw new Error('Failed to download traffic data');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'yerevan_traffic_data.csv';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        hideLoading();
        showNotification('Traffic data downloaded successfully!', 'success');

    } catch (error) {
        console.error('Download error:', error);
        hideLoading();
        showNotification('Failed to download traffic data', 'error');
    }
}

async function downloadRouteData() {
    if (!selectedRoute || !window.routeOptions || !window.routeOptions[selectedRoute]) {
        showNotification('Please select a route first by clicking on a route option', 'warning');
        return;
    }

    try {
        showLoading();
        console.log('Downloading route data for:', selectedRoute);

        const routeData = window.routeOptions[selectedRoute];
        console.log('Route data structure:', routeData);

        if (!routeData.route_details || !Array.isArray(routeData.route_details)) {
            throw new Error('Invalid route details data');
        }

        const payload = {
            route_details: routeData.route_details,
            route_name: routeData.name || selectedRoute
        };

        console.log('Sending payload:', payload);

        const response = await fetch('/download-route-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server response error:', errorText);
            throw new Error(`Server error: ${response.status} ${errorText}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'yerevan_route_data.csv';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        hideLoading();
        showNotification('Route data downloaded successfully!', 'success');

    } catch (error) {
        console.error('Route download error:', error);
        hideLoading();
        showNotification('Failed to download route data: ' + error.message, 'error');
    }
}

function updateDownloadButton() {
    const downloadBtn = document.getElementById('downloadRouteBtn');
    if (selectedRoute && window.routeOptions && window.routeOptions[selectedRoute]) {
        downloadBtn.disabled = false;
        downloadBtn.style.opacity = '1';
        downloadBtn.title = 'Download detailed data for the selected route';
        console.log('Download button enabled for route:', selectedRoute);
    } else {
        downloadBtn.disabled = true;
        downloadBtn.style.opacity = '0.6';
        downloadBtn.title = 'Please select a route first';
        console.log('Download button disabled - no route selected');
    }
}

// Notification System
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
    `;

    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };

    notification.style.background = colors[type] || colors.info;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

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
`;
document.head.appendChild(style);