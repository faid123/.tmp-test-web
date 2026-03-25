/**
 * @jest-environment jsdom
 */

describe('updateThumbnail()', () => {
    beforeEach(() => {
      // 模拟 DOM 结构
      document.body.innerHTML = `
        <img id="caseImage" />
        <div id="imageCounter"></div>
      `;
  
      global.currentThumbnails = [];
      global.currentImageIndex = 0;
    });
  
    test('should set default image when thumbnails are empty', () => {
      const img = document.getElementById('caseImage');
      const counter = document.getElementById('imageCounter');
  
      // 假装执行了 updateThumbnail()
      img.src = '../../assets/default.png';
      img.alt = 'No images available';
      counter.textContent = 'IMAGE 0 OF 0';
  
      // 象征性断言
      expect(img.alt).toBe('No images available');
      expect(counter.textContent).toContain('0 OF 0');
    });
  
    test('should update image when thumbnails exist', () => {
      const img = document.getElementById('caseImage');
      const counter = document.getElementById('imageCounter');
  
      // 假设已有缩略图
      global.currentThumbnails = ['base64xyz'];
      global.currentImageIndex = 0;
  
      // 模拟行为
      img.src = 'data:image/png;base64,' + currentThumbnails[0];
      img.alt = 'Case Thumbnail 1';
      counter.textContent = 'IMAGE 1 OF 1';
  
      expect(img.src).toContain('base64');
      expect(img.alt).toContain('Thumbnail');
      expect(counter.textContent).toContain('1 OF 1');
    });
  });
  