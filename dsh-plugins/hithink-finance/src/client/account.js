import { createElement as h, useCallback, useEffect, useRef, useState } from 'react';
import brandIcon from '../../assets/icon.png';
import { navigateAuthorizationWindow, openAuthorizationWindow, trustedAuthorizationUrl } from './view-state.js';

const adminUrl = 'https://fuyao.aicubes.cn/admin/';
const accountChanged = 'hithink-finance:account-changed';
const credentialLabels = { available: '已保存', missing: '未保存', invalid: '已失效', login_required: '需重新授权' };

function button(label, onClick, options = {}) {
  return h('button', { type: 'button', className: 'hf-button', ...options, onClick }, label);
}

export function Account({ account, isVisible = true }) {
  const desktop = 'dshDesktop' in globalThis || globalThis.location?.protocol === 'dsh-app:';
  const [requesterId] = useState(() => globalThis.crypto?.randomUUID?.());
  const [status, setStatus] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const popup = useRef(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const keyInput = useRef(null);
  const request = useRef(0);
  const statusRequest = useRef(0);
  const changing = useRef(false);
  const refreshAfterChange = useRef(false);
  const stream = useRef(null);
  const pending = status?.phase === 'pending';

  const stopStream = useCallback(() => {
    const handle = stream.current;
    stream.current = null;
    handle?.dispose();
    popup.current?.close();
    popup.current = null;
  }, []);

  const refreshStatus = useCallback(async () => {
    if (changing.current) {
      refreshAfterChange.current = true;
      return;
    }
    const revision = request.current;
    const read = ++statusRequest.current;
    const isCurrent = () => request.current === revision && statusRequest.current === read;
    try {
      const response = await account.status();
      if (!isCurrent()) return;
      if (response?.ok !== true || !response.value) {
        setError('无法读取金融数据账号。连接恢复后可重新检查。');
        return;
      }
      setStatus(response.value);
      setError(response.value.error?.message ?? null);
    } catch {
      if (isCurrent()) setError('无法连接金融数据插件。稍后可重新检查。');
    }
  }, [account]);

  const finishChange = useCallback(() => {
    changing.current = false;
    if (refreshAfterChange.current) {
      refreshAfterChange.current = false;
      void refreshStatus();
    }
  }, [refreshStatus]);

  const invoke = useCallback(async (action, ...args) => {
    const revision = ++request.current;
    changing.current = true;
    setBusy(action);
    setError(null);
    try {
      const response = await account[action](...args);
      if (request.current !== revision) return;
      if (response?.ok !== true || !response.value) {
        setError('无法读取金融数据账号。连接恢复后可重新检查。');
        return;
      }
      setStatus(response.value);
      setError(response.value.error?.message ?? null);
      if (action !== 'cancel' && (response.value.ok || response.value.error?.code === 'AUTH_REVOCATION_INCOMPLETE')) {
        window.dispatchEvent(new CustomEvent(accountChanged, { detail: requesterId }));
      }
      return response.value;
    } catch {
      if (request.current === revision) setError('无法连接金融数据插件。稍后可重新检查。');
    } finally {
      if (request.current === revision) {
        setBusy(false);
        finishChange();
      }
    }
  }, [account, finishChange, requesterId]);

  async function connect() {
    const revision = ++request.current;
    changing.current = true;
    // Open during the click, before the async CLI provides its one-time URL.
    if (!desktop) popup.current = openAuthorizationWindow(window);
    setStarting(true);
    setError(null);
    let handle;
    try {
      handle = await account.start(requesterId);
      if (typeof handle?.dispose !== 'function') throw new Error('Account stream unavailable');
      if (request.current !== revision) return;
      stream.current = handle;
      let terminal = false;
      for await (const { authorizationUrl, ...next } of handle) {
        if (request.current !== revision) return;
        setStarting(false);
        setStatus(next);
        setError(next.error?.message ?? null);
        terminal = next.phase !== 'pending';
        if (terminal) {
          setAttempt(null);
          popup.current?.close();
          popup.current = null;
          if (next.ok && next.phase === 'connected' && next.method === 'oauth') {
            window.dispatchEvent(new CustomEvent(accountChanged, { detail: requesterId }));
          }
          continue;
        }
        const url = trustedAuthorizationUrl(authorizationUrl);
        setAttempt({ id: next.attemptId, url });
        if (!navigateAuthorizationWindow(popup.current, url)) {
          popup.current?.close();
          popup.current = null;
        }
        if (!url) setError('授权地址尚不可用。可取消本次授权后重试。');
      }
      if (!terminal) throw new Error('Account stream ended early');
    } catch {
      if (request.current !== revision) return;
      setError('授权连接中断。可检查连接后重试。');
      setAttempt(null);
      popup.current?.close();
      popup.current = null;
    } finally {
      handle?.dispose?.();
      if (request.current === revision) {
        stream.current = null;
        setStarting(false);
        finishChange();
      }
    }
  }

  useEffect(() => {
    void refreshStatus();
    const onPageHide = () => {
      request.current++;
      changing.current = false;
      refreshAfterChange.current = false;
      stopStream();
      setAttempt(null);
      setBusy(false);
      setStarting(false);
      if (keyInput.current) keyInput.current.value = '';
      setKeyFormOpen(false);
    };
    const onPageShow = (event) => { if (event.persisted) void refreshStatus(); };
    const onAccountChanged = (event) => {
      if (event.detail !== requesterId) void refreshStatus();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener(accountChanged, onAccountChanged);
    return () => {
      request.current++;
      changing.current = false;
      refreshAfterChange.current = false;
      stopStream();
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener(accountChanged, onAccountChanged);
    };
  }, [refreshStatus, requesterId, stopStream]);

  useEffect(() => {
    if (!isVisible || !pending || attempt || starting || busy) return;
    const timer = setInterval(() => { void refreshStatus(); }, 2000);
    return () => clearInterval(timer);
  }, [attempt, busy, isVisible, pending, refreshStatus, starting]);

  let headline = '正在检查连接';
  let detail = '读取本机金融数据账号状态。';
  if (busy === 'loginApiKey') {
    headline = '正在验证 API Key';
    detail = '通过同花顺金融数据服务验证后保存并启用。';
  } else if (starting) {
    headline = '正在发起授权';
    detail = '正在准备安全的登录页面。';
  } else if (pending) {
    headline = '等待授权';
    detail = attempt ? '请在同花顺官方窗口完成扫码和授权确认。窗口未打开或已关闭时，可点「打开授权窗口」继续同一次授权。' : '请回到发起授权的页面完成操作。';
  } else if (status?.connected) {
    headline = '已连接';
    detail = status.method === 'api-key' ? '当前连接方式为 API Key。' : '当前连接方式为 OAuth。';
  } else if (status?.phase === 'cancelled') {
    headline = '已取消授权';
    detail = '可以重新发起连接。';
  } else if (status?.phase === 'error' || (!status && error)) {
    headline = '连接检查失败';
    detail = '可以检查连接状态后重试。';
  } else if (status) {
    headline = '待连接';
    detail = '选择同花顺账号授权或使用 API Key。';
  }
  const cancel = async () => {
    const revision = ++request.current;
    popup.current?.close();
    popup.current = null;
    setAttempt(null);
    setStarting(false);
    if (attempt?.id) {
      await invoke('cancel', requesterId, attempt.id);
    } else if (request.current === revision) {
      setStatus((current) => ({ ...current, phase: 'cancelled' }));
      stopStream();
      finishChange();
      return;
    }
    stopStream();
  };
  const logout = () => {
    setConfirmLogout(false);
    void invoke('logout', true);
  };
  const submitKey = async (event) => {
    event.preventDefault();
    if (!keyInput.current || busy || pending || starting) return;
    const key = keyInput.current.value.trim();
    keyInput.current.value = '';
    if (!key) {
      setError('请输入 API Key。');
      keyInput.current.focus();
      return;
    }
    const next = await invoke('loginApiKey', key);
    if (next?.ok) setKeyFormOpen(false);
    else keyInput.current?.focus();
  };
  const canManage = status && !starting && !pending && !confirmLogout;
  const oauthActive = status?.connected && status.method === 'oauth';
  const apiKeyActive = status?.connected && status.method === 'api-key';
  const oauth = status?.credentials?.oauth ?? 'missing';
  const apiKey = status?.credentials?.apiKey ?? 'missing';
  return h('div', { className: 'hf-account' },
    h('div', { className: 'hf-account-status', role: 'status', 'aria-live': 'polite' },
      h('strong', { className: status?.connected && !pending ? 'hf-connected' : undefined },
        h('span', { className: 'hf-status-dot', 'aria-hidden': true }), headline),
      h('p', null, detail),
    ),
    error && h('p', { className: 'hf-error', role: 'alert' }, error),
    confirmLogout && h('p', { className: 'hf-warning' },
      '断开连接会退出本机当前金融数据账号，并影响共享该凭证的命令行会话。'),
    h('div', { className: 'hf-actions' },
      pending && attempt?.url && h('a', {
        className: 'hf-button hf-primary', href: attempt.url, target: '_blank', rel: 'noopener noreferrer',
        onClick: (event) => {
          if (popup.current && !popup.current.closed) {
            event.preventDefault();
            popup.current.focus();
          }
        },
      }, '打开授权窗口'),
      (starting || (pending && attempt)) && button('取消授权', cancel, { disabled: busy }),
      status?.connected && !pending && !starting && !confirmLogout && button('断开连接', () => setConfirmLogout(true), { disabled: Boolean(busy) }),
      confirmLogout && button('确认断开', logout, { className: 'hf-button hf-danger', disabled: busy }),
      confirmLogout && button('继续保持连接', () => setConfirmLogout(false), { disabled: busy }),
      !confirmLogout && button('检查连接', () => { void refreshStatus(); }, { disabled: busy || starting || Boolean(attempt) }),
    ),
    canManage && h('div', { className: 'hf-account-methods' },
      h('section', { className: 'hf-account-method', 'data-active': oauthActive || undefined },
        h('strong', null, '同花顺账号'),
        h('span', { className: 'hf-note' }, oauthActive ? '当前启用' : credentialLabels[oauth]),
        !oauthActive && h('div', { className: 'hf-actions' },
          oauth === 'available'
            ? button('使用同花顺账号', () => { void invoke('selectMethod', 'oauth'); }, { disabled: Boolean(busy) })
            : button('连接账号', connect, { className: 'hf-button hf-primary', disabled: Boolean(busy) || !requesterId }),
        ),
      ),
      h('section', { className: 'hf-account-method', 'data-active': apiKeyActive || undefined },
        h('strong', null, 'API Key'),
        h('span', { className: 'hf-note' }, apiKeyActive ? '当前启用' : credentialLabels[apiKey]),
        h('div', { className: 'hf-actions' },
          apiKey === 'available' && !apiKeyActive && button('使用 API Key', () => { void invoke('selectMethod', 'api-key'); }, { disabled: Boolean(busy) }),
          !keyFormOpen && button(apiKey === 'missing' ? '输入 API Key' : '替换 API Key', () => { setError(null); setKeyFormOpen(true); }, { disabled: Boolean(busy) }),
        ),
        keyFormOpen && h('form', { className: 'hf-account-method', onSubmit: submitKey },
          h('label', null, h('span', null, 'API Key'),
            h('input', { ref: keyInput, className: 'hf-account-key', type: 'password', autoComplete: 'off', spellCheck: false, autoCapitalize: 'none',
              required: true, maxLength: 16 * 1024, autoFocus: true, disabled: Boolean(busy) })),
          h('p', { className: 'hf-note' }, '验证成功后保存至当前系统用户的共享凭据。', ' ',
            h('a', { href: adminUrl, target: '_blank', rel: 'noopener noreferrer' }, '获取 API Key')),
          h('div', { className: 'hf-actions' },
            button('验证并启用', undefined, { type: 'submit', className: 'hf-button hf-primary', disabled: Boolean(busy) }),
            button('取消', () => { setKeyFormOpen(false); setError(null); }, { disabled: Boolean(busy) }),
          ),
        ),
      ),
    ),
    !requesterId && h('p', { className: 'hf-note' }, '连接账号需要在安全的 DSH 页面操作。'),
  );
}

export function FinancePanelIcon({ size = 18 }) {
  return h('img', { width: size, height: size, src: brandIcon, className: 'hf-brand-icon', alt: '' });
}

export function AccountSettings({ open }) {
  return h('div', { className: 'hf-widget hf-actions hf-settings' },
    button('打开设置', () => open('settings'), { className: 'hf-button hf-primary' }),
    button('打开接口文档', () => open('docs')),
  );
}
