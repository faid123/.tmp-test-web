import { STLLoader } from '../node_modules/three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';


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
        
        //console.log(geometry.attributes.position.count);
        var colors = new Float32Array(geometry.attributes.position.count * 3);
        for (var i = 0; i < geometry.attributes.position.count; i++) {
          colors[i * 3] = 208/255;
          colors[i * 3 + 1] = 190/255;
          colors[i * 3 + 2] = 141/255;
          
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        material_array.push(geometry.clone());
        if(surface!='stl'){
        if(surface?.occlusion_values?.data){


              const buffer = surface.occlusion_values.data;
            // Convert byte array to Uint8Array
          const uint8Array = new Uint8Array(buffer);
            
      // Create an ArrayBuffer from the Uint8Array
      const arrayBuffer = uint8Array.buffer;
      // Create a Float32Array from the ArrayBuffer
      
      
            const rgbaColorsArray = new Float32Array(arrayBuffer);
            //console.log(rgbaColorsArray);
      
              var colors = new Float32Array(geometry.attributes.position.count * 3);
            
                  for (var i = 0; i < geometry.attributes.position.count; i++) {
                    var r = rgbaColorsArray[i * 4];
                    var g = rgbaColorsArray[i * 4 + 1];
                    var b = rgbaColorsArray[i * 4 + 2];
                    if(r==1)
                      {
                        r= 208/255;
                      }
                      if(g==1)
                      {
                        g = 190/255;
                      }
                      if(b==1)
                      {
                        b = 141/255;
                      }
                    colors[i * 3] = r;
                    colors[i * 3 + 1] = g;
                    colors[i * 3 + 2] = b;
                  }
                  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                  material_array.push(geometry.clone());
                }
      
      
                if('surveying_values' in surface){
                  const buffer = surface.surveying_values.data;
                // Convert byte array to Uint8Array
              const uint8Array = new Uint8Array(buffer);
          
          // Create an ArrayBuffer from the Uint8Array
              const arrayBuffer = uint8Array.buffer;
          
          // Create a Float32Array from the ArrayBuffer
          
          
                const rgbaColorsArray = new Float32Array(arrayBuffer);
                //console.log(rgbaColorsArray);
          
                  var colors = new Float32Array(geometry.attributes.position.count * 3);
                
                      for (var i = 0; i < geometry.attributes.position.count; i++) {
                        var r = rgbaColorsArray[i * 4];
                        var g = rgbaColorsArray[i * 4 + 1];
                        var b = rgbaColorsArray[i * 4 + 2];
                        if(r==1)
                          {
                            r= 208/255;
                          }
                          if(g==1)
                          {
                            g = 190/255;
                          }
                          if(b==1)
                          {
                            b = 141/255;
                          }
                        colors[i * 3] = r;
                        colors[i * 3 + 1] = g;
                        colors[i * 3 + 2] = b;
                      }}
          
                    }geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                    material_array.push(geometry.clone());

                    mesh = new THREE.Mesh(material_array[0], this.material);
                    return [mesh,material_array];
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
