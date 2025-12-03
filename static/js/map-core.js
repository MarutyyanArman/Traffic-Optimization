// Map Core Initialization
let map;
let congestionLayer = null;
let startMarker = null;
let endMarker = null;

// Initialize the map
function initMap() {
    console.log('Initializing map...');
    
    // Create map centered on Yerevan
    map = L.map('map').setView([40.1872, 44.5152], 13);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    // Initialize markers
    initMarkers();
    
    // Load initial congestion data
    loadCongestionOverlay();
    
    console.log('Map initialized successfully');
    
    // Make map available globally
    window.map = map;
}

// Initialize markers for start and end points
function initMarkers() {
    // Marker styles
    const startIcon = L.divIcon({
        className: 'start-marker',
        html: '<div class="marker-pin start"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    
    const endIcon = L.divIcon({
        className: 'end-marker',
        html: '<div class="marker-pin end"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    
    // Click handler for map
    map.on('click', function(e) {
        handleMapClick(e.latlng);
    });
}

// Handle map clicks for setting start/end points
function handleMapClick(latlng) {
    if (!window.selectingStart && !window.selectingEnd) {
        return; // No selection mode active
    }
    
    if (window.selectingStart) {
        setStartPoint(latlng);
        window.selectingStart = false;
        updateSelectionUI();
    } else if (window.selectingEnd) {
        setEndPoint(latlng);
        window.selectingEnd = false;
        updateSelectionUI();
    }
}

// Set start point
function setStartPoint(latlng) {
    // Remove existing start marker
    if (startMarker) {
        map.removeLayer(startMarker);
    }
    
    // Create new start marker
    startMarker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'start-marker',
            html: '<div class="marker-pin start"><span>S</span></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(map);
    
    // Store coordinates
    window.startPoint = {
        lat: latlng.lat,
        lng: latlng.lng
    };
    
    console.log('Start point set:', window.startPoint);
    showNotification('Start point set', 'success');
    
    // Enable find routes if both points are set
    checkRouteReady();
}

// Set end point
function setEndPoint(latlng) {
    // Remove existing end marker
    if (endMarker) {
        map.removeLayer(endMarker);
    }
    
    // Create new end marker
    endMarker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'end-marker',
            html: '<div class="marker-pin end"><span>E</span></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        })
    }).addTo(map);
    
    // Store coordinates
    window.endPoint = {
        lat: latlng.lat,
        lng: latlng.lng
    };
    
    console.log('End point set:', window.endPoint);
    showNotification('End point set', 'success');
    
    // Enable find routes if both points are set
    checkRouteReady();
}

// Check if both points are set and enable find routes
function checkRouteReady() {
    const findRoutesBtn = document.getElementById('findRoutesBtn');
    if (window.startPoint && window.endPoint) {
        findRoutesBtn.disabled = false;
        findRoutesBtn.style.opacity = '1';
    } else {
        findRoutesBtn.disabled = true;
        findRoutesBtn.style.opacity = '0.6';
    }
}

// Update selection UI
function updateSelectionUI() {
    const startBtn = document.getElementById('selectStartBtn');
    const endBtn = document.getElementById('selectEndBtn');
    
    if (window.selectingStart) {
        startBtn.classList.add('selecting');
        endBtn.classList.remove('selecting');
    } else if (window.selectingEnd) {
        endBtn.classList.add('selecting');
        startBtn.classList.remove('selecting');
    } else {
        startBtn.classList.remove('selecting');
        endBtn.classList.remove('selecting');
    }
}

// Load congestion overlay
async function loadCongestionOverlay() {
    try {
        const timeInput = document.getElementById('timeInput');
        const dayTypeSelect = document.getElementById('dayType');
        
        const hour = timeInput ? parseInt(timeInput.value.split(':')[0]) : 12;
        const dayType = dayTypeSelect ? dayTypeSelect.value : 'weekday';
        
        const response = await fetch(`/congestion-data?hour=${hour}&day_type=${dayType}`);
        const congestionData = await response.json();
        
        displayCongestionOverlay(congestionData);
    } catch (error) {
        console.error('Error loading congestion overlay:', error);
    }
}

// Display congestion overlay on map
function displayCongestionOverlay(congestionData) {
    // Remove existing congestion layer
    if (congestionLayer) {
        map.removeLayer(congestionLayer);
    }
    
    if (!congestionData || !congestionData.features) {
        console.error('Invalid congestion data');
        return;
    }
    
    // Create congestion overlay
    congestionLayer = L.geoJSON(congestionData, {
        style: function(feature) {
            const congestion = feature.properties.congestion || 0;
            return {
                color: getCongestionColor(congestion),
                weight: 6,
                opacity: 0.7,
                lineCap: 'round'
            };
        },
        onEachFeature: function(feature, layer) {
            const congestion = feature.properties.congestion || 0;
            const roadName = feature.properties.name || 'Unnamed Road';
            
            // Add popup with congestion info
            layer.bindPopup(`
                <div class="congestion-popup">
                    <h4>${roadName}</h4>
                    <p>Congestion: <strong>${(congestion * 100).toFixed(1)}%</strong></p>
                    <div class="congestion-bar">
                        <div class="congestion-fill" style="width: ${congestion * 100}%; background: ${getCongestionColor(congestion)};"></div>
                    </div>
                </div>
            `);
        }
    }).addTo(map);
    
    console.log('Congestion overlay displayed');
}

// Get color based on congestion level
function getCongestionColor(congestion) {
    if (congestion < 0.3) return '#4CAF50'; // Green - low
    if (congestion < 0.6) return '#FF9800'; // Orange - medium
    return '#F44336'; // Red - high
}

// Update congestion overlay when time or day type changes
function updateCongestionOverlay() {
    loadCongestionOverlay();
}

// Clear all points and routes
function clearAll() {
    // Clear markers
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }
    
    // Clear points
    window.startPoint = null;
    window.endPoint = null;
    window.selectingStart = false;
    window.selectingEnd = false;
    
    // Clear routes
    if (window.clearRoutes) {
        window.clearRoutes();
    }
    
    // Update UI
    updateSelectionUI();
    checkRouteReady();
    
    showNotification('All points and routes cleared', 'info');
}

// Initialize map when document is ready
document.addEventListener('DOMContentLoaded', function() {
    initMap();
});