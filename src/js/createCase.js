// 顶部引入模块
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

// ✅ 全局状态变量（必须提前声明）
let existingUsers = []; // 当前案例已有的共享用户
let addedUsers = []; // 用户后续添加的新用户
let selectedUser = null; // 当前选中的待添加用户（搜索结果）

document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.querySelector(".create-case");
  const modal = document.getElementById("caseModal");
  const closeBtn = document.getElementById("closeCaseModal");

  const jawUploadInput = document.getElementById("jawUploadInput");
  const jawContainer = document.getElementById("uploadedJawModels");

  const refUploadBtn = document.getElementById("addRefImageBtn");
  const refUploadInput = document.getElementById("refImageInput");
  const refContainer = document.getElementById("uploadedReferenceImages");

  const caseNameInput = document.getElementById("caseName");
  const requestDateInput = document.getElementById("requestDate");
  const cancelBtn = document.querySelector(".cancel-btn");
  const startBtn = document.querySelector(".start-btn");
  const inviteBtn = document.querySelector(".invite-btn");
  const userAccessModal = document.getElementById("userAccessModal");
  const closeUserAccessModal = document.getElementById("closeUserAccessModal");
  const cancelInviteBtn = document.getElementById("cancelInviteBtn");
  const userSearchInput = document.getElementById("userSearchInput");
  const addUserBtn = document.getElementById("addUserBtn");
  const caseNameDisplay = document.getElementById("caseNameDisplay");
  const saveInviteBtn = document.getElementById("saveInviteBtn");

  let activeTarget = null;
  const uploadLimit = 2;

  // === Drag & drop helpers (jaw STL placeholders + reference image container) ===
  const eventHasFiles = (e) => {
    const types = e?.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).some((t) => t === "Files");
  };

  // Build a fresh jaw placeholder ("upper" | "lower") with click + drag-drop wired up.
  const buildJawPlaceholder = (jawType) => {
    const placeholder = document.createElement("div");
    placeholder.className = "upload-placeholder";
    placeholder.dataset.jaw = jawType;

    const bgImg = document.createElement("img");
    bgImg.className = "jaw-bg";
    bgImg.alt = jawType === "upper" ? "Upper Jaw" : "Lower Jaw";
    bgImg.src =
      jawType === "upper" ? "../../assets/upper.svg" : "../../assets/lower.svg";

    const plus = document.createElement("span");
    plus.className = "plus-icon";
    plus.textContent = "＋";

    placeholder.appendChild(bgImg);
    placeholder.appendChild(plus);

    placeholder.addEventListener("click", () => {
      activeTarget = placeholder;
      jawUploadInput.click();
    });
    enableJawDropZone(placeholder);
    return placeholder;
  };

  // Build the reference-image "+" placeholder with click wired up.
  const buildRefPlaceholder = () => {
    const placeholder = document.createElement("div");
    placeholder.className = "upload-placeholder";

    const plus = document.createElement("span");
    plus.className = "plus-icon";
    plus.textContent = "＋";
    placeholder.appendChild(plus);

    placeholder.addEventListener("click", () => {
      refUploadInput.click();
    });
    return placeholder;
  };

  // Reset the create-case modal (clears inputs + rebuilds upload zones).
  const resetCreateCaseForm = () => {
    if (caseNameInput) caseNameInput.value = "";
    if (requestDateInput) requestDateInput.value = "";
    document.querySelectorAll(".uploaded-model").forEach((el) => {
      delete el.file;
    });
    if (jawContainer) {
      jawContainer.innerHTML = "";
      ["upper", "lower"].forEach((jaw) => {
        jawContainer.appendChild(buildJawPlaceholder(jaw));
      });
    }
    if (refContainer) {
      refContainer.innerHTML = "";
      refContainer.appendChild(buildRefPlaceholder());
    }
    if (jawUploadInput) jawUploadInput.value = "";
    if (refUploadInput) refUploadInput.value = "";
  };

  // Process a dropped/picked STL file. The wrapper is inserted into the DOM
  // synchronously (with the File attached) so a fast Start-click after drop
  // still sees `.uploaded-model[data-jaw="..."]` and uploads the STL; the
  // rendered preview thumbnail fills in once Three.js finishes parsing.
  const processStlFile = (file, target) => {
    if (!file || !target) return;
    const jaw = target.dataset.jaw;

    const wrapper = document.createElement("div");
    wrapper.className = "uploaded-model";
    wrapper.dataset.jaw = jaw;
    wrapper.file = file;

    const img = document.createElement("img");
    img.style.width = "100px";
    img.alt = jaw === "upper" ? "Upper jaw STL" : "Lower jaw STL";

    const remove = document.createElement("div");
    remove.className = "remove-model";
    remove.textContent = "×";
    remove.onclick = () => {
      delete wrapper.file;
      wrapper.replaceWith(buildJawPlaceholder(wrapper.dataset.jaw));
    };

    wrapper.appendChild(img);
    wrapper.appendChild(remove);
    target.replaceWith(wrapper);
    jawUploadInput.value = "";

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loader = new STLLoader();
        const geometry = loader.parse(e.target.result);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(197 / 255, 173 / 255, 137 / 255),
          opacity: 1,
        });
        const mesh = new THREE.Mesh(geometry, material);
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1));
        const lights = [
          new THREE.DirectionalLight(0xffffff, 1),
          new THREE.DirectionalLight(0xffffff, 1),
          new THREE.DirectionalLight(0xffffff, 1),
          new THREE.DirectionalLight(0xffffff, 1),
        ];
        lights[0].position.set(0, 0, 1);
        lights[1].position.set(0, 0, -1);
        lights[2].position.set(-1, 0, 0);
        lights[3].position.set(1, 0, 0);
        lights.forEach((light) => scene.add(light));
        scene.add(mesh);

        geometry.computeBoundingBox();
        const center = geometry.boundingBox.getCenter(new THREE.Vector3());
        mesh.position.sub(center);

        const width = 100;
        const height = 100;
        const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);
        camera.position.z = 100;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setClearColor(0xffffff);
        renderer.render(scene, camera);
        img.src = renderer.domElement.toDataURL();
      } catch (err) {
        console.error("STL 解析失败：", err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Insert ref image wrapper synchronously (with File attached) so Start-click
  // immediately after drop still sees it; fill the preview when FileReader finishes.
  const addRefImageFromFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "uploaded-model";
    wrapper.file = file;

    const img = document.createElement("img");

    const remove = document.createElement("div");
    remove.className = "remove-model";
    remove.textContent = "×";
    remove.onclick = () => {
      delete wrapper.file;
      wrapper.remove();
      refUploadInput.value = "";
    };

    wrapper.appendChild(img);
    wrapper.appendChild(remove);
    refContainer.insertBefore(wrapper, refUploadBtn.nextSibling);

    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const enableJawDropZone = (placeholder) => {
    if (!placeholder || placeholder.dataset.dropBound === "1") return;
    placeholder.dataset.dropBound = "1";
    placeholder.addEventListener("dragenter", (e) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      placeholder.classList.add("is-dragover");
    });
    placeholder.addEventListener("dragover", (e) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      placeholder.classList.add("is-dragover");
    });
    placeholder.addEventListener("dragleave", (e) => {
      if (placeholder.contains(e.relatedTarget)) return;
      placeholder.classList.remove("is-dragover");
    });
    placeholder.addEventListener("drop", (e) => {
      placeholder.classList.remove("is-dragover");
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!/\.stl$/i.test(file.name)) {
        alert("Please drop a .stl file.");
        return;
      }
      activeTarget = placeholder;
      processStlFile(file, placeholder);
    });
  };

  const enableRefDropZone = (container) => {
    if (!container || container.dataset.dropBound === "1") return;
    container.dataset.dropBound = "1";
    container.addEventListener("dragenter", (e) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      container.classList.add("is-dragover");
    });
    container.addEventListener("dragover", (e) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      container.classList.add("is-dragover");
    });
    container.addEventListener("dragleave", (e) => {
      if (container.contains(e.relatedTarget)) return;
      container.classList.remove("is-dragover");
    });
    container.addEventListener("drop", (e) => {
      container.classList.remove("is-dragover");
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      const imageFiles = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (!imageFiles.length) {
        alert("Please drop image files (PNG or JPEG).");
        return;
      }
      for (const file of imageFiles) {
        addRefImageFromFile(file);
      }
    });
  };

  // 打开弹窗
  if (openBtn && modal) {
    openBtn.addEventListener("click", () => {
      modal.classList.add("show");
      modal.classList.remove("hidden");
    });
  }

  // 关闭弹窗
  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("show");
      modal.classList.add("hidden");
    });
  }

  // 点击遮罩关闭
  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("show");
      modal.classList.add("hidden");
    }
  });

  /*** 👇 STL 上传逻辑（左边，最多两个） ***/
  if (jawUploadInput && jawContainer) {
    jawContainer.querySelectorAll(".upload-placeholder").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTarget = btn;
        jawUploadInput.click();
      });
      enableJawDropZone(btn);
    });

    jawUploadInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      processStlFile(file, activeTarget);
    });
  }

  /*** 👇 PNG/JPG 图片上传逻辑（右边，无限上传） ***/
  if (refUploadBtn && refUploadInput && refContainer) {
    refUploadBtn.addEventListener("click", () => {
      refUploadInput.click();
    });
    enableRefDropZone(refContainer);

    refUploadInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      addRefImageFromFile(file);
    });
  }

  /*** 👇 取消按钮清空状态逻辑 ***/
  if (cancelBtn) {
    cancelBtn.addEventListener("click", resetCreateCaseForm);
  }

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (startBtn.dataset.submitting === "1") return;

      const caseName = caseNameInput?.value?.trim();

      if (!caseName) {
        alert("Please enter case name.");
        return;
      }

      const loggedInUser = getLoggedInUser();
      if (!loggedInUser || !loggedInUser.uuid) {
        alert("User not logged in.");
        return;
      }

      startBtn.dataset.submitting = "1";
      startBtn.disabled = true;
      if (inviteBtn) inviteBtn.disabled = true;
      const originalStartText = startBtn.textContent;
      startBtn.textContent = "Creating…";

      const machine_id = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
      const uuid = loggedInUser.uuid;
      const hasUpper = !!jawContainer.querySelector(
        '.uploaded-model[data-jaw="upper"]'
      );
      const hasLower = !!jawContainer.querySelector(
        '.uploaded-model[data-jaw="lower"]'
      );

      const payload = [
        {
          machine_id,
          uuid,
        },
        {
          case_id: caseName,
          upper_insertion_angle_x: 0,
          upper_insertion_angle_y: 0,
          upper_insertion_angle_z: 0,
          lower_insertion_angle_x: 0,
          lower_insertion_angle_y: 0,
          lower_insertion_angle_z: 0,
          process_upper: hasUpper ? 1 : 0,
          process_lower: hasLower ? 1 : 0,
        },
      ];

      fetch("https://live.api.smartrpdai.com/api/smartrpd/case", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
          return res.json();
        })
        .then(async (data) => {
          console.log("✅ Case uploaded successfully:", data);

          const case_id = caseName;
          const caseIntID = data.id;
            const user_id = getLoggedInUser()?.username || "";
  await createCaseHistory({ machine_id, uuid, caseIntID, user_id });

          // 📤 上传 Upper STL（如有）
          if (hasUpper) {
            const upperEl = jawContainer.querySelector(
              '.uploaded-model[data-jaw="upper"]'
            );
            await uploadSTL(
              "upper_jaw",
              upperEl,
              machine_id,
              uuid,
              case_id,
              caseIntID
            );
          }

          // 📤 上传 Lower STL（如有）
          if (hasLower) {
            const lowerEl = jawContainer.querySelector(
              '.uploaded-model[data-jaw="lower"]'
            );
            await uploadSTL(
              "lower_jaw",
              lowerEl,
              machine_id,
              uuid,
              case_id,
              caseIntID
            );
          }

          // ✅ ✅ ✅ 上传 Reference Image（多张）
          const refWrappers = refContainer.querySelectorAll(".uploaded-model");
          for (let i = 0; i < refWrappers.length; i++) {
            const wrapperEl = refWrappers[i];
            try {
              await uploadReferenceImage(
                wrapperEl,
                machine_id,
                uuid,
                case_id,
                caseIntID,
                i + 1
              );
            } catch (err) {
              const fallbackName = `ref_image_${i + 1}.png`;
              console.warn(
                `❌ Failed to upload reference image ${fallbackName}:`,
                err
              );
            }
          }

          alert("Case created, STL and reference images uploaded!");
          window.location.reload();
        })

        .catch((err) => {
          console.error("❌ Upload failed:", err);
          alert("Failed to create case.");
          // Re-enable so the user can retry
          startBtn.dataset.submitting = "";
          startBtn.disabled = false;
          startBtn.textContent = originalStartText;
          if (inviteBtn) inviteBtn.disabled = false;
        });
    });
  }

  if (inviteBtn) {
    inviteBtn.addEventListener("click", async () => {
      if (inviteBtn.dataset.submitting === "1") return;

      const caseName = caseNameInput?.value?.trim();

      if (!caseName) {
        alert("Please enter case name.");
        return;
      }

      const loggedInUser = getLoggedInUser();
      if (!loggedInUser || !loggedInUser.uuid) {
        alert("User not logged in.");
        return;
      }

      inviteBtn.dataset.submitting = "1";
      inviteBtn.disabled = true;
      if (startBtn) startBtn.disabled = true;
      const originalInviteText = inviteBtn.textContent;
      inviteBtn.textContent = "Creating…";

      const releaseInviteButton = () => {
        inviteBtn.dataset.submitting = "";
        inviteBtn.disabled = false;
        inviteBtn.textContent = originalInviteText;
        if (startBtn) startBtn.disabled = false;
      };

      const machine_id = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
      const uuid = loggedInUser.uuid;
      const hasUpper = !!jawContainer.querySelector(
        '.uploaded-model[data-jaw="upper"]'
      );
      const hasLower = !!jawContainer.querySelector(
        '.uploaded-model[data-jaw="lower"]'
      );

      // ✅ Step 1: 创建 Case
      const payload = [
        {
          machine_id,
          uuid,
        },
        {
          case_id: caseName,
          upper_insertion_angle_x: 0,
          upper_insertion_angle_y: 0,
          upper_insertion_angle_z: 0,
          lower_insertion_angle_x: 0,
          lower_insertion_angle_y: 0,
          lower_insertion_angle_z: 0,
          process_upper: hasUpper ? 1 : 0,
          process_lower: hasLower ? 1 : 0,
        },
      ];

      let caseIntID = null;

      try {
        const res = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/case",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        caseIntID = data.id;
        console.log("✅ Case created:", caseIntID);
        const user_id = getLoggedInUser()?.username || "";
await createCaseHistory({ machine_id, uuid, caseIntID, user_id });
      } catch (err) {
        console.error("❌ Failed to create case", err);
        alert("Failed to create case.");
        releaseInviteButton();
        return;
      }

      // ✅ Step 2: 上传 STL（如有）
      try {
        if (hasUpper) {
          const upperEl = jawContainer.querySelector(
            '.uploaded-model[data-jaw="upper"]'
          );
          await uploadSTL(
            "upper_jaw",
            upperEl,
            machine_id,
            uuid,
            caseName,
            caseIntID
          );
        }
        if (hasLower) {
          const lowerEl = jawContainer.querySelector(
            '.uploaded-model[data-jaw="lower"]'
          );
          await uploadSTL(
            "lower_jaw",
            lowerEl,
            machine_id,
            uuid,
            caseName,
            caseIntID
          );
        }
      } catch (err) {
        console.error("❌ STL Upload failed", err);
      }

      // ✅ Step 3: 上传 Reference Image（多张）
      try {
        const refWrappers = refContainer.querySelectorAll(".uploaded-model");
        for (let i = 0; i < refWrappers.length; i++) {
          const wrapperEl = refWrappers[i];
          await uploadReferenceImage(
            wrapperEl,
            machine_id,
            uuid,
            caseName,
            caseIntID,
            i + 1
          );
        }
      } catch (err) {
        console.warn("❌ Reference Image Upload failed", err);
      }

      // ✅ Step 3: 打开邀请弹窗
      releaseInviteButton();
      userAccessModal.classList.remove("hidden");
      userAccessModal.classList.add("show");
      // caseNameDisplay.textContent = caseName;
      const nameSpan = userAccessModal.querySelector(".case-name-display");
      if (nameSpan) nameSpan.textContent = caseName;

      window._inviteContext = {
        caseName,
        caseIntID,
        uuid,
        machine_id,
      };

      // ✅ Step 4: 获取当前 Case 所有成员（用正确字段 caseIntID + case_int_id）
      try {
        const rolePayload = [
          { machine_id, uuid, caseIntID },
          { case_int_id: caseIntID },
        ];

        console.log("📤 Role request payload:", rolePayload);

        const roleRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/role/all/get",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rolePayload),
          }
        );

        const text = await roleRes.text();
        console.log("📥 Role API response:", text);

        if (!roleRes.ok)
          throw new Error(`Role fetch failed: ${roleRes.status}`);
        const roleData = JSON.parse(text);
        existingUsers = roleData;
        renderSharedUserList();
      } catch (err) {
        console.error("❌ Failed to fetch roles", err);
        sharedUserList.innerHTML = "<li>Failed to load users.</li>";
      }
    });
    console.log("caseNameDisplay = ", caseNameDisplay);
  }

  // ✅ 绑定 ADD 按钮点击逻辑（确保可以多次添加）
  if (addUserBtn && userSearchInput) {
    const updateBtnState = () => {
      const hasText = userSearchInput.value.trim().length > 0;
      addUserBtn.disabled = false;
      addUserBtn.style.pointerEvents = "auto";
      addUserBtn.style.cursor = "pointer";
      addUserBtn.style.backgroundColor = "#88abda";
    };

    updateBtnState(); // 初始化状态
    userSearchInput.addEventListener("input", updateBtnState);

    addUserBtn.addEventListener("click", async () => {
      console.log("✅ ADD 按钮被点击");

      const username = userSearchInput.value.trim();
      if (!username) return;

      const ctx = window._inviteContext;
      if (!ctx || !ctx.caseIntID || !ctx.uuid || !ctx.machine_id) {
        alert("❌ 无法获取 case 上下文，请刷新页面重试！");
        return;
      }

      const { caseIntID, machine_id, uuid: ownerUUID } = ctx;

      if (existingUsers.some((u) => u.username === username)) {
        alert(`User "${username}" is already added.`);
        return;
      }

      try {
        // 1️⃣ 检查用户是否存在
        const checkRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/user/checkIfUsernameExists/get",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{ machine_id }, { username }]),
          }
        );

        const checkData = await checkRes.json();
        if (!checkData || !checkData.uuid) {
          throw new Error("User not found");
        }

        const targetUUID = checkData.uuid;

        // 2️⃣ 添加为 co-owner
        const roleRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/role",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
              { machine_id, uuid: ownerUUID, caseIntID },
              { role: 3, uuid: targetUUID, case_int_id: caseIntID },
            ]),
          }
        );

        if (!roleRes.ok) throw new Error("Add role failed");
        // 2.5️⃣ 发送通知（忽略 new_status）
try {
  const from_user = getLoggedInUser()?.username || "";
  const alertPayload = [
    { machine_id, uuid: ownerUUID, caseIntID },
    {
      case_int_id: caseIntID,
      to_user: username,                // 被邀请的人
      from_user,                        // 当前登录的人
      alert_message: `You have been added to case "${ctx.caseName}" by ${from_user}.`,
      read_status: 0,
      deleted: 0
    }
  ];

  await fetch("https://live.api.smartrpdai.com/api/smartrpd/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alertPayload)
  });

  console.log("✅ Alert sent to", username);
} catch (e) {
  console.warn("⚠️ Failed to send alert:", e);
}

        // 3️⃣ 刷新共享用户
        const refreshed = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/role/all/get",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
              { machine_id, uuid: ownerUUID, caseIntID },
              { case_int_id: caseIntID },
            ]),
          }
        );

        const refreshedData = await refreshed.json();
        existingUsers = refreshedData;
        renderSharedUserList();

        // ✅ 清空输入框
        userSearchInput.value = "";
        updateBtnState();
      } catch (err) {
        console.error("❌ Failed to add user:", err);
        alert("Failed to add user: " + err.message);
      }
    });
  }

  if (saveInviteBtn) {
    saveInviteBtn.addEventListener("click", () => {
      console.log("🔁 SAVE AND RETURN clicked → refreshing page");
      location.reload(); // ✅ 重新加载页面
    });
  }
  if (closeUserAccessModal) {
    closeUserAccessModal.addEventListener("click", () => {
      userAccessModal.classList.add("hidden");
      userAccessModal.classList.remove("show");
    });
  }

  // Invite modal Cancel: clear the search input only (keep modal + user list).
  if (cancelInviteBtn && userSearchInput) {
    cancelInviteBtn.addEventListener("click", () => {
      userSearchInput.value = "";
    });
  }
});

function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser"));
  } catch (err) {
    console.warn("无法解析 loggedInUser", err);
    return null;
  }
}

async function uploadSTL(
  jawType,
  wrapperEl,
  machine_id,
  uuid,
  case_id,
  caseIntID
) {
  if (!wrapperEl || !wrapperEl.file) {
    console.warn(`⚠️ No STL file found for ${jawType}`);
    return;
  }

  const file = wrapperEl.file;
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = async function (e) {
      try {
        const arrayBuffer = e.target.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        const binaryStr = uint8Array.reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        );
        const base64 = btoa(binaryStr);

        const payload = [
          {
            machine_id,
            uuid,
            caseIntID,
          },
          {
            case_id,
            type: jawType, // "upper_jaw" or "lower_jaw"
            data: base64,
            filename: file.name || `${jawType}.stl`,
          },
        ];

        // ✅ 使用 /stl/raw 替代 /stl
        const res = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/stl/raw",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          console.error(`❌ Failed to upload ${jawType}`, res.status);
        } else {
          console.log(`✅ Uploaded ${jawType} STL`);
        }

        resolve();
      } catch (err) {
        console.error(`❌ Error uploading ${jawType}:`, err);
        resolve();
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

// function renderSharedUserList() {
//   const container = document.getElementById("sharedUserList");

//   if (!container) {
//     console.warn("⚠️ Missing element: #sharedUserList");
//     return;
//   }

//   // 清空旧内容
//   container.innerHTML = "";

//   // 如果没有用户，显示提示
//   if (!existingUsers || existingUsers.length === 0) {
//     const emptyItem = document.createElement("li");
//     emptyItem.textContent = "No users found.";
//     emptyItem.style.color = "#888";
//     emptyItem.style.fontStyle = "italic";
//     container.appendChild(emptyItem);
//     return;
//   }

//   // 遍历用户并渲染每个条目
//   existingUsers.forEach((user) => {
//     const li = document.createElement("li");
//     li.className = "shared-user-item";

//     const nameSpan = document.createElement("span");
//     nameSpan.className = "user-name";
//     nameSpan.textContent = `👤 ${user.username}`;

//     const roleSpan = document.createElement("span");
//     roleSpan.className = "user-role";
//     roleSpan.textContent = user.role;

//     li.appendChild(nameSpan);
//     li.appendChild(roleSpan);
//     container.appendChild(li);
//   });
// }

function renderSharedUserList() {
  const container = document.getElementById("sharedUserList");

  if (!container) {
    console.warn("⚠️ Missing element: #sharedUserList");
    return;
  }

  // 清空旧内容
  container.innerHTML = "";

  // 如果没有用户，显示提示
  if (!existingUsers || existingUsers.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No users found.";
    emptyItem.style.color = "#888";
    emptyItem.style.fontStyle = "italic";
    container.appendChild(emptyItem);
    return;
  }

  // 遍历用户并渲染每个条目
  existingUsers.forEach((user) => {
    const li = document.createElement("li");
    li.className = "shared-user-item";
    li.style.position = "relative"; // 为右上角 × 做定位

    const nameSpan = document.createElement("span");
    nameSpan.className = "user-name";
    nameSpan.textContent = `👤 ${user.username}`;

    const roleSpan = document.createElement("span");
    roleSpan.className = "user-role";
    roleSpan.textContent = user.role;

    // ✅ 添加右上角删除按钮
    // ✅ 删除按钮（右上角 ×）
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "×";
    deleteBtn.title = "Remove user";
    deleteBtn.className = "delete-user-btn";

    // 隐藏删除按钮的条件：无 uuid 或为 owner
    if (!user.uuid || user.role === "owner") {
      deleteBtn.style.display = "none";
    }

    deleteBtn.addEventListener("click", async () => {
      const confirmed = confirm(`Remove user ${user.username}?`);
      if (!confirmed) return;

      try {
        const { caseIntID, uuid, machine_id } = window._inviteContext;
        const payload = [
          { machine_id, uuid, caseIntID },
          { case_id: caseIntID, uuid: user.uuid }
        ];

        const res = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/role/delete",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        alert(`✅ User ${user.username} removed.`);

        existingUsers = existingUsers.filter((u) => u.uuid !== user.uuid);
        renderSharedUserList();
      } catch (err) {
        console.error("❌ Failed to remove user:", err);
        alert("❌ Failed to remove user.");
      }
    });

    li.appendChild(nameSpan);
    li.appendChild(roleSpan);
    li.appendChild(deleteBtn); // ✅ 添加小 ×
    container.appendChild(li);
  });
}


async function uploadReferenceImage(
  wrapperEl,
  machine_id,
  uuid,
  case_id,
  caseIntID,
  index = 1
) {
  if (!wrapperEl || !wrapperEl.file) {
    console.warn(`⚠️ No image file found in wrapper`);
    return;
  }

  const file = wrapperEl.file;
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onload = async function (e) {
      try {
        const base64data = e.target.result;

        const payload = [
          {
            machine_id,
            uuid,
            caseIntID,
          },
          {
            case_id,
            image_name: file.name || `ref_image_${index}.png`,
            image_data: base64data,
          },
        ];

        const res = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/referenceimages",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          console.error(
            `❌ Failed to upload reference image ${file.name}`,
            res.status
          );
        } else {
          console.log(`✅ Uploaded reference image: ${file.name}`);
        }

        resolve();
      } catch (err) {
        console.error(`❌ Error uploading reference image ${file.name}:`, err);
        resolve();
      }
    };

    reader.readAsDataURL(file); // ✅ 读取为 Base64
  });
}

// === 写入 Case History：Created case ===
async function createCaseHistory({ machine_id, uuid, caseIntID, user_id, action = "Created case" }) {
  const payload = [
    { machine_id, uuid, caseIntID },
    { user_id, action, datetime: Date.now() }   // 当前毫秒时间戳
  ];

  let body = "";
  const res = await fetch("https://live.api.smartrpdai.com/api/smartrpd/casehistory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  try { body = await res.text(); } catch {}

  console.log("[casehistory][POST]", res.status, body);
  // 不阻塞主流程：失败只打日志
}
