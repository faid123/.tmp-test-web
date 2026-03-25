import { GUI } from '../node_modules/dat.gui';

function addVisibilityAndTransparencyControls(parentObject, name, material_array, jaw_type) {
    // Add custom CSS for dat.GUI
    const style = document.createElement('style');
    const customCSS = `
    /* Custom scrollbar styles */
    .guiContainer::-webkit-scrollbar {
        width: 8px;
    }
    .guiContainer::-webkit-scrollbar-track {
        background: transparent;
    }
    .guiContainer::-webkit-scrollbar-thumb {
        background: #888; 
        border-radius: 4px;
    }
    .guiContainer::-webkit-scrollbar-thumb:hover {
        background: #555; 
    }
    .guiContainer {
        scrollbar-width: thin;
        scrollbar-color: #888 transparent;
    }
    .guiContainer::-webkit-scrollbar {
        display: none;
    }
    .guiContainer:hover::-webkit-scrollbar {
        display: block;
    }

    /* Folder styling */
    .dg .folder {
        background-color: black !important;
        color: white !important;
        margin-bottom: 0 !important; /* Remove space between folders */
    }
    .dg .folder .title {
        color: white !important;
        display: flex;
        align-items: center; /* Center items vertically */
        justify-content: center; /* Center items horizontally */
    }
    .dg .folder .cr {
        color: white !important;
    }
    .dg .folder input[type="checkbox"] {
        background-color: black !important;
    }
    .dg .folder input[type="range"] {
        background-color: black !important;
    }
        /* Hide close controls */
    .dg .close-button, .dg .close-control {
        display: none !important;
    }

    /* Icon styling */
    .dg .folder .title .icon {
        width: 28px;  /* Increased from 16px to 28px */
        height: 28px; /* Increased from 16px to 28px */
        background: no-repeat center center;
        background-size: contain;
        display: inline-block;
        vertical-align: middle;
        margin-right: 5px;
    }

`;

    style.innerHTML = customCSS;
    document.head.appendChild(style);

    const guiContainer = document.createElement('div');
    guiContainer.style.position = 'absolute';
    guiContainer.style.top = '40px'; // Adjust this to control the distance from the toggle button
    guiContainer.style.left = '0'; // Align it with the toggle button horizontally
    guiContainer.style.width = '260px';
    guiContainer.style.maxHeight = '300px';


    guiContainer.classList.add('guiContainer'); // Apply custom scrollbar styles




    document.body.appendChild(guiContainer);
    //creation of the controls
    const gui = new GUI({ autoPlace: false });
    guiContainer.appendChild(gui.domElement);

    let globalVisibilityToggle = true; // Initialize the global visibility toggle

    const visibilityControls = [];
    //iterates all meshes
    parentObject.children.forEach((child) => {
        if (child.isMesh) {
            const folder = gui.addFolder(child.name);
            folder.open();

            // Replace folder title with icon
            let iconPath;
            const basePath = window.location.hostname.includes("github.io") ? "/smartrpd_viewer" : "";

            if (child.name.includes('surface')) {
                if (child.name.includes('lower')) {
                    iconPath = `${basePath}/assets/Icon_LowerJaw.png`;
                } else if (child.name.includes('upper')) {
                    iconPath = `${basePath}/assets/Icon_UpperJaw.png`;
                }
            } else {
                if (child.name.includes('lower')) {
                    iconPath = `${basePath}/assets/Icon_LowerJaw_Occlusal.png`;
                } else if (child.name.includes('upper')) {
                    iconPath = `${basePath}/assets/Icon_UpperJaw_Occlusal.png`;
                }
            }


            const title = folder.domElement.querySelector('.title');
            title.innerHTML = `<span class="icon" style="background-image: url('${iconPath}');"></span>`;

            // Visibility toggle
            const visibilityInput = document.createElement('input');
            visibilityInput.type = 'checkbox';
            visibilityInput.checked = child.visible;
            visibilityInput.addEventListener('change', () => {
                child.visible = visibilityInput.checked;
            });

            // Add to visibilityControls array for global toggling
            visibilityControls.push(visibilityInput);

            // Transparency control
            const transparencyInput = document.createElement('input');
            transparencyInput.type = 'range';
            transparencyInput.min = 0;
            transparencyInput.max = 1;
            transparencyInput.step = 0.01;
            transparencyInput.value = child.material.opacity;
            transparencyInput.addEventListener('input', () => {
                child.material.transparent = true;
                child.material.opacity = transparencyInput.value;
                child.material.needsUpdate = true;
            });

            // Create a single object to hold visibility and transparency properties
            const controlContainer = document.createElement('div');
            controlContainer.style.display = 'flex';
            controlContainer.style.justifyContent = 'space-between';
            controlContainer.style.alignItems = 'center';
            controlContainer.style.marginBottom = '0px'; // Remove space between controls

            controlContainer.appendChild(visibilityInput);
            controlContainer.appendChild(transparencyInput);

            // Append controlContainer to folder's DOM
            const listItem = document.createElement('li');
            listItem.appendChild(controlContainer);
            folder.__ul.appendChild(listItem);

            if (!child.name.includes('surface') && child.userData.jaw_type in jaw_type) {
                let undercutControl, occControl;
                if (jaw_type[child.userData.jaw_type][0]) {
                    undercutControl = folder.add({ undercut: false }, 'undercut').name('Undercut').onChange((value) => {
                        if (value) {
                            const mat = material_array[child.name][2];
                            occControl.setValue(false);
                            child.geometry.dispose();
                            child.geometry = mat;
                            child.geometry.needsUpdate = true;
                        } else {
                            const mat = material_array[child.name][0];
                            child.geometry.dispose();
                            child.geometry = mat;
                            child.geometry.needsUpdate = true;
                        }//1
                    });
                }
                if (jaw_type[child.userData.jaw_type][0]) {
                    occControl = folder.add({ occlusion: false }, 'occlusion').name('Occlusion').onChange((value) => {
                        if (value) {
                            const mat = material_array[child.name][1];
                            undercutControl.setValue(false);
                            child.geometry.dispose();
                            child.geometry = mat;
                            child.geometry.needsUpdate = true;
                        } else {
                            const mat = material_array[child.name][0];
                            child.geometry.dispose();
                            child.geometry = mat;
                            child.geometry.needsUpdate = true;
                        }
                    });
                }
            } else if (child.name.includes('surface')) {
                const surfaceMaterialControl = folder.add({ surfaceMetallic: false }, 'surfaceMetallic').name('Metallic').onChange((value) => {
                    if (value) {
                        const mat = material_array[child.name][2];
                        child.material = mat;
                    } else {
                        const mat = material_array[child.name][1];
                        child.material = mat;
                    }
                });
            }
        }
    });

    //This is for the background for the control so it wont look janked
    let blackBar;
    if (guiContainer.offsetHeight) {
        guiContainer.style.overflowY = 'auto';
        guiContainer.style.overflowX = 'hidden';
    
        blackBar = document.createElement('div');
        blackBar.style.position = 'fixed';
        blackBar.style.zIndex = '999'; // Ensure the black bar is behind the guiContainer

        let temp_width = guiContainer.offsetWidth - 15;
        if (isMobileDevice()) {
            temp_width = temp_width * 2;
        }
        blackBar.style.width = temp_width + 'px'; // Full width of the viewport
        
        let temp_height_of_bar = 25;
        let temp_height = guiContainer.offsetTop + guiContainer.offsetHeight;
        if (isMobileDevice()) {
            temp_height_of_bar = temp_height_of_bar * 2;
            temp_height = temp_height * 2 - guiContainer.offsetTop;
        }
        blackBar.style.top = `${guiContainer.offsetTop}px`; // Adjusted top position based on guiContainer height
        blackBar.style.height = temp_height + 'px';
        blackBar.style.backgroundColor = 'black';

        document.body.appendChild(blackBar);

        // Adjust guiContainer zIndex to ensure it is above the black bar
        guiContainer.style.zIndex = '1000';
    }


    const globalVisibilityButton = {
        toggleVisibility: () => {
            globalVisibilityToggle = !globalVisibilityToggle;
            parentObject.children.forEach((child) => {
                if (child.isMesh) {
                    child.visible = globalVisibilityToggle;
                }
            });
            visibilityControls.forEach((control) => {
                control.checked = globalVisibilityToggle;
            });
        }
    };
    gui.add(globalVisibilityButton, 'toggleVisibility').name('Toggle All Visibility');

    function isMobileDevice() {
        return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // External button for toggling GUI visibility
    const toggleButton = document.createElement('button');
    toggleButton.innerText = 'Close controls'; // Initial text
    toggleButton.style.position = 'absolute';
    toggleButton.style.top = '10px';
    toggleButton.style.left = '0'; // Adjust the position as needed
    if (isMobileDevice()) {
        toggleButton.style.width = '488px';
    } else {
        toggleButton.style.width = '245px';
    }
    toggleButton.style.height = '25px';
    // Add styling for a professional and slick look
    toggleButton.style.backgroundColor = 'black';
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.padding = '0px 0px';
    toggleButton.style.fontSize = '13px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.style.borderRadius = '5px';
    toggleButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
    toggleButton.style.transition = 'background-color 0.3s, transform 0.3s';

    // Add hover effect
    toggleButton.addEventListener('mouseover', () => {
        toggleButton.style.backgroundColor = '#333';
        toggleButton.style.transform = 'scale(1.05)';
    });

    toggleButton.addEventListener('mouseout', () => {
        toggleButton.style.backgroundColor = 'black';
        toggleButton.style.transform = 'scale(1)';
    });

    document.body.appendChild(toggleButton);

    toggleButton.addEventListener('click', () => {
        if (guiContainer.style.display === 'none') {
            guiContainer.style.display = 'block';
            blackBar.style.display = 'block';
            toggleButton.innerText = 'Close controls';
        } else {
            guiContainer.style.display = 'none';
            blackBar.style.display = 'none';
            toggleButton.innerText = 'Open controls';
        }
    });

    if (isMobileDevice()) {
        const scale = 2;
        
        guiContainer.style.transformOrigin = 'top left';
        guiContainer.style.transform = `scale(${scale})`;
        parentObject.position.y -= 5;
    }

}

export { addVisibilityAndTransparencyControls };
