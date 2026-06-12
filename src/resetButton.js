export function addResetButton(camera, clone, controls, getResetTarget = null) {
    let rotationLocked = true; // Initial state of rotation lock
    const getViewerRightNav = () => {
        if (window.getViewerRightNav) return window.getViewerRightNav();
        let nav = document.getElementById('viewer-right-nav');
        if (!nav) {
            nav = document.createElement('nav');
            nav.id = 'viewer-right-nav';
            nav.setAttribute('aria-label', 'Viewer controls');
            document.body.appendChild(nav);
        }
        return nav;
    };

    // Create and append styles
    const style = document.createElement('style');
    style.innerHTML = `
        /* Animation for rotating the reset icon */
        @keyframes rotate360 {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* Styles for the reset button */
        #reset-button {
            position: static;
            order: 20;
            z-index: 1000;
            background-color: #ffffff;
            border: 1px solid rgba(0, 0, 0, 0.15);
            padding: 8px;
            border-radius: 8px;
            color: #222222;
            font-family: Arial, sans-serif;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 60px;
            height: 60px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            transition: background-color 0.2s, box-shadow 0.2s;
        }

        /* Highlight on hover */
        #reset-button:hover {
            background-color: #f0f0f0;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
        }

        /* Styles for the reset icon */
        #reset-icon {
            width: 40px;
            height: 40px;
            margin-right: 0;
            transition: transform 0.1s;
        }

        /* Rotate animation when clicked */
        #reset-button.clicked #reset-icon {
            animation: rotate360 0.5s linear;
        }

        /* Styles for the lock rotation button */
        #lock-rotation-button {
            position: static;
            order: 30;
            z-index: 1000;
            background-color: #ffffff;
            border: 1px solid rgba(0, 0, 0, 0.15);
            padding: 8px;
            border-radius: 8px;
            color: #222222;
            font-family: Arial, sans-serif;
            cursor: pointer;
            width: 60px;
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            transition: background-color 0.2s, box-shadow 0.2s;
        }

        /* Highlight on hover */
        #lock-rotation-button:hover {
            background-color: #f0f0f0;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
        }
    `;
    document.head.appendChild(style);

    // Create the reset button
    const resetButton = document.createElement('button');
    resetButton.id = 'reset-button';

    // Create the icon
    const resetIcon = document.createElement('img');
    const basePath = window.location.hostname.includes("github.io") ? "/.tmp-test-web" : "";
    resetIcon.src = `${basePath}/assets/reset.png`; // Replace with the path to your icon
    // resetIcon.src = '/reset.png'; // Replace with the path to your icon
    resetIcon.alt = 'Reset';
    resetIcon.id = 'reset-icon';

    // Append the icon to the button (no text label)
    resetButton.appendChild(resetIcon);

    // Wrap reset + lock buttons in a shared row so they sit side by side
    const topRow = document.createElement('div');
    topRow.id = 'viewer-right-nav-top-row';
    topRow.style.order = '40';
    getViewerRightNav().appendChild(topRow);
    topRow.appendChild(resetButton);

    // Function to handle reset button click
    function handleResetButtonClick() {
        // Add class to trigger animation
        resetButton.classList.add('clicked');
        camera.copy(clone)
        // Reset the camera zoom
        camera.zoom = 7;
        camera.updateProjectionMatrix();
        // Reset controls target and update controls
        const resetTarget = typeof getResetTarget === 'function' ? getResetTarget() : null;
        if (resetTarget) {
            controls.target.copy(resetTarget);
        } else {
            controls.target.set(0, 0, 0);
        }
        controls.update();
        //console.log('Camera reset:');
        //console.log('Position:', camera.position);
        //console.log('Rotation:', camera.rotation);
        //console.log('Zoom:', camera.zoom);

        // Reset animation after delay
        setTimeout(() => {
            resetButton.classList.remove('clicked');
        }, 1000); // Adjust timing as needed

        // Add your reset logic here if needed
        //console.log('Reset button clicked');
    }

    // Add click event listener to reset button
    resetButton.addEventListener('click', handleResetButtonClick);

    // Create the lock rotation button
    const lockRotationButton = document.createElement('button');
    lockRotationButton.id = 'lock-rotation-button';

    // Initial setup for the button's background image and text
    updateLockRotationButtonImage();

    // Add lock button into the same top row as reset
    topRow.appendChild(lockRotationButton);

    // Define the lock/unlock rotation function
    function toggleRotationLock() {
        rotationLocked = !rotationLocked; // Toggle rotation lock state
        updateLockRotationButtonImage(); // Update button image
        // Implement your logic to lock or unlock rotation
        controls.noRotate = rotationLocked;
        //console.log(`Rotation ${rotationLocked ? 'locked' : 'unlocked'}`);
    }

    // Add a listener to the lock rotation button
    lockRotationButton.addEventListener('click', toggleRotationLock);
    lockRotationButton.click();

    // Function to update lock rotation button image based on current state
    function updateLockRotationButtonImage() {
        const basePath = window.location.hostname.includes("github.io") ? "/smartrpd_viewer" : "";

        const lockedImageUrl = `${basePath}/assets/lock.png`;    // Replace with your locked image path
        const unlockedImageUrl = `${basePath}/assets/unlock.png`;
 // Replace with your unlocked image path
        const imageUrl = rotationLocked ? lockedImageUrl : unlockedImageUrl;

        // Clear existing content
        lockRotationButton.innerHTML = '';

        // Create an image element
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = rotationLocked ? 'Locked' : 'Unlocked';
        img.style.width = '40px';
        img.style.height = '40px';

        // Append the icon only (no text label)
        lockRotationButton.appendChild(img);
    }

    const legendContainer = document.createElement('section');
    legendContainer.className = 'legend-container legend-hidden';
    legendContainer.setAttribute('aria-label', 'Undercut and occlusion legend');

    const legendHeader = document.createElement('div');
    legendHeader.className = 'legend-header';

    const legendHeading = document.createElement('strong');
    legendHeading.textContent = 'Heatmap';

    const legendClose = document.createElement('button');
    legendClose.type = 'button';
    legendClose.className = 'legend-close';
    legendClose.textContent = '×';
    legendClose.setAttribute('aria-label', 'Close measurement legend');

    const legendBody = document.createElement('div');
    legendBody.className = 'legend-body';

    legendHeader.appendChild(legendHeading);
    legendHeader.appendChild(legendClose);
    legendContainer.appendChild(legendHeader);
    legendContainer.appendChild(legendBody);

    const legendSections = [
        { title: 'Undercut (mm)', colors: {'#D7C60C': '0.25', '#D7A60B': '0.5', '#D8790E': '0.75', '#B20F1D': '> 0.75'} },
        { title: 'Occlusion (mm)', colors: {'#8A01D3': '0.1', '#08009B': '0.25', '#48D6FA': '0.3 - 0.4', '#00E930': '0.5'} }
    ];

    legendSections.forEach(section => {
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'legend-section';

        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'legend-section-title';
        sectionTitle.textContent = section.title;
        sectionContainer.appendChild(sectionTitle);

        Object.entries(section.colors).forEach(([color, label]) => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';

            const colorBox = document.createElement('div');
            colorBox.className = 'legend-color';
            colorBox.style.backgroundColor = color || '#FFFFFF';

            const itemText = document.createElement('span');
            itemText.textContent = label;

            legendItem.appendChild(colorBox);
            legendItem.appendChild(itemText);
            sectionContainer.appendChild(legendItem);
        });

        legendBody.appendChild(sectionContainer);
    });

    legendClose.addEventListener('click', () => {
        legendContainer.classList.add('legend-hidden');
    });

    const legendHost =
        document.getElementById('container3D') ||
        getViewerRightNav().parentElement ||
        document.body;
    legendHost.appendChild(legendContainer);

    window.toggleMeasurementLegend = () => {
        legendContainer.classList.toggle('legend-hidden');
    };

    const customCSS = document.createElement('style');
    customCSS.innerHTML = `
        .legend-container {
            position: absolute;
            right: 258px;
            bottom: 16px;
            z-index: 1002;
            width: 280px;
            max-height: calc(100% - 32px);
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 8px;
            background: rgba(28, 28, 28, 0.96);
            color: #ffffff;
            font: 13px Arial, sans-serif;
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(6px);
        }

        .legend-container.legend-hidden {
            display: none;
        }

        .legend-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            min-height: 36px;
            padding: 6px 8px 6px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.06);
        }

        .legend-close {
            width: 26px;
            height: 26px;
            border: 1px solid rgba(255, 255, 255, 0.22);
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            font-size: 16px;
            line-height: 1;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .legend-close:hover {
            background: rgba(255, 255, 255, 0.16);
        }

        .legend-body {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            padding: 12px;
            max-height: calc(100% - 48px);
            overflow: auto;
        }

        .legend-section-title {
            margin-bottom: 6px;
            font-weight: 700;
            font-size: 12px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
            white-space: nowrap;
            font-size: 12px;
        }

        .legend-color {
            flex: 0 0 16px;
            width: 16px;
            height: 16px;
            border: 1px solid rgba(255, 255, 255, 0.36);
            box-sizing: border-box;
            border-radius: 2px;
        }

        @media (min-width: 769px) and (max-width: 1024px) {
            .legend-container {
                right: 16px;
                bottom: calc(120px + env(safe-area-inset-bottom, 0px));
            }
        }

        @media (max-width: 768px) {
            .legend-container {
                right: 10px;
                bottom: calc(112px + env(safe-area-inset-bottom, 0px));
                width: min(280px, calc(100vw - 20px));
            }
        }
    `;
    document.head.appendChild(customCSS);

}
