/* function createSimpleVisibilityButtons(parentObject, material_array) {
	const controlBar = document.createElement('div');
	controlBar.style.position = 'absolute';
	controlBar.style.bottom = '20px';
	controlBar.style.left = '50%';
	controlBar.style.transform = 'translateX(-50%)';
	controlBar.style.display = 'flex';
	controlBar.style.gap = '10px';
	controlBar.style.zIndex = '999';

	const visibilityStates = {
		model: true,
		undercut: false,
		occlusion: false,
	};

	const btnConfigs = [
		{
			name: 'model',
			icon: 'Model.png',
			onClick: () => {
				visibilityStates.model = !visibilityStates.model;

				parentObject.children.forEach(child => {
					if (child.isMesh && child.userData && child.userData.jaw_type) {
						// Ensure visibility toggle works only for jaw model meshes
						child.visible = visibilityStates.model;

						// Optional: revert material to standard if metallic was applied
						const matArray = material_array[child.name];
						if (matArray && matArray.length >= 2) {
							child.material = matArray[1]; // 1 is standard (non-metallic)
							child.material.needsUpdate = true;
						}
					}
				});
			}
		},
		{
			name: 'undercut',
			icon: 'Undercut.png',
			onClick: () => {
				visibilityStates.undercut = !visibilityStates.undercut;
				visibilityStates.occlusion = false;

				parentObject.children.forEach(child => {
					if (child.isMesh && !child.name.includes("surface")) {
						const matArray = material_array[child.name];
						if (!matArray || matArray.length < 3) return;

						child.geometry.dispose();
						child.geometry = visibilityStates.undercut
							? matArray[2].clone()
							: matArray[0].clone();
						child.geometry.computeBoundingSphere();
						child.geometry.needsUpdate = true;
					}
				});
			}
		},
		{
			name: 'occlusion',
			icon: 'Occlusion.png',
			onClick: () => {
				visibilityStates.occlusion = !visibilityStates.occlusion;
				visibilityStates.undercut = false;

				parentObject.children.forEach(child => {
					if (child.isMesh && !child.name.includes("surface")) {
						const matArray = material_array[child.name];
						if (!matArray || matArray.length < 2) return;

						child.geometry.dispose();
						child.geometry = visibilityStates.occlusion
							? matArray[1].clone()
							: matArray[0].clone();
						child.geometry.computeBoundingSphere();
						child.geometry.needsUpdate = true;
					}
				});
			}
		}
	];

	btnConfigs.forEach(cfg => {
		const btn = document.createElement('button');
		btn.style.background = 'none';
		btn.style.border = 'none';
		btn.style.cursor = 'pointer';

		const img = document.createElement('img');
		img.src = cfg.icon;
		img.alt = cfg.name;
		img.style.width = '40px';
		img.style.height = '40px';
		btn.appendChild(img);

		btn.addEventListener('click', cfg.onClick);
		controlBar.appendChild(btn);
	});

	document.body.appendChild(controlBar);
}

export { createSimpleVisibilityButtons };
 */
/*  
function addVisibilityAndTransparencyControls(parentObject, name, material_array, jaw_type) {
	const container = document.createElement('div');
	container.id = 'icon-controls';
	container.style.position = 'absolute';
	container.style.top = '10px';
	container.style.left = '10px';
	container.style.zIndex = '999';
	container.style.display = 'flex';
	container.style.gap = '10px';

	// Utility: create icon button
	function createIconButton(iconPath, tooltip, onClick) {
		const btn = document.createElement('button');
		btn.style.width = '40px';
		btn.style.height = '40px';
		btn.style.backgroundImage = `url(${iconPath})`;
		btn.style.backgroundSize = 'contain';
		btn.style.backgroundRepeat = 'no-repeat';
		btn.style.backgroundColor = 'transparent';
		btn.style.border = 'none';
		btn.style.cursor = 'pointer';
		btn.title = tooltip;
		btn.addEventListener('click', onClick);
		return btn;
	}

	// Toggle logic for visibility, undercut, occlusion
	const toggle = {
		modelVisible: true,
		undercut: false,
		occlusion: false,
		metallic: false
	};
	
	// Model toggle
	const modelBtn = createIconButton('Model.png', 'Toggle Jaw Model', () => {
		toggle.modelVisible = !toggle.modelVisible;
		parentObject.children.forEach((child) => {
			if (child.isMesh && !child.name.includes('surface')) {
				child.visible = toggle.modelVisible;
			}
		});
	});
	container.appendChild(modelBtn);

	// Model toggle
	const surfaceBtn = createIconButton('Model.png', 'Toggle Jaw Model', () => {
		toggle.modelVisible = !toggle.modelVisible;
		parentObject.children.forEach((child) => {
			if (child.isMesh && child.name.includes('surface')) {
				child.visible = toggle.modelVisible;
			}
		});
	});
	container.appendChild(surfaceBtn);

	// Undercut toggle (affects all jaws)
	const undercutBtn = createIconButton('Undercut.png', 'Toggle Undercut Heatmap', () => {
		toggle.undercut = !toggle.undercut;
		toggle.occlusion = false;

		parentObject.children.forEach((child) => {
			if (!child.name.includes('surface') && child.userData.jaw_type in jaw_type) {
				const mat = toggle.undercut ? material_array[child.name][2] : material_array[child.name][0];
				child.geometry.dispose();
				child.geometry = mat;
				child.geometry.needsUpdate = true;
			}
		});
	});
	container.appendChild(undercutBtn);

	// Occlusion toggle (affects all jaws)
	const occlusionBtn = createIconButton('Occlusion.png', 'Toggle Occlusion View', () => {
		toggle.occlusion = !toggle.occlusion;
		toggle.undercut = false;

		parentObject.children.forEach((child) => {
			if (!child.name.includes('surface') && child.userData.jaw_type in jaw_type) {
				const mat = toggle.occlusion ? material_array[child.name][1] : material_array[child.name][0];
				child.geometry.dispose();
				child.geometry = mat;
				child.geometry.needsUpdate = true;
			}
		});
	});
	container.appendChild(occlusionBtn);

	// Metallic toggle for surface models
	const metallicBtn = createIconButton('Model.png', 'Toggle Metallic Material', () => {
		toggle.metallic = !toggle.metallic;

		parentObject.children.forEach((child) => {
			if (child.name.includes('surface')) {
				child.material = toggle.metallic
					? material_array[child.name][2]
					: material_array[child.name][1];
			}
		});
	});
	container.appendChild(metallicBtn);

	document.body.appendChild(container);

	// Optional: scale up on mobile
	function isMobileDevice() {
		return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
	}
	if (isMobileDevice()) {
		container.style.transform = 'scale(1.5)';
		container.style.transformOrigin = 'top left';
	}
}

export { addVisibilityAndTransparencyControls };
 */
 
 // Inject custom CSS for icon toggle states
 const style = document.createElement('style');
 style.textContent = `
   .icon-button {
     position: relative;
     width: 40px;
     height: 40px;
     background-size: contain;
     background-repeat: no-repeat;
     background-color: transparent;
     border: none;
     cursor: pointer;
     transition: all 0.2s ease-in-out;
   }
 
   .icon-button.active {
     border: 2px solid #00cc99;
     border-radius: 6px;
     background-color: rgba(0, 255, 204, 0.1);
   }
 
   .icon-button.inactive::after {
     content: '✕';
     position: absolute;
     top: 0px;
     right: 0px;
     color: red;
     font-size: 18px;
     font-weight: bold;
     background: rgba(255,255,255,0.7);
     border-radius: 50%;
     padding: 2px 5px;
     line-height: 1;
   }
   .polyline-jaw-button {
     background-image: none !important;
     background-color: #00a651 !important;
     border: 2px solid #07853f !important;
     border-radius: 6px;
     color: #ffffff;
     font-size: 12px;
     font-weight: 700;
     line-height: 1;
   }

   .polyline-jaw-button.inactive {
     background-color: rgba(0, 166, 81, 0.25) !important;
     border-color: rgba(7, 133, 63, 0.55) !important;
   }

   .artificial-tooth-jaw-button {
     background-image: none !important;
     background-color: #e5e87c !important;
     border: 2px solid #a7aa28 !important;
     border-radius: 6px;
     color: #1f2937;
     font-size: 12px;
     font-weight: 700;
     line-height: 1;
   }

   .artificial-tooth-jaw-button.inactive {
     background-color: rgba(229, 232, 124, 0.25) !important;
     border-color: rgba(167, 170, 40, 0.55) !important;
   }
 `;
 document.head.appendChild(style);
 
 function removeVisibilityAndTransparencyControls() {
     const existingContainer = document.getElementById('icon-controls');
     if (existingContainer) {
         existingContainer.remove();
     }
 }
  
 function addVisibilityAndTransparencyControls(parentObject, name, material_array, jaw_type) {
     const container = document.createElement('div');
     container.id = 'icon-controls';
     container.style.position = 'absolute';
     container.style.top = '10px';
     container.style.left = '10px';
     container.style.zIndex = '999';
     container.style.display = 'flex';
     container.style.flexDirection = 'column';
     container.style.gap = '8px';
 
     function createIconBtn(iconPath, tooltip, callback) {
         const btn = document.createElement('button');
         btn.className = 'icon-button';
         btn.style.width = '40px';
         btn.style.height = '40px';
         btn.style.backgroundImage = `url(${iconPath})`;
         btn.style.backgroundSize = 'contain';
         btn.style.backgroundRepeat = 'no-repeat';
         btn.style.backgroundColor = 'transparent';
         btn.style.border = 'none';
         btn.style.cursor = 'pointer';
         btn.title = tooltip;
         btn.addEventListener('click', callback);
         return btn;
     }
 
     // 🔍 First scan for surface meshes
     const meshesByJaw = {
         upper: { jaw: [], surface: [] },
         lower: { jaw: [], surface: [] },
     };

     const getJawKey = (child) => {
         const nameText = String(child.name || '').toLowerCase();
         const jawTypeText = String(child.userData?.jaw_type || '').toLowerCase();
         if (nameText.includes('upper') || jawTypeText.includes('upper') || jawTypeText === '2') return 'upper';
         if (nameText.includes('lower') || jawTypeText.includes('lower') || jawTypeText === '1') return 'lower';
         return null;
     };

     parentObject.children.forEach(child => {
         if (!child.isMesh) return;
         const jawKey = getJawKey(child);
         if (!jawKey) return;
         const bucket = child.name.toLowerCase().includes('surface') ? 'surface' : 'jaw';
         meshesByJaw[jawKey][bucket].push(child);
     });

     const setButtonState = (button, isActive) => {
         button.classList.toggle('active', Boolean(isActive));
         button.classList.toggle('inactive', !isActive);
     };

     const setMeshGroupVisible = (meshes, isVisible) => {
         meshes.forEach(mesh => {
             mesh.visible = isVisible;
         });
     };

     const areAnyVisible = (meshes) => meshes.some(mesh => mesh.visible);

     const applyJawMaterial = (meshes, index) => {
         meshes.forEach(mesh => {
             const meshMaterials = material_array[mesh.name];
             if (!meshMaterials || !meshMaterials[index]) return;
             mesh.geometry.dispose();
             mesh.geometry = meshMaterials[index];
             mesh.geometry.needsUpdate = true;
         });
     };

     const makeGroupVisibilityButton = (iconPath, tooltip, meshes) => {
         const button = createIconBtn(iconPath, tooltip, () => {
             const nextVisible = !areAnyVisible(meshes);
             setMeshGroupVisible(meshes, nextVisible);
             setButtonState(button, nextVisible);
         });
         if (!meshes.length) {
             button.disabled = true;
             button.style.cursor = 'not-allowed';
             button.style.opacity = '0.45';
             setButtonState(button, false);
             return button;
         }
         setButtonState(button, areAnyVisible(meshes));
         return button;
     };

     ['upper', 'lower'].forEach(jawKey => {
         const jawMeshes = meshesByJaw[jawKey].jaw;
         const surfaceMeshes = meshesByJaw[jawKey].surface;
         if (!jawMeshes.length && !surfaceMeshes.length) return;

         const meshControls = document.createElement('div');
         meshControls.style.display = 'flex';
         meshControls.style.gap = '4px';
         meshControls.style.alignItems = 'center';

         const titlePrefix = jawKey === 'upper' ? 'Upper' : 'Lower';
         const jawIcon = `${basePath}/assets/Icon_${titlePrefix}Jaw_Occlusal.png`;
         const surfaceIcon = `${basePath}/assets/Icon_${titlePrefix}Jaw.png`;

         meshControls.appendChild(
             makeGroupVisibilityButton(jawIcon, `${titlePrefix} Jaw`, jawMeshes)
         );
         meshControls.appendChild(
             makeGroupVisibilityButton(
                 surfaceIcon,
                 `${titlePrefix} Jaw Surface`,
                 surfaceMeshes
             )
         );

         let currentMode = 'normal';
         const undercutBtn = createIconBtn(`${basePath}/assets/Undercut.png`, `${titlePrefix} Undercut`, () => {});
         const occlusionBtn = createIconBtn(`${basePath}/assets/Occlusion.png`, `${titlePrefix} Occlusion`, () => {});
         setButtonState(undercutBtn, false);
         setButtonState(occlusionBtn, false);

         undercutBtn.onclick = () => {
             if (currentMode === 'undercut') {
                 currentMode = 'normal';
                 applyJawMaterial(jawMeshes, 0);
                 setButtonState(undercutBtn, false);
             } else {
                 currentMode = 'undercut';
                 applyJawMaterial(jawMeshes, 2);
                 setButtonState(undercutBtn, true);
                 setButtonState(occlusionBtn, false);
             }
         };
         occlusionBtn.onclick = () => {
             if (currentMode === 'occlusion') {
                 currentMode = 'normal';
                 applyJawMaterial(jawMeshes, 0);
                 setButtonState(occlusionBtn, false);
             } else {
                 currentMode = 'occlusion';
                 applyJawMaterial(jawMeshes, 1);
                 setButtonState(occlusionBtn, true);
                 setButtonState(undercutBtn, false);
             }
         };
         meshControls.appendChild(undercutBtn);
         meshControls.appendChild(occlusionBtn);

         const polylineBtn = createIconBtn('', `${titlePrefix} Polyline`, () => {});
         polylineBtn.classList.add('polyline-jaw-button');
         polylineBtn.textContent = 'PL';
         const syncPolylineButtonState = () => {
             const isVisible = window.getPolylineJawVisibility?.(jawKey) ?? true;
             setButtonState(polylineBtn, isVisible);
         };
         polylineBtn.onclick = () => {
             const nextVisible = !(window.getPolylineJawVisibility?.(jawKey) ?? true);
             window.setPolylineJawVisibility?.(jawKey, nextVisible);
             syncPolylineButtonState();
         };
         syncPolylineButtonState();
         meshControls.appendChild(polylineBtn);

         const artificialTeethBtn = createIconBtn('', `${titlePrefix} Artificial Teeth`, () => {});
         artificialTeethBtn.classList.add('artificial-tooth-jaw-button');
         artificialTeethBtn.textContent = 'AT';
         const syncArtificialTeethButtonState = () => {
             const isVisible = window.getArtificialTeethJawVisibility?.(jawKey) ?? true;
             setButtonState(artificialTeethBtn, isVisible);
         };
         artificialTeethBtn.onclick = () => {
             const nextVisible = !(window.getArtificialTeethJawVisibility?.(jawKey) ?? true);
             window.setArtificialTeethJawVisibility?.(jawKey, nextVisible);
             syncArtificialTeethButtonState();
         };
         syncArtificialTeethButtonState();
         meshControls.appendChild(artificialTeethBtn);

         container.appendChild(meshControls);
     });

     document.body.appendChild(container);

     if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
         container.style.transform = 'scale(1.5)';
         container.style.transformOrigin = 'top left';
     }

     return;

     const meshNames = parentObject.children
         .filter(child => child.isMesh)
         .map(child => child.name);
 
     const hasSurfaceMesh = meshNames.some(name => name.includes('surface'));
     const addedPolylineJawButtons = new Set();
 
     // 💡 Now generate buttons per mesh
     parentObject.children.forEach(child => {
         if (!child.isMesh) return;
 
         const meshName = child.name;
         const meshControls = document.createElement('div');
         meshControls.style.display = 'flex';
         meshControls.style.gap = '4px';
         meshControls.style.alignItems = 'center';
 
         let iconPath = `${basePath}/assets/Model.png`;
         if (meshName.includes('surface')) {
             if (meshName.includes('upper')) 
                iconPath = `${basePath}/assets/Icon_UpperJaw.png`;
             else if (meshName.includes('lower')) 
                iconPath = `${basePath}/assets/Icon_LowerJaw.png`;
         } else {
             if (meshName.includes('upper')) 
                iconPath = `${basePath}/assets/Icon_UpperJaw_Occlusal.png`;
             else if (meshName.includes('lower')) 
                iconPath = `${basePath}/assets/Icon_LowerJaw_Occlusal.png`;
         }
 
         // 👁 Toggle visibility
         const visibilityBtn = createIconBtn(iconPath, `Toggle ${meshName}`, () => {
         child.visible = !child.visible;
             if (child.visible) {
                 visibilityBtn.classList.add('active');
                 visibilityBtn.classList.remove('inactive');
             } else {
                 visibilityBtn.classList.remove('active');
                 visibilityBtn.classList.add('inactive');
             }
         });
         // Set initial state
         if (child.visible) {
             visibilityBtn.classList.add('active');
         } else {
             visibilityBtn.classList.add('inactive');
         }
 
         meshControls.appendChild(visibilityBtn);
 
         // 🔵 Undercut, Occlusion, Normal for non-surface
         if (!meshName.includes('surface') && child.userData.jaw_type in jaw_type) {
         let undercutBtn, occlusionBtn;
 
         let currentMode = 'normal';
 
         const applyMaterial = (index) => {
             child.geometry.dispose();
             child.geometry = material_array[meshName][index];
             child.geometry.needsUpdate = true;
         };
 
         // Create buttons first (without handlers yet)
         undercutBtn = createIconBtn(`${basePath}/assets/Undercut.png`, 'Toggle Undercut View', () => {});
         occlusionBtn = createIconBtn(`${basePath}/assets/Occlusion.png`, 'Toggle Occlusion View', () => {});
         undercutBtn.classList.add('inactive');
         occlusionBtn.classList.add('inactive');
 
         // Now assign the event handlers
         undercutBtn.onclick = () => {
             if (currentMode === 'undercut') {
                 currentMode = 'normal';
                 applyMaterial(0);
                 undercutBtn.classList.remove('active');
                 undercutBtn.classList.add('inactive');
             } else {
                 currentMode = 'undercut';
                 applyMaterial(2);
                 undercutBtn.classList.add('active');
                 undercutBtn.classList.remove('inactive');
                 occlusionBtn.classList.remove('active');
                 occlusionBtn.classList.add('inactive');
             }
         };
 
         occlusionBtn.onclick = () => {
             if (currentMode === 'occlusion') {
                 currentMode = 'normal';
                 applyMaterial(0);
                 occlusionBtn.classList.remove('active');
                 occlusionBtn.classList.add('inactive');
             } else {
                 currentMode = 'occlusion';
                 applyMaterial(1);
                 occlusionBtn.classList.add('active');
                 occlusionBtn.classList.remove('inactive');
                 undercutBtn.classList.remove('active');
                 undercutBtn.classList.add('inactive');
             }
         };
 
 
 /* 		const normalBtn = createIconBtn('Model.png', 'Normal View', () => {
             currentMode = 'normal';
             applyMaterial(0);
         }); */
 
         meshControls.appendChild(undercutBtn);
         meshControls.appendChild(occlusionBtn);
         //meshControls.appendChild(normalBtn);
     }
 
 
         // 🟣 Metallic toggle (only if any surface mesh exists)
         const jawKey = meshName.toLowerCase().includes('upper')
             ? 'upper'
             : meshName.toLowerCase().includes('lower')
                ? 'lower'
                : null;
         if (jawKey && !addedPolylineJawButtons.has(jawKey)) {
             addedPolylineJawButtons.add(jawKey);
             const polylineBtn = createIconBtn('', `Toggle ${jawKey} polyline`, () => {});
             polylineBtn.classList.add('polyline-jaw-button');
             polylineBtn.textContent = 'PL';

             const syncPolylineButtonState = () => {
                 const isVisible = window.getPolylineJawVisibility?.(jawKey) ?? true;
                 polylineBtn.classList.toggle('active', isVisible);
                 polylineBtn.classList.toggle('inactive', !isVisible);
             };

             polylineBtn.onclick = () => {
                 const nextVisible = !(window.getPolylineJawVisibility?.(jawKey) ?? true);
                 window.setPolylineJawVisibility?.(jawKey, nextVisible);
                 syncPolylineButtonState();
             };
             syncPolylineButtonState();
             meshControls.appendChild(polylineBtn);
         }

         if (hasSurfaceMesh && meshName.includes('surface')) {
             const metallicBtn = createIconBtn(`${basePath}/assets/Model.png`, 'Toggle Metallic', () => {
                 const isMetallic = child.material === material_array[meshName][2];
                 child.material = isMetallic ? material_array[meshName][1] : material_array[meshName][2];
 
                 if (!isMetallic) {
                     metallicBtn.classList.add('active');
                     metallicBtn.classList.remove('inactive');
                 } else {
                     metallicBtn.classList.remove('active');
                     metallicBtn.classList.add('inactive');
                 }
             });
             metallicBtn.classList.add('inactive'); // set default state
 
             meshControls.appendChild(metallicBtn);
         }
 
         container.appendChild(meshControls);
     });
 
     document.body.appendChild(container);
 
     // 📱 Mobile scaling
     if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
         container.style.transform = 'scale(1.5)';
         container.style.transformOrigin = 'top left';
     }
 }
 
 export { addVisibilityAndTransparencyControls, removeVisibilityAndTransparencyControls };
 
