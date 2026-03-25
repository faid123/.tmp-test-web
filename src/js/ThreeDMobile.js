function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

window.addEventListener("DOMContentLoaded", () => {
  const chatWidget = document.getElementById("chat-widget");
  const chatIcon = document.getElementById("chat-icon");

  if (!chatWidget || !chatIcon) return;

  // 默认桌面端显示聊天框
  chatWidget.style.display = "flex";
  chatIcon.style.display = "none";

  if (isMobileDevice()) {
      // ✅ 插入移动端专属样式：放大字体 & 图片
      const style = document.createElement('style');
      style.innerHTML = `
      #chat-box .chat-message {
        font-size: 28px !important; /* 原 14px */
      }
//
      .chat-message .timestamp {
        font-size: 20px !important; /* 原 10px */
      }//

      .chat-message .author {
        font-size: 22px !important; /* 原 11px */
      }
  
      .chat-message img {
        max-width: 240px !important;
        max-height: 240px !important;
      }
    `;
      document.head.appendChild(style);

      // ✅ 移动端隐藏聊天框，显示图标
      chatWidget.style.display = "none";
      chatIcon.style.display = "block";

      chatIcon.addEventListener("click", () => {
          const isActive = chatWidget.classList.toggle("active");
          chatWidget.style.display = isActive ? "flex" : "none";
      });

      document.addEventListener("click", (e) => {
          const isInsideChat = chatWidget.contains(e.target) || chatIcon.contains(e.target);
          const isInImageModal = e.target.closest("#imageModal") !== null; // ✅ 用 ID 精准匹配
          const isCancelPreviewBtn = e.target.closest(".cancel-preview") !== null; // ✅ 更稳写法

          if (!isInsideChat && !isInImageModal && !isCancelPreviewBtn && chatWidget.classList.contains("active")) {
              chatWidget.classList.remove("active");
              chatWidget.style.display = "none";
          }
      });

  }
});

// if (isMobileDevice()) {
//   let attempts = 0;
//   const maxAttempts = 20;

//   const fixToothImgPos = () => {
//     const allButtons = document.getElementsByTagName("button");
//     for (let btn of allButtons) {
//       const img = btn.querySelector("img");
//       if (img && img.src.startsWith("data:image/png") && !btn.hasAttribute("data-mobile-moved")) {

//         // ✅ 设置牙图位置
//         btn.style.position = "fixed";
//         //btn.style.top = "500px";
//         btn.style.left = "15px";
//         btn.style.zIndex = "1000";
//         btn.style.width = "140px";
//         btn.style.height = "auto";
//         btn.style.padding = "0";
//         btn.style.border = "none";
//         btn.style.background = "none";
//         btn.style.cursor = "pointer";

//         img.style.width = "100%";
//         img.style.height = "auto";
//         img.style.transform = "none";
//         img.style.display = "block";

//         btn.setAttribute("data-mobile-moved", "true");
//         console.log("[Mobile] 2D tooth map moved");
//         return true;
//       }
//     }
//     return false;
//   };

//   const interval = setInterval(() => {
//     attempts += 1;
//     const success = fixToothImgPos();
//     if (success || attempts >= maxAttempts) {
//       clearInterval(interval);
//     }
//   }, 300);
// }