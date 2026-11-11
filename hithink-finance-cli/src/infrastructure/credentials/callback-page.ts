import { randomBytes } from 'node:crypto';
import type { Language } from '../../cli/i18n.js';

/** Fixed local content and redirect; authorization parameters never enter the document. */
export function callbackPage(success: boolean, language: Language) {
  const nonce = randomBytes(18).toString('base64');
  const chinese = language === 'zh-CN';
  const title = success
    ? chinese
      ? '登录成功'
      : 'Signed in'
    : chinese
      ? '登录未完成'
      : 'Sign-in did not complete';
  const detail = success
    ? chinese
      ? '登录认证通过，可关闭当前网页继续使用，3 秒后将前往官网。'
      : 'Authentication successful. You can close this page and continue. Opening the website in 3 seconds.'
    : chinese
      ? '登录认证未完成，请查看提示并重试，或重新运行 hithink-finance auth login。'
      : 'Authentication did not complete. Check the sign-in message and try again, or run hithink-finance auth login.';
  const link = success
    ? `<a href="https://fuyao.aicubes.cn/">${chinese ? '立即前往官网' : 'Open website'}</a>`
    : '';
  return {
    policy: `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'`,
    body: `<!doctype html><html lang="${chinese ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · HiThink Finance</title><style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f6f8;color:#17212f;font-family:system-ui,sans-serif}.card{max-width:540px;margin:24px;padding:40px;background:white;border-radius:18px;box-shadow:0 12px 45px #14213312}small{color:#6b7280}h1{font-size:30px}p{line-height:1.8;color:#4b5563}a{display:inline-block;margin-top:12px;padding:12px 22px;border-radius:10px;background:#c71c30;color:white;text-decoration:none}</style></head><body><main class="card"><small>同花顺金融数据 · HiThink Finance</small><h1>${title}</h1><p>${detail}</p>${link}</main><script nonce="${nonce}">history.replaceState(null,'','/oauth/callback');${success ? "setTimeout(()=>location.replace('https://fuyao.aicubes.cn/'),3000);" : ''}</script></body></html>`,
  };
}
