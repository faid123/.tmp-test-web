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
            background-color: rgba(48, 48, 48, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.42);
            padding: 5px 10px;
            border-radius: 5px;
            color: #ffffff;
            font-family: Arial, sans-serif;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            box-shadow:
                0 0 0 2px rgba(255, 255, 255, 0.08),
                0 5px 14px rgba(0, 0, 0, 0.32);
            transition: background-color 0.3s, border 0.3s, box-shadow 0.3s;
        }

        /* Highlight on hover */
        #reset-button:hover {
            background-color: rgba(58, 58, 58, 0.98);
            border-color: rgba(255, 255, 255, 0.72);
            box-shadow:
                0 0 0 2px rgba(255, 255, 255, 0.16),
                0 6px 18px rgba(0, 0, 0, 0.38);
        }

        /* Styles for the reset icon */
        #reset-icon {
            width: 50px;
            height: 50px;
            margin-right: 10px;
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
            background-color: rgba(48, 48, 48, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.42);
            padding: 0px;
            border-radius: 5px;
            color: #ffffff;
            font-family: Arial, sans-serif;
            font-size: 20px;
            cursor: pointer;
            width: 125px;
            height: 75px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            box-shadow:
                0 0 0 2px rgba(255, 255, 255, 0.08),
                0 5px 14px rgba(0, 0, 0, 0.32);
            transition: background-color 0.3s, border-color 0.3s, box-shadow 0.3s;
        }

        /* Highlight on hover */
        #lock-rotation-button:hover {
            background-color: rgba(58, 58, 58, 0.98);
            border-color: rgba(255, 255, 255, 0.72);
            box-shadow:
                0 0 0 2px rgba(255, 255, 255, 0.16),
                0 6px 18px rgba(0, 0, 0, 0.38);
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

    // Create the text
    const resetText = document.createElement('span');
    resetText.textContent = 'Reset';

    // Append the icon and text to the button
    resetButton.appendChild(resetIcon);
    resetButton.appendChild(resetText);

    // Append the reset button to the body
    getViewerRightNav().appendChild(resetButton);

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

    // Append the lock rotation button to the body
    getViewerRightNav().appendChild(lockRotationButton);

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
        img.style.width = '50px';
        img.style.height = '50px';

        // Create a span element for the text
        const span = document.createElement('span');
        span.textContent = 'Rotation';

        // Append the image and span to the button
        lockRotationButton.appendChild(img);
        lockRotationButton.appendChild(span);
    }

    const legendContainer = document.createElement('section');
    legendContainer.className = 'legend-container';
    legendContainer.setAttribute('aria-label', 'Undercut and occlusion legend');

    const legendHeader = document.createElement('div');
    legendHeader.className = 'legend-header';

    const legendHeading = document.createElement('strong');
    legendHeading.textContent = 'Measurement Legend';

    const legendToggle = document.createElement('button');
    legendToggle.type = 'button';
    legendToggle.className = 'legend-toggle';
    legendToggle.textContent = 'Hide';
    legendToggle.setAttribute('aria-expanded', 'true');
    legendToggle.setAttribute('aria-label', 'Hide measurement legend');

    const legendBody = document.createElement('div');
    legendBody.className = 'legend-body';

    legendHeader.appendChild(legendHeading);
    legendHeader.appendChild(legendToggle);
    legendContainer.appendChild(legendHeader);
    legendContainer.appendChild(legendBody);

    // sets the stuff for legends
    const legendSections = [
        { title: 'Undercut (mm)', colors: {'#D7C60C': '0.25', '#D7A60B': '0.5', '#D8790E': '0.75', '#B20F1D': '> 0.75'} },
        { title: 'Occlusion (mm)', colors: {'#8A01D3': '0.1', '#08009B': '0.25', '#48D6FA': '0.3 - 0.4', '#00E930': '0.5'} }
    ];

    // Create legend sections
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

    legendToggle.addEventListener('click', () => {
        const collapsed = legendContainer.classList.toggle('collapsed');
        legendToggle.textContent = collapsed ? 'Show' : 'Hide';
        legendToggle.setAttribute('aria-expanded', String(!collapsed));
        legendToggle.setAttribute(
            'aria-label',
            `${collapsed ? 'Show' : 'Hide'} measurement legend`
        );
    });

    document.body.appendChild(legendContainer);

    const customCSS = document.createElement('style');
    customCSS.innerHTML = `
        .legend-container {
            position: fixed;
            right: 250px;
            bottom: 12px;
            z-index: 1001;
            width: 250px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.34);
            border-radius: 7px;
            background: rgba(48, 48, 48, 0.94);
            color: #ffffff;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
            font: 13px Arial, sans-serif;
        }

        .legend-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            min-height: 38px;
            padding: 6px 8px 6px 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.18);
            background: rgba(65, 65, 65, 0.98);
        }

        .legend-toggle {
            min-width: 48px;
            min-height: 28px;
            border: 1px solid rgba(255, 255, 255, 0.32);
            border-radius: 5px;
            background: #303030;
            color: #ffffff;
            cursor: pointer;
        }

        .legend-body {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding: 10px;
        }

        .legend-container.collapsed .legend-body {
            display: none;
        }

        .legend-container.collapsed .legend-header {
            border-bottom: 0;
        }

        .legend-section-title {
            margin-bottom: 7px;
            font-weight: 700;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 7px;
            margin-bottom: 5px;
            white-space: nowrap;
        }

        .legend-color {
            flex: 0 0 18px;
            width: 18px;
            height: 18px;
            border: 1px solid rgba(255, 255, 255, 0.48);
            box-sizing: border-box;
        }

        @media (min-width: 769px) and (max-width: 1024px) {
            .legend-container {
                right: 10px;
                bottom: calc(124px + env(safe-area-inset-bottom, 0px));
            }
        }

        @media (max-width: 768px) {
            .legend-container {
                right: 10px;
                bottom: calc(116px + env(safe-area-inset-bottom, 0px));
                width: min(250px, calc(100vw - 20px));
            }

            .legend-body {
                gap: 8px;
                padding: 8px;
            }

            .legend-container,
            .legend-toggle {
                font-size: 12px;
            }
        }
    `;
    document.head.appendChild(customCSS);

}
