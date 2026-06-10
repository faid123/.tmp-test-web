// 引入加密解密函数
import { lol } from '../crypt.js';

// DOM elements are resolved lazily (bindDom) so this module can be imported on
// any page — including ones where the chat widget is injected after scripts run
// or isn't present at all. It no longer throws at load when there's no case id.
let chatBox, textInput, sendBtn, uploadBtn, imageInput, imageModal, modalImage;

let messages = [];
let pendingImageBase64 = null;
let pendingImageMime = 'image/jpeg';
let caseId = null;
let domBound = false;
let lastNotesSignature = '';
let pollTimer = null;
let pollInFlight = false;
let chatFocusHandler = null;

// Live-chat poll cadence while the tab is focused. Kept tight so a friend's
// message shows within a few seconds, but guarded (in-flight + hidden-tab
// pause) so requests never stack and trip the backend rate-limiter.
const CHAT_POLL_MS = 3000;

// Author tag used for the local-only "pending upload" preview bubble.
const PREVIEW_AUTHOR = 'Click send to upload image';

// Resolve the (decrypted) case id from, in priority order: an explicit
// encrypted id passed by the caller, the page's ?id= query param, or
// window.SMARTRPD_CHAT_CASE_ID — set by pages that track the selected case in
// memory rather than the URL (e.g. the case list).
function resolveCaseId(explicitEncryptedId) {
    const enc =
        explicitEncryptedId ||
        new URLSearchParams(window.location.search).get('id') ||
        window.SMARTRPD_CHAT_CASE_ID ||
        null;
    if (!enc) return null;
    const decoded = lol(enc);
    return decoded || null;
}

// The signed-in user's name, used as the note author (was hard-coded "faid").
function currentUsername() {
    try {
        const u = JSON.parse(localStorage.getItem('loggedInUser') || 'null');
        return u?.username || 'unknown';
    } catch {
        return 'unknown';
    }
}

// 推测 MIME 类型
function detectImageMime(base64) {
    const signature = base64.substring(0, 5);
    if (signature.startsWith('/9j/')) return 'image/jpeg';
    if (signature.startsWith('iVBOR')) return 'image/png';
    if (signature.startsWith('R0lG')) return 'image/gif';
    if (signature.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg';
}

// 获取历史记录
async function fetchNotes() {
    if (!caseId || !chatBox) return;
    try {
        const response = await fetch(`https://live.api.smartrpdai.com/api/smartrpd/notes/get/${caseId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        if (response.ok) {
            const notes = await response.json();
            notes.reverse();
            // Only re-render when the server data actually changed, so the
            // auto-refresh poll doesn't yank the user's scroll position or
            // flicker the list every few seconds.
            const signature = notes
                .map(n => n.id ?? `${n.author_username}:${n.created_at}`)
                .join('|');
            const changed = signature !== lastNotesSignature;
            lastNotesSignature = signature;

            messages = notes.map(note => {
                let content = '';
                if (note.image_base64) {
                    const mimeType = detectImageMime(note.image_base64);
                    content += `<img src="data:${mimeType};base64,${note.image_base64}" alt="Note Image" class="uploaded-image" />`;
                }
                if (note.content) {
                    content += `<div class="msg-text">${note.content}</div>`;
                }
                return {
                    content,
                    author: note.author_username,
                    timestamp: new Date(note.created_at).toLocaleString(),
                };
            });
            // Keep any in-progress image preview visible across refreshes.
            if (pendingImageBase64) messages.push(buildPendingPreviewMessage());
            // Only re-render on real changes so the poll doesn't yank scroll
            // position; an untouched preview is already in the DOM.
            if (changed) displayMessages();
        } else {
            console.error('❌ Failed to fetch notes:', await response.text());
        }
    } catch (err) {
        console.error('❌ Error fetching notes:', err);
    }
}

// One guarded poll: skip if a request is already in flight, there's no case,
// or the tab is hidden — so polls can't pile up and get rate-limited.
async function pollTick() {
    if (pollInFlight || !caseId || !chatBox || document.hidden) return;
    pollInFlight = true;
    try {
        await fetchNotes();
    } finally {
        pollInFlight = false;
    }
}

// Poll for new messages while the chat is active so incoming notes appear
// without a manual refresh. Also fetch immediately whenever the user returns
// to the tab/window, so messages that arrived while it was hidden show at once.
function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollTick, CHAT_POLL_MS);
    chatFocusHandler = () => { if (!document.hidden) pollTick(); };
    document.addEventListener('visibilitychange', chatFocusHandler);
    window.addEventListener('focus', chatFocusHandler);
}
function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (chatFocusHandler) {
        document.removeEventListener('visibilitychange', chatFocusHandler);
        window.removeEventListener('focus', chatFocusHandler);
        chatFocusHandler = null;
    }
}

// 渲染消息
function displayMessages() {
    if (!chatBox) return;
    chatBox.innerHTML = '';
    const me = currentUsername();
    messages.forEach(msg => {
        const isPreview = msg.author === PREVIEW_AUTHOR;
        // My own notes sit on the right ("You"); everyone else's on the left
        // labelled with their username.
        const mine = isPreview || msg.author === 'You' || msg.author === me;

        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message');
        messageElement.classList.add(mine ? 'is-mine' : 'is-theirs');

        const contentElement = document.createElement('div');
        contentElement.classList.add('message-content');
        contentElement.innerHTML = msg.content;
        messageElement.appendChild(contentElement);

        const timestampElement = document.createElement('div');
        timestampElement.classList.add('timestamp');
        timestampElement.textContent = msg.timestamp;
        messageElement.appendChild(timestampElement);

        if (!isPreview) {
            const authorElement = document.createElement('div');
            authorElement.classList.add('author');
            authorElement.textContent = mine ? 'You' : msg.author;
            messageElement.appendChild(authorElement);
        }

        chatBox.appendChild(messageElement);
    });

    // 滚动到底
    const images = chatBox.querySelectorAll('img');
    if (images.length > 0) {
        images[images.length - 1].onload = () => {
            chatBox.scrollTop = chatBox.scrollHeight;
        };
    } else {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// 提交新消息
async function createNote(content, imageBase64 = null) {
    if (!caseId) return;
    try {
        const response = await fetch('https://live.api.smartrpdai.com/api/smartrpd/notes/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case_int_id: caseId,
                author_username: currentUsername(),
                content: content || null,
                image_base64: imageBase64 || null,
            })
        });
        if (!response.ok) {
            console.error('❌ Failed to create note:', response.status);
        }
    } catch (err) {
        console.error('❌ Error creating note:', err);
    }
}

// 点击发送按钮
async function handleSendMessage() {
    const message = textInput.value.trim();
    if (!message && !pendingImageBase64) return;

    const sentImage = pendingImageBase64;
    const sentMime = pendingImageMime;

    // Clear the input right away so it disappears the instant you send — don't
    // wait for the (possibly slow) network round-trip below.
    textInput.value = '';
    imageInput.value = '';
    pendingImageBase64 = null;
    autoResizeInput();

    // Optimistic echo. Built by concatenation (no template-literal indentation)
    // so the pre-wrapped text doesn't render blank lines above/below it.
    removePendingPreview();
    let echo = '';
    if (sentImage) echo += `<img src="data:${sentMime};base64,${sentImage}" alt="Image" class="uploaded-image" />`;
    if (message) echo += `<div class="msg-text">${message}</div>`;
    messages.push({
        content: echo,
        author: 'You',
        timestamp: new Date().toLocaleString(),
    });
    displayMessages();

    await createNote(message, sentImage);
    fetchNotes();
}


// Drop the local-only "pending upload" preview bubble from the message list.
function removePendingPreview() {
    messages = messages.filter(m => m.author !== PREVIEW_AUTHOR);
}

// Build the "pending upload" preview message (shown until Send is pressed).
function buildPendingPreviewMessage() {
    return {
        content: `
        <div class="upload-preview-wrap">
            <img src="data:${pendingImageMime};base64,${pendingImageBase64}" alt="Preview" class="uploaded-image" />
            <button type="button" class="upload-preview-remove" onclick="clearImage()" aria-label="Remove image">&times;</button>
        </div>
    `,
        author: PREVIEW_AUTHOR,
        timestamp: new Date().toLocaleString(),
    };
}

// 渲染预览图（上传/粘贴共用）
function previewImage(base64, mime = 'image/jpeg') {
    pendingImageBase64 = base64;
    pendingImageMime = mime;
    removePendingPreview();
    messages.push(buildPendingPreviewMessage());
    displayMessages();
}
// Auto-grow the comment textarea with its content, capped at 5 rows; once the
// cap is reached it scrolls instead of growing further.
const MAX_INPUT_ROWS = 5;
function autoResizeInput() {
    if (!textInput) return;
    // Skip while the panel is hidden (display:none): scrollHeight is 0 then, so
    // sizing here would squash the box to ~0 until the user types. CSS
    // min-height keeps it at one row in the meantime.
    if (!textInput.offsetParent) return;
    const cs = getComputedStyle(textInput);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const maxH = lineHeight * MAX_INPUT_ROWS + padding + border;
    textInput.style.height = 'auto';
    const next = Math.min(textInput.scrollHeight + border, maxH);
    textInput.style.height = next + 'px';
    textInput.style.overflowY = textInput.scrollHeight + border > maxH ? 'auto' : 'hidden';
}

// Read an image File into a base64 preview (shared by the upload button,
// Ctrl+V paste and drag-and-drop). Ignores non-image files.
function readImageFile(file) {
    if (!file || file.type.indexOf('image') === -1) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const base64 = e.target.result.split(',')[1];
        previewImage(base64, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
}

// 上传图片
function handleImageUpload(event) {
    readImageFile(event.target.files[0]);
}

// 取消图片预览（不清除文本）
window.clearImage = function () {
    pendingImageBase64 = null;
    removePendingPreview();
    displayMessages();
    if (imageInput) imageInput.value = '';
};

// Bind DOM + event listeners exactly once. Returns false when the chat widget
// isn't on the page, so callers can no-op gracefully.
function bindDom() {
    if (domBound) return true;
    chatBox = document.getElementById('chat-box');
    textInput = document.getElementById('textInput');
    sendBtn = document.getElementById('sendBtn');
    uploadBtn = document.getElementById('uploadBtn');
    imageInput = document.getElementById('imageInput');
    imageModal = document.getElementById('imageModal');
    modalImage = document.getElementById('modalImage');
    const chatWidget = document.getElementById('chat-widget');
    if (!chatBox || !textInput || !sendBtn || !uploadBtn || !imageInput) return false;
    domBound = true;

    // Ctrl+V 粘贴图片
    textInput.addEventListener('paste', function (e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.indexOf("image") !== -1) {
                readImageFile(item.getAsFile());
            }
        }
    });

    // Press Enter to send; Shift+Enter inserts a newline (the textarea grows).
    textInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Grow the textarea with its content, up to 5 rows, then scroll.
    textInput.addEventListener('input', autoResizeInput);
    autoResizeInput();

    // Close like the app sidebar: click the backdrop / close button, or Escape.
    if (chatWidget) {
        chatWidget.querySelectorAll('[data-chat-close]').forEach((el) =>
            el.addEventListener('click', () => closeWidget(chatWidget))
        );
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && chatWidget.classList.contains('is-open')) {
                closeWidget(chatWidget);
            }
        });
    }

    // Drag-and-drop an image onto the chat panel to attach it. Mirrors the
    // proven drop-zone pattern in createCase.js: bind to a concrete element
    // (the panel has pointer-events:auto — a pointer-events:none overlay does
    // not reliably receive drops), guard on dragged files, and use
    // relatedTarget to avoid dragleave flicker.
    const hasFiles = (e) =>
        Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files');
    const dropZone = (chatWidget && chatWidget.querySelector('.chat-sidebar-panel')) || chatBox;
    if (dropZone) {
        dropZone.addEventListener('dragenter', (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragover', (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', (e) => {
            if (dropZone.contains(e.relatedTarget)) return;
            dropZone.classList.remove('drag-over');
        });
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('drag-over');
            if (!hasFiles(e)) return;
            e.preventDefault();
            const file = Array.from(e.dataTransfer.files).find((f) =>
                f.type.startsWith('image/')
            );
            if (file) readImageFile(file);
        });
    }

    sendBtn.addEventListener('click', handleSendMessage);
    uploadBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', handleImageUpload);

    // 放大图片
    if (imageModal && modalImage) {
        chatBox.addEventListener('click', function (e) {
            if (e.target.tagName === 'IMG') {
                modalImage.src = e.target.src;
                imageModal.style.display = 'flex';
            }
        });
        imageModal.addEventListener('click', function () {
            imageModal.style.display = 'none';
        });
    }
    return true;
}

// Load (or reload) the conversation for a case. Returns true when the chat is
// ready (widget present + a resolvable case id), false otherwise. This does a
// one-time fetch but does NOT start the live poll — polling is tied to the
// panel being open (see openWidget), so pages that carry the chat widget but
// keep it closed (the 2D annotation / 3D viewer pages) don't poll all session.
export function initChat(explicitEncryptedId) {
    if (!bindDom()) return false;
    const resolved = resolveCaseId(explicitEncryptedId);
    if (!resolved) return false;
    const changed = resolved !== caseId;
    caseId = resolved;
    if (changed) {
        // Switching cases: drop the old conversation so it can't linger.
        messages = [];
        lastNotesSignature = '';
    }
    if (changed || !messages.length) fetchNotes();
    return true;
}

// Slide the side panel in/out, matching the app sidebar's open/close timing
// (the 220ms delay before hiding lets the transform transition finish).
function openWidget(widget) {
    widget.classList.remove('is-hidden');
    requestAnimationFrame(() => {
        widget.classList.add('is-open');
        // Now that the panel is visible, size the textarea correctly (it can't
        // measure itself while hidden).
        autoResizeInput();
    });
    widget.setAttribute('aria-hidden', 'false');
    setTimeout(() => textInput && textInput.focus(), 60);
    // Start the live poll only now that the panel is actually open; closeWidget
    // stops it. This keeps closed-but-present chat widgets from polling all
    // session on the annotation / 3D viewer pages.
    startPolling();
}
function closeWidget(widget) {
    widget.classList.remove('is-open');
    widget.setAttribute('aria-hidden', 'true');
    setTimeout(() => widget.classList.add('is-hidden'), 220);
    stopPolling();
}

// Toggle the chat side panel, lazily initialising it for the given case. Used
// by the footer chat button on the case list and 2D annotation pages.
export function toggleChat(explicitEncryptedId) {
    if (!bindDom()) return;
    const widget = document.getElementById('chat-widget');
    if (!widget) return;
    if (widget.classList.contains('is-open')) {
        closeWidget(widget);
        return;
    }
    // Only open once we have a case context to talk about.
    if (!initChat(explicitEncryptedId)) return;
    openWidget(widget);
}

// Standalone viewer behaviour: when the page already carries a ?id= and the
// widget exists, bind and fetch immediately (matches the original chat.js).
// Start the live poll on boot only for always-on chat widgets (e.g. the 3D
// viewer's inline panel, which has no open/close toggle). Slide-in sidebar
// widgets start hidden (.is-hidden) and begin polling when opened instead, so
// they don't poll all session while closed on the annotation page.
if (new URLSearchParams(window.location.search).get('id')) {
    const boot = () => {
        if (!initChat()) return;
        const widget = document.getElementById('chat-widget');
        const isClosedPanel = widget && widget.classList.contains('is-hidden');
        if (!isClosedPanel) startPolling();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}
