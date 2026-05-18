import { state } from "./2DAnnotation.js";

export const CLINICAL_ASSET_BASE = "../../assets/clinicalInfo";

export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export function sourceToothFor(toothId) {
  if (toothId >= 21 && toothId <= 28) return { id: toothId - 10, mirrored: true };
  if (toothId >= 31 && toothId <= 38) return { id: toothId + 10, mirrored: true };
  return { id: toothId, mirrored: false };
}

export function statusFor(toothId) {
  const tooth = state.teeth?.[toothId];
  if (!tooth) return "presence";
  if (tooth.status === "missing" || tooth.isPresent === false) return "missing";
  if (tooth.status === "abutment") return "abutment";
  return "presence";
}

function buildToothImg(srcFile, extraClass = "") {
  const img = document.createElement("img");
  img.className = "clinical-info-tooth-img" + (extraClass ? ` ${extraClass}` : "");
  img.src = `${CLINICAL_ASSET_BASE}/${srcFile}`;
  img.alt = "";
  return img;
}

function buildToothCell(toothId) {
  const { id, mirrored } = sourceToothFor(toothId);
  const status = statusFor(toothId);
  const isUpper = toothId >= 11 && toothId <= 28;

  const cell = document.createElement("div");
  cell.className = `clinical-info-tooth is-${status}`;
  cell.dataset.toothId = String(toothId);

  const number = document.createElement("div");
  number.className = "clinical-info-tooth-number";
  number.textContent = String(toothId);
  cell.appendChild(number);

  const imgWrap = document.createElement("div");
  imgWrap.className = "clinical-info-tooth-img-wrap";

  const mirrorClass = mirrored ? " is-mirrored" : "";

  if (status === "abutment") {
    imgWrap.appendChild(
      buildToothImg(`${id}_Abutment.svg`, `clinical-info-tooth-full${mirrorClass}`)
    );
  } else {
    const stack = document.createElement("div");
    stack.className = "clinical-info-tooth-stack";
    const crownImg = buildToothImg(`${id}_Crown.svg`, `clinical-info-tooth-crown${mirrorClass}`);
    const rootImg = buildToothImg(`${id}_Root.svg`, `clinical-info-tooth-root${mirrorClass}`);
    if (isUpper) {
      stack.appendChild(rootImg);
      stack.appendChild(crownImg);
    } else {
      stack.appendChild(crownImg);
      stack.appendChild(rootImg);
    }
    imgWrap.appendChild(stack);

    if (status === "missing") {
      const cross = document.createElement("span");
      cross.className = "clinical-info-tooth-cross";
      cross.setAttribute("aria-hidden", "true");
      imgWrap.appendChild(cross);
    }
  }

  cell.appendChild(imgWrap);
  return cell;
}

function renderRow(containerId, teeth) {
  const row = document.getElementById(containerId);
  if (!row) return;
  row.replaceChildren();
  const frag = document.createDocumentFragment();
  teeth.forEach((id) => frag.appendChild(buildToothCell(id)));
  row.appendChild(frag);
}

function getModal() {
  return document.getElementById("clinicalInfoModal");
}

export function openClinicalInfo() {
  const modal = getModal();
  if (!modal) return;
  renderRow("clinicalInfoUpperRow", UPPER_TEETH);
  renderRow("clinicalInfoLowerRow", LOWER_TEETH);
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
}

export function closeClinicalInfo() {
  const modal = getModal();
  if (!modal) return;
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
}

export function initClinicalInfo() {
  document.getElementById("openClinicalInfoBtn")?.addEventListener("click", openClinicalInfo);
  document.getElementById("clinicalInfoCloseBtn")?.addEventListener("click", closeClinicalInfo);
  document
    .getElementById("clinicalInfoModal")
    ?.querySelector(".clinical-info-backdrop")
    ?.addEventListener("click", closeClinicalInfo);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !getModal()?.classList.contains("is-hidden")) {
      closeClinicalInfo();
    }
  });
}
