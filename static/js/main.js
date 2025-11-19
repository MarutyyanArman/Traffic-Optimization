// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);

    // Sync to map page
    syncThemeToMapPage();

    // Update charts if they exist
    updateChartsTheme();
}

function syncThemeToMapPage() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

    // Store theme in sessionStorage for immediate use
    sessionStorage.setItem('theme', currentTheme);

    // Also store in localStorage for persistence
    localStorage.setItem('theme', currentTheme);

    console.log(`Theme ${currentTheme} synced for map page`);
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (theme === 'dark') {
        themeToggle.setAttribute('aria-label', 'Switch to light theme');
    } else {
        themeToggle.setAttribute('aria-label', 'Switch to dark theme');
    }
}

function updateChartsTheme() {
    // This function will be implemented to update chart colors when theme changes
    if (window.chartInstances) {
        window.chartInstances.forEach(chart => {
            chart.update();
        });
    }
}

// Enhanced navigation function with theme sync
function syncThemeAndNavigate() {
    syncThemeToMapPage();
    // Small delay to ensure theme is synced before navigation
    setTimeout(() => {
        window.location.href = '/map';
    }, 100);
}

function openRoutePlanner() {
    syncThemeToMapPage();
    setTimeout(() => {
        window.location.href = '/map';
    }, 100);
}

// Load basic stats on homepage
async function loadStats() {
    try {
        const response = await fetch('/traffic-data?hour=8&day_type=weekday');
        const stats = await response.json();

        document.getElementById('total-roads').textContent = stats.total_roads;
        document.getElementById('total-length').textContent = stats.total_road_length_km;
        document.getElementById('avg-congestion').textContent = (stats.avg_congestion * 100).toFixed(1) + '%';
    } catch (error) {
        console.error('Error loading stats:', error);
        // Set default values
        document.getElementById('total-roads').textContent = '250+';
        document.getElementById('total-length').textContent = '45+';
        document.getElementById('avg-congestion').textContent = '35%';
    }
}

// Analytics Dashboard Functions
function showAnalyticsDashboard() {
    document.getElementById('analyticsDashboard').style.display = 'block';
    loadDashboardData();
    window.scrollTo({ top: document.getElementById('analyticsDashboard').offsetTop - 20, behavior: 'smooth' });
}

function hideAnalyticsDashboard() {
    document.getElementById('analyticsDashboard').style.display = 'none';
}

// Enhanced dashboard data loading
async function loadDashboardData() {
    try {
        // Load traffic statistics
        const statsResponse = await fetch('/traffic-data?hour=8&day_type=weekday');
        const stats = await statsResponse.json();

        // Load traffic patterns
        const patternsResponse = await fetch('/traffic-patterns');
        const patterns = await patternsResponse.json();

        // Update dashboard stats
        document.getElementById('dashboard-total-roads').textContent = stats.total_roads;
        document.getElementById('dashboard-avg-congestion').textContent = (stats.avg_congestion * 100).toFixed(1) + '%';
        document.getElementById('dashboard-peak-congestion').textContent = patterns.peak_hours[0]?.congestion + '%' || '65%';

        // Calculate average speed (simulated)
        const avgSpeed = Math.max(20, 60 - (stats.avg_congestion * 40));
        document.getElementById('dashboard-avg-speed').textContent = avgSpeed.toFixed(0);

        // Render charts
        renderCharts(stats, patterns);

        // Update peak hours
        updatePeakHours(patterns.peak_hours);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        // Set default values
        document.getElementById('dashboard-total-roads').textContent = '250';
        document.getElementById('dashboard-avg-speed').textContent = '35';
        document.getElementById('dashboard-avg-congestion').textContent = '35%';
        document.getElementById('dashboard-peak-congestion').textContent = '65%';
    }
}

function renderCharts(stats, patterns) {
    // Store chart instances for theme updates
    window.chartInstances = window.chartInstances || [];

    // Clear existing charts
    window.chartInstances.forEach(chart => chart.destroy());
    window.chartInstances = [];

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    // Congestion Distribution Chart
    const congestionCtx = document.getElementById('congestionChart').getContext('2d');
    const congestionChart = new Chart(congestionCtx, {
        type: 'doughnut',
        data: {
            labels: ['Low (<30%)', 'Medium (30-60%)', 'High (>60%)'],
            datasets: [{
                data: [
                    stats.congestion_distribution.low,
                    stats.congestion_distribution.medium,
                    stats.congestion_distribution.high
                ],
                backgroundColor: ['#4CAF50', '#FF9800', '#F44336']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor
                    }
                }
            }
        }
    });
    window.chartInstances.push(congestionChart);

    // Hourly Pattern Chart
    const hourlyCtx = document.getElementById('hourlyPatternChart').getContext('2d');
    const hours = patterns.daily_trends.map(d => d.hour + ':00');
    const weekdayData = patterns.daily_trends.map(d => d.weekday);
    const weekendData = patterns.daily_trends.map(d => d.weekend);

    const hourlyChart = new Chart(hourlyCtx, {
        type: 'line',
        data: {
            labels: hours,
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
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Congestion (%)',
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor
                    }
                },
                x: {
                    ticks: {
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: textColor
                    }
                }
            }
        }
    });
    window.chartInstances.push(hourlyChart);

    // Road Type Chart
    const roadTypeCtx = document.getElementById('roadTypeChart').getContext('2d');
    const roadTypes = Object.keys(stats.road_type_distribution);
    const roadCounts = Object.values(stats.road_type_distribution);
    const roadCongestion = roadTypes.map(type =>
        (stats.avg_congestion_by_type[type] * 100) || 50
    );

    const roadTypeChart = new Chart(roadTypeCtx, {
        type: 'bar',
        data: {
            labels: roadTypes,
            datasets: [
                {
                    label: 'Number of Roads',
                    data: roadCounts,
                    backgroundColor: 'rgba(37, 99, 235, 0.6)',
                    yAxisID: 'y'
                },
                {
                    label: 'Avg Congestion (%)',
                    data: roadCongestion,
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    yAxisID: 'y1',
                    type: 'line'
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Number of Roads',
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    max: 100,
                    title: {
                        display: true,
                        text: 'Congestion (%)',
                        color: textColor
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        color: textColor
                    }
                },
                x: {
                    ticks: {
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: textColor
                    }
                }
            }
        }
    });
    window.chartInstances.push(roadTypeChart);

    // Weekly Trend Chart
    const weeklyCtx = document.getElementById('weeklyTrendChart').getContext('2d');
    const weeklyChart = new Chart(weeklyCtx, {
        type: 'radar',
        data: {
            labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            datasets: [{
                label: 'Average Congestion',
                data: [65, 68, 70, 72, 75, 45, 40],
                backgroundColor: 'rgba(37, 99, 235, 0.2)',
                borderColor: '#2563eb',
                pointBackgroundColor: '#2563eb'
            }]
        },
        options: {
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
                        color: textColor
                    },
                    ticks: {
                        color: textColor,
                        backdropColor: isDark ? '#1e293b' : 'white'
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: textColor
                    }
                }
            }
        }
    });
    window.chartInstances.push(weeklyChart);
}

function updatePeakHours(peakHours) {
    const container = document.getElementById('peakHoursList');
    container.innerHTML = '';

    peakHours.slice(0, 5).forEach(hour => {
        const hourItem = document.createElement('div');
        hourItem.className = 'hour-item';
        hourItem.innerHTML = `
            <span>${hour.hour}:00</span>
            <span style="color: ${hour.congestion > 70 ? '#F44336' : hour.congestion > 50 ? '#FF9800' : '#4CAF50'}; font-weight: bold;">
                ${hour.congestion}% congestion
            </span>
        `;
        container.appendChild(hourItem);
    });
}

// Initialize theme and load stats when page loads
document.addEventListener('DOMContentLoaded', function () {
    initializeTheme();
    loadStats();

    // Add event listener to theme toggle button
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
});

// Function to download comprehensive data from homepage
async function downloadComprehensiveData() {
    try {
        const response = await fetch('/download-traffic-data?hour=8&day_type=weekday');

        if (!response.ok) {
            throw new Error('Failed to download traffic data');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'yerevan_comprehensive_traffic_report.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error('Download error:', error);
        alert('Failed to download traffic report');
    }
}