// 顶部引入模块
import { lol } from "../crypt.js";
import { toast, flashToast } from "./toast.js";
import { confirmModal } from "./confirmModal.js";
import { logApi } from "./apiLog.js";

let THREE;
let STLLoader;

// Lazy-load Three.js + STLLoader from a CDN. Bare specifiers ("three") only
// resolve behind a bundler; the GitHub Pages deployment serves raw src/ files,
// where the browser sees "three" as a relative URL and 404s. Matching the
// version + CDN preview3D.js uses keeps both modules on a single instance.
async function loadThreeDeps() {
  if (THREE && STLLoader) return;
  const [threeMod, loaderMod] = await Promise.all([
    import("https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"),
    import("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/STLLoader.js"),
  ]);
  THREE = threeMod;
  STLLoader = loaderMod.STLLoader;
}

let existingUsers = []; // shared users currently on the case (loaded via role/all/get)
let pendingInvites = []; // usernames queued in the inline create-case view

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadThreeDeps();
  } catch (err) {
    console.error("createCase: dependency load failed", err);
  }

  const openBtn = document.getElementById("createCaseBtn");
  const formPane = document.getElementById("createCaseForm");
  const uploadPane = document.getElementById("createCaseUpload");
  const pageEl = document.querySelector(".cm-page");

  const jawUploadInput = document.getElementById("jawUploadInput");
  const jawContainer = document.getElementById("uploadedJawModels");

  const refUploadBtn = document.getElementById("addRefImageBtn");
  const refUploadInput = document.getElementById("refImageInput");
  const refContainer = document.getElementById("uploadedReferenceImages");

  const caseNameInput = document.getElementById("caseName");
  const requestDateInput = document.getElementById("requestDate");
  const caseOwnerDisplay = document.getElementById("ccCaseOwner");
  const caseCreateDateDisplay = document.getElementById("ccCreateDate");
  const inviteInput = document.getElementById("ccInviteInput");
  const inviteAddBtn = document.getElementById("ccInviteAdd");
  const inviteListEl = document.getElementById("ccInviteList");

  const cancelBtn = uploadPane?.querySelector(".cancel-btn");
  const saveBtn = uploadPane?.querySelector(".save-btn");
  const saveStartBtn = uploadPane?.querySelector(".save-start-btn");

  const userAccessModal = document.getElementById("userAccessModal");
  const closeUserAccessModal = document.getElementById("closeUserAccessModal");
  const cancelInviteBtn = document.getElementById("cancelInviteBtn");
  const userSearchInput = document.getElementById("userSearchInput");
  const addUserBtn = document.getElementById("addUserBtn");
  const saveInviteBtn = document.getElementById("saveInviteBtn");

  let activeTarget = null;
  const uploadLimit = 2;

  const formatToday = () => new Date().toISOString().slice(0, 10);

  const showInlineView = () => {
    if (!formPane || !uploadPane || !pageEl) return;
    resetCreateCaseForm();
    const loggedInUser = getLoggedInUser();
    if (caseOwnerDisplay) {
      caseOwnerDisplay.textContent = loggedInUser?.username || "—";
    }
    if (caseCreateDateDisplay) {
      caseCreateDateDisplay.textContent = formatToday();
    }
    pageEl.classList.add("creating");
    document.body.classList.add("creating-case");
    formPane.classList.remove("hidden");
    uploadPane.classList.remove("hidden");
  };

  const hideInlineView = () => {
    if (!formPane || !uploadPane || !pageEl) return;
    pageEl.classList.remove("creating");
    document.body.classList.remove("creating-case");
    formPane.classList.add("hidden");
    uploadPane.classList.add("hidden");
  };

  const renderInviteList = () => {
    if (!inviteListEl) return;
    inviteListEl.innerHTML = "";
    pendingInvites.forEach((username, idx) => {
      const li = document.createElement("li");
      li.textContent = username;
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.setAttribute("aria-label", `Remove ${username}`);
      x.addEventListener("click", () => {
        pendingInvites.splice(idx, 1);
        renderInviteList();
      });
      li.appendChild(x);
      inviteListEl.appendChild(li);
    });
  };

  const addInvite = () => {
    if (!inviteInput) return;
    const name = inviteInput.value.trim();
    if (!name) return;
    if (pendingInvites.includes(name)) {
      inviteInput.value = "";
      return;
    }
    pendingInvites.push(name);
    inviteInput.value = "";
    renderInviteList();
  };

  // === Drag & drop helpers (jaw STL placeholders + reference image container) ===
  const eventHasFiles = (e) => {
    const types = e?.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).some((t) => t === "Files");
  };

  // Build a fresh jaw placeholder ("upper" | "lower") with click + drag-drop wired up.
  const buildJawPlaceholder = (jawType) => {
    const placeholder = document.createElement("div");
    placeholder.className = "upload-placeholder cc-jaw-tile";
    placeholder.dataset.jaw = jawType;

    const bgImg = document.createElement("img");
    bgImg.className = "jaw-bg";
    bgImg.alt = jawType === "upper" ? "Upper Jaw" : "Lower Jaw";
    bgImg.src =
      jawType === "upper" ? "../../assets/upper.svg" : "../../assets/lower.svg";

    const label = document.createElement("span");
    label.className = "cc-jaw-label";
    label.textContent = jawType === "upper" ? "Upper Jaw" : "Lower Jaw";

    placeholder.appendChild(bgImg);
    placeholder.appendChild(label);

    placeholder.addEventListener("click", () => {
      activeTarget = placeholder;
      jawUploadInput.click();
    });
    enableJawDropZone(placeholder);
    return placeholder;
  };

  // Reset the create-case form (clears inputs + rebuilds upload zones).
  const resetCreateCaseForm = () => {
    if (caseNameInput) caseNameInput.value = "";
    if (requestDateInput) requestDateInput.value = "";
    if (inviteInput) inviteInput.value = "";
    pendingInvites = [];
    renderInviteList();
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

        // Render at thumbnail-friendly resolution so the PNG we upload to the
        // case thumbnail slot is crisp. The on-screen preview img is sized via
        // CSS (width: 100px), so a 512² source still displays correctly.
        const width = 512;
        const height = 512;
        const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);
        camera.position.z = 100;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        // Matches the .cm-image-area backdrop so the thumbnail blends into
        // the detail-pane image box instead of standing out as a white tile.
        renderer.setClearColor(0xeef2f7);
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL("image/png");
        img.src = dataUrl;
        wrapper.thumbnailDataUrl = dataUrl;
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
    refContainer.appendChild(wrapper);

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
        toast.warning("Please drop a .stl file.");
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
        toast.warning("Please drop image files (PNG or JPEG).");
        return;
      }
      for (const file of imageFiles) {
        addRefImageFromFile(file);
      }
    });
  };

  // 打开内联创建视图（取代弹窗）
  if (openBtn && formPane && uploadPane) {
    openBtn.addEventListener("click", () => {
      showInlineView();
    });
  }

  /*** 👇 STL 上传逻辑（最多两个） ***/
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

  /*** 👇 PNG/JPG 图片上传逻辑（无限上传） ***/
  if (refUploadBtn && refUploadInput && refContainer) {
    refUploadBtn.addEventListener("click", () => {
      refUploadInput.click();
    });
    enableRefDropZone(refContainer);
    enableRefDropZone(refUploadBtn);

    refUploadInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      addRefImageFromFile(file);
    });
  }

  /*** 👇 Invite Users 内联列表 ***/
  if (inviteAddBtn) {
    inviteAddBtn.addEventListener("click", addInvite);
  }
  if (inviteInput) {
    inviteInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addInvite();
      }
    });
  }

  /*** 👇 取消按钮：清空状态并关闭内联视图 ***/
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      resetCreateCaseForm();
      hideInlineView();
    });
  }

  /*** 👇 Save / Save & Start 提交流程 ***/
  const submitCase = async (mode, triggerBtn) => {
    if (triggerBtn.dataset.submitting === "1") return;

    const caseName = caseNameInput?.value?.trim();
    if (!caseName) {
      toast.warning("Please enter case name.");
      return;
    }

    const loggedInUser = getLoggedInUser();
    if (!loggedInUser || !loggedInUser.uuid) {
      toast.error("User not logged in.");
      return;
    }

    triggerBtn.dataset.submitting = "1";
    triggerBtn.disabled = true;
    if (saveBtn) saveBtn.disabled = true;
    if (saveStartBtn) saveStartBtn.disabled = true;
    const originalText = triggerBtn.textContent;
    triggerBtn.textContent = "Creating…";

    const release = () => {
      triggerBtn.dataset.submitting = "";
      triggerBtn.disabled = false;
      triggerBtn.textContent = originalText;
      if (saveBtn) saveBtn.disabled = false;
      if (saveStartBtn) saveStartBtn.disabled = false;
    };

    const machine_id = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
    const uuid = loggedInUser.uuid;
    const hasUpper = !!jawContainer.querySelector(
      '.uploaded-model[data-jaw="upper"]'
    );
    const hasLower = !!jawContainer.querySelector(
      '.uploaded-model[data-jaw="lower"]'
    );

    const payload = [
      { machine_id, uuid },
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      logApi(res, 'POST /case');
      if (!res.ok) {
        let errorText = "";
        try {
          errorText = await res.text();
        } catch {
          errorText = "";
        }
        const err = new Error(`Create case failed: HTTP ${res.status}`);
        err.status = res.status;
        err.body = errorText;
        throw err;
      }
      const data = await res.json();
      caseIntID = data.id;
      const user_id = loggedInUser.username || "";
      await createCaseHistory({ machine_id, uuid, caseIntID, user_id });
    } catch (err) {
      console.error("❌ Failed to create case", err);
      const detail = typeof err?.body === "string" && err.body.trim()
        ? `\n${err.body.slice(0, 400)}`
        : "";
      const statusPart = err?.status ? ` (HTTP ${err.status})` : "";
      toast.error(`Failed to create case${statusPart}.${detail}`);
      release();
      return;
    }

    try {
      if (hasUpper) {
        const upperEl = jawContainer.querySelector(
          '.uploaded-model[data-jaw="upper"]'
        );
        await uploadSTL("upper_jaw", upperEl, machine_id, uuid, caseName, caseIntID);
        if (upperEl?.thumbnailDataUrl) {
          await uploadCaseThumbnail(machine_id, uuid, caseIntID, 1, upperEl.thumbnailDataUrl);
        }
      }
      if (hasLower) {
        const lowerEl = jawContainer.querySelector(
          '.uploaded-model[data-jaw="lower"]'
        );
        await uploadSTL("lower_jaw", lowerEl, machine_id, uuid, caseName, caseIntID);
        if (lowerEl?.thumbnailDataUrl) {
          await uploadCaseThumbnail(machine_id, uuid, caseIntID, 2, lowerEl.thumbnailDataUrl);
        }
      }
    } catch (err) {
      console.error("❌ STL Upload failed", err);
    }

    try {
      const refWrappers = refContainer.querySelectorAll(".uploaded-model");
      for (let i = 0; i < refWrappers.length; i++) {
        await uploadReferenceImage(
          refWrappers[i],
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

    if (pendingInvites.length) {
      const from_user = loggedInUser.username || "";
      for (const username of pendingInvites) {
        try {
          const checkRes = await fetch(
            "https://live.api.smartrpdai.com/api/smartrpd/user/checkifusernameexists/get",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify([{ machine_id }, { username }]),
            }
          );
          logApi(checkRes, 'POST /user/checkifusernameexists/get');
          const checkData = await checkRes.json();
          if (!checkData || !checkData.uuid) {
            console.warn(`User "${username}" not found — skipping.`);
            continue;
          }
          const targetUUID = checkData.uuid;
          const roleInviteRes = await fetch("https://live.api.smartrpdai.com/api/smartrpd/role", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
              { machine_id, uuid, caseIntID },
              { role: 3, uuid: targetUUID, case_int_id: caseIntID },
            ]),
          });
          logApi(roleInviteRes, 'POST /role');
          const alertInviteRes = await fetch("https://live.api.smartrpdai.com/api/smartrpd/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
              { machine_id, uuid, caseIntID },
              {
                case_int_id: caseIntID,
                to_user: username,
                from_user,
                alert_message: `You have been added to case "${caseName}" by ${from_user}.`,
                read_status: 0,
                deleted: 0,
              },
            ]),
          });
          logApi(alertInviteRes, 'POST /alerts');
        } catch (e) {
          console.warn(`❌ Failed to invite ${username}:`, e);
        }
      }
    }

    if (mode === "start") {
      const encryptedId = lol(caseIntID);
      const isGitHubPages = window.location.hostname.includes("github.io");
      const repoBase = isGitHubPages
        ? `/${window.location.pathname.split("/").filter(Boolean)[0] || ""}`
        : "";
      window.location.href = `${window.location.origin}${repoBase}/src/pages/2DAnnotation.html?id=${encryptedId}`;
    } else {
      flashToast("Case created.", "success");
      window.location.reload();
    }
  };

  if (saveBtn) {
    saveBtn.addEventListener("click", () => submitCase("save", saveBtn));
  }
  if (saveStartBtn) {
    saveStartBtn.addEventListener("click", () => submitCase("start", saveStartBtn));
  }

  // Bind ADD button click in the userAccessModal (shared-user invite flow).
  if (addUserBtn && userSearchInput) {
    addUserBtn.addEventListener("click", async () => {
      const username = userSearchInput.value.trim();
      if (!username) return;

      const ctx = window._inviteContext;
      if (!ctx || !ctx.caseIntID || !ctx.uuid || !ctx.machine_id) {
        toast.error("Unable to load case context — please refresh and try again.");
        return;
      }

      const { caseIntID, machine_id, uuid: ownerUUID } = ctx;

      if (existingUsers.some((u) => u.username === username)) {
        toast.info(`User "${username}" is already added.`);
        return;
      }

      try {
        // 1️⃣ 检查用户是否存在
        const checkRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/user/checkifusernameexists/get",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{ machine_id }, { username }]),
          }
        );
        logApi(checkRes, 'POST /user/checkifusernameexists/get');
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
        logApi(roleRes, 'POST /role');
        if (!roleRes.ok) throw new Error("Add role failed");

        // Send an in-app notification to the invitee. Failures are non-fatal.
        try {
          const from_user = getLoggedInUser()?.username || "";
          const alertSendRes = await fetch("https://live.api.smartrpdai.com/api/smartrpd/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
              { machine_id, uuid: ownerUUID, caseIntID },
              {
                case_int_id: caseIntID,
                to_user: username,
                from_user,
                alert_message: `You have been added to case "${ctx.caseName}" by ${from_user}.`,
                read_status: 0,
                deleted: 0,
              },
            ]),
          });
          logApi(alertSendRes, 'POST /alerts');
        } catch (e) {
          console.warn("Failed to send invite alert:", e);
        }

        // Refresh the shared-user list from the server.
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
        logApi(refreshed, 'POST /role/all/get');
        existingUsers = await refreshed.json();
        renderSharedUserList();

        userSearchInput.value = "";
      } catch (err) {
        console.error("Failed to add user:", err);
        toast.error("Failed to add user: " + err.message);
      }
    });
  }

  if (saveInviteBtn) {
    saveInviteBtn.addEventListener("click", () => {
      location.reload();
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
        const filename = file.name || `${jawType}.stl`;

        const rawPayload = [
          { machine_id, uuid, caseIntID },
          {
            case_id,
            type: jawType, // "upper_jaw" or "lower_jaw"
            data: base64,
            filename,
          },
        ];

        // 1) Raw STL bucket — what the web 3D preview pulls from.
        const rawRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/stl/raw",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rawPayload),
          }
        );
        logApi(rawRes, 'POST /stl/raw');
        if (!rawRes.ok) {
          console.error(`❌ Failed to upload ${jawType} (raw)`, rawRes.status);
        } else {
          console.log(`✅ Uploaded ${jawType} STL (raw)`);
        }

        // 2) Processed STL bucket — what the SmartRPD desktop client loads via
        // RestAPI.CreateSTL. C# enum: Upper=0, Lower=1; DB column is 1-based,
        // so we send the integer (jawType "upper_jaw" → 1, "lower_jaw" → 2).
        const dbType = jawType === "upper_jaw" ? 1 : jawType === "lower_jaw" ? 2 : 0;
        const stlPayload = [
          { machine_id, uuid, caseIntID },
          {
            case_id: caseIntID,
            type: dbType,
            data: base64,
            filename,
          },
        ];
        const stlRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/stl",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(stlPayload),
          }
        );
        logApi(stlRes, 'POST /stl');
        if (!stlRes.ok) {
          let body = "";
          try { body = await stlRes.text(); } catch {}
          console.error(
            `❌ Failed to upload ${jawType} (processed)`,
            stlRes.status,
            body.slice(0, 200)
          );
        } else {
          console.log(`✅ Uploaded ${jawType} STL (processed)`);
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

function renderSharedUserList() {
  const container = document.getElementById("sharedUserList");
  if (!container) {
    console.warn("Missing element: #sharedUserList");
    return;
  }

  container.innerHTML = "";

  if (!existingUsers || existingUsers.length === 0) {
    const empty = document.createElement("li");
    empty.className = "uam-empty";
    empty.innerHTML = `
      <i class="fa fa-user-group" aria-hidden="true"></i>
      <span>No one else has access yet</span>
      <span style="font-size: 12px; opacity: 0.75;">Invite a user above to share this case.</span>
    `;
    container.appendChild(empty);
    return;
  }

  existingUsers.forEach((user) => {
    const li = document.createElement("li");
    li.className = "shared-user-item";

    const avatar = document.createElement("span");
    avatar.className = "user-avatar";
    avatar.textContent = initialsFor(user.username);

    const body = document.createElement("div");
    body.className = "user-body";

    const nameSpan = document.createElement("span");
    nameSpan.className = "user-name";
    nameSpan.textContent = user.username;

    const roleSpan = document.createElement("span");
    roleSpan.className = "user-role";
    roleSpan.textContent = user.role || "Member";
    if ((user.role || "").toLowerCase() === "owner") {
      roleSpan.classList.add("is-owner");
    }

    body.appendChild(nameSpan);
    body.appendChild(roleSpan);

    li.appendChild(avatar);
    li.appendChild(body);

    // Owner row + rows without a uuid aren't removable.
    if (user.uuid && user.role !== "owner") {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.title = "Remove user";
      deleteBtn.setAttribute("aria-label", `Remove ${user.username}`);
      deleteBtn.className = "delete-user-btn";
      deleteBtn.innerHTML = '<i class="fa fa-xmark" aria-hidden="true"></i>';

      deleteBtn.addEventListener("click", async () => {
        const confirmed = await confirmModal({
          title: "Remove user?",
          message: `Remove ${user.username} from this case? They'll lose access immediately.`,
          confirmText: "Remove",
          cancelText: "Cancel",
          variant: "danger",
        });
        if (!confirmed) return;

        try {
          const { caseIntID, uuid, machine_id } = window._inviteContext;
          const res = await fetch(
            "https://live.api.smartrpdai.com/api/smartrpd/role/delete",
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify([
                { machine_id, uuid, caseIntID },
                { case_id: caseIntID, uuid: user.uuid },
              ]),
            }
          );
          logApi(res, 'PUT /role/delete');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          existingUsers = existingUsers.filter((u) => u.uuid !== user.uuid);
          renderSharedUserList();
        } catch (err) {
          console.error("Failed to remove user:", err);
          toast.error("Failed to remove user.");
        }
      });

      li.appendChild(deleteBtn);
    }

    container.appendChild(li);
  });
}

function initialsFor(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
        logApi(res, 'POST /referenceimages');
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

// POST /thumbnails — save a thumbnail PNG into a specific slot for a case.
// Body shape per API spec: [authData, caseData] where caseData carries the
// integer case id, the slot index, and the base64 image payload (no data URL
// prefix). slot 0 = composite 2D annotation, 1 = upper STL render,
// 2 = lower STL render.
async function uploadCaseThumbnail(machine_id, uuid, caseIntID, slot, dataUrl) {
  if (!caseIntID || !dataUrl) return;
  const commaIdx = dataUrl.indexOf(",");
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const payload = [
    { machine_id, uuid, caseIntID },
    { case_id: caseIntID, slot, data: base64 },
  ];
  try {
    const res = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/thumbnails",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    logApi(res, 'POST /thumbnails');
    if (!res.ok) {
      console.error(`❌ Failed to upload thumbnail slot ${slot}:`, res.status);
    } else {
      console.log(`✅ Uploaded thumbnail slot ${slot}`);
    }
  } catch (err) {
    console.error(`❌ Error uploading thumbnail slot ${slot}:`, err);
  }
}

// === 写入 Case History：Created case ===
async function createCaseHistory({ machine_id, uuid, caseIntID, user_id, action = "Created case" }) {
  const payload = [
    { machine_id, uuid, caseIntID },
    { user_id, action, datetime: Date.now() }   // 当前毫秒时间戳
  ];

  // History is a side-write and must never block / undo a successful case
  // creation. The previous implementation let network errors bubble up to the
  // caller's catch, which then showed "Failed to create case" even though the
  // case already existed on the server — making the user retry and create
  // duplicates.
  try {
    const res = await fetch("https://live.api.smartrpdai.com/api/smartrpd/casehistory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let body = "";
    try { body = await res.text(); } catch {}
    console.log("[casehistory][POST]", res.status, body);
  } catch (err) {
    console.warn("[casehistory][POST] network error (non-fatal):", err);
  }
}
