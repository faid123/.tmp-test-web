// __tests__/chat.test.mjs
import { jest } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

describe('handleSendMessage()', () => {
  let dom, state, handleSendMessage;

  beforeEach(() => {
    dom = {
      textInput: { value: '' },
      imageInput: { value: '' },
      errorMessage: { textContent: '' }
    };

    state = {
      pendingImageBase64: null,
      messages: []
    };

    handleSendMessage = async () => {
      const message = dom.textInput.value.trim();
      if (!message && !state.pendingImageBase64) {
        dom.errorMessage.textContent = 'Message cannot be empty!';
        return;
      }

      state.messages.push({
        content: message || '[Image]',
        author: 'user'
      });

      dom.textInput.value = '';
      dom.imageInput.value = '';
      state.pendingImageBase64 = null;
    };
  });

  test('should show error if no message and no image', async () => {
    dom.textInput.value = '';
    state.pendingImageBase64 = null;
    await handleSendMessage();
    expect(dom.errorMessage.textContent).toBe('Message cannot be empty!');
  });

  test('should send text message', async () => {
    dom.textInput.value = 'Hello!';
    await handleSendMessage();
    expect(state.messages.length).toBe(1);
    expect(state.messages[0].content).toBe('Hello!');
  });

  test('should send image message if no text', async () => {
    dom.textInput.value = '';
    state.pendingImageBase64 = 'abc123';
    await handleSendMessage();
    expect(state.messages[0].content).toBe('[Image]');
  });

  test('should reset input fields after sending', async () => {
    dom.textInput.value = 'test';
    dom.imageInput.value = 'something';
    state.pendingImageBase64 = 'xyz';
    await handleSendMessage();
    expect(dom.textInput.value).toBe('');
    expect(dom.imageInput.value).toBe('');
    expect(state.pendingImageBase64).toBe(null);
  });
});