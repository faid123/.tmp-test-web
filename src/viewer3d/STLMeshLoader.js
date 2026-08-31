import { STLLoader } from '../../node_modules/three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';
import { baseColorArray, occlusionColorArray, surveyColorArray } from './vertexColors.js';

class STLMeshLoader {
    constructor(material) {
        this.material = material;
    }

    load(data,surface) {
        let material_array = [];
        let mesh;
        let geometry;
        const loader = new STLLoader();
        const orggeometry = loader.parse(data);

        geometry = mergeVertices(orggeometry);

    // Update the geometry to apply the changes
    geometry.computeVertexNormals();
        
        const vertexCount = geometry.attributes.position.count;
        const setColors = (values) => {
            geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
            material_array.push(geometry.clone());
        };

        // material_array holds one geometry clone per colour layer, in order:
        // base tooth colour, occlusion, then survey.
        let colors = baseColorArray(vertexCount);
        setColors(colors);

        // `surface` is the string 'stl' for a raw upload with no survey payload,
        // and `in` throws on a primitive — hence the guard.
        if (surface != 'stl') {
            if (surface?.occlusion_values?.data) {
                colors = occlusionColorArray(vertexCount, surface.occlusion_values.data);
            }
            setColors(colors);
            if ('surveying_values' in surface) {
                colors = surveyColorArray(vertexCount, surface.surveying_values.data);
            }
        }
        // Pushed either way, so the survey layer always has a slot: without a
        // survey it repeats whatever colours were last computed.
        setColors(colors);

        mesh = new THREE.Mesh(material_array[0], this.material);
        return [mesh, material_array];
    }
}

export { STLMeshLoader };
// stl double loads vertices
function mergeVertices(geometry) {
    const threshold = 1e-4; // adjust as needed
    const positions = geometry.attributes.position.array;

    const mergedPositions = [];
    const mergedIndices = [];
    const vertexMap = {};
    let index = 0;

    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        const key = `${Math.round(x / threshold)},${Math.round(y / threshold)},${Math.round(z / threshold)}`;

        if (vertexMap[key] === undefined) {
            mergedPositions.push(x, y, z);
            vertexMap[key] = index;
            mergedIndices.push(index);
            index++;
        } else {
            mergedIndices.push(vertexMap[key]);
        }
    }

    const mergedGeometry = new THREE.BufferGeometry();
    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
    mergedGeometry.setIndex(mergedIndices);

    return mergedGeometry;
}
