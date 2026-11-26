export const officialBoardChannel = 'hithink-finance:official-board';

export function acceptsOfficialBoardPort(event, frame, token) {
  return Boolean(frame) && event.source === frame && event.origin === 'null'
    && event.data?.type === officialBoardChannel && event.data?.token === token
    && event.ports.length === 1;
}

export function officialBoardDocument({ html, stylesheet, runtime, token, params, withNavigation }) {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid official board frame token');
  const policy = [
    "default-src 'none'", "style-src 'unsafe-inline'", "img-src data:", "base-uri 'none'",
    "form-action 'none'", `script-src 'nonce-${token}'`,
  ].join('; ');
  const settings = JSON.stringify({ token, params, withNavigation }).replaceAll('<', '\\u003c');
  const boot = `<script nonce="${token}">${runtime.replace(/<\/script/gi, '<\\/script')}
HithinkFinanceBoard.startOfficialBoard(${settings});</script>`;
  return html
    .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)
    .replace(/<link rel="stylesheet" href="[^"]+">/, () => `<style>${stylesheet}</style>`)
    .replace(/<a class="wordmark" [^>]+>([^<]+)<\/a>/, '<span class="wordmark">$1</span>')
    .replace('<section id="content"></section>', '<section id="query"></section><section id="content"></section>')
    .replace(/<script type="module" src="[^"]+"><\/script>/, () => boot);
}

export function connectOfficialBoard({ frame, token, load, onParams, onHeight, onOpenAccount, onOpenBoard }) {
  let port;
  let pending;
  let mostRecent = 0;
  const abort = () => pending?.abort();
  function connect(event) {
    if (port || !acceptsOfficialBoardPort(event, frame.contentWindow, token)) return;
    port = event.ports[0];
    window.removeEventListener('message', connect);
    port.onmessage = async ({ data }) => {
      switch (data?.type) {
        case 'height':
          if (Number.isFinite(data.height)) onHeight(Math.min(24_000, Math.max(360, Math.ceil(data.height))));
          return;
        case 'account':
          onOpenAccount();
          return;
        case 'navigate':
          onOpenBoard(data.page);
          return;
      }
      if (data?.type !== 'load' || !Number.isSafeInteger(data.id) || data.id <= mostRecent
        || !data.params || typeof data.params !== 'object' || Array.isArray(data.params)) return;
      mostRecent = data.id;
      abort();
      const request = new AbortController();
      pending = request;
      const requestPort = port;
      onParams(data.params);
      let result;
      try {
        result = await load(data.params, request.signal);
      } catch {
        result = { ok: false, error: { message: '暂时无法连接金融数据服务。' } };
      }
      if (pending === request) pending = undefined;
      if (port === requestPort && data.id === mostRecent && !request.signal.aborted) {
        port.postMessage({ type: 'result', id: data.id, result });
      }
    };
  }
  window.addEventListener('message', connect);
  window.addEventListener('pagehide', abort);
  return () => {
    window.removeEventListener('message', connect);
    window.removeEventListener('pagehide', abort);
    abort();
    port?.close();
    port = undefined;
  };
}
