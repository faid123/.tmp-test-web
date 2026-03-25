export function addResetButton(camera, clone, controls) {
    let rotationLocked = true; // Initial state of rotation lock

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
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background-color: transparent;
            border: 1px solid transparent;
            padding: 5px 10px;
            border-radius: 5px;
            font-family: Arial, sans-serif;
            font-size: 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            transition: background-color 0.3s, border 0.3s;
        }

        /* Highlight on hover */
        #reset-button:hover {
            background-color: rgba(200, 200, 200, 0.5);
            border: 1px solid #ccc;
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
            position: fixed;
            top: 75px;
            right: 10px;
            z-index: 1000;
            background-color: transparent;
            border: 1px solid transparent;
            padding: 0px;
            border-radius: 5px;
            font-family: Arial, sans-serif;
            font-size: 20px;
            cursor: pointer;
            width: 125px;
            height: 75px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: background-color 0.3s, border-color 0.3s;
        }

        /* Highlight on hover */
        #lock-rotation-button:hover {
            background-color: rgba(200, 200, 200, 0.5);
            border: 1px solid #ccc;
        }
    `;
    document.head.appendChild(style);

    // Create the reset button
    const resetButton = document.createElement('button');
    resetButton.id = 'reset-button';

    // Create the icon
    const resetIcon = document.createElement('img');
    const basePath = window.location.hostname.includes("github.io") ? "/smartrpd_viewer" : "";
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
    document.body.appendChild(resetButton);

    // Function to handle reset button click
    function handleResetButtonClick() {
        // Add class to trigger animation
        resetButton.classList.add('clicked');
        camera.copy(clone)
        // Reset the camera zoom
        camera.zoom = 7;
        camera.updateProjectionMatrix();
        // Reset controls target and update controls
        controls.target.set(0, 0, 0);
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
    document.body.appendChild(lockRotationButton);

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
    function autoClickTwice(button) {
        // Click the button for the first time
        button.click();
        // Click the button for the second time
        
    }
    
    // Call the function to auto click the button twice
    autoClickTwice(lockRotationButton);

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

    const legendContainer = document.createElement('div');
    legendContainer.style.position = 'fixed';
    legendContainer.style.bottom = '100px';
    legendContainer.style.left = '5px';
    legendContainer.style.zIndex = '1000';
    legendContainer.style.backgroundColor = 'transparent';
    legendContainer.style.border = '0px solid transparent';
    legendContainer.style.padding = '10px';
    legendContainer.style.borderRadius = '0px';
    legendContainer.style.fontFamily = 'Arial, sans-serif';
    legendContainer.style.fontSize = '14px';
    legendContainer.style.minWidth = '190px';
    legendContainer.style.width = '20%';
    legendContainer.style.maxWidth = '250px'
    legendContainer.style.display = 'flex';
    legendContainer.style.flexWrap = 'wrap';

    // sets the stuff for legends
    const legendSections = [
        { title: 'Undercut(mm)', colors: {'#D7C60C': '0.25', '#D7A60B': '0.5', '#D8790E': '0.75', '#B20F1D': '> 0.75'} },
        { title: 'Occlusion(mm)', colors: {'#8A01D3': '0.1', '#08009B': '0.25', '#48D6FA': '0.3 - 0.4', '#00E930': '0.5'} }
    ];

    // Create legend sections
    legendSections.forEach(section => {
        const sectionContainer = document.createElement('div');
        sectionContainer.style.marginRight = '20px';

        const sectionTitle = document.createElement('div');
        sectionTitle.textContent = section.title;
        sectionTitle.style.marginBottom = '5px';
        sectionTitle.style.fontWeight = 'bold';
        sectionContainer.appendChild(sectionTitle);

        Object.entries(section.colors).forEach(([color, label]) => {
            const legendItem = document.createElement('div');
            legendItem.style.display = 'flex';
            legendItem.style.alignItems = 'center';
            legendItem.style.marginBottom = '5px';

            const colorBox = document.createElement('div');
            colorBox.style.width = '20px';
            colorBox.style.height = '20px';
            colorBox.style.backgroundColor = color || '#FFFFFF';
            colorBox.style.marginRight = '10px';
            colorBox.style.border = '1px solid #000';

            const itemText = document.createElement('span');
            itemText.textContent = label;

            legendItem.appendChild(colorBox);
            legendItem.appendChild(itemText);
            sectionContainer.appendChild(legendItem);
        });

        legendContainer.appendChild(sectionContainer);
    });

    // Append the legend container to the body
    document.body.appendChild(legendContainer);

    // Add custom CSS for responsiveness
    const customCSS = document.createElement('style');
    customCSS.innerHTML = `
        @media (max-width: 1200px) {
            .legend-container { width: 35%; }
        }
        @media (max-width: 768px) {
            .legend-container { width: 50%; bottom: 70px; }
        }
        @media (max-width: 480px) {
            .legend-container { width: 70%; bottom: 50px; left: 5px; padding: 5px; }
            .legend-container div { font-size: 12px; }
            .legend-container div div { font-size: 10px; }
            .legend-container div div div { width: 15px; height: 15px; margin-right: 5px; }
        }
    `;
    document.head.appendChild(customCSS);

    // Assign the class to the legend container
    legendContainer.className = 'legend-container';
}
