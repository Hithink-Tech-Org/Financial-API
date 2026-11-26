const channel = 'hithink-finance:workbench';
const pagePolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'";
const documentStart = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
const allowedTags = new Set(('a abbr article aside b blockquote br button canvas caption code col colgroup dd details div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i img input label legend li main mark meter nav ol optgroup option output p picture pre progress s section select small span strong style sub summary sup table tbody td textarea tfoot th thead time tr u ul svg g path circle ellipse line polyline polygon rect text tspan defs clippath lineargradient radialgradient stop title').split(' '));
const allowedAttributes = new Set(('id class style title role lang dir hidden open type disabled value checked selected min max step minlength maxlength rows cols placeholder for name multiple readonly width height colspan rowspan scope datetime alt viewbox fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray fill-opacity stroke-opacity opacity transform d x y cx cy r rx ry x1 y1 x2 y2 points dx dy font-size text-anchor offset stop-color stop-opacity gradientunits gradienttransform preserveaspectratio clip-path').split(' '));

function cleanHtml(source, interactive = false) {
  const template = document.createElement('template');
  template.innerHTML = source;
  let scriptsRemoved = 0;
  for (const element of template.content.querySelectorAll('*')) {
    const tag = element.localName.toLowerCase();
    if (interactive && tag === 'script' && element.namespaceURI === 'http://www.w3.org/1999/xhtml'
      && !element.hasAttribute('src') && ['', 'text/javascript', 'application/javascript', 'module'].includes(element.type.trim().toLowerCase())) {
      const module = element.type.trim().toLowerCase() === 'module';
      for (const { name } of Array.from(element.attributes)) element.removeAttribute(name);
      if (module) element.type = 'module';
      continue;
    }
    if (!allowedTags.has(tag) || (tag === 'style' && element.namespaceURI !== 'http://www.w3.org/1999/xhtml')) {
      if (tag === 'script' && element.id !== 'hithink-finance-data') scriptsRemoved++;
      element.remove();
      continue;
    }
    for (const { name, value } of Array.from(element.attributes)) {
      const key = name.toLowerCase();
      const localAnchor = tag === 'a' && key === 'href' && /^#[^\s]*$/.test(value);
      const embeddedImage = tag === 'img' && key === 'src' && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(value);
      const localHandler = interactive && key.startsWith('on');
      if (!localAnchor && !embeddedImage && !localHandler && !allowedAttributes.has(key) && !key.startsWith('aria-') && !key.startsWith('data-')) {
        if (key.startsWith('on')) scriptsRemoved++;
        element.removeAttribute(name);
      }
    }
    if (tag === 'input' && !['text', 'number', 'date', 'search', 'range', 'checkbox', 'radio'].includes(element.type)) element.type = 'text';
  }
  return { html: template.innerHTML, scriptsRemoved };
}

export function buildPageDocument(source, token) {
  const { html, scriptsRemoved } = cleanHtml(source);
  const scriptSource = token ? `'nonce-${token}'` : "'none'";
  const bindingScript = token
    ? `<script nonce="${token}">(${bindDocument})(${JSON.stringify(token)},${JSON.stringify(channel)});</script>`
    : '';
  return {
    scriptsRemoved,
    srcDoc: `${documentStart}<meta http-equiv="Content-Security-Policy" content="${pagePolicy}; script-src ${scriptSource}">
<style>:root{color-scheme:light dark;font:14px/1.55 system-ui,sans-serif}body{margin:0;padding:16px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px 9px;text-align:start;border-bottom:1px solid color-mix(in srgb,currentColor 20%,transparent)}th{white-space:nowrap}pre{white-space:pre-wrap;overflow-wrap:anywhere}canvas.hf-page-line{display:block;width:100%;height:180px}.hf-page-table{overflow:auto}</style>
<body>${html}${bindingScript}</body></html>`,
  };
}

export function buildInteractiveDocument(source) {
  const { html } = cleanHtml(source, true);
  return `${documentStart}<meta http-equiv="Content-Security-Policy" content="${pagePolicy}; script-src 'unsafe-inline'">
<body>${html}</body></html>`;
}

export function buildOfficialSample(source) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${pagePolicy}; script-src 'unsafe-inline'">`;
  return /<head(?:\s[^>]*)?>/i.test(source)
    ? source.replace(/<head(?:\s[^>]*)?>/i, (head) => head + policy)
    : `${documentStart}${policy}${source}</html>`;
}

export function acceptsFramePort(event, frame, token) {
  return Boolean(frame) && event.source === frame && event.origin === 'null'
    && event.data?.type === channel && event.data?.token === token && event.ports.length === 1;
}

// Serialized into the isolated HTML frame. Only the nonce-bearing runtime can send requests.
function bindDocument(token, channel) {
  const slots = Array.from(document.querySelectorAll('[data-hf-query]'));
  if (!slots.length) return;
  const port = new MessageChannel();
  const pick = (value, field) => (field || '').split('.').filter(Boolean).reduce(
    (item, key) => item && Object.hasOwn(item, key) ? item[key] : undefined, value);
  const json = (value, fallback) => {
    try {
      const parsed = JSON.parse(value);
      return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  };
  const make = (tag, content) => {
    const element = document.createElement(tag);
    if (content !== undefined) element.textContent = typeof content === 'object' ? JSON.stringify(content) : String(content);
    return element;
  };
  function readRequests() {
    const names = new Map();
    for (const slot of slots) {
      const name = slot.dataset.hfQuery;
      const params = names.get(name) ?? Object.create(null);
      for (const [key, selector] of Object.entries(json(slot.dataset.hfParams, {}))) {
        if (typeof selector !== 'string') continue;
        try {
          const field = document.querySelector(selector);
          if (!field?.matches('input, select, textarea') || field.value === '') continue;
          params[key] = field.type === 'number' || field.type === 'range' ? Number(field.value) : field.value;
        } catch {
          // Other declared fields remain usable when one selector is invalid.
        }
      }
      const days = Number(slot.dataset.hfWindowDays);
      if (Number.isInteger(days) && days > 0 && days <= 400) {
        const now = Date.now();
        params['start-ms'] = now - days * 86400000;
        params['end-ms'] = now;
      }
      names.set(name, params);
    }
    port.port1.postMessage({ type: 'read', requests: Array.from(names, ([name, params]) => ({ name, params })) });
  }

  const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' });
  const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Shanghai' });
  const display = (field, value) => typeof value === 'number' && /(?:^|\.)(?:date_ms|time_ms|timestamp_ms|period_end_ms|report_date_ms)$/.test(field) && Number.isFinite(new Date(value).getTime())
    ? date.format(new Date(value)) : value;

  function table(slot, rows) {
    const defaults = Object.keys(rows[0]).slice(0, 16).map((key) => [key, key]);
    const columns = Object.entries(json(slot.dataset.hfColumns, Object.fromEntries(defaults))).slice(0, 24);
    const scroll = make('div');
    scroll.className = 'hf-page-table';
    const grid = make('table');
    const header = grid.createTHead().insertRow();
    for (const [, label] of columns) header.append(make('th', label));
    const body = grid.createTBody();
    for (const row of rows.slice(0, 1000)) {
      const line = body.insertRow();
      for (const [field] of columns) line.append(make('td', display(field, pick(row, field)) ?? '—'));
    }
    scroll.append(grid);
    return scroll;
  }

  function chart(slot, rows, observers) {
    const container = make('figure');
    container.style.margin = '0';
    const x = slot.dataset.hfX;
    const y = slot.dataset.hfY;
    const dateAxis = slot.dataset.hfXType === 'date';
    const series = [];
    for (const [index, row] of rows.slice(0, 5000).entries()) {
      const label = pick(row, x);
      const value = pick(row, y);
      if (label == null || value == null || !Number.isFinite(Number(value))) continue;
      const position = dateAxis ? new Date(label).getTime() : index;
      if (Number.isFinite(position)) series.push({ label, position, value: Number(value) });
    }
    if (!series.length) return make('p', '本次查询无可绘制的数据。');
    if (dateAxis) series.sort((left, right) => left.position - right.position);
    const values = series.map(({ value }) => value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const start = series[0].position;
    const span = Math.max(1, series.at(-1).position - start);
    const canvas = make('canvas');
    canvas.className = 'hf-page-line';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', slot.dataset.hfLabel || '数据走势');
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const plot = canvas.getContext('2d');
      plot.scale(ratio, ratio);
      plot.font = '11px system-ui';
      plot.fillStyle = getComputedStyle(canvas).color;
      plot.strokeStyle = plot.fillStyle;
      const padding = 16;
      plot.globalAlpha = 0.2;
      for (let tick = 0; tick <= 3; tick++) {
        const gridY = padding + tick * (height - padding * 2) / 3;
        plot.beginPath();
        plot.moveTo(0, gridY);
        plot.lineTo(width, gridY);
        plot.stroke();
      }
      plot.globalAlpha = 1;
      plot.strokeStyle = getComputedStyle(canvas).getPropertyValue('--hf-chart-color').trim() || '#527cda';
      plot.lineWidth = 2;
      plot.beginPath();
      series.forEach(({ position, value }, index) => {
        const pointX = padding + (width - padding * 2) * (position - start) / span;
        const pointY = height - padding - (height - padding * 2) * (maximum === minimum ? 0.5 : (value - minimum) / (maximum - minimum));
        if (index) plot.lineTo(pointX, pointY);
        else plot.moveTo(pointX, pointY);
        if (values.length === 1) plot.lineTo(pointX + 2, pointY);
      });
      plot.stroke();
    };
    const observer = new ResizeObserver(draw);
    observers.push(observer);
    observer.observe(canvas);
    const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });
    const tick = ({ label, position }) => dateAxis ? date.format(new Date(position)) : display(x, label);
    const caption = `${tick(series[0])} – ${tick(series.at(-1))} · ${number.format(minimum)}–${number.format(maximum)}`;
    container.append(canvas, make('figcaption', caption));
    return container;
  }

  let observers = [];
  port.port1.onmessage = ({ data }) => {
    if (data.type === 'refresh') return readRequests();
    if (data.type !== 'results') return;
    for (const observer of observers) observer.disconnect();
    observers = [];
    for (const slot of slots) {
      const response = data.results[slot.dataset.hfQuery];
      const field = slot.dataset.hfField || 'data';
      const value = pick(response, field);
      const view = slot.dataset.hfView || 'json';
      let content;
      if (!response?.ok) content = make('p', response?.error?.message || '此数据查询不可用。');
      else if (value == null || (Array.isArray(value) && !value.length)) content = make('p', '本次查询无匹配数据。');
      else if (view === 'table' || view === 'line') {
        const rows = Array.isArray(value) ? value.filter((row) => row && typeof row === 'object') : [];
        if (!rows.length) content = make('p', '返回的数据与此视图绑定不匹配。');
        else content = view === 'table' ? table(slot, rows) : chart(slot, rows, observers);
      } else if (view === 'value') {
        const formatted = slot.dataset.hfFormat === 'datetime' && typeof value === 'number'
          ? (value > 0 && Number.isFinite(new Date(value).getTime()) ? dateTime.format(value) : '—')
          : value;
        content = make('span', formatted);
      } else content = make('pre', JSON.stringify(value, null, 2));
      slot.replaceChildren(content);
    }
  };
  document.addEventListener('submit', (event) => { event.preventDefault(); readRequests(); });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-hf-refresh]')) {
      event.preventDefault();
      readRequests();
    }
  });
  window.addEventListener('pagehide', () => {
    port.port1.close();
    for (const observer of observers) observer.disconnect();
  }, { once: true });
  port.port1.start();
  parent.postMessage({ type: channel, token }, '*', [port.port2]);
}
