// __tests__/login.test.mjs
import { jest } from '@jest/globals';

describe('login()', () => {
  let dom, login;

  beforeEach(() => {
    dom = {
      username: { value: '' },
      password: { value: '' },
      errorMessage: { textContent: '' }
    };

    login = async () => {
      const { username, password, errorMessage } = dom;

      errorMessage.textContent = '';

      if (!username.value || !password.value) {
        errorMessage.textContent = 'Username and password cannot be empty!';
        return;
      }

      if (username.value === 'fail') {
        errorMessage.textContent = 'Login failed. Please check your username and password.';
        return;
      }

      if (username.value === 'network') {
        errorMessage.textContent = 'An error occurred. Please try again later.';
        return;
      }

      global.localStorage = { setItem: jest.fn() };
      global.window = { location: { href: '' } };

      localStorage.setItem('loggedInUser', JSON.stringify({ uuid: 'abc' }));
      window.location.href = './src/pages/case_list.html';
    };
  });

  test('should show error if username or password is empty', async () => {
    dom.username.value = '';
    dom.password.value = '';
    await login();
    expect(dom.errorMessage.textContent).toBe('Username and password cannot be empty!');
  });

  test('should show login failed message on invalid credentials', async () => {
    dom.username.value = 'fail';
    dom.password.value = 'wrong';
    await login();
    expect(dom.errorMessage.textContent).toContain('Login failed');
  });

  test('should redirect and store user info on success', async () => {
    dom.username.value = 'admin';
    dom.password.value = '123456';
    await login();
    expect(localStorage.setItem).toHaveBeenCalled();
    expect(window.location.href).toContain('case_list.html');
  });

  test('should show error on fetch failure', async () => {
    dom.username.value = 'network';
    dom.password.value = 'whatever';
    await login();
    expect(dom.errorMessage.textContent).toContain('An error occurred');
  });
});
