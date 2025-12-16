// main.js - Routely Modern JavaScript

// Theme Management System
class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.init();
    }

    init() {
        this.initializeTheme();
        this.bindEvents();
    }

    initializeTheme() {
        const savedTheme = localStorage.getItem('routely-theme') || 'light';
        this.currentTheme = savedTheme;
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
        this.updateMetaTheme(savedTheme);
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.currentTheme = newTheme;

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('routely-theme', newTheme);
        this.updateThemeIcon(newTheme);
        this.updateMetaTheme(newTheme);

        // Sync to other pages
        this.syncThemeToMapPage();
        
        // Update charts and UI elements
        this.updateChartsTheme();
        this.updateUITheme();

        // Dispatch custom event for other components
        document.dispatchEvent(new CustomEvent('themeChange', { detail: { theme: newTheme } }));

        console.log(`🎨 Theme changed to ${newTheme}`);
    }

    updateThemeIcon(theme) {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            if (theme === 'dark') {
                themeToggle.setAttribute('aria-label', 'Switch to light theme');
                themeToggle.setAttribute('title', 'Switch to light theme');
            } else {
                themeToggle.setAttribute('aria-label', 'Switch to dark theme');
                themeToggle.setAttribute('title', 'Switch to dark theme');
            }
        }
    }

    updateMetaTheme(theme) {
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#0f172a' : '#ffffff');
        }
    }

    syncThemeToMapPage() {
        // Store theme in sessionStorage for immediate use
        sessionStorage.setItem('routely-theme', this.currentTheme);
        console.log(`🔄 Theme ${this.currentTheme} synced for map page`);
    }

    updateChartsTheme() {
        if (window.chartInstances && Array.isArray(window.chartInstances)) {
            window.chartInstances.forEach(chart => {
                if (chart && typeof chart.update === 'function') {
                    const isDark = this.currentTheme === 'dark';
                    const textColor = isDark ? '#ffffff' : '#2b2d42';
                    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                    
                    // Update chart options
                    chart.options.scales.x.ticks.color = textColor;
                    chart.options.scales.y.ticks.color = textColor;
                    chart.options.scales.x.grid.color = gridColor;
                    chart.options.scales.y.grid.color = gridColor;
                    
                    if (chart.options.plugins.legend) {
                        chart.options.plugins.legend.labels.color = textColor;
                    }
                    
                    chart.update('none');
                }
            });
        }
    }

    updateUITheme() {
        // Update any theme-dependent UI elements
        const elements = document.querySelectorAll('[data-theme-dependent]');
        elements.forEach(element => {
            element.classList.toggle('dark-theme', this.currentTheme === 'dark');
            element.classList.toggle('light-theme', this.currentTheme === 'light');
        });
    }

    bindEvents() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Listen for system theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => {
                if (!localStorage.getItem('routely-theme')) {
                    // Only auto-switch if user hasn't set a preference
                    this.currentTheme = e.matches ? 'dark' : 'light';
                    document.documentElement.setAttribute('data-theme', this.currentTheme);
                    this.updateThemeIcon(this.currentTheme);
                    this.updateChartsTheme();
                }
            });
        }
    }
}

// Stats and Data Manager
class DataManager {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 30 * 1000; // 30 seconds - reduced from 5 minutes to see updates more quickly
    }

    async loadStats() {
        try {
            const cacheKey = 'homepage-stats';
            const cached = this.getCachedData(cacheKey);
            
            if (cached) {
                this.updateStatsUI(cached);
                return;
            }

            const response = await fetch('/traffic-data?hour=8&day_type=weekday');
            if (!response.ok) throw new Error('Network response was not ok');
            
            const stats = await response.json();
            this.cacheData(cacheKey, stats);
            this.updateStatsUI(stats);

        } catch (error) {
            console.error('❌ Error loading stats:', error);
            this.showFallbackStats();
        }
    }

    async loadDashboardData() {
        try {
            // Clear any cached data
            this.cache.clear();
            
            // Use the current hour for more realistic data
            const currentHour = new Date().getHours();
            console.log(`Loading dashboard data for hour: ${currentHour}`);

            const [statsResponse, patternsResponse] = await Promise.all([
                fetch(`/traffic-data?hour=${currentHour}&day_type=weekday&_nocache=${Date.now()}`),
                fetch(`/traffic-patterns?_nocache=${Date.now()}`)
            ]);

            if (!statsResponse.ok || !patternsResponse.ok) {
                throw new Error('Failed to fetch dashboard data');
            }

            const [stats, patterns] = await Promise.all([
                statsResponse.json(),
                patternsResponse.json()
            ]);

            const data = { stats, patterns };
            // Don't cache data to ensure fresh values each time
            this.updateDashboardUI(stats, patterns);

        } catch (error) {
            console.error('❌ Error loading dashboard data:', error);
            this.showFallbackDashboard();
        }
    }

    updateStatsUI(stats) {
        this.safeUpdateElement('total-roads', stats.total_roads?.toLocaleString() || '1,247');
        this.safeUpdateElement('total-length', stats.total_road_length_km?.toLocaleString() || '856');
        
        const avgCongestion = stats.avg_congestion ? 
            (stats.avg_congestion * 100).toFixed(1) + '%' : '23%';
        this.safeUpdateElement('avg-congestion', avgCongestion);

        // Update quick stats in hero section
        this.safeUpdateElement('live-users', '2.4k+');
        this.safeUpdateElement('routes-optimized', '15.7k+');
        this.safeUpdateElement('time-saved', '4.2k+');
    }

    updateDashboardUI(stats, patterns) {
        // Update dashboard stats
        this.safeUpdateElement('dashboard-total-roads', stats.total_roads?.toLocaleString() || '1,247');
        
        const avgCongestion = stats.avg_congestion ? 
            (stats.avg_congestion * 100).toFixed(1) + '%' : '23%';
        this.safeUpdateElement('dashboard-avg-congestion', avgCongestion);

        const peakCongestion = patterns.peak_hours?.[0]?.congestion + '%' || '67%';
        this.safeUpdateElement('dashboard-peak-congestion', peakCongestion);

        // Debug log the stats object to see what's coming from API
        console.log('Stats from API:', stats);
        
        // Use actual average speed from traffic statistics
        const avgSpeed = stats.avg_speed_kmh ? 
            stats.avg_speed_kmh.toFixed(0) : '38';
        console.log('Actual avg_speed_kmh value:', stats.avg_speed_kmh);
        console.log('Formatted avgSpeed for display:', avgSpeed);
        this.safeUpdateElement('dashboard-avg-speed', avgSpeed);
        
        // Add detailed tooltip with speeds by congestion level if available
        const speedElement = document.getElementById('dashboard-avg-speed');
        if (speedElement && stats.avg_speed_by_congestion) {
            const lowSpeed = stats.avg_speed_by_congestion.low || 0;
            const mediumSpeed = stats.avg_speed_by_congestion.medium || 0;
            const highSpeed = stats.avg_speed_by_congestion.high || 0;
            
            speedElement.setAttribute('title', `Light Traffic: ${lowSpeed} km/h\nModerate Traffic: ${mediumSpeed} km/h\nHeavy Traffic: ${highSpeed} km/h`);
            speedElement.style.cursor = 'help';
        }

        // Render charts via DashboardManager
        if (window.routelyApp && window.routelyApp.dashboardManager) {
            window.routelyApp.dashboardManager.renderCharts(stats, patterns);
            window.routelyApp.dashboardManager.updatePeakHours(patterns.peak_hours || []);
        }
    }

    safeUpdateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    cacheData(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    showFallbackStats() {
        this.safeUpdateElement('total-roads', '1,247');
        this.safeUpdateElement('total-length', '856');
        this.safeUpdateElement('avg-congestion', '23%');
    }

    showFallbackDashboard() {
        this.safeUpdateElement('dashboard-total-roads', '1,247');
        this.safeUpdateElement('dashboard-avg-speed', '38');
        this.safeUpdateElement('dashboard-avg-congestion', '23%');
        this.safeUpdateElement('dashboard-peak-congestion', '67%');
    }
}

// Analytics Dashboard Manager
class DashboardManager {
    constructor() {
        this.isVisible = false;
        this.dataManager = new DataManager();
    }

    show() {
        const dashboard = document.getElementById('analyticsDashboard');
        if (dashboard) {
            dashboard.style.display = 'block';
            this.isVisible = true;
            
            // Add animation class
            dashboard.classList.add('dashboard-visible');
            
            // Load data
            this.dataManager.loadDashboardData();
            
            // Scroll to dashboard
            this.scrollToDashboard();
            
            // Dispatch event
            document.dispatchEvent(new CustomEvent('dashboardShow'));
            
            console.log('📊 Analytics dashboard opened');
        }
    }

    hide() {
        const dashboard = document.getElementById('analyticsDashboard');
        if (dashboard) {
            dashboard.style.display = 'none';
            this.isVisible = false;
            dashboard.classList.remove('dashboard-visible');
            
            // Dispatch event
            document.dispatchEvent(new CustomEvent('dashboardHide'));
            
            console.log('📊 Analytics dashboard closed');
        }
    }

    scrollToDashboard() {
        const dashboard = document.getElementById('analyticsDashboard');
        if (dashboard) {
            window.scrollTo({
                top: dashboard.offsetTop - 100,
                behavior: 'smooth'
            });
        }
    }

    renderCharts(stats, patterns) {
        // Store chart instances for theme updates
        window.chartInstances = window.chartInstances || [];

        // Clear existing charts
        window.chartInstances.forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        window.chartInstances = [];

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#ffffff' : '#2b2d42';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const fontFamily = 'Inter, system-ui, -apple-system, sans-serif';

        // Congestion Distribution Chart
        this.renderCongestionChart(stats, isDark, textColor, gridColor, fontFamily);
        
        // Hourly Pattern Chart
        this.renderHourlyPatternChart(patterns, isDark, textColor, gridColor, fontFamily);
        
        // Road Type Chart
        this.renderRoadTypeChart(stats, isDark, textColor, gridColor, fontFamily);
        
        // Weekly Trend Chart
        this.renderWeeklyTrendChart(isDark, textColor, gridColor, fontFamily);
    }

    renderCongestionChart(stats, isDark, textColor, gridColor, fontFamily) {
        const ctx = document.getElementById('congestionChart');
        if (!ctx) return;

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Free Flow', 'Moderate', 'Heavy', 'Severe'],
                datasets: [{
                    data: [
                        stats.congestion_distribution?.free_flow ?? 0,
                        stats.congestion_distribution?.moderate ?? 0,
                        stats.congestion_distribution?.heavy ?? 0,
                        stats.congestion_distribution?.severe ?? 0
                    ],
                    backgroundColor: [
                        '#10b981', '#f97316', '#ef4444', '#dc2626'
                    ],
                    borderWidth: 2,
                    borderColor: isDark ? '#1e293b' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: {
                                family: fontFamily,
                                size: 11
                            },
                            padding: 15,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1
                    }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
        window.chartInstances.push(chart);
    }

    renderHourlyPatternChart(patterns, isDark, textColor, gridColor, fontFamily) {
        const ctx = document.getElementById('hourlyPatternChart');
        if (!ctx) return;

        const hours = patterns.daily_trends?.map(d => d.hour + ':00') || 
                     Array.from({length: 24}, (_, i) => i + ':00');
        const weekdayData = patterns.daily_trends?.map(d => d.weekday) || 
                           Array.from({length: 24}, (_, i) => Math.sin(i / 24 * Math.PI) * 30 + 40);
        const weekendData = patterns.daily_trends?.map(d => d.weekend) || 
                           Array.from({length: 24}, (_, i) => Math.cos(i / 24 * Math.PI) * 20 + 30);

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: hours,
                datasets: [
                    {
                        label: 'Weekday',
                        data: weekdayData,
                        borderColor: '#4361ee',
                        backgroundColor: 'rgba(67, 97, 238, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 3
                    },
                    {
                        label: 'Weekend',
                        data: weekendData,
                        borderColor: '#9d4edd',
                        backgroundColor: 'rgba(157, 78, 221, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 3
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Congestion (%)',
                            color: textColor,
                            font: {
                                family: fontFamily,
                                weight: '500'
                            }
                        },
                        grid: {
                            color: gridColor
                        },
                        ticks: {
                            color: textColor,
                            font: {
                                family: fontFamily
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time of Day',
                            color: textColor,
                            font: {
                                family: fontFamily,
                                weight: '500'
                            }
                        },
                        grid: {
                            color: gridColor
                        },
                        ticks: {
                            color: textColor,
                            font: {
                                family: fontFamily
                            },
                            maxRotation: 45
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: textColor,
                            font: {
                                family: fontFamily,
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1
                    }
                }
            }
        });
        window.chartInstances.push(chart);
    }

    renderRoadTypeChart(stats, isDark, textColor, gridColor, fontFamily) {
        const ctx = document.getElementById('roadTypeChart');
        if (!ctx) return;

        const roadTypes = Object.keys(stats.road_type_distribution || { 
            'Highway': 45, 'Arterial': 120, 'Collector': 85, 'Local': 180 
        });
        const roadCounts = Object.values(stats.road_type_distribution || { 
            'Highway': 45, 'Arterial': 120, 'Collector': 85, 'Local': 180 
        });

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: roadTypes,
                datasets: [{
                    label: 'Number of Roads',
                    data: roadCounts,
                    backgroundColor: 'rgba(67, 97, 238, 0.7)',
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Roads',
                            color: textColor,
                            font: {
                                family: fontFamily,
                                weight: '500'
                            }
                        },
                        grid: {
                            color: gridColor
                        },
                        ticks: {
                            color: textColor,
                            font: {
                                family: fontFamily
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: textColor,
                            font: {
                                family: fontFamily
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1
                    }
                }
            }
        });
        window.chartInstances.push(chart);
    }

    renderWeeklyTrendChart(isDark, textColor, gridColor, fontFamily) {
        const ctx = document.getElementById('weeklyTrendChart');
        if (!ctx) return;

        const chart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Average Congestion',
                    data: [65, 68, 70, 72, 75, 45, 40],
                    backgroundColor: 'rgba(67, 97, 238, 0.2)',
                    borderColor: '#4361ee',
                    pointBackgroundColor: '#4361ee',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: gridColor
                        },
                        angleLines: {
                            color: gridColor
                        },
                        pointLabels: {
                            color: textColor,
                            font: {
                                family: fontFamily,
                                size: 11
                            }
                        },
                        ticks: {
                            color: textColor,
                            backdropColor: 'transparent',
                            font: {
                                family: fontFamily
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: textColor,
                            font: {
                                family: fontFamily
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1
                    }
                }
            }
        });
        window.chartInstances.push(chart);
    }

    updatePeakHours(peakHours) {
        const container = document.getElementById('peakHoursList');
        if (!container) return;

        const hours = peakHours.length > 0 ? peakHours.slice(0, 5) : [
            { hour: '08:00', congestion: 75 },
            { hour: '17:00', congestion: 82 },
            { hour: '18:00', congestion: 78 },
            { hour: '09:00', congestion: 68 },
            { hour: '16:00', congestion: 65 }
        ];

        container.innerHTML = hours.map(hour => `
            <div class="hour-item">
                <span class="hour-time">${hour.hour}</span>
                <span class="hour-congestion ${hour.congestion > 70 ? 'high' : hour.congestion > 50 ? 'medium' : 'low'}">
                    ${hour.congestion}% congestion
                </span>
            </div>
        `).join('');
    }
}

// Navigation Manager
class NavigationManager {
    static syncThemeAndNavigate(url) {
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        sessionStorage.setItem('routely-theme', theme);
        
        // Add loading state
        document.body.classList.add('page-transition');
        
        setTimeout(() => {
            window.location.href = url;
        }, 300);
    }

    static scrollToFeatures() {
        const featuresSection = document.getElementById('features');
        if (featuresSection) {
            window.scrollTo({
                top: featuresSection.offsetTop,
                behavior: 'smooth'
            });
        }
    }
}

// Download Manager
class DownloadManager {
    static async downloadComprehensiveData() {
        try {
            // Show loading state
            this.showDownloadLoading();

            const response = await fetch('/download-traffic-data?hour=8&day_type=weekday');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'routely_comprehensive_traffic_report.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            this.showDownloadSuccess();

        } catch (error) {
            console.error('❌ Download error:', error);
            this.showDownloadError();
        }
    }

    static showDownloadLoading() {
        // You can implement a toast notification here
        console.log('⬇️ Starting download...');
    }

    static showDownloadSuccess() {
        // You can implement a success notification here
        console.log('✅ Download completed successfully!');
    }

    static showDownloadError() {
        // You can implement an error notification here
        alert('❌ Failed to download traffic report. Please try again.');
    }
}

// Initialize Routely Application
class RoutelyApp {
    constructor() {
        this.themeManager = new ThemeManager();
        this.dataManager = new DataManager();
        this.dashboardManager = new DashboardManager();
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadInitialData();
        this.initializeAnimations();
        
        console.log('🚀 Routely application initialized');
    }

    bindEvents() {
        // Global event listeners
        document.addEventListener('click', this.handleGlobalClick.bind(this));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
        
        // Page visibility
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    handleGlobalClick(event) {
        // Handle analytics dashboard toggle
        if (event.target.closest('[data-action="toggle-analytics"]')) {
            this.dashboardManager.show();
        }
        
        // Theme toggle is handled by ThemeManager.bindEvents() - don't duplicate here
    }

    handleKeyboardShortcuts(event) {
        // Toggle dashboard with Ctrl/Cmd + D
        if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
            event.preventDefault();
            this.dashboardManager.isVisible ? 
                this.dashboardManager.hide() : 
                this.dashboardManager.show();
        }
        
        // Toggle theme with Ctrl/Cmd + T
        if ((event.ctrlKey || event.metaKey) && event.key === 't') {
            event.preventDefault();
            this.themeManager.toggleTheme();
        }
    }

    handleVisibilityChange() {
        if (!document.hidden) {
            // Refresh data when page becomes visible
            this.dataManager.loadStats();
        }
    }

    loadInitialData() {
        this.dataManager.loadStats();
        
        // Preload dashboard data if user is likely to open it
        setTimeout(() => {
            this.dataManager.loadDashboardData();
        }, 2000);
    }

    initializeAnimations() {
        // Initialize any entrance animations
        const animatedElements = document.querySelectorAll('.feature-card, .stat-card, .action-card');
        animatedElements.forEach((element, index) => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(30px)';
            
            setTimeout(() => {
                element.style.transition = 'all 0.6s ease';
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }, 100 * index);
        });
    }
}

// Initialize Routely application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (!window.routelyApp) {
        window.routelyApp = new RoutelyApp();
    }
});

// Global functions for HTML onclick attributes
function showAnalyticsDashboard() {
    if (window.routelyApp) {
        window.routelyApp.dashboardManager.show();
    }
}

function hideAnalyticsDashboard() {
    if (window.routelyApp) {
        window.routelyApp.dashboardManager.hide();
    }
}

function syncThemeToMapPage() {
    if (window.routelyApp) {
        window.routelyApp.themeManager.syncThemeToMapPage();
    }
}

function syncThemeAndNavigate() {
    NavigationManager.syncThemeAndNavigate('/map');
}

function scrollToFeatures() {
    NavigationManager.scrollToFeatures();
}


// Chart Accordion Functions
function toggleChartSection(headerElement) {
    const section = headerElement.closest('.chart-section');
    const content = section.querySelector('.chart-section-content');
    const isExpanded = content.classList.contains('expanded');

    // If currently expanded, play closing animation then hide
    if (isExpanded) {
        content.classList.remove('expanded');
        content.classList.add('collapsing');
        headerElement.classList.add('collapsed');

        const onAnimationEnd = (event) => {
            if (event.animationName === 'chart-accordion-close') {
                content.classList.remove('collapsing');
                content.style.display = 'none';
                content.removeEventListener('animationend', onAnimationEnd);
            }
        };

        content.addEventListener('animationend', onAnimationEnd);
    } else {
        // Opening: ensure visible and play open animation
        content.style.display = 'block';
        content.classList.remove('collapsing');
        content.classList.add('expanded');
        headerElement.classList.remove('collapsed');
    }
}

function downloadChart(canvasId, filename) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('Chart canvas not found:', canvasId);
        return;
    }
    
    try {
        // Create a temporary canvas with white background for better quality
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        // Fill with white background (or dark if in dark mode)
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Draw the original chart on top
        ctx.drawImage(canvas, 0, 0);
        
        // Create download link
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0, 10);
        link.download = `routely_${filename}_${timestamp}.png`;
        link.href = tempCanvas.toDataURL('image/png', 1.0);
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`📊 Chart downloaded: ${filename}`);
    } catch (error) {
        console.error('Error downloading chart:', error);
        alert('Failed to download chart. Please try again.');
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add loaded class to body for CSS animations
    document.body.classList.add('loaded');
    
    console.log('✨ Routely fully loaded and ready!');
});

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ThemeManager,
        DataManager,
        DashboardManager,
        NavigationManager,
        DownloadManager,
        RoutelyApp
    };
}

// Add CSS for the refresh button
const style = document.createElement('style');
style.textContent = `
    .refresh-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #3b82f6;
        font-size: 14px;
        padding: 5px;
        margin-top: 5px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }
    .refresh-btn:hover {
        background: rgba(59, 130, 246, 0.1);
        transform: rotate(30deg);
    }
    .refresh-btn:active {
        transform: rotate(180deg);
    }
    .refresh-btn.loading {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Force refresh stats function
function forceRefreshStats() {
    console.log('Forcing refresh of speed stats...');
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.classList.add('loading');
    }
    
    // Get current hour
    const currentHour = new Date().getHours();
    
    // Make direct API call with random param to bypass cache
    fetch(`/traffic-data?hour=${currentHour}&day_type=weekday&_nocache=${Date.now()}`)
        .then(response => response.json())
        .then(stats => {
            console.log('Fresh stats from API:', stats);
            // Update speed display
            const avgSpeed = stats.avg_speed_kmh ? 
                stats.avg_speed_kmh.toFixed(0) : '38';
            console.log('Fresh avg_speed_kmh value:', stats.avg_speed_kmh);
            
            // Update all instances of speed display
            const speedElements = document.querySelectorAll('#dashboard-avg-speed');
            speedElements.forEach(element => {
                element.textContent = avgSpeed;
                
                // Add tooltip if speed by congestion is available
                if (stats.avg_speed_by_congestion) {
                    const lowSpeed = stats.avg_speed_by_congestion.low || 0;
                    const mediumSpeed = stats.avg_speed_by_congestion.medium || 0;
                    const highSpeed = stats.avg_speed_by_congestion.high || 0;
                    
                    element.setAttribute('title', `Light Traffic: ${lowSpeed} km/h\nModerate Traffic: ${mediumSpeed} km/h\nHeavy Traffic: ${highSpeed} km/h`);
                    element.style.cursor = 'help';
                }
            });
            
            // Update congestion displays
            const avgCongestion = stats.avg_congestion ? 
                (stats.avg_congestion * 100).toFixed(1) + '%' : '23%';
            const congestionElements = document.querySelectorAll('#avg-congestion, #dashboard-avg-congestion');
            congestionElements.forEach(element => {
                element.textContent = avgCongestion;
            });
            
            // Update road count displays
            const totalRoads = stats.total_roads?.toLocaleString() || '1,247';
            const roadCountElements = document.querySelectorAll('#total-roads, #dashboard-total-roads');
            roadCountElements.forEach(element => {
                element.textContent = totalRoads;
            });
            
            // Update road length display
            const totalLength = stats.total_road_length_km?.toLocaleString() || '856';
            const lengthElements = document.querySelectorAll('#total-length');
            lengthElements.forEach(element => {
                element.textContent = totalLength;
            });
        })
        .catch(error => {
            console.error('Error refreshing stats:', error);
        })
        .finally(() => {
            // Remove loading state
            if (refreshBtn) {
                refreshBtn.classList.remove('loading');
            }
        });
}