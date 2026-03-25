import * as THREE from "../node_modules/three/build/three.module.js";

export class OFFLoader {
  constructor(material,submaterial) {
    this.material = material
    if(typeof submaterial != 'undefined')
    {
      this.submaterial =submaterial;
    }
    
  }

/*
  load(url, onLoad) {
    fetch(url)
      .then(response => response.text())
      .then(data => {
        const lines = data.split('\n');
        if (lines[0].trim() !== 'OFF') {
          console.error('Not a valid OFF file');
          return;
        }*/
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


if(check){
  //setting default color
  var colors = new Float32Array(geometry.attributes.position.count * 3);
  for (var i = 0; i < geometry.attributes.position.count; i++) {
    colors[i * 3] = 208/255;
    colors[i * 3 + 1] = 190/255;
    colors[i * 3 + 2] = 141/255;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  material_array.push(geometry.clone());
  //setting occulsion color
  if(surface?.occlusion_values?.data){
        const buffer = surface.occlusion_values.data;
      // Convert byte array to Uint8Array
    const uint8Array = new Uint8Array(buffer);

// Create an ArrayBuffer from the Uint8Array
    const arrayBuffer = uint8Array.buffer;

// Create a Float32Array from the ArrayBuffer


      const rgbaColorsArray = new Float32Array(arrayBuffer);


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

          if(surface!='stl')
            {
          //setting undercut values
          if('surveying_values' in surface){
            const buffer = surface.surveying_values.data;
          // Convert byte array to Uint8Array
        const uint8Array = new Uint8Array(buffer);
    
    // Create an ArrayBuffer from the Uint8Array
        const arrayBuffer = uint8Array.buffer;
    
    // Create a Float32Array from the ArrayBuffer
    
    
          const rgbaColorsArray = new Float32Array(arrayBuffer);

    
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

