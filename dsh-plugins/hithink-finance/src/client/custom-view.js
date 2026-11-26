const policy = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'worker-src blob:',
  "connect-src 'none'", "frame-src 'none'", "form-action 'none'", "base-uri 'none'",
].join('; ');

function customWorker(loadRender) {
  const el = (tag, children = [], props = {}) => ({ ...props, tag, children });
  const render = loadRender(el);
  self.addEventListener('message', ({ data }) => {
    try {
      self.postMessage(JSON.stringify(render(data.rows, data.action)));
    } catch {
      self.postMessage(null);
    }
  }, { once: true });
}

// This function is serialized as the trusted srcdoc script. Author code runs only in the dedicated Worker.
function startCustomView(token, workerProgram) {
  const root = document.querySelector('main');
  const tags = new Set(['div', 'section', 'h2', 'h3', 'p', 'span', 'strong', 'small', 'br', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'output', 'progress', 'button']);
  const styles = new Set(['display', 'gridTemplateColumns', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems',
    'width', 'maxWidth', 'height', 'gap', 'margin', 'padding', 'borderRadius', 'color', 'backgroundColor',
    'fontSize', 'fontWeight', 'fontVariantNumeric', 'lineHeight', 'textAlign']);
  const channel = new MessageChannel();
  let worker;
  let workerUrl;
  let timer;
  let rows;
  let source;
  let nodes;

  function stop() {
    clearTimeout(timer);
    worker?.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    worker = workerUrl = null;
  }

  function failed() {
    stop();
    root.textContent = '自定义组件暂时无法显示，可查看数据表。';
  }

  function nodeFor(value, depth = 0) {
    if (++nodes > 800 || depth > 18) throw new Error();
    if (value == null) return document.createTextNode('');
    if (typeof value === 'string' || typeof value === 'number') return document.createTextNode(String(value));
    if (Array.isArray(value)) {
      const fragment = document.createDocumentFragment();
      for (const child of value) fragment.append(nodeFor(child, depth + 1));
      return fragment;
    }
    if (!tags.has(value.tag)) throw new Error();
    const node = document.createElement(value.tag);
    if (typeof value.label === 'string') node.setAttribute('aria-label', value.label.slice(0, 160));
    for (const [key, style] of Object.entries(value.style ?? {})) {
      if (styles.has(key) && ['string', 'number'].includes(typeof style)
        && /^[\w#.%, -]{1,96}$/.test(String(style))) node.style[key] = style;
    }
    if (value.tag === 'progress') {
      if (Number.isFinite(value.max) && value.max > 0) node.max = value.max;
      if (Number.isFinite(value.value)) node.value = value.value;
    }
    if (value.tag === 'button') {
      node.type = 'button';
      if (typeof value.pressed === 'boolean') node.setAttribute('aria-pressed', String(value.pressed));
      if (typeof value.action === 'string' && value.action.length <= 96) {
        node.dataset.action = value.action;
        node.addEventListener('click', () => run(value.action));
      } else node.disabled = true;
    }
    if (value.children !== undefined && !['progress', 'br'].includes(value.tag)) {
      node.append(nodeFor(value.children, depth + 1));
    }
    return node;
  }

  function run(action = null) {
    stop();
    try {
      const program = ['(', workerProgram, ')((el)=>{\n', source, '\n;return render;\n});'];
      workerUrl = URL.createObjectURL(new Blob(program, { type: 'text/javascript' }));
      worker = new Worker(workerUrl);
      worker.onmessage = ({ data }) => {
        stop();
        try {
          if (typeof data !== 'string' || data.length > 64 * 1024) throw new Error();
          const tree = JSON.parse(data);
          if (tree == null) throw new Error();
          const restoreFocus = action !== null && root.contains(document.activeElement);
          nodes = 0;
          root.replaceChildren(nodeFor(tree));
          if (restoreFocus) Array.from(root.querySelectorAll('button')).find((button) => button.dataset.action === action)?.focus();
        } catch {
          failed();
        }
      };
      worker.onerror = (event) => { event.preventDefault(); failed(); };
      worker.postMessage({ rows, action });
      timer = setTimeout(failed, 3000);
    } catch {
      failed();
    }
  }

  channel.port1.onmessage = ({ data }) => {
    channel.port1.close();
    if (!Array.isArray(data?.rows) || typeof data.source !== 'string') return failed();
    ({ rows, source } = data);
    run();
  };
  window.addEventListener('pagehide', stop, { once: true });
  parent.postMessage({ type: 'hithink-finance:ready', token }, '*', [channel.port2]);
}

export function customDocument(token) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:light dark;font:14px/1.5 system-ui,sans-serif}
body{margin:0;color:CanvasText}button{font:inherit;cursor:pointer}table{border-collapse:collapse}td,th{padding:4px 8px}
</style>
<main aria-live="polite">正在显示自定义组件…</main>
<script>(${startCustomView})(${JSON.stringify(token)},${JSON.stringify(customWorker.toString())});</script>`;
}
