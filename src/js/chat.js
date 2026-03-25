// 引入加密解密函数
import { lol } from '../crypt.js';


// 获取 DOM 元素
const chatBox = document.getElementById('chat-box');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const uploadBtn = document.getElementById('uploadBtn');
const imageInput = document.getElementById('imageInput');

let messages = [];
let pendingImageBase64 = null;

// 解密 caseId
const encryptedCaseId = new URLSearchParams(window.location.search).get('id');
if (!encryptedCaseId) {
    alert('Missing case ID');
    throw new Error('Missing case ID');
}

const caseId = lol(encryptedCaseId);
if (!caseId) {
    alert('Invalid case ID');
    throw new Error('Invalid case ID');
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
    try {
        const response = await fetch(`https://live.api.smartrpdai.com/api/smartrpd/notes/get/${caseId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        if (response.ok) {
            const notes = await response.json();
            notes.reverse();
            messages = notes.map(note => {
                let content = '';
                if (note.image_base64) {
                    const mimeType = detectImageMime(note.image_base64);
                    content += `<img src="data:${mimeType};base64,${note.image_base64}" alt="Note Image" class="uploaded-image" />`;
                }
                if (note.content) {
                    content += `<div style="margin-top:6px;">${note.content}</div>`;
                }
                return {
                    content,
                    author: note.author_username,
                    timestamp: new Date(note.created_at).toLocaleString(),
                };
            });
            displayMessages();
        } else {
            console.error('❌ Failed to fetch notes:', await response.text());
        }
    } catch (err) {
        console.error('❌ Error fetching notes:', err);
    }
}

// 渲染消息
function displayMessages() {
    chatBox.innerHTML = '';
    messages.forEach(msg => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message');

        const contentElement = document.createElement('div');
        contentElement.classList.add('message-content');
        contentElement.innerHTML = msg.content;
        messageElement.appendChild(contentElement);

        const timestampElement = document.createElement('div');
        timestampElement.classList.add('timestamp');
        timestampElement.textContent = msg.timestamp;
        messageElement.appendChild(timestampElement);

        const authorElement = document.createElement('div');
        authorElement.classList.add('author');
        authorElement.textContent = msg.author;
        messageElement.appendChild(authorElement);

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
    try {
        const response = await fetch('https://live.api.smartrpdai.com/api/smartrpd/notes/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case_int_id: caseId,
                author_username: 'faid',
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

    if (message || pendingImageBase64) {
        // 立即移除预览
        messages = messages.filter(m => m.author !== 'Click send to upload image');

        const previewHtml = `
            ${pendingImageBase64 ? `<img src="data:image/jpeg;base64,${pendingImageBase64}" alt="Image" class="uploaded-image" />` : ''}
            ${message ? `<div style="margin-top:6px;">${message}</div>` : ''}
        `;
        messages.push({
            content: previewHtml,
            author: 'You',
            timestamp: new Date().toLocaleString(),
        });
        displayMessages();

        await createNote(message, pendingImageBase64);

        textInput.value = '';
        imageInput.value = '';
        pendingImageBase64 = null;

        fetchNotes();
    }
}


// 渲染预览图（上传/粘贴共用）
function previewImage(base64, mime = 'image/jpeg') {
    pendingImageBase64 = base64;
    messages = messages.filter(m => m.author !== 'Click send to upload image');

    const previewHtml = `
        <img src="data:${mime};base64,${base64}" alt="Preview" class="uploaded-image" />
        <div style="text-align:right; margin-top:4px;">
            <button class="cancel-preview" onclick="clearImage()">cancel</button>
        </div>
    `;
    messages.push({
        content: previewHtml,
        author: 'Click send to upload image',
        timestamp: new Date().toLocaleString(),
    });
    displayMessages();
}

// 上传图片
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const base64 = e.target.result.split(',')[1];
            previewImage(base64, file.type || 'image/jpeg');
        };
        reader.readAsDataURL(file);
    }
}

// Ctrl+V 粘贴图片
textInput.addEventListener('paste', function (e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = function (event) {
                const base64 = event.target.result.split(',')[1];
                previewImage(base64, file.type || 'image/jpeg');
            };
            reader.readAsDataURL(file);
        }
    }
});

// 取消图片预览（不清除文本）
window.clearImage = function () {
    pendingImageBase64 = null;
    messages = messages.filter(m => m.author !== 'Click send to upload image');
    displayMessages();
    imageInput.value = '';
};

// 放大图片
const imageModal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');
chatBox.addEventListener('click', function (e) {
    if (e.target.tagName === 'IMG') {
        modalImage.src = e.target.src;
        imageModal.style.display = 'flex';
    }
});
imageModal.addEventListener('click', function () {
    imageModal.style.display = 'none';
});

// 初始化
sendBtn.addEventListener('click', handleSendMessage);
uploadBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', handleImageUpload);
fetchNotes();