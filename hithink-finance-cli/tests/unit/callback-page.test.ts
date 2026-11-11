import { expect, test } from 'vitest';
import { callbackPage } from '../../src/infrastructure/credentials/callback-page.js';
test('Chinese success uses nonce CSP and cleans the callback before its fixed redirect', () => {
  const page = callbackPage(true, 'zh-CN');
  expect(page.body).toContain('登录成功');
  expect(page.body).toContain('登录认证通过，可关闭当前网页继续使用，3 秒后将前往官网。');
  expect(page.body).not.toMatch(/WorkBuddy|终端/u);
  expect(page.body.indexOf('history.replaceState')).toBeLessThan(
    page.body.indexOf('location.replace'),
  );
  expect(page.body).toContain("location.replace('https://fuyao.aicubes.cn/'),3000");
  const nonce = /script-src 'nonce-([^']+)'/u.exec(page.policy)![1];
  expect(page.body).toContain(`<script nonce="${nonce}">`);
  expect(page.body).not.toMatch(/access_token|refresh_token|error_description/u);
});
test('failure remains on the local result with a retry instruction', () => {
  const page = callbackPage(false, 'zh-CN');
  expect(page.body).toContain('登录未完成');
  expect(page.body).toContain('hithink-finance auth login');
  expect(page.body).not.toContain('location.replace');
  expect(page.body).toContain('history.replaceState');
  expect(page.body).not.toMatch(/WorkBuddy|终端/u);
  expect(callbackPage(true, 'en').body).toContain('Signed in');
});
