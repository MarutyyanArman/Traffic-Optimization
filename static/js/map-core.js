// Map Core Functionality
let map = null;
let edgesLayer = null;
let startMarker = null, endMarker = null;
let routeLines = {};
let selectedRoute = null;
let clickCount = 0;
let hidePanelsTimeout = null;
let panelsVisible = true;
let routeCalculationInProgress = false;

// Tutorial State
let currentTutorialStep = 0;
let tutorialSteps = [];
let isTutorialActive = false;

// Initialize map
function initializeMap() {
    console.log("Initializing map...");
    
    // Check if map container exists
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
        console.error("Map container not found!");
        return;
    }

    try {
        map = L.map("map", {
            preferCanvas: true,
            zoomControl: false
        }).setView([40.183, 44.515], 15);

        // Add zoom control to a different position
        L.control.zoom({ position: 'topright' }).addTo(map);

        edgesLayer = L.layerGroup().addTo(map);

        // Initialize with current theme - call this AFTER map is created
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        updateMapTheme(currentTheme);

        // Add event listeners for map movement
        map.on('movestart', onMapMove);
        map.on('zoomstart', onMapMove);

        // Add map click handler here instead of in routing.js
        map.on("click", handleMapClick);
        map.on("contextmenu", handleMapRightClick);

        console.log("Map initialized successfully");
        return true;
    } catch (error) {
        console.error("Error initializing map:", error);
        return false;
    }
}

// Map event handlers
function handleMapClick(e) {
    if (routeCalculationInProgress) {
        return;
    }

    clickCount++;
    if (clickCount === 1) {
        if (startMarker) map.removeLayer(startMarker);
        startMarker = addMarker(e.latlng, "#10b981", "start");
    } else if (clickCount === 2) {
        if (endMarker) map.removeLayer(endMarker);
        endMarker = addMarker(e.latlng, "#ef4444", "end");

        calculateMultiRoute();
        clickCount = 0;
    }
}

function handleMapRightClick(e) {
    const clickedPoint = e.latlng;

    if (startMarker && map.distance(clickedPoint, startMarker.getLatLng()) < 20) {
        map.removeLayer(startMarker);
        startMarker = null;
        clickCount = 0;
        clearRoute();
        return;
    }

    if (endMarker && map.distance(clickedPoint, endMarker.getLatLng()) < 20) {
        map.removeLayer(endMarker);
        endMarker = null;
        clickCount = 1;
        clearRoute();
        return;
    }
}

// Theme Management for Map
function initializeTheme() {
    console.log("Initializing theme...");
    let savedTheme = sessionStorage.getItem('theme') || localStorage.getItem('theme') || 'light';
    sessionStorage.removeItem('theme');

    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    // Don't call updateMapTheme here - it will be called after map initialization
    console.log(`Theme initialized with ${savedTheme} theme`);
}

function toggleTheme() {
    console.log("Toggling theme...");
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Only update map theme if map is initialized
    if (map) {
        updateMapTheme(newTheme);
    }

    sessionStorage.setItem('theme', newTheme);
    console.log(`Theme changed to: ${newTheme}`);
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        if (theme === 'dark') {
            themeToggle.setAttribute('aria-label', 'Switch to light theme');
        } else {
            themeToggle.setAttribute('aria-label', 'Switch to dark theme');
        }
    }
}

function updateMapTheme(theme) {
    console.log(`Updating map theme to: ${theme}`);
    if (!map) {
        console.error("Map not initialized yet!");
        return;
    }

    try {
        // Remove existing tile layers
        map.eachLayer(function (layer) {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });

        if (theme === 'dark') {
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);
            console.log("Dark theme tile layer added");
        } else {
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);
            console.log("Light theme tile layer added");
        }
    } catch (error) {
        console.error("Error updating map theme:", error);
    }
}

// Sync theme back to homepage
function syncThemeToHomepage() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    sessionStorage.setItem('theme', currentTheme);
}

// Panel Management
function hidePanels() {
    if (isTutorialActive) return;

    const controls = document.getElementById('controls');
    const info = document.getElementById('info');
    const backHome = document.getElementById('backHome');

    if (controls) {
        controls.classList.remove('visible');
        controls.classList.add('hidden');
    }
    if (info) {
        info.classList.remove('visible');
        info.classList.add('hidden');
    }
    if (backHome) {
        backHome.classList.remove('visible');
        backHome.classList.add('hidden');
    }
    panelsVisible = false;
}

function showPanels() {
    const controls = document.getElementById('controls');
    const info = document.getElementById('info');
    const backHome = document.getElementById('backHome');

    if (controls) {
        controls.classList.remove('hidden');
        controls.classList.add('visible');
    }
    if (info) {
        info.classList.remove('hidden');
        info.classList.add('visible');
    }
    if (backHome) {
        backHome.classList.remove('hidden');
        backHome.classList.add('visible');
    }
    panelsVisible = true;

    if (hidePanelsTimeout) {
        clearTimeout(hidePanelsTimeout);
    }

    hidePanelsTimeout = setTimeout(() => {
        if (panelsVisible && !isTutorialActive) {
            hidePanels();
        }
    }, 5000);
}

function onMapMove() {
    if (panelsVisible && !isTutorialActive) {
        hidePanels();
    }
}

// Time Management
function setCurrentTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayType = isWeekend ? 'weekend' : 'weekday';
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

    const timeInput = document.getElementById('timeInput');
    const dayTypeSelect = document.getElementById('dayType');
    const currentTimeDisplay = document.getElementById('current-time-map');

    if (timeInput) timeInput.value = `${hours}:${minutes}`;
    if (dayTypeSelect) dayTypeSelect.value = dayType;
    if (currentTimeDisplay) {
        currentTimeDisplay.textContent = `Current: ${hours}:${minutes} • ${dayName} • ${dayType}`;
    }

    return {
        hour: now.getHours(),
        dayType: dayType
    };
}

function updateTimeDisplay() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayType = isWeekend ? 'weekend' : 'weekday';
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

    const currentTimeDisplay = document.getElementById('current-time-map');
    if (currentTimeDisplay) {
        currentTimeDisplay.textContent = `Current: ${hours}:${minutes} • ${dayName} • ${dayType}`;
    }
}

function useCurrentTime() {
    const timeData = setCurrentTime();
    updateTraffic();
    return timeData;
}

function simulateTime() {
    const timeInput = document.getElementById('timeInput');
    const dayTypeSelect = document.getElementById('dayType');
    const currentTimeDisplay = document.getElementById('current-time-map');

    if (!timeInput || !timeInput.value) {
        alert("Please set a time first");
        return;
    }

    const [hours, minutes] = timeInput.value.split(':').map(Number);
    const dayType = dayTypeSelect ? dayTypeSelect.value : 'weekday';
    const dayOfWeek = dayType === 'weekend' ? 0 : 1;
    const dayName = dayType === 'weekend' ? 'Sunday' : 'Monday';

    if (currentTimeDisplay) {
        currentTimeDisplay.textContent = `Simulated: ${timeInput.value} • ${dayName} • ${dayType}`;
    }

    updateTraffic();

    return {
        hour: hours,
        minutes: minutes,
        dayType: dayType
    };
}

function startRealTimeClock() {
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 60000);
}

// Road Drawing
function drawEdges() {
    return new Promise((resolve) => {
        if (!edgesLayer) {
            console.error("Edges layer not initialized!");
            resolve();
            return;
        }

        edgesLayer.clearLayers();

        const timeDisplay = document.getElementById('current-time-map');
        let hours, dayType;

        if (timeDisplay && timeDisplay.textContent.includes('Simulated:')) {
            const timeInput = document.getElementById('timeInput');
            if (timeInput && timeInput.value) {
                [hours] = timeInput.value.split(':').map(Number);
            }
            const dayTypeSelect = document.getElementById('dayType');
            dayType = dayTypeSelect ? dayTypeSelect.value : 'weekday';
        } else {
            const now = new Date();
            hours = now.getHours();
            const dayOfWeek = now.getDay();
            dayType = (dayOfWeek === 0 || dayOfWeek === 6) ? 'weekend' : 'weekday';
        }

        axios.get(`/roads?hour=${hours}&day_type=${dayType}`)
            .then(res => {
                const polylines = res.data.map(road =>
                    L.polyline(road.coords, {
                        color: road.color,
                        weight: road.weight || 4,
                        opacity: 0.8
                    })
                );

                const featureGroup = L.featureGroup(polylines);
                edgesLayer.addLayer(featureGroup);
                resolve();
            })
            .catch(err => {
                console.error('Error loading roads:', err);
                alert('Error loading road data');
                resolve();
            });
    });
}

// Marker Functions
function addMarker(latlng, color, type) {
    if (!map) {
        console.error("Map not initialized!");
        return null;
    }

    const isStart = type === "start";
    const pinColor = isStart ? "#10b981" : "#ef4444";
    const label = isStart ? 'START' : 'END';

    const iconHtml = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
          <div style="width: 24px; height: 24px; background: ${pinColor}; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">
            ${isStart ? 'A' : 'B'}
          </div>
          <div style="background: white; color: ${pinColor}; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.2); border: 1px solid #e5e7eb;">
            ${label}
          </div>
        </div>
    `;

    const icon = L.divIcon({
        className: `marker-${type}`,
        html: iconHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });

    return L.marker(latlng, { icon: icon }).addTo(map);
}

// Traffic Update
async function updateTraffic() {
    await drawEdges();

    if (startMarker && endMarker && Object.keys(routeLines).length > 0) {
        await calculateMultiRoute();
    }
}

// Loading Functions
function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'block';
    }
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM loaded, initializing map application...");
    
    // Initialize theme first (just sets the HTML attribute)
    initializeTheme();
    
    // Initialize map
    const mapInitialized = initializeMap();
    
    if (mapInitialized) {
        // Start real-time clock
        startRealTimeClock();
        
        // Draw initial roads
        drawEdges().then(() => {
            console.log("Initial roads drawn");
        });

        // Add event listeners for edge triggers
        const leftTrigger = document.getElementById('leftEdgeTrigger');
        const rightTrigger = document.getElementById('rightEdgeTrigger');
        
        if (leftTrigger) {
            leftTrigger.addEventListener('mouseenter', showPanels);
        }
        if (rightTrigger) {
            rightTrigger.addEventListener('mouseenter', showPanels);
        }

        // Add event listener to keep panels visible when interacting with them
        const controls = document.getElementById('controls');
        const info = document.getElementById('info');
        
        if (controls) {
            controls.addEventListener('mouseenter', function () {
                if (hidePanelsTimeout) {
                    clearTimeout(hidePanelsTimeout);
                }
            });
        }

        if (info) {
            info.addEventListener('mouseenter', function () {
                if (hidePanelsTimeout) {
                    clearTimeout(hidePanelsTimeout);
                }
            });
        }

        // Set initial timeout to hide panels after 10 seconds
        hidePanelsTimeout = setTimeout(() => {
            if (panelsVisible && !isTutorialActive) {
                hidePanels();
            }
        }, 10000);
    }

    // Add event listener to theme toggle button
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    } else {
        console.error("Theme toggle button not found!");
    }

    console.log("Map application initialization complete");
});