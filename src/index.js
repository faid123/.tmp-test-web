// Import the THREE.js library
import * as THREE from "three";
// To allow for the camera to move around the scene
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

import { STLMeshLoader } from "./STLMeshLoader.js";

console.log(THREE.REVISION);
// Import the OFFLoader class
import { OFFLoader } from "./OFFLoader.js";
// Import the ApiClient class
import { ApiClient } from "./ApiClient.js";

import { addResetButton } from "./resetButton.js";
import { lol } from "./crypt.js";
import "./js/sidebar.js";
import "./js/createCase";
import {
  addVisibilityAndTransparencyControls,
  removeVisibilityAndTransparencyControls,
} from "./newControls.js";

//initialise everything

let all_mesh_mat = {};
window.finished = false;

// Get the current URL
const url = new URL(window.location.href);

// Get the value of a specific query parameter, e.g., "param"
let paramValue = url.searchParams.get("id");
const close = url.searchParams.get("close");

//decrypts the paramvalue
//if doing testing with test cases jus comment it out
paramValue = lol(paramValue);

// Create a Three.JS Scene
const scene = new THREE.Scene();
// Create a new camera with positions and angles
let camera;
const aspect = window.innerWidth / window.innerHeight;
camera = new THREE.OrthographicCamera(
  window.innerWidth / -2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  window.innerHeight / -2,
  -500,
  1000
);

// Keep track of the mouse position, so we can make the eye move
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let undercut_type = {};
// Keep the 3D object on a global variable so we can access it later

// OrbitControls allow the camera to move around the scene
let controls;
let orb_controls;

// Set which object to render
let objToRender = "dino";
let mesh_geo;

// Create a material
const material = new THREE.MeshPhongMaterial({ vertexColors: true });
const materialsurface = new THREE.MeshStandardMaterial({
  color: 0xa0a0a0, // Base color
  metalness: 0.75, // Fully metallic
  roughness: 0.2, // Smooth surface
});
const materialsurface_non_metal = new THREE.MeshStandardMaterial({
  color: 0xa0a0a0, // Base color
  metalness: 0, // Fully metallic
  roughness: 0.2, // Smooth surface
});

// Create an instance of the ApiClient with the base URL
const apiClient = new ApiClient("https://live.api.smartrpdai.com/api/smartrpd");
const parentObject = new THREE.Object3D();
scene.add(parentObject);

//The async prevents processing of data before the stuff is loaded in
(async () => {
  //datas :)
  // this for the undercut upper and the main json data use to retrieve stuff
  const data = {
    machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
    uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
    //uuid: 'eOqJe2FpjqdECy25l0KuJkH2cPQm', // dev server acc uuid
    case_int_id: paramValue,
    jaw_type: 2,
    caseIntID: paramValue,
  };
  // this for the undercut lower
  const data2 = {
    machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
    uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
    //uuid: 'eOqJe2FpjqdECy25l0KuJkH2cPQm', // dev server acc uuid
    case_int_id: paramValue,
    jaw_type: 1,
    caseIntID: paramValue,
  };
  let positionDatas = [];
  let positionData;

  //This section is for the processing of creation date, case id and last updated
  const urldatas = ["/case/get/" + paramValue];
  try {
    // Call the post method and wait for the response
    for (const urldata of urldatas) {
      positionData = await apiClient.post(urldata, [data], false, "Case Info");
      //console.log('Success:', positionData)
      positionDatas = positionDatas.concat(positionData);
      window.caseID = positionData.case_id;
      window.lastEdited = unixToHumanReadable(positionData.last_updated);
      window.username = positionData.username;
    }
  } catch (error) {
    console.error("Error:", error);
  }
  //for all the text info
  const time = unixToHumanReadable(positionData.creation_date);
  const update_time = unixToHumanReadable(positionData.last_updated);
  createTextbox("Creation Date: " + time, "bottom-left");
  //createTextbox("Case Name: " + positionData.case_id, 'bottom-right');
  createTextbox(
    "Last Updated: " +
      update_time +
      " Last Edited by: " +
      positionData.username,
    "bottom-left2"
  );

  const thumbnail_url = ["/thumbnails/get"];
  try {
    // Call the post method and wait for the response
    for (const urldata of thumbnail_url) {
      const thumbnailData = await apiClient.post(
        urldata,
        [data],
        false,
        "2D image"
      );
      //console.log('Success thumb:', thumbnailData)
      for (const thumb in thumbnailData) {
        if (thumbnailData[thumb].slot == 0) {
          const test = thumbnailData[thumb].data;
          window.thumbnailBase64 = test;
          // Container for thumbnail + 2D buttons
          const thumbWrapper = document.createElement("div");
          thumbWrapper.style.position = "absolute"; // allows layout inside container3D
          thumbWrapper.style.left = "20px"; // left side of screen
          thumbWrapper.style.top = "20px"; // top offset
          thumbWrapper.style.zIndex = "1000";
          thumbWrapper.style.display = "flex";
          thumbWrapper.style.flexDirection = "column";
          thumbWrapper.style.alignItems = "flex-start";
          thumbWrapper.style.gap = "6px"; // spacing between image and buttons

          // Create thumbnail button
          const button = document.createElement("button");
          button.style.padding = "0";
          button.style.border = "none";
          button.style.background = "none";
          button.style.cursor = "pointer";
          button.style.width = "30px";
          button.style.height = "30px";

          // Create thumbnail image
          const img = new Image();
          img.src = "data:image/png;base64," + test;
          img.style.transform = `scale(0.3)`;
          button.appendChild(img);

          // Create "Click me" watermark overlay
          const watermark = document.createElement("div");
          watermark.textContent = "Click me";
          watermark.style.position = "absolute";
          watermark.style.top = "50%";
          watermark.style.left = "50%";
          watermark.style.transform = "translate(-50%, -50%)";
          watermark.style.color = "white";
          watermark.style.fontWeight = "bold";
          const isMobile =
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
              navigator.userAgent
            );
          watermark.style.fontSize = isMobile ? "34px" : "16px";
          watermark.style.textShadow = "1px 1px 4px rgba(0, 0, 0, 1.0)";
          watermark.style.pointerEvents = "none"; // so clicks go through to the button
          button.style.position = "relative"; // Make sure parent is positioned
          button.appendChild(watermark);

          // Append to wrapper
          thumbWrapper.appendChild(button);

          // Static 2D buttons below the image
          const btnContainer = document.createElement("div");
          btnContainer.style.display = "flex";
          btnContainer.style.flexDirection = "column"; // <- make them vertical
          btnContainer.style.gap = "6px";
          btnContainer.style.position = "absolute"; // ensure absolute for precise positioning

          img.onload = () => {
            const isMobile =
              /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
              );
            const imgRect = img.getBoundingClientRect();
            const offset = isMobile ? -350 : 25; // Slightly more offset on mobile
            // btnContainer.style.top = `380px`;
            // btnContainer.style.left = `0px`;
            btnContainer.style.top = isMobile ? "820px" : "380px";
            btnContainer.style.left = isMobile ? "10px" : "0px";
          };

          /* const approve2DStatic = document.createElement('button');
approve2DStatic.className = 'smart-btn approve';
approve2DStatic.textContent = 'Approve 2D';
approve2DStatic.onclick = () => sendEmail("Your 2D Design has been APPROVED.");
btnContainer.appendChild(approve2DStatic);

const edit2DStatic = document.createElement('button');
edit2DStatic.className = 'smart-btn edit';
edit2DStatic.textContent = 'Edit 2D';
edit2DStatic.onclick = () => sendEmail("Please do some modifications on 2D Design. See Notebox.");
btnContainer.appendChild(edit2DStatic); */

          // Append buttons to wrapper
          thumbWrapper.appendChild(btnContainer);

          // Finally, append everything to container3D so it's layout-aware
          const container3D = document.getElementById("container3D");
          container3D.appendChild(thumbWrapper);

          button.addEventListener("click", function () {
            // Fullscreen overlay
            const overlay = document.createElement("div");
            overlay.className = "twod-overlay";

            // Group container (card)
            const twodGroup = document.createElement("div");
            twodGroup.className = "twod-group";
            twodGroup.style.position = "relative"; // Required to position watermark relative to image

            // Enlarged image
            const enlargedImg = new Image();
            enlargedImg.src = img.src;
            enlargedImg.className = "twod-fullscreen-image";
            twodGroup.appendChild(enlargedImg);

            // Watermark centered on image
            const watermark = document.createElement("div");
            watermark.textContent = `🦷 Case: ${window.caseID || "N/A"}`;
            watermark.className = "case-title-watermark";
            watermark.style.position = "absolute";
            watermark.style.top = "50%";
            watermark.style.left = "50%";
            watermark.style.transform = "translate(-50%, -50%)"; // true center
            watermark.style.color = "white";
            watermark.style.fontSize = "32px";
            watermark.style.fontWeight = "bold";
            watermark.style.textShadow = "0px 0px 10px rgba(0, 0, 0, 0.8)";
            watermark.style.pointerEvents = "none";
            watermark.style.zIndex = "1";

            twodGroup.appendChild(watermark);

            // // 1️⃣ 创建 canvas
            // const canvas = document.createElement('canvas');
            // canvas.width = enlargedImg.naturalWidth;
            // canvas.height = enlargedImg.naturalHeight;

            // const ctx = canvas.getContext('2d');

            // // 2️⃣ 绘制底图
            // const baseImage = new Image();
            // baseImage.onload = () => {
            //   ctx.drawImage(baseImage, 0, 0);

            //   // 3️⃣ 画水印文字
            //   const caseID = window.caseID || "N/A";
            //   const text = `🦷 Case: ${caseID}`;
            //   ctx.font = 'bold 32px sans-serif';
            //   ctx.fillStyle = 'white';
            //   ctx.textAlign = 'center';
            //   ctx.textBaseline = 'middle';
            //   ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            //   ctx.shadowBlur = 10;
            //   ctx.fillText(text, canvas.width / 2, canvas.height / 2);

            //   // 4️⃣ 转为 base64 并存入 localStorage，Key 包含加密 ID
            //   const composedDataURL = canvas.toDataURL();
            //   localStorage.setItem(`annotateBackground_${caseID}`, composedDataURL);
            //   console.log(`✅ 保存图像到 localStorage: annotateBackground_${caseID}`);
            // };

            // baseImage.src = enlargedImg.src;

            // Buttons container
            const btnContainer2D = document.createElement("div");
            btnContainer2D.className = "smart-btn-container-2d";

            const approve2D = document.createElement("button");
            approve2D.className = "smart-btn approve";
            approve2D.textContent = "Approve 2D";
            approve2D.onclick = () =>
              sendEmail("Your 2D Design has been APPROVED.");
            btnContainer2D.appendChild(approve2D);

            const edit2D = document.createElement("button");
            edit2D.className = "smart-btn edit";
            edit2D.textContent = "Edit 2D";
            edit2D.onclick = () =>
              sendEmail(
                "Please do some modifications on 2D Design. See Notebox."
              );
            btnContainer2D.appendChild(edit2D);

            // 🟣 创建 Annotate 按钮（跳转到 2DAnnotate.html）
            const annotateBtn = document.createElement("button");
            annotateBtn.className = "smart-btn annotate";
            annotateBtn.textContent = "Annotate";

            annotateBtn.addEventListener("click", (e) => {
              e.stopPropagation();

              const params = new URLSearchParams(window.location.search);
              const encryptedId = params.get("id");
              const caseID = window.caseID || encryptedId;

              if (!encryptedId) {
                alert("❌ 缺少参数，无法跳转 Annotate 页面");
                return;
              }

              // ✅ 重新生成图像并保存
              const enlargedImg = document.querySelector(
                ".twod-fullscreen-image"
              );
              if (!enlargedImg) {
                alert("❌ 未找到图像，无法生成截图");
                return;
              }

              const canvas = document.createElement("canvas");
              canvas.width = enlargedImg.naturalWidth;
              canvas.height = enlargedImg.naturalHeight;
              const ctx = canvas.getContext("2d");

              const baseImage = new Image();
              baseImage.onload = () => {
                ctx.drawImage(baseImage, 0, 0);

                const text = `🦷 Case: ${caseID}`;
                const fontSize = canvas.width * 0.034; // 相当于 3% 宽度
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = "white";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                ctx.shadowBlur = 10;
                ctx.fillText(text, canvas.width / 2, canvas.height / 2);

                const composedDataURL = canvas.toDataURL();
                localStorage.setItem(
                  `annotateBackground_${encryptedID}`,
                  composedDataURL
                );
                console.log(`✅ 已保存 annotateBackground_${encryptedID}`);

                // 🟢 跳转
                // 🟢 跳转（确保使用 URL 中的加密 ID）
                const encryptedId = new URLSearchParams(
                  window.location.search
                ).get("id"); // ✅ 确保使用真实的加密 ID

                const isGitHubPages =
                  window.location.hostname.includes("github.io");
                const isLocal = window.location.hostname === "localhost";
                const queryConnector = isLocal ? "/?" : "?";
                const basePath = isGitHubPages ? "/smartrpd_viewer" : "";

                const targetURL = `${window.location.origin}${basePath}/src/pages/2DAnnotation.html${queryConnector}id=${encryptedId}`;
                console.log("🔁 正在跳转到 Annotate 页:", targetURL);
                window.open(targetURL, "_blank");
              };

              baseImage.src = enlargedImg.src;
            });

            // 插入按钮
            btnContainer2D.appendChild(annotateBtn);

            // const historyBtn = document.createElement('button');
            // historyBtn.className = 'smart-btn history';
            // historyBtn.textContent = 'History';
            // historyBtn.addEventListener('click', (e) => e.stopPropagation()); // 防止冒泡
            // // 逻辑在别的文件里绑定
            // btnContainer2D.appendChild(historyBtn);
            const historyBtn = document.createElement("button");
            historyBtn.className = "smart-btn history";
            historyBtn.textContent = "History";

            historyBtn.addEventListener("click", (e) => {
              e.stopPropagation();

              const params = new URLSearchParams(window.location.search);
              const encryptedId = params.get("id");

              if (!encryptedId) {
                alert("❌ 缺少参数，无法跳转 History 页面");
                return;
              }

              const isGitHubPages =
                window.location.hostname.includes("github.io");
              const isLocal = window.location.hostname === "localhost";
              const queryConnector = isLocal ? "/?" : "?";
              const basePath = isGitHubPages ? "/smartrpd_viewer" : "";

              const targetURL = `${window.location.origin}${basePath}/src/pages/AnnotationHistory.html${queryConnector}id=${encryptedId}`;
              console.log("🔁 正在跳转到 History 页:", targetURL);
              window.open(targetURL, "_blank");
            });

            btnContainer2D.appendChild(historyBtn);

            twodGroup.appendChild(btnContainer2D);
            overlay.appendChild(twodGroup);
            document.body.appendChild(overlay);

            // Close on overlay click
            overlay.addEventListener("click", () => overlay.remove());
          });

          /* 			button.addEventListener('click', function () {
				
			  // Fullscreen overlay
			  const overlay = document.createElement('div');
			  overlay.className = 'twod-overlay';

			  // Group container (card)
			  const twodGroup = document.createElement('div');
			  twodGroup.className = 'twod-group';

			  // Enlarged image
			  const enlargedImg = new Image();
			  enlargedImg.src = img.src;
			  enlargedImg.className = 'twod-fullscreen-image';
			  twodGroup.appendChild(enlargedImg);

			  // Buttons container
			  const btnContainer2D = document.createElement('div');
			  btnContainer2D.className = 'smart-btn-container-2d';

			  const approve2D = document.createElement('button');
			  approve2D.className = 'smart-btn approve';
			  approve2D.textContent = 'Approve 2D';
			  approve2D.onclick = () => sendEmail("Your 2D Design has been APPROVED.");
			  btnContainer2D.appendChild(approve2D);

			  const edit2D = document.createElement('button');
			  edit2D.className = 'smart-btn edit';
			  edit2D.textContent = 'Edit 2D';
			  edit2D.onclick = () => sendEmail("Please do some modifications on 2D Design. See Notebox.");
			  btnContainer2D.appendChild(edit2D);

			  twodGroup.appendChild(btnContainer2D);
			  overlay.appendChild(twodGroup);
			  document.body.appendChild(overlay);

			  // Close on overlay click
			  overlay.addEventListener('click', () => overlay.remove());
			}); */
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  // to get the undercut and occulsion values
  let undercut_values = [];

  const heatmap_urldatas = ["/undercutheatmap/get"];
  try {
    // Call the post method and wait for the response

    const undercut_value = await apiClient.post(
      heatmap_urldatas,
      data,
      false,
      "Heatmap upper"
    );
    undercut_values = undercut_values.concat(undercut_value);
    //console.log('Success:', undercut_value)

    undercut_type[undercut_value.jaw_type] = [
      Boolean(undercut_value.surveying_values),
      Boolean(undercut_value.occlusion_values),
    ];

    const undercut_value1 = await apiClient.post(
      heatmap_urldatas,
      data2,
      false,
      "Heatmap lower"
    );
    undercut_values = undercut_values.concat(undercut_value1);

    undercut_type[undercut_value1.jaw_type] = [
      Boolean(undercut_value1.surveying_values),
      Boolean(undercut_value1.occlusion_values),
    ];
  } catch (error) {
    console.error("Error:", error);
  }

  //Processing mesh

  // stl will be true is fail to process parameterisation
  let stl = false;
  const urls = ["/parameterisation/mesh/getall", "/surface/getall"];
  let responseDatas = [];
  let responseData;
  let loop = 0;
  try {
    // Call the post method and wait for the response
    for (const url of urls) {
      loop += 1;
      //console.log('raw: ' + close);

      // this is for the generation of button to change to closed mesh if it exist
      let name_of_mesh;
      if (!close) {
        if (url == "/parameterisation/mesh/getall") {
          name_of_mesh = "Jaw mesh";
        } else if (url == "/surface/getall") {
          name_of_mesh = "Denture mesh";
        }
        responseData = await apiClient.post(url, [data], false, name_of_mesh);
        //console.log(responseData);
        if (isObject(responseData)) {
          responseDatas = responseDatas.concat(responseData);
        }
        //loop to prevent repeated check
        if (loop == 1) {
          //check for closed.off
          const test = await apiClient.post(
            "/stl/get",
            [data],
            "test",
            "Jaw mesh"
          );

          if (test != "stl") {
            /* // Create a button element
          const button = document.createElement('button');
          button.textContent = 'Parameterized Jaw'; // Set the text content of the button. initially was called Close.off check for bool close

          // Style the button
          button.style.position = 'fixed';
          button.style.bottom = '10px';  // Adjust the bottom position as needed
          button.style.right = '20px';   // Adjust the right position as needed
          button.style.padding = '10px';
          button.style.backgroundColor = 'blue';
          button.style.color = 'white';
          button.style.border = 'none';
          button.style.cursor = 'pointer';
          button.style.borderRadius = '5px';
          button.style.zIndex = '1000';  // Ensure it's above other elements

          // Function to handle button click
          function redirectToUrl() {
            // Change this URL to the desired destination

            window.location.href = window.location.href + '&close=true';  // Redirect to the specified URL
          }

          // Add click event listener to button
          button.addEventListener('click', redirectToUrl);

          // Append the button to the body or another container
          document.body.appendChild(button); */
          }

          // Create a container for the buttons
          const btnContainer = document.createElement("div");
          btnContainer.className = "smart-btn-container";

          /* 		// === NEW: Container for 2D Buttons on the Left ===
		const btnContainer2D = document.createElement('div');
		btnContainer2D.className = 'smart-btn-container-2d';
		*/

          // === NEW: Container for 3D Buttons under Chat ===
          const btnContainer3D = document.createElement("div");
          btnContainer3D.className = "smart-btn-container-3d";

          // Create "Nudge" button
          /* 		const nudgeButton = document.createElement('button');
		nudgeButton.textContent = 'Nudge';
		nudgeButton.className = 'smart-btn nudge';
		nudgeButton.addEventListener('click', function () {
			sendEmail("You have received a NUDGE. Please check your case.");
		});
		btnContainer.appendChild(nudgeButton); */

          /* 		// Create "Approve" button
		const approveButton = document.createElement('button');
		approveButton.textContent = 'Approve 2D';
		approveButton.className = 'smart-btn approve';
		approveButton.addEventListener('click', function () {
			sendEmail("Your 2D Design has been APPROVED.");
		});
		btnContainer2D.appendChild(approveButton);

		// Create "Edit" button
		const editButton = document.createElement('button');
		editButton.textContent = 'Edit 2D';
		editButton.className = 'smart-btn edit';
		editButton.addEventListener('click', function () {
			sendEmail("Please do some modifications on 2D Design. See Notebox.");
		});
		btnContainer2D.appendChild(editButton); */

          // Create "Approve 3D" button
          const approveButton3D = document.createElement("button");
          approveButton3D.textContent = "Approve 3D";
          approveButton3D.className = "smart-btn approve";
          approveButton3D.addEventListener("click", function () {
            sendEmail("Your 3D Design has been APPROVED.");
          });
          btnContainer3D.appendChild(approveButton3D);

          // Create "Edit 3D" button
          const editButton3D = document.createElement("button");
          editButton3D.textContent = "Edit 3D";
          editButton3D.className = "smart-btn edit";
          editButton3D.addEventListener("click", function () {
            sendEmail(
              "Please do some modifications on 3D Design. See Notebox."
            );
          });
          btnContainer3D.appendChild(editButton3D);

          // Create a new wrapper ONLY for the email input and button
          const emailWrapperContainer = document.createElement("div");
          emailWrapperContainer.style.marginTop = "12px"; // spacing from other buttons
          emailWrapperContainer.style.display = "block"; // block-level to avoid affecting other buttons
          emailWrapperContainer.style.position = "fixed";
          emailWrapperContainer.style.bottom = "40px"; // adjust as needed
          emailWrapperContainer.style.right = "20px";
          emailWrapperContainer.style.zIndex = "1000";

          // Create inner wrapper to align input + button side by side
          const emailInputWrapper = document.createElement("div");
          emailInputWrapper.style.display = "flex";
          emailInputWrapper.style.gap = "8px";

          // Create the Email Input Field
          const emailInput = document.createElement("input");
          emailInput.type = "email";
          emailInput.placeholder = "Enter email address";
          emailInput.style.padding = "8px";
          emailInput.style.border = "1px solid #ccc";
          emailInput.style.borderRadius = "4px";
          emailInput.style.width = "200px";

          // Create the Submit Button
          const addEmailBtn = document.createElement("button");
          addEmailBtn.textContent = "Add to Mail";
          addEmailBtn.className = "smart-btn";
          addEmailBtn.style.backgroundColor = "#6c757d"; // grey
          addEmailBtn.addEventListener("click", async () => {
            const email = emailInput.value.trim();
            if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
              alert("Please enter a valid email address.");
              return;
            }

            try {
              const payload = {
                case_int_id: paramValue, // assuming you have paramValue as the current caseIntID
                email: email,
              };

              const response = await fetch(
                "https://live.api.smartrpdai.com/api/smartrpd/mailinglist/add",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(payload),
                }
              );

              const result = await response.json();
              if (response.ok) {
                alert("✅ Email added to mailing list.");
                emailInput.value = "";
              } else {
                console.error(result);
                alert(
                  "❌ Failed to add email: " +
                    (result.message || "Unknown error")
                );
              }
            } catch (err) {
              console.error(err);
              alert("❌ Server error while adding email.");
            }
          });

          // Append input + button to inner wrapper
          emailInputWrapper.appendChild(emailInput);
          emailInputWrapper.appendChild(addEmailBtn);

          // Add inner wrapper into outer container
          emailWrapperContainer.appendChild(emailInputWrapper);

          // Finally, append the email wrapper
          document.body.appendChild(emailWrapperContainer);

          // Create "Load Other STLs" button
          const loadOtherStlButton = document.createElement("button");
          loadOtherStlButton.id = "center-load-button";
          loadOtherStlButton.textContent = "Show me 3D RPD design";
          loadOtherStlButton.className = "smart-btn other-stl";
          loadOtherStlButton.addEventListener("click", () => {
            loadAllSTLSlots(); // You can change slot number accordingly

            // After loading, change the button to become a "Back" button
            loadOtherStlButton.textContent = "🔙 Back to Original Jaw";
            loadOtherStlButton.onclick = () => {
              // Remove ?slots=true from URL and reload
              //const cleanURL = window.location.origin + window.location.pathname;
              //window.location.href = cleanURL;
              window.location.reload();
            };
          });
          btnContainer.appendChild(loadOtherStlButton);

          // Append the container to the body
          document.body.appendChild(btnContainer);
          //document.body.appendChild(btnContainer2D);
          document.body.appendChild(btnContainer3D);
        }
      }

      if (
        responseData == "stl" &&
        url == "/parameterisation/mesh/getall" &&
        !close
      ) {
        responseData = "stl";
        responseData = await apiClient.post(
          "/stl/raw/get",
          [data],
          false,
          "Jaw mesh"
        );
        stl = true;
      } else if (close && url == "/parameterisation/mesh/getall") {
        responseData = "stl";
        responseData = await apiClient.post(
          "/stl/get",
          [data],
          false,
          "Jaw mesh"
        );
        //console.log(responseData);
        stl = false;
        const button = document.createElement("button");
        button.textContent = "Back to original"; // Set the text content of the button

        // Style the button
        button.style.position = "fixed";
        button.style.bottom = "45px"; // Adjust the bottom position as needed
        button.style.right = "10px"; // Adjust the right position as needed
        button.style.padding = "10px";
        button.style.backgroundColor = "blue";
        button.style.color = "white";
        button.style.border = "none";
        button.style.cursor = "pointer";
        button.style.borderRadius = "5px";
        button.style.zIndex = "1000"; // Ensure it's above other elements

        // Function to handle button click
        function redirectToUrl() {
          // Change this URL to the desired destination

          window.location.href = window.location.href.slice(0, -11); // Redirect to the specified URL
        }

        // Add click event listener to button
        button.addEventListener("click", redirectToUrl);

        // Append the button to the body or another container
        document.body.appendChild(button);
      } else {
        responseData = "stl";
      }
      //console.log('e')

      //console.log('Success:', responseData);
      if (isObject(responseData)) {
        responseDatas = responseDatas.concat(responseData);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  // Function to style buttons
  function styleButton(button, color) {
    button.style.position = "fixed";
    button.style.bottom = "80px"; // Adjust based on order
    button.style.right = "20px";
    button.style.padding = "10px";
    button.style.backgroundColor = color;
    button.style.color = "white";
    button.style.border = "none";
    button.style.cursor = "pointer";
    button.style.borderRadius = "5px";
    button.style.zIndex = "1000";
  }

  const style = document.createElement("style");
  style.textContent = `
  .smart-btn-container {
      position: fixed;
      bottom: 100px;
      right: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      z-index: 1000;
  }

  .smart-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      color: white;
      cursor: pointer;
      font-weight: bold;
      transition: background-color 0.3s, transform 0.2s;
      min-width: 140px;
      text-align: center;
  }

  .smart-btn:hover {
      transform: scale(1.05);
      filter: brightness(1.1);
  }

  .smart-btn.nudge {
      background-color: #007bff;
  }

  .smart-btn.approve {
      background-color: #28a745;
  }

  .smart-btn.edit {
      background-color: #fd7e14;
  }

  .smart-btn.annotate {
      background-color: #6f42c1; /* 例如紫色，你可改成你想要的颜色 */
  }
  
  .smart-btn.history {
      background-color: #17a2b8; /* 蓝绿色, 你可以自由换颜色 */
  }

  .smart-btn.other-stl {
      background-color: #007bff;
  }
  
/*   .smart-btn-container-2d {
	position: fixed;
	left: 10px;
	top: 160px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	z-index: 1000;
	} */

	.smart-btn-container-3d {
		position: fixed;
		right: 20px;
		bottom: 120px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 1000;
	}
	
	.twod-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.6);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
}

.twod-group {
  background: #fff;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 0 15px rgba(0,0,0,0.3);
  text-align: center;
}

.twod-fullscreen-image {
  max-width: 90vw;
  max-height: 70vh;
  margin-bottom: 15px;
}

.smart-btn-container-2d {
  display: flex;
  gap: 10px;
  justify-content: center;
}


  
  #center-load-button {
    position: fixed;
    top: 70%;
    left: 50%;
    transform: translate(-50%, -70%);
    z-index: 1000;
  }

  #container3D {
      position: relative;
  }

  .case-title {
      position: absolute;
      top: 60%;
      left: 50%;
      font-size: 22px;
      font-weight: bold;
      color: rgba(255, 255, 255, 0.8);
      text-shadow: 0px 0px 8px rgba(0, 0, 0, 0.7);
      z-index: 10;
      pointer-events: none;
  }
  
  @media (max-height: 950px) {
	  #center-load-button {
		top: 80%; /* shift lower on short screens */
		transform: translate(-50%, -80%);
	  }
	}

	@media (max-height: 700px) {
	  #center-load-button {
		top: 80%; /* even lower for very short screens */
		transform: translate(-50%, -80%);
	  }
	}

  
  @media (max-width: 1024px) {
    #center-load-button {
        top: 80%; /* more spacing on smaller screens */
		transform: translate(-50%, -80%);
		}
	}

  @media (max-width: 768px) {
      .smart-btn-container {
          grid-template-columns: 1fr !important;
      }
  }
`;
  document.head.appendChild(style);

  // Extract encrypted case ID from address bar
  const urlParams = new URLSearchParams(window.location.search);
  const encryptedID = urlParams.get("id");

  // Use the full viewer URL in the email
  const viewerURL = `https://faid123.github.io/webrpdviewer/?id=${encodeURIComponent(
    encryptedID
  )}`;

  // Function to send email for Approve or Edit action
  function sendEmail(actionType) {
    const apiUrl = "https://live.api.smartrpdai.com/api/smartrpd/sendEmail";

    const emailData = {
      //userEmail: "faid_akatsuki@live.com",  // replace as needed
      action: actionType,
      case_id: window.caseID,
      case_int_id: paramValue, // for database queries (e.g., 1199)
      last_edited: window.lastEdited,
      username: window.username,
      viewer_url: viewerURL, // include this as a new field
      thumbnail: window.thumbnailBase64
        ? `data:image/png;base64,${window.thumbnailBase64}`
        : null,
    };

    fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    })
      .then(async (response) => {
        const contentType = response.headers.get("content-type");
        const isJson =
          contentType && contentType.indexOf("application/json") !== -1;

        const data = isJson ? await response.json() : await response.text();

        if (!response.ok) {
          throw new Error(data.message || data || "Unknown error");
        }

        console.log("Email sent successfully:", data);
        alert("✅ Email sent successfully to associated users.");
      })
      .catch((error) => {
        console.error("Error sending email:", error);
        alert("❌ Failed to send email. Please try again.");
      });
  }

  // Function to send email to a custom email address
  function sendCustomEmail(email) {
    if (!email) {
      alert("Please enter a valid email address.");
      return;
    }

    let apiUrl = "https://live.api.smartrpdai.com/api/smartrpd/sendCustomEmail";

    let emailData = {
      customEmail: email,
      subject: "SmartRPD Custom Notification",
      message: "This is a custom email message for your SmartRPD case.",
    };

    fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    })
      .then((response) => response.json())
      .then((data) => console.log("Custom email sent successfully:", data))
      .catch((error) => console.error("Error sending custom email:", error));
  }

  /* async function loadAllSTLSlots() {
    const apiUrl = "/stl/slot/get"; // only the endpoint, since apiClient handles base URL

    const authPayload = {
        machine_id: '3a0df9c37b50873c63cebecd7bed73152a5ef616',
        uuid: 'AC4gRQXZJoNz9EhhW36Q8jMJXBsf',
        caseIntID: paramValue // This is your numeric case ID from decrypted param
    };

    let anyLoaded = false;

    for (let slot = 1; slot <= 4; slot++) {
        const payload = [authPayload, { slotNumber: slot }];

        try {
            const result = await apiClient.post(apiUrl, payload, false, `Slot ${slot}`);

            if (!result || !result.data) {
                console.log(`❌ Slot ${slot}: No STL data found.`);
                continue;
            }

            const binarySTL = atob(result.data);
            const stlLoader = new STLMeshLoader(material);
            const [mesh] = stlLoader.load(binarySTL, null);

            mesh.name = result.filename || `Slot ${slot}`;
            parentObject.add(mesh);

            console.log(`✅ Loaded STL from slot ${slot}`);
            anyLoaded = true;
        } catch (error) {
            console.warn(`⚠️ Slot ${slot} failed:`, error.message || error);
        }
    }

    if (!anyLoaded) {
        alert("❌ No STL files found in slots 1 to 4.");
    } else {
        alert("✅ STL loading completed.");
    }
} */

  async function loadAllSTLSlots() {
    const apiUrl = "/stl/slot/get";

    const authPayload = {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
      caseIntID: paramValue,
    };

    // 🧹 Clear previous meshes
    while (parentObject.children.length > 0) {
      const child = parentObject.children[0];
      parentObject.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    // Remove previous GUI controls if any
    const oldGui = document.querySelector(".dg.ac");
    if (oldGui) oldGui.remove();

    const oldGuiContainer = document.querySelector(".guiContainer");
    if (oldGuiContainer) oldGuiContainer.remove();

    const oldToggleBtn = [...document.querySelectorAll("button")].find((btn) =>
      btn.innerText.includes("controls")
    );
    if (oldToggleBtn) oldToggleBtn.remove();

    const guiBlackBox = [...document.querySelectorAll("div")].find(
      (div) =>
        div.style.backgroundColor === "black" && div.style.zIndex === "999"
    );
    if (guiBlackBox) guiBlackBox.remove();

    let anyLoaded = false;

    for (let slot = 1; slot <= 4; slot++) {
      //for (let slot = 4; slot>0; slot--){
      const payload = [authPayload, { slotNumber: slot }];

      try {
        const result = await apiClient.post(
          apiUrl,
          payload,
          false,
          `Slot ${slot}`
        );

        if (!result || !result.data) {
          console.log(`❌ Slot ${slot}: No STL data found.`);
          continue;
        }

        const binarySTL = atob(result.data);
        // Assign a unique color per slot
        const slotColors = {
          1: {
            color: new THREE.Color(197 / 255, 173 / 255, 137 / 255),
            opacity: 255 / 255,
          },
          2: {
            color: new THREE.Color(71 / 255, 86 / 255, 105 / 255),
            opacity: 255 / 255,
          },
          3: {
            color: new THREE.Color(197 / 255, 173 / 255, 137 / 255),
            opacity: 255 / 255,
          },
          4: {
            color: new THREE.Color(71 / 255, 86 / 255, 105 / 255),
            opacity: 255 / 255,
          },
        };

        const slotColorInfo = slotColors[slot] || {
          color: new THREE.Color(1, 1, 1),
          opacity: 1,
        };

        const slotMaterial = new THREE.MeshStandardMaterial({
          color: slotColorInfo.color,
          opacity: slotColorInfo.opacity,
          transparent: slotColorInfo.opacity,
          metalness: 0.0,
          roughness: 0.7,
        });

        /* const slotColors = {
				1: 0xffb3ba, // soft pink
				2: 0xbaffc9, // mint green
				3: 0xbae1ff, // baby blue
				4: 0xffffba  // pale yellow
			}; */

        /* 			const slotMaterial = new THREE.MeshStandardMaterial({
				color: slotColors[slot] || 0xaaaaaa,
				metalness: 0.0,
				roughness: 0.7
			}); */

        const stlLoader = new STLMeshLoader(slotMaterial);
        const [mesh] = stlLoader.load(binarySTL, null);

        mesh.name = result.filename || `Slot ${slot}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // 👇 Match logic like close.off for centering and rotation
        /*  mesh.geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            mesh.geometry.boundingBox.getCenter(center);
            mesh.geometry.translate(-center.x, -center.y, -center.z); */

        // 🟢 Default origin and slight shift like upper jaw logic
        //mesh.position.set(0, 5, 0);
        //mesh.rotation.set(THREE.MathUtils.degToRad(1), THREE.MathUtils.degToRad(1), THREE.MathUtils.degToRad(180));
        /* 			mesh.position.set(0, 0, 0);      // Reset position
			mesh.rotation.set(0, 0, 0);      // Reset rotation
			mesh.scale.set(1, 1, 1);         // Reset scale */

        parentObject.add(mesh);

        controls.update();
        //render();

        console.log(`✅ Loaded STL from slot ${slot}`);
        anyLoaded = true;
      } catch (error) {
        console.warn(`⚠️ Slot ${slot} failed:`, error.message || error);
      }
    }

    if (!anyLoaded) {
      alert("❌ No STL files found in slots 1 to 4.");
    } else {
      alert("✅ STL loading completed.");
      removeVisibilityAndTransparencyControls();
      // 🧩 Re-enable visibility/transparency controls after loading
      addVisibilityAndTransparencyControls(
        parentObject,
        name,
        all_mesh_mat,
        undercut_type
      );
    }
  }

  //console.log(responseDatas);
  for (const offFile of responseDatas) {
    let loader;
    //console.log(offFile)
    if (offFile.filename.includes("surface")) {
      loader = new OFFLoader(
        materialsurface.clone(),
        materialsurface_non_metal.clone()
      );
    } else {
      loader = new OFFLoader(material.clone());
    }

    // Fetch the OFF file data
    //const offData = await apiClient.get(offFile); // Assuming the ApiClient has a get method for fetching data
    const offdata = atob(offFile.data);
    let x;
    if (
      offFile.filename.includes("ParameterisationMesh") ||
      offFile.filename.includes("closed")
    ) {
      x = true;
    }
    // Load the OFF file
    //console.log('check stl:' + stl)
    if (stl) {
      const stlMeshLoader = new STLMeshLoader(material);
      if (offFile.type.includes("upper")) {
        mesh_geo = stlMeshLoader.load(offdata, undercut_values[1]);
      } else if (offFile.type.includes("lower")) {
        mesh_geo = stlMeshLoader.load(offdata, undercut_values[0]);
      }
    } else if (offFile.type.includes("upper")) {
      mesh_geo = loader.parse(offdata, undercut_values[1], x);
    } else if (offFile.type.includes("lower")) {
      mesh_geo = loader.parse(offdata, undercut_values[0], x);
    }

    const mesh = mesh_geo[0];
    mesh.name = offFile.filename;

    mesh.userData = {
      jaw_type: offFile.type,
    };
    if (all_mesh_mat != null) {
      all_mesh_mat[offFile.filename] = mesh_geo[1].slice();
    }

    //addVisibilityControl(mesh, 'BoxMesh');
    //addTransparencyControl(material, 'BoxMesh');
    /*
    if(offFile.filename.includes('surface')[])
      {
        if(offFile.filename.includes('upper'))
          {
            changeMeshRotation(mesh,pos['upper'][0],pos['upper'][1],pos['upper'][2]);
          }
          else{
            changeMeshRotation(mesh,pos['lower'][0],pos['lower'][1],pos['lower'][2]);
          }
      }
          */
    // Add the mesh to the parent object

    if (offFile.type.includes("upper") && !stl && !close) {
      //console.log('check');
      changeMeshRotation(mesh, 1, 1, 180);
      mesh.position.y += 5;
    }

    //console.log(mesh)
    /*
    if(stl)
      {
        changeMeshRotation(mesh,0,105,0);
      }
        */
    parentObject.add(mesh);
  }
  //console.log(all_mesh_mat);

  function changeMeshRotation(mesh, x, y, z) {
    mesh.rotation.set(
      THREE.MathUtils.degToRad(x),
      THREE.MathUtils.degToRad(y),
      THREE.MathUtils.degToRad(z)
    );
  }

  // Example usage

  function createTextbox(text, position) {
    const textbox = document.createElement("div");
    textbox.textContent = text;
    textbox.style.position = "fixed";
    textbox.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
    textbox.style.padding = "5px";
    textbox.style.border = "1px solid #ccc";
    textbox.style.borderRadius = "5px";
    textbox.style.fontFamily = "Arial, sans-serif";
    textbox.style.fontSize = "15px";
    textbox.style.color = "#333";
    textbox.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.1)";

    textbox.style.height = "15px";

    // Optionally, add a media query to adjust size for very small screens

    if (position === "bottom-left") {
      textbox.style.bottom = "55px";
      textbox.style.left = "10px";
      textbox.style.height = "30px";
      textbox.style.minWidth = "220px";
      textbox.style.width = "20%";
      textbox.style.maxWidth = "250px";
    } else if (position === "bottom-right") {
      textbox.width = "150px";
      textbox.style.bottom = "10px";
      textbox.style.right = "10px";
    } else if (position === "bottom-left2") {
      textbox.style.bottom = "10px";
      textbox.style.padding = "5px";
      textbox.style.left = "10px";
      textbox.style.height = "30px";
      textbox.style.minWidth = "220px";
      textbox.style.width = "20%";
      textbox.style.maxWidth = "250px";
    } else if (position === "name") {
      textbox.style.bottom = "10px";
      textbox.style.right = "10px";
      textbox.style.height = "30px";
      textbox.style.padding = "5px";
    }

    document.body.appendChild(textbox);
  }

  function unixToHumanReadable(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000); // Multiply by 1000 to convert seconds to milliseconds
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0"); // Months are zero-indexed
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // Instantiate the OFFLoader
  // Load the OFF file

  finished = true;
  // Instantiate a new renderer and set its size
  const renderer = new THREE.WebGLRenderer({ alpha: true }); // Alpha: true allows for the transparent background
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Add the renderer to the DOM
  const container = document.getElementById("container3D");
  container.style.position = "relative"; // <- Add this line
  if (container) {
    container.appendChild(renderer.domElement);

    // After container3D and renderer are set up
    const caseTitle = document.createElement("div");
    caseTitle.textContent = `🦷 Case: ${window.caseID}`; // Display the case name
    caseTitle.className = "case-title"; // CSS class for styling

    const isMobile =
      /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    caseTitle.style.transform = isMobile
      ? "translate(-50%, 2500%)"
      : "translate(-50%, 1000%)";

    // Insert it into container3D
    container.appendChild(caseTitle);
  } else {
    console.error("No container element found");
  }

  // Set how far the camera will be from the 3D model

  camera.position.z = objToRender === "dino" ? 100 : 500;

  // Add lights to the scene, so we can actually see the 3D model
  const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
  scene.add(ambientLight);

  // Add directional lights from different directions for even lighting
  const lights = [
    new THREE.DirectionalLight(0xffffff, 1), // Front light
    new THREE.DirectionalLight(0xffffff, 1), // Back light
    new THREE.DirectionalLight(0xffffff, 1), // Left light
    new THREE.DirectionalLight(0xffffff, 1), // Right light
  ];

  lights[0].position.set(0, 0, 1);
  lights[1].position.set(0, 0, -1);
  lights[2].position.set(-1, 0, 0);
  lights[3].position.set(1, 0, 0);

  lights.forEach((light) => {
    scene.add(light);
  });

  // This adds controls to the camera, so we can rotate / zoom it with the mouse
  if (objToRender === "dino") {
    controls = new TrackballControls(camera, renderer.domElement);
    orb_controls = new OrbitControls(camera, renderer.domElement);

    controls.rotateSpeed = 4.0;
    orb_controls.zoomSpeed = 2;
    orb_controls.enableRotate = false;
    orb_controls.enabelePan = true;

    controls.panSpeed = 30;
    controls.noZoom = true;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;

    //console.log('changed2');
  }

  // Render the scene
  function animate() {
    requestAnimationFrame(animate);
    // Here we could add some code to update the scene, adding some automatic movement
    controls.update();
    // Make the eye move

    renderer.render(scene, camera);
  }

  // Add a listener to the window, so we can resize the window and the camera
  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Add mouse position listener, so we can make the eye move
  document.onmousemove = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  };

  camera.zoom = 7;
  camera.updateProjectionMatrix();
  const clonedCamera = camera.clone();
  addResetButton(camera, clonedCamera, controls);
  //console.log(camera)

  // Start the 3D rendering
  animate();
  //console.log(parentObject);
  //console.log(undercut_type);
  removeVisibilityAndTransparencyControls();
  addVisibilityAndTransparencyControls(
    parentObject,
    name,
    all_mesh_mat,
    undercut_type
  );

  const urlLogout = ["/user/logout"];
  try {
    // Call the post method and wait for the response
    for (const urldata of urlLogout) {
      const check = await apiClient.post(urldata, [data]);
      //console.log('Success logout:', check)
    }
  } catch (error) {
    console.error("Error:", error);
  }
})();

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

function displayFullScreenImage(img) {
  // Create a fullscreen container
  const fullscreenContainer = document.createElement("div");
  fullscreenContainer.style.position = "fixed";
  fullscreenContainer.style.top = "0";
  fullscreenContainer.style.left = "0";
  fullscreenContainer.style.width = "100%";
  fullscreenContainer.style.height = "100%";
  fullscreenContainer.style.backgroundColor = "rgba(0, 0, 0, 0.9)"; // Semi-transparent black background
  fullscreenContainer.style.zIndex = "1000"; // Ensure it's above other content
  fullscreenContainer.style.display = "flex";
  fullscreenContainer.style.justifyContent = "center";
  fullscreenContainer.style.alignItems = "center";
  fullscreenContainer.style.flexDirection = "column"; // stack vertically

  // 🦷 Create and append the case title watermark
  const watermark = document.createElement("div");
  watermark.textContent = `🦷 Case: ${window.caseID || "N/A"}`;
  watermark.style.position = "absolute";
  watermark.style.left = "50%";
  watermark.style.transform = "translateX(-50%)"; // only X-axis initially
  watermark.style.color = "white";
  watermark.style.fontSize = "32px";
  watermark.style.fontWeight = "bold";
  watermark.style.textShadow = "0px 0px 10px rgba(0, 0, 0, 0.8)";
  watermark.style.pointerEvents = "none";
  watermark.classList.add("case-title-watermark");

  fullscreenContainer.appendChild(watermark);

  // Dynamically position vertically based on image
  const centerWatermark = () => {
    const img = fullscreenContainer.querySelector("img");
    if (!img) return;

    const imgRect = img.getBoundingClientRect();
    const containerRect = fullscreenContainer.getBoundingClientRect();
    const verticalCenter = imgRect.top + imgRect.height / 2 - containerRect.top;

    watermark.style.top = `${verticalCenter}px`;
  };

  // Run after image is loaded and on resize
  const imgElement = fullscreenContainer.querySelector("img");
  if (imgElement && !imgElement.complete) {
    imgElement.onload = centerWatermark;
  } else {
    centerWatermark();
  }

  window.addEventListener("resize", centerWatermark);

  // Calculate maximum dimensions for the fullscreen image
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  let maxImageWidth;
  let maxImageHeight;
  //if is mobile then expand image
  if (isMobileDevice()) {
    maxImageWidth = screenWidth * 0.9; // Adjust as needed, e.g., 90% of screen width
    maxImageHeight = screenHeight * 0.9; // Adjust as needed, e.g., 90% of screen height
  } else {
    maxImageWidth = img.width;
    maxImageHeight = img.height;
  }

  // Create an image element inside the fullscreen container
  const fullscreenImg = new Image();
  fullscreenImg.src = img.src; // Set the source of the fullscreen image

  // Calculate image dimensions to maintain aspect ratio
  const aspectRatio = img.width / img.height;
  let displayWidth = maxImageWidth;
  let displayHeight = maxImageWidth / aspectRatio;

  // Adjust based on height if necessary
  if (displayHeight > maxImageHeight) {
    displayHeight = maxImageHeight;
    displayWidth = maxImageHeight * aspectRatio;
  }

  // Apply calculated dimensions and styles to the image
  fullscreenImg.style.width = `${displayWidth}px`;
  fullscreenImg.style.height = `${displayHeight}px`;
  fullscreenImg.style.objectFit = "contain"; // Maintain aspect ratio
  const touchMoveHandler = function (event) {
    if (event.scale !== 1) {
      event.preventDefault();
    }
  };

  const wheelHandler = function (event) {
    if (event.ctrlKey) {
      event.preventDefault();
    }
  };
  document.addEventListener("touchmove", touchMoveHandler, { passive: false });
  document.addEventListener("wheel", wheelHandler, { passive: false });
  // Append the fullscreen image to the container
  fullscreenContainer.appendChild(fullscreenImg);
  // Close fullscreen on click outside the image
  fullscreenContainer.addEventListener("click", function () {
    document.removeEventListener("touchmove", touchMoveHandler, {
      passive: false,
    });
    document.removeEventListener("wheel", wheelHandler, { passive: false });
    document.body.removeChild(fullscreenContainer); // Remove fullscreen container
  });
  // Append the fullscreen container to the body
  document.body.appendChild(fullscreenContainer);
}

function isObject(variable) {
  return variable !== null && typeof variable === "object";
}

window.addEventListener("load", () => {
  const fixToothMapPosition = () => {
    const allButtons = document.getElementsByTagName("button");
    for (let btn of allButtons) {
      const img = btn.querySelector("img");

      if (img && img.src.startsWith("data:image/png;base64")) {
        // ✅ 分别控制按钮位置 & 图片宽度
        const topValue = isMobileDevice() ? "200px" : "150px";
        const imgWidth = isMobileDevice() ? "200px" : "140px";

        btn.style.position = "fixed";
        btn.style.top = topValue;
        btn.style.left = "15px";
        btn.style.width = imgWidth; // ← 设置按钮宽度
        btn.style.height = "auto";
        btn.style.padding = "0";
        btn.style.border = "none";
        btn.style.background = "none";
        btn.style.cursor = "pointer";
        btn.style.zIndex = "1000";

        img.style.width = "100%"; // ← 图片宽度始终相对于按钮宽度
        img.style.height = "auto";
        img.style.transform = "none";
        img.style.display = "block";

        return true;
      }
    }
    return false;
  };

  const interval = setInterval(() => {
    if (fixToothMapPosition()) {
      clearInterval(interval);
    }
  }, 200);
});

window.addEventListener("load", () => {
  const interval = setInterval(() => {
    const allButtons = document.getElementsByTagName("button");

    for (let btn of allButtons) {
      const img = btn.querySelector("img");

      if (img && img.src.startsWith("data:image/png")) {
        if (!btn.hasAttribute("data-zoom-bound")) {
          btn.setAttribute("data-zoom-bound", "true");

          btn.addEventListener("click", () => {
            const overlayDivs = document.querySelectorAll(
              "div[style*='position: fixed']"
            );
            for (let div of overlayDivs) {
              const popupImg = div.querySelector("img");
              if (popupImg && popupImg.src.startsWith("data:image/png")) {
                // ✅ 放大样式
                popupImg.style.maxWidth = "80vw";
                popupImg.style.maxHeight = "80vh";
                popupImg.style.width = "auto";
                popupImg.style.height = "auto";

                // ✅ 隐藏 chatbox 和 icon
                const chatWidget = document.getElementById("chat-widget");
                const chatIcon = document.getElementById("chat-icon");
                if (chatWidget) chatWidget.style.display = "none";
                if (chatIcon) chatIcon.style.display = "none";

                // ✅ 点击浮层退出，并根据设备恢复
                div.addEventListener(
                  "click",
                  () => {
                    div.remove();

                    const isMobile =
                      /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                        navigator.userAgent
                      );

                    if (chatWidget && chatIcon) {
                      if (isMobile) {
                        chatWidget.classList.remove("active");
                        chatWidget.style.display = "none";
                        chatIcon.style.display = "block";
                      } else {
                        chatWidget.style.display = "flex";
                        chatIcon.style.display = "none";
                      }
                    }
                  },
                  { once: true }
                );

                break;
              }
            }
          });
        }

        clearInterval(interval);
        break;
      }
    }
  }, 300);
});
