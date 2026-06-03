import * as THREE from "three";

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
 
 const basePath = window.location.hostname.includes("github.io") ? "/.tmp-test-web" : "";

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

   .artificial-teeth-jaw-button {
     background-image: none !important;
     background-color: #e5e87c !important;
     border: 2px solid #a7aa28 !important;
     border-radius: 6px;
     color: #1f2937;
     font-size: 12px;
     font-weight: 700;
     line-height: 1;
   }

   .artificial-teeth-jaw-button.inactive {
     background-color: rgba(229, 232, 124, 0.25) !important;
     border-color: rgba(167, 170, 40, 0.55) !important;
   }

   .jaw-view-button {
     background-image: none !important;
     background-color: #0ea5e9 !important;
     border: 2px solid #0369a1 !important;
     border-radius: 6px;
     color: #ffffff;
     font-size: 11px;
     font-weight: 800;
     line-height: 1;
   }

   .jaw-view-button.inactive {
     background-color: rgba(14, 165, 233, 0.25) !important;
     border-color: rgba(3, 105, 161, 0.55) !important;
   }

   .component-panel-toggle {
     position: fixed;
     right: 20px;
     bottom: 522px;
     z-index: 1001;
     border: 1px solid rgba(255, 255, 255, 0.16);
     border-radius: 6px;
     background: #303030;
     color: #ffffff;
     padding: 9px 12px;
     font: 700 13px Arial, sans-serif;
     cursor: pointer;
     box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
     pointer-events: auto;
   }

   .component-panel {
     position: fixed;
     right: 20px;
     top: 50%;
     transform: translateY(-50%);
     z-index: 1002;
     width: min(380px, calc(100vw - 24px));
     max-height: calc(100vh - 32px);
     overflow: auto;
     border: 1px solid rgba(255, 255, 255, 0.12);
     border-radius: 8px;
     background: rgba(32, 32, 32, 0.96);
     color: #f5f5f5;
     box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
     font-family: Arial, sans-serif;
     pointer-events: auto;
   }

   .component-panel.hidden {
     display: none;
   }

   .component-panel-header {
     position: sticky;
     top: 0;
     z-index: 1;
     display: flex;
     align-items: center;
     justify-content: space-between;
     gap: 8px;
     padding: 10px 12px;
     background: #303030;
     border-bottom: 1px solid rgba(255, 255, 255, 0.1);
   }

   .component-panel-title {
     font-size: 14px;
     font-weight: 800;
   }

   .component-panel-summary {
     color: #cbd5e1;
     font-size: 11px;
   }

   .component-panel-body {
     display: grid;
     gap: 8px;
     padding: 10px;
   }

   .component-row {
     display: grid;
     grid-template-columns: 1fr;
     gap: 8px;
     padding: 8px;
     border-radius: 6px;
     background: #3f3f3f;
   }

   .component-row-main {
     min-width: 0;
   }

   .component-row-title {
     overflow: hidden;
     color: #ffffff;
     font-size: 13px;
     font-weight: 800;
     text-overflow: ellipsis;
     white-space: nowrap;
   }

   .component-row-detail {
     margin-top: 2px;
     color: #cbd5e1;
     font-size: 11px;
   }

   .component-row-controls {
     display: grid;
     grid-template-columns: 1fr;
   }

   .component-row input[type="range"] {
     min-width: 0;
   }

   .component-mini-button {
     height: 28px;
     border: 1px solid rgba(255, 255, 255, 0.14);
     border-radius: 5px;
     background: #2d2d2d;
     color: #ffffff;
     font: 700 11px Arial, sans-serif;
   }

   .component-mini-button {
     padding: 0 8px;
     cursor: pointer;
   }

   .component-panel-diagnostics {
     margin: 0 10px 10px;
     padding: 8px;
     border-radius: 6px;
     background: #252525;
     color: #d7dde8;
     font-size: 11px;
     line-height: 1.45;
   }

   @media (max-width: 640px), (max-height: 720px) {
     .component-panel-toggle {
       right: 10px;
       bottom: 442px;
       padding: 8px 10px;
     }

     .component-panel {
       right: 8px;
       top: 50%;
       transform: translateY(-50%);
       width: min(320px, 62vw);
       max-height: calc(100vh - 20px);
     }

     #icon-controls {
       bottom: 6px !important;
       max-width: calc(100vw - 128px) !important;
     }
   }

 `;
 document.head.appendChild(style);
 
 function removeVisibilityAndTransparencyControls() {
     const existingContainer = document.getElementById('icon-controls');
     if (existingContainer) {
         existingContainer.remove();
     }
     const existingPanel = document.getElementById('component-panel');
     if (existingPanel) {
         existingPanel.remove();
     }
     const existingToggle = document.getElementById('component-panel-toggle');
     if (existingToggle) {
         existingToggle.remove();
     }
 }

 function formatCount(value) {
     return Number(value || 0).toLocaleString();
 }

 function getMeshStats(mesh) {
     const geometry = mesh.geometry;
     const position = geometry?.attributes?.position;
     const color = geometry?.attributes?.color;
     const vertexCount = position?.count || 0;
     const triangleCount = geometry?.index
         ? Math.floor(geometry.index.count / 3)
         : Math.floor(vertexCount / 3);
     return {
         vertexCount,
         triangleCount,
         hasVertexColors: Boolean(color && color.count > 0),
     };
 }

 function summarizeMeshes(meshes) {
     return meshes.reduce(
         (summary, mesh) => {
             const stats = getMeshStats(mesh);
             summary.meshes += 1;
             summary.vertices += stats.vertexCount;
             summary.triangles += stats.triangleCount;
             if (stats.hasVertexColors) summary.colored += 1;
             return summary;
         },
         { meshes: 0, vertices: 0, triangles: 0, colored: 0 }
     );
 }

 function colorRamp(value) {
     const v = Math.max(0, Math.min(1, value));
     if (v < 0.5) {
         const t = v / 0.5;
         return [t, 0.35 + t * 0.65, 1 - t];
     }
     const t = (v - 0.5) / 0.5;
     return [1, 1 - t * 0.75, 0];
 }

 function createDensityGeometry(mesh) {
     const cache = mesh.userData.analysisGeometryCache || {};
     if (cache.density) return cache.density;

     const baseGeometry = mesh.userData.baseGeometry || mesh.geometry;
     const position = baseGeometry?.attributes?.position;
     if (!position || position.count === 0) return null;

     const geometry = baseGeometry.clone();
     const scores = new Float32Array(position.count);
     const counts = new Uint16Array(position.count);
     const a = new THREE.Vector3();
     const b = new THREE.Vector3();
     const c = new THREE.Vector3();

     const addEdge = (from, to) => {
         a.fromBufferAttribute(position, from);
         b.fromBufferAttribute(position, to);
         const length = a.distanceTo(b);
         scores[from] += length;
         scores[to] += length;
         counts[from] += 1;
         counts[to] += 1;
     };

     if (baseGeometry.index) {
         const indices = baseGeometry.index.array;
         for (let i = 0; i < indices.length; i += 3) {
             const i0 = indices[i];
             const i1 = indices[i + 1];
             const i2 = indices[i + 2];
             addEdge(i0, i1);
             addEdge(i1, i2);
             addEdge(i2, i0);
         }
     } else {
         for (let i = 0; i < position.count; i += 3) {
             if (i + 2 >= position.count) break;
             addEdge(i, i + 1);
             addEdge(i + 1, i + 2);
             addEdge(i + 2, i);
         }
     }

     let min = Infinity;
     let max = -Infinity;
     for (let i = 0; i < scores.length; i += 1) {
         if (!counts[i]) continue;
         scores[i] = scores[i] / counts[i];
         min = Math.min(min, scores[i]);
         max = Math.max(max, scores[i]);
     }

     const colors = new Float32Array(position.count * 3);
     const range = Math.max(0.000001, max - min);
     for (let i = 0; i < position.count; i += 1) {
         const edgeScore = counts[i] ? (scores[i] - min) / range : 0;
         const densityScore = 1 - edgeScore;
         const [r, g, bl] = colorRamp(densityScore);
         colors[i * 3] = r;
         colors[i * 3 + 1] = g;
         colors[i * 3 + 2] = bl;
     }

     geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
     geometry.computeVertexNormals();
     mesh.userData.analysisGeometryCache = {
         ...cache,
         density: geometry,
     };
     return geometry;
 }

 function createComponentPanel(componentGroups, options = {}) {
     const groups = componentGroups.filter(group => {
         return group.type === 'overlay' || (Array.isArray(group.meshes) && group.meshes.length > 0);
     });
     if (!groups.length) return;

     const toggle = document.createElement('button');
     toggle.id = 'component-panel-toggle';
     toggle.className = 'component-panel-toggle';
     toggle.type = 'button';
     toggle.textContent = 'Components';
     toggle.setAttribute('aria-expanded', 'true');

     const panel = document.createElement('div');
     panel.id = 'component-panel';
     panel.className = 'component-panel';

     const header = document.createElement('div');
     header.className = 'component-panel-header';

     const titleWrap = document.createElement('div');
     const title = document.createElement('div');
     title.className = 'component-panel-title';
     title.textContent = 'Components';
     const summaryText = document.createElement('div');
     summaryText.className = 'component-panel-summary';
     titleWrap.appendChild(title);
     titleWrap.appendChild(summaryText);

     const closeButton = document.createElement('button');
     closeButton.type = 'button';
     closeButton.className = 'component-mini-button';
     closeButton.textContent = 'Hide';
     closeButton.addEventListener('click', () => {
         panel.classList.add('hidden');
         toggle.setAttribute('aria-expanded', 'false');
     });

     header.appendChild(titleWrap);
     header.appendChild(closeButton);

     const body = document.createElement('div');
     body.className = 'component-panel-body';
     const diagnostics = document.createElement('div');
     diagnostics.className = 'component-panel-diagnostics';

     const rowControllers = [];
     const allMeshes = groups.flatMap(group => group.meshes || []);
     const totalStats = summarizeMeshes(allMeshes);
     summaryText.textContent = `${formatCount(totalStats.vertices)} vertices, ${formatCount(totalStats.triangles)} tris`;

     const syncAllRows = () => {
         rowControllers.forEach(controller => controller.sync());
         const visibleCount = groups.filter(group => group.getVisible?.()).length;
         diagnostics.innerHTML = [
             `Visible groups: ${visibleCount}/${groups.length}`,
             `Meshes: ${formatCount(totalStats.meshes)}`,
             `Vertices: ${formatCount(totalStats.vertices)}`,
             `Triangles: ${formatCount(totalStats.triangles)}`,
             `Vertex color maps: ${formatCount(totalStats.colored)}/${formatCount(totalStats.meshes)}`,
         ].join('<br>');
     };

     groups.forEach(group => {
         const row = document.createElement('div');
         row.className = 'component-row';
         group.lastOpacity = typeof group.getOpacity === 'function'
             ? group.getOpacity()
             : 1;

         const applyGroupOpacity = (opacity) => {
             if (group.type === 'mesh') {
                 options.setMeshGroupOpacity?.(group.meshes || [], opacity);
             } else {
                 group.setOpacity?.(opacity);
             }
             if (opacity > 0) {
                 group.lastOpacity = opacity;
             }
         };

         const main = document.createElement('div');
         main.className = 'component-row-main';
         const rowTitle = document.createElement('div');
         rowTitle.className = 'component-row-title';
         rowTitle.textContent = group.label;
         const rowDetail = document.createElement('div');
         rowDetail.className = 'component-row-detail';
         const stats = summarizeMeshes(group.meshes || []);
         rowDetail.textContent = group.type === 'overlay'
             ? 'Overlay opacity'
             : `${formatCount(stats.vertices)} vertices, ${formatCount(stats.triangles)} tris`;
         main.appendChild(rowTitle);
         main.appendChild(rowDetail);

         const controls = document.createElement('div');
         controls.className = 'component-row-controls';

         const opacitySlider = document.createElement('input');
         opacitySlider.type = 'range';
         opacitySlider.min = '0';
         opacitySlider.max = '100';
         opacitySlider.value = '100';
         opacitySlider.title = `${group.label} opacity`;
         opacitySlider.disabled = group.type !== 'mesh' && typeof group.setOpacity !== 'function';
         opacitySlider.addEventListener('input', () => {
             const opacity = Number(opacitySlider.value) / 100;
             applyGroupOpacity(opacity);
             syncAllRows();
         });

         controls.appendChild(opacitySlider);

         row.appendChild(main);
         row.appendChild(controls);
         body.appendChild(row);

         rowControllers.push({
             sync: () => {
                 if (typeof group.getOpacity === 'function') {
                     opacitySlider.value = String(Math.round(group.getOpacity() * 100));
                 }
             },
         });
     });

     toggle.addEventListener('click', () => {
         const isHidden = panel.classList.toggle('hidden');
         toggle.setAttribute('aria-expanded', String(!isHidden));
     });

     panel.appendChild(header);
     panel.appendChild(body);
     panel.appendChild(diagnostics);
     document.body.appendChild(toggle);
     document.body.appendChild(panel);
     syncAllRows();
 }
  
 function addVisibilityAndTransparencyControls(parentObject, name, material_array, jaw_type) {
     const container = document.createElement('div');
     container.id = 'icon-controls';
     container.style.position = 'fixed';
     container.style.left = '50%';
     container.style.right = 'auto';
     container.style.bottom = '18px';
     container.style.top = 'auto';
     container.style.transform = 'translateX(-50%)';
     container.style.zIndex = '999';
     container.style.display = 'flex';
     container.style.flexDirection = 'row';
     container.style.flexWrap = 'wrap';
     container.style.justifyContent = 'center';
     container.style.alignItems = 'center';
     container.style.gap = '8px';
     container.style.maxWidth = 'calc(100vw - 24px)';
     container.style.padding = '8px 10px';
     container.style.borderRadius = '8px';
     container.style.background = 'rgba(255, 255, 255, 0.34)';
     container.style.backdropFilter = 'blur(6px)';
     container.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.12)';
 
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
         child.userData.baseGeometry = child.userData.baseGeometry || child.geometry;
         const jawKey = getJawKey(child);
         if (!jawKey) return;
         const bucket = child.name.toLowerCase().includes('surface') ? 'surface' : 'jaw';
         meshesByJaw[jawKey][bucket].push(child);
     });
     const componentGroups = [];

     const setButtonState = (button, isActive) => {
         button.classList.toggle('active', Boolean(isActive));
         button.classList.toggle('inactive', !isActive);
     };

     const setMeshGroupVisible = (meshes, isVisible) => {
         meshes.forEach(mesh => {
             mesh.visible = isVisible;
             const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
             materials.forEach(material => {
                 if (!material) return;
                 material.transparent = (material.opacity ?? 1) < 1;
                 material.depthTest = true;
                 material.depthWrite = (material.opacity ?? 1) >= 0.95;
                 material.needsUpdate = true;
             });
         });
     };

     const setMeshGroupOpacity = (meshes, opacity) => {
         meshes.forEach(mesh => {
             const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
             materials.forEach(material => {
                 if (!material) return;
                 material.opacity = opacity;
                 material.transparent = opacity < 1;
                 material.depthWrite = opacity >= 0.95;
                 material.needsUpdate = true;
             });
         });
     };

     const areAnyVisible = (meshes) => meshes.some(mesh => mesh.visible);

     const applyJawMaterial = (meshes, index) => {
         meshes.forEach(mesh => {
             const meshMaterials = material_array[mesh.name];
             if (!meshMaterials || !meshMaterials[index]) return;
             mesh.geometry = meshMaterials[index];
             mesh.geometry.needsUpdate = true;
         });
     };

     const applyAnalysisMode = (meshes, mode) => {
         const materialIndexByMode = {
             normal: 0,
             occlusion: 1,
             undercut: 2,
         };
         if (mode in materialIndexByMode) {
             applyJawMaterial(meshes, materialIndexByMode[mode]);
             return;
         }
         if (mode === 'density') {
             meshes.forEach(mesh => {
                 const densityGeometry = createDensityGeometry(mesh);
                 if (!densityGeometry) return;
                 mesh.geometry = densityGeometry;
                 mesh.geometry.needsUpdate = true;
             });
         }
     };

     const makeGroupVisibilityButton = (iconPath, tooltip, meshes, onVisibilityChange = null) => {
         const button = createIconBtn(iconPath, tooltip, () => {
             const nextVisible = !areAnyVisible(meshes);
             setMeshGroupVisible(meshes, nextVisible);
             setButtonState(button, nextVisible);
             if (typeof onVisibilityChange === 'function') {
                 onVisibilityChange(nextVisible);
             }
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

     ['upper', 'lower'].forEach((jawKey, jawIndex) => {
         const jawMeshes = meshesByJaw[jawKey].jaw;
         const surfaceMeshes = meshesByJaw[jawKey].surface;
         const archMeshes = [...jawMeshes, ...surfaceMeshes];
         if (!jawMeshes.length && !surfaceMeshes.length) return;

         if (jawIndex > 0 && container.children.length > 0) {
             const divider = document.createElement('div');
             divider.className = 'jaw-toggle-divider';
             divider.setAttribute('aria-hidden', 'true');
             divider.style.flex = '0 0 1px';
             divider.style.alignSelf = 'stretch';
             divider.style.minHeight = '40px';
             divider.style.background = 'rgba(0, 0, 0, 0.28)';
             divider.style.margin = '0 4px';
             container.appendChild(divider);
         }

         const meshControls = document.createElement('div');
         meshControls.className = `jaw-toggle-group jaw-toggle-group-${jawKey}`;
         meshControls.style.display = 'flex';
         meshControls.style.gap = '4px';
         meshControls.style.alignItems = 'center';

         const titlePrefix = jawKey === 'upper' ? 'Upper' : 'Lower';
         const jawIcon = `${basePath}/assets/Icon_${titlePrefix}Jaw_Occlusal.png`;
         const surfaceIcon = `${basePath}/assets/Icon_${titlePrefix}Jaw.png`;
         let syncJawViewButtonState = () => {};
         let syncJawButtonState = () => {};
         let syncSurfaceButtonState = () => {};

         const jawBtn = makeGroupVisibilityButton(jawIcon, `${titlePrefix} Jaw`, jawMeshes, () => {
             syncJawButtonState();
             syncJawViewButtonState();
             window.syncArtificialTeethToJaw?.();
         });
         syncJawButtonState = () => setButtonState(jawBtn, areAnyVisible(jawMeshes));
         meshControls.appendChild(jawBtn);

         const surfaceBtn = makeGroupVisibilityButton(
             surfaceIcon,
             `${titlePrefix} Mesh`,
             surfaceMeshes,
             () => {
                 syncSurfaceButtonState();
                 syncJawViewButtonState();
                 window.syncArtificialTeethToJaw?.();
             }
         );
         syncSurfaceButtonState = () => setButtonState(surfaceBtn, areAnyVisible(surfaceMeshes));
         meshControls.appendChild(surfaceBtn);

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
         artificialTeethBtn.classList.add('artificial-teeth-jaw-button');
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

         const jawViewBtn = createIconBtn('', `${titlePrefix} Jaw View`, () => {});
         jawViewBtn.classList.add('jaw-view-button');
         jawViewBtn.textContent = jawKey === 'upper' ? 'TOP' : 'BOT';
         syncJawViewButtonState = () => {
             setButtonState(jawViewBtn, areAnyVisible(archMeshes));
         };
         jawViewBtn.onclick = () => {
             const nextVisible = !areAnyVisible(archMeshes);
             setMeshGroupVisible(archMeshes, nextVisible);
             window.setPolylineJawVisibility?.(jawKey, nextVisible);
             window.setArtificialTeethJawVisibility?.(jawKey, nextVisible);
             syncJawButtonState();
             syncSurfaceButtonState();
             syncJawViewButtonState();
             syncPolylineButtonState();
             syncArtificialTeethButtonState();
             window.syncArtificialTeethToJaw?.();
         };
         syncJawViewButtonState();
         meshControls.appendChild(jawViewBtn);

         componentGroups.push({
             key: `${jawKey}-jaw`,
             label: `${titlePrefix} jaw`,
             type: 'mesh',
             meshes: jawMeshes,
             supportsAnalysis: true,
             getVisible: () => areAnyVisible(jawMeshes),
             setVisible: (isVisible) => {
                 setMeshGroupVisible(jawMeshes, isVisible);
                 syncJawButtonState();
                 syncJawViewButtonState();
                 window.syncArtificialTeethToJaw?.();
             },
             getMode: () => currentMode,
             setMode: (mode) => {
                 currentMode = mode;
                 applyAnalysisMode(jawMeshes, mode);
                 setButtonState(undercutBtn, mode === 'undercut');
                 setButtonState(occlusionBtn, mode === 'occlusion');
             },
         });

         componentGroups.push({
             key: `${jawKey}-surface`,
             label: `${titlePrefix} Mesh`,
             type: 'mesh',
             meshes: surfaceMeshes,
             supportsAnalysis: false,
             getVisible: () => areAnyVisible(surfaceMeshes),
             setVisible: (isVisible) => {
                 setMeshGroupVisible(surfaceMeshes, isVisible);
                 syncSurfaceButtonState();
                 syncJawViewButtonState();
                 window.syncArtificialTeethToJaw?.();
             },
         });

         componentGroups.push({
             key: `${jawKey}-polyline`,
             label: `${titlePrefix} polylines`,
             type: 'overlay',
             meshes: [],
             supportsAnalysis: false,
             getVisible: () => window.getPolylineJawVisibility?.(jawKey) ?? true,
             setVisible: (isVisible) => {
                 window.setPolylineJawVisibility?.(jawKey, isVisible);
                 syncPolylineButtonState();
             },
             getOpacity: () => window.getPolylineJawOpacity?.(jawKey) ?? 1,
             setOpacity: (opacity) => window.setPolylineJawOpacity?.(jawKey, opacity),
         });

         componentGroups.push({
             key: `${jawKey}-artificial-teeth`,
             label: `${titlePrefix} artificial teeth`,
             type: 'overlay',
             meshes: [],
             supportsAnalysis: false,
             getVisible: () => window.getArtificialTeethJawVisibility?.(jawKey) ?? true,
             setVisible: (isVisible) => {
                 window.setArtificialTeethJawVisibility?.(jawKey, isVisible);
                 syncArtificialTeethButtonState();
             },
             getOpacity: () => window.getArtificialTeethJawOpacity?.(jawKey) ?? 1,
             setOpacity: (opacity) => window.setArtificialTeethJawOpacity?.(jawKey, opacity),
         });

         container.appendChild(meshControls);
     });

     createComponentPanel(componentGroups, {
         setMeshGroupOpacity,
         setMeshGroupVisible,
     });

     document.body.appendChild(container);

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
 
