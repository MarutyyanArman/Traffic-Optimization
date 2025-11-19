// Event Handlers and Tutorial System

// Initialize Tutorial Steps
function initializeTutorialSteps() {
    tutorialSteps = [
        {
            title: "Welcome to Yerevan Traffic Intelligence!",
            content: "This interactive tutorial will guide you through all the features of our traffic analysis system. Let's get started!",
            target: null,
            position: "center"
        },
        {
            title: "The Interactive Map",
            content: "This is the main map of Yerevan. You can zoom, pan, and click anywhere to set route points. The colored lines show real-time traffic congestion.",
            target: "map",
            position: "top"
        },
        {
            title: "Control Panel",
            content: "This is your main control center. Here you can adjust time settings, plan routes, and access various analytics tools.",
            target: "controls",
            position: "right"
        },
        {
            title: "Time Settings",
            content: "Set specific times or use current time to see how traffic changes throughout the day. You can simulate different hours and day types.",
            target: "timeInput",
            position: "bottom"
        },
        {
            title: "Route Planning",
            content: "Click 'Compare Routes' after setting start and end points to see multiple route options with different priorities.",
            target: "calculateMultiRoute",
            position: "bottom"
        },
        {
            title: "Analytics Tools",
            content: "Explore traffic statistics, speed charts, predictions, and pattern analysis to make informed travel decisions.",
            target: "showStats",
            position: "bottom"
        },
        {
            title: "Information Panel",
            content: "This panel shows instructions and a legend to help you understand the color codes and symbols on the map.",
            target: "info",
            position: "left"
        },
        {
            title: "Traffic Predictions",
            content: "Use the Predictions feature to see the best times to travel and avoid congestion based on historical patterns.",
            target: "showTrafficPredictions",
            position: "bottom"
        },
        {
            title: "Pattern Analysis",
            content: "Analyze traffic patterns, peak hours, and congestion hotspots to understand Yerevan's traffic flow.",
            target: "showPatternAnalysis",
            position: "bottom"
        },
        {
            title: "Data Export",
            content: "Download traffic data and route information in CSV format for further analysis and reporting.",
            target: "downloadTrafficData",
            position: "bottom"
        },
        {
            title: "Theme Switcher",
            content: "Switch between light and dark themes for better visibility in different lighting conditions.",
            target: "themeToggle",
            position: "bottom"
        },
        {
            title: "You're All Set!",
            content: "You now know how to use all the features of Yerevan Traffic Intelligence. Happy navigating! 🚗",
            target: null,
            position: "center"
        }
    ];
}

// Tutorial Functions
function startTutorial() {
    initializeTutorialSteps();
    currentTutorialStep = 0;
    isTutorialActive = true;
    showTutorialStep();
}

function showTutorialStep() {
    const step = tutorialSteps[currentTutorialStep];
    const tutorialStep = document.getElementById('tutorialStep');
    const tutorialOverlay = document.getElementById('tutorialOverlay');
    const tutorialHighlight = document.getElementById('tutorialHighlight');
    const tutorialTooltip = document.getElementById('tutorialTooltip');

    // Show overlay
    tutorialOverlay.style.display = 'block';

    // Create the tutorial step content
    tutorialStep.innerHTML = `
        <div class="tutorial-header">
            <i class="fas fa-graduation-cap" style="color: var(--primary);"></i>
            <div class="tutorial-title">${step.title}</div>
            <button class="close-tutorial" onclick="skipTutorial()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="tutorial-content">
            ${step.content}
        </div>
        <div class="tutorial-actions">
            <div>
                ${currentTutorialStep > 0 ? '<button class="tutorial-btn prev" onclick="prevTutorialStep()">Previous</button>' : '<button class="tutorial-btn prev" style="visibility: hidden;">Previous</button>'}
            </div>
            <div>
                <button class="tutorial-btn next" onclick="nextTutorialStep()">
                    ${currentTutorialStep === tutorialSteps.length - 1 ? 'Finish' : 'Next'}
                </button>
            </div>
        </div>
    `;

    // Show the tutorial step
    tutorialStep.style.display = 'block';

    // Position the tutorial step
    positionTutorialStep(step);

    // Handle target element highlighting
    if (step.target) {
        const targetElement = getTargetElement(step.target);
        if (targetElement) {
            highlightElement(targetElement, step.position);
        }
    } else {
        tutorialHighlight.style.display = 'none';
        tutorialTooltip.style.display = 'none';
    }
}

function getTargetElement(targetId) {
    if (targetId === 'map') return document.getElementById('map');
    if (targetId === 'controls') return document.getElementById('controls');
    if (targetId === 'info') return document.getElementById('info');
    if (targetId === 'timeInput') return document.getElementById('timeInput');
    if (targetId === 'themeToggle') return document.getElementById('themeToggle');
    if (targetId === 'downloadTrafficData') return document.querySelector('button[onclick="downloadTrafficData()"]');

    // For function targets, find the corresponding button
    if (targetId === 'calculateMultiRoute') {
        return document.querySelector('button[onclick="calculateMultiRoute()"]');
    }
    if (targetId === 'showStats') {
        return document.querySelector('button[onclick="showStats()"]');
    }
    if (targetId === 'showTrafficPredictions') {
        return document.querySelector('button[onclick="showTrafficPredictions()"]');
    }
    if (targetId === 'showPatternAnalysis') {
        return document.querySelector('button[onclick="showPatternAnalysis()"]');
    }

    return null;
}

function positionTutorialStep(step) {
    const tutorialStep = document.getElementById('tutorialStep');

    // Reset positioning
    tutorialStep.style.top = '';
    tutorialStep.style.left = '';
    tutorialStep.style.right = '';
    tutorialStep.style.bottom = '';
    tutorialStep.style.transform = '';

    if (step.position === 'center') {
        tutorialStep.style.top = '50%';
        tutorialStep.style.left = '50%';
        tutorialStep.style.transform = 'translate(-50%, -50%)';
        return;
    }

    if (step.target) {
        const targetElement = getTargetElement(step.target);
        if (targetElement) {
            const rect = targetElement.getBoundingClientRect();
            const tutorialRect = tutorialStep.getBoundingClientRect();

            // Ensure the tutorial step stays within viewport
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let top, left;

            switch (step.position) {
                case 'top':
                    top = rect.top - tutorialRect.height - 20;
                    left = rect.left + (rect.width / 2) - (tutorialRect.width / 2);

                    // Adjust if going off screen
                    if (top < 20) top = 20;
                    if (left < 20) left = 20;
                    if (left + tutorialRect.width > viewportWidth - 20) {
                        left = viewportWidth - tutorialRect.width - 20;
                    }

                    tutorialStep.style.top = top + 'px';
                    tutorialStep.style.left = left + 'px';
                    break;

                case 'bottom':
                    top = rect.bottom + 20;
                    left = rect.left + (rect.width / 2) - (tutorialRect.width / 2);

                    // Adjust if going off screen
                    if (top + tutorialRect.height > viewportHeight - 20) {
                        top = viewportHeight - tutorialRect.height - 20;
                    }
                    if (left < 20) left = 20;
                    if (left + tutorialRect.width > viewportWidth - 20) {
                        left = viewportWidth - tutorialRect.width - 20;
                    }

                    tutorialStep.style.top = top + 'px';
                    tutorialStep.style.left = left + 'px';
                    break;

                case 'left':
                    top = rect.top + (rect.height / 2) - (tutorialRect.height / 2);
                    left = rect.left - tutorialRect.width - 20;

                    // Adjust if going off screen
                    if (top < 20) top = 20;
                    if (top + tutorialRect.height > viewportHeight - 20) {
                        top = viewportHeight - tutorialRect.height - 20;
                    }
                    if (left < 20) left = 20;

                    tutorialStep.style.top = top + 'px';
                    tutorialStep.style.left = left + 'px';
                    break;

                case 'right':
                    top = rect.top + (rect.height / 2) - (tutorialRect.height / 2);
                    left = rect.right + 20;

                    // Adjust if going off screen
                    if (top < 20) top = 20;
                    if (top + tutorialRect.height > viewportHeight - 20) {
                        top = viewportHeight - tutorialRect.height - 20;
                    }
                    if (left + tutorialRect.width > viewportWidth - 20) {
                        left = viewportWidth - tutorialRect.width - 20;
                    }

                    tutorialStep.style.top = top + 'px';
                    tutorialStep.style.left = left + 'px';
                    break;
            }
        }
    }
}

function highlightElement(element, position) {
    const tutorialHighlight = document.getElementById('tutorialHighlight');
    const rect = element.getBoundingClientRect();

    tutorialHighlight.style.display = 'block';
    tutorialHighlight.style.width = (rect.width + 10) + 'px';
    tutorialHighlight.style.height = (rect.height + 10) + 'px';
    tutorialHighlight.style.top = (rect.top - 5) + 'px';
    tutorialHighlight.style.left = (rect.left - 5) + 'px';
}

function nextTutorialStep() {
    console.log('Next button clicked, current step:', currentTutorialStep);
    if (currentTutorialStep < tutorialSteps.length - 1) {
        currentTutorialStep++;
        console.log('Moving to step:', currentTutorialStep);
        showTutorialStep();
    } else {
        console.log('Finishing tutorial');
        finishTutorial();
    }
}

function prevTutorialStep() {
    console.log('Previous button clicked, current step:', currentTutorialStep);
    if (currentTutorialStep > 0) {
        currentTutorialStep--;
        console.log('Moving to step:', currentTutorialStep);
        showTutorialStep();
    }
}

function skipTutorial() {
    console.log('Skipping tutorial');
    finishTutorial();
}

function finishTutorial() {
    console.log('Finishing tutorial');
    isTutorialActive = false;
    document.getElementById('tutorialOverlay').style.display = 'none';
    document.getElementById('tutorialStep').style.display = 'none';
    document.getElementById('tutorialHighlight').style.display = 'none';
    document.getElementById('tutorialTooltip').style.display = 'none';
}

// Keyboard Shortcuts
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        clearRoute();
    } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        switchStartEnd();
    } else if (e.key === 'u' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        updateTraffic();
    } else if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useCurrentTime();
    } else if (e.key === 'm' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        calculateMultiRoute();
    } else if (e.key === 'h' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (panelsVisible) {
            hidePanels();
        } else {
            showPanels();
        }
    } else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        showSpeedCongestionChart();
    } else if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        showTrafficPredictions();
    } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        showPatternAnalysis();
    } else if (e.key === 't' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        startTutorial();
    } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleTheme();
    } else if (e.key === '1' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        downloadTrafficData();
    } else if (e.key === '2' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        downloadRouteData();
    }
});