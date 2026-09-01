import * as THREE from "../../node_modules/three/build/three.module.js";
import { baseColorArray, occlusionColorArray, surveyColorArray } from "./vertexColors.js";

export class OFFLoader {
  constructor(material,submaterial) {
    this.material = material
    if(typeof submaterial != 'undefined')
    {
      this.submaterial =submaterial;
    }
    
  }

        parse(data,surface,check) {
          let material_array = [];
          let mesh;
            const lines = data.split('\n').filter(line => line.trim().length > 0);
        
            if (lines[0].trim() !== 'OFF') {
                console.error('Not a valid OFF file');
                const value = 'stl';
                return value;
            }
        
        //creates the geometry of mesh
        const [numVertices, numFaces] = lines[1].trim().split(' ').map(Number);
        const vertices = [];
        const indices = [];

        for (let i = 0; i < numVertices; i++) {
          const vertex = lines[2 + i].trim().split(' ').map(Number);

          vertices.push(...vertex);
        }

        let lineIndex = 2 + numVertices;
        for (let i = 0; i < numFaces; i++) {


          const face = lines[lineIndex+i].trim().split(' ').map(Number);
          const numVerticesInFace = face[0];

          // Ensure that faces are triangles
          if (numVerticesInFace === 3) {
            indices.push(face[2], face[3], face[4]);
          } else {
            console.warn(`Unsupported face with ${numVerticesInFace} vertices.`);
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();


        if (check) {
          const vertexCount = geometry.attributes.position.count;
          const setColors = (values) => {
            geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
            material_array.push(geometry.clone());
          };

          // material_array holds one geometry clone per colour layer, in order:
          // base tooth colour, occlusion, then survey.
          let colors = baseColorArray(vertexCount);
          setColors(colors);

          if (surface?.occlusion_values?.data) {
            colors = occlusionColorArray(vertexCount, surface.occlusion_values.data);
          }
          setColors(colors);

          // `surface` is the string 'stl' when the case carries no survey, and
          // `in` throws on a primitive — hence the guard before it.
          if (surface != 'stl' && 'surveying_values' in surface) {
            colors = surveyColorArray(vertexCount, surface.surveying_values.data);
          }
          // Pushed either way, so the survey layer always has a slot: without a
          // survey it repeats whatever colours were last computed.
          setColors(colors);

          mesh = new THREE.Mesh(material_array[0], this.material);
        }
        else
        {
          mesh = new THREE.Mesh(geometry, this.submaterial);
          material_array.push(geometry.clone())
          material_array.push(this.submaterial);
          material_array.push(this.material);
          
        }

        
        

        return [mesh,material_array];
      }

  }

