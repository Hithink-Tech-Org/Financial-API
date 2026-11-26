import { renderBoard } from './app.js';
import { time } from './charts.js';
import { officialBoardChannel } from './frame.js';
import { officialBoardPages } from './pages.js';

const $ = (selector) => document.querySelector(selector);
const make = (tag, text, attributes = {}) => {
  const node = document.createElement(tag);
  node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};
const fields = {
  'fund-dca': [
    ['index', '比较指数', '000300.SH'], ['fund', '执行 ETF', '510300.SH'],
    ['base', '基础金额（元）', '1000', 'number'], ['frequency', '频率', 'monthly', { monthly: '每月', weekly: '每周' }],
    ['day', '计划执行日（每月 1–28 日）', '10', 'number'],
  ],
  'etf-compare': [
    ['index', '跟踪指数', '000300.SH'], ['funds', 'ETF 代码，逗号分隔（最多 6 只）', '510300.SH,510330.SH,159919.SZ', 'grow'],
  ],
  'auction-radar': [
    ['stocks', '自选股代码，逗号分隔（最多 20 只）', '600519.SH,300750.SZ,000858.SZ,601318.SH', 'grow'],
    ['stage', '数据阶段', 'live', { live: '实时', final: '终态' }],
  ],
  'limit-break': [['date', '交易日（选填）', '', 'date']],
  'hot-rank': [['date', '历史对照日期（选填）', '', 'date']],
  'dragon-anomaly': [
    ['board', '龙虎榜类型', 'all', { all: '全部', org: '机构榜', hot_money: '游资榜' }],
    ['date', '龙虎榜交易日（选填）', '', 'date'],
  ],
  'stock-sector-index': [
    ['stock', '个股', '600726.SH'], ['sector', '所属板块指数', '881105.TI'], ['index', '基准指数', '000300.SH'],
  ],
};
const fieldHelp = {
  'fund-dca': '比较指数用于走势对照。定投金额取决于 ETF 自身跟踪指数的估值。',
  'limit-break': '默认查询今天的池子和最近交易日梯队。',
  'hot-rank': '当前榜单按查询时点更新。',
  'dragon-anomaly': '日期只用于龙虎榜。盘中异动与快照按查询时点取得。',
};
const freshnessStatus = { ok: '已返回', partial: '部分可用', empty: '暂无数据', error: '查询失败', unavailable: '暂不可用' };
const statusLabels = { ok: '实时查询', partial: '部分数据可用', empty: '暂无数据' };
const dataDate = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' });

function mountForm(page, params, apply) {
  const form = make('form', '', { class: 'toolbar', 'data-query': '' });
  for (const [name, title, fallback, type] of fields[page]) {
    const id = `query-${name}`;
    const group = make('div', '', { class: type === 'grow' ? 'field grow' : 'field' });
    const control = make(typeof type === 'object' ? 'select' : 'input', '', { id, name });
    if (typeof type === 'object') {
      for (const [value, label] of Object.entries(type)) control.append(make('option', label, { value }));
    } else {
      control.type = ['number', 'date'].includes(type) ? type : 'text';
      if (name === 'base') {
        control.min = '1';
        control.step = '0.01';
      }
      if (name === 'day') {
        control.min = '1';
        control.max = '28';
      }
    }
    control.value = params[name] ?? fallback;
    group.append(make('label', title, { for: id }), control);
    form.append(group);
  }
  form.append(make('button', '应用', { class: 'primary', type: 'submit' }));
  if (fieldHelp[page]) form.append(make('span', fieldHelp[page], { class: 'helper' }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = Object.fromEntries([...new FormData(form)]
      .map(([name, value]) => [name, String(value).trim()]).filter(([, value]) => value));
    apply(next);
  });
  $('#query').replaceChildren(form);
}

function statusCard(title, description, warning = false) {
  const card = make('div', '', { class: 'state-card', role: warning ? 'alert' : 'status' });
  card.append(make('h2', title), make('p', description));
  return card;
}

function disposeCharts() {
  document.querySelectorAll('.chart').forEach((chart) => chart._dispose?.());
}

function renderDataStatus(data) {
  if (data.warnings?.length) {
    const notice = make('div', '', { class: 'board-warnings notice', role: 'status' });
    const list = make('ul', '');
    for (const warning of data.warnings) list.append(make('li', warning));
    notice.append(make('b', '数据提示'), list);
    $('#content').prepend(notice);
  }
  if (data.freshness?.length) {
    const details = make('details', '', { class: 'board-source notice' });
    const list = make('ul', '');
    for (const source of data.freshness) {
      const moment = source.updated_at ? `数据时间 ${dataDate.format(source.updated_at)}`
        : source.fetched_at ? `查询时间 ${time(source.fetched_at)}` : '';
      const status = freshnessStatus[source.status] ?? '暂不可用';
      list.append(make('li', [source.label, status, moment, source.message].filter(Boolean).join(' · ')));
    }
    details.append(make('summary', '各数据来源的查询状态'), list);
    $('#content').append(details);
  }
}

function refreshDelay(page) {
  const market = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const minutes = market.getHours() * 60 + market.getMinutes();
  const workingDay = market.getDay() > 0 && market.getDay() < 6;
  const trading = workingDay && ((minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes <= 900));
  if (page === 'auction-radar') return workingDay && minutes >= 555 && minutes <= 570 ? 15_000 : 300_000;
  if (page === 'fund-dca') return 21_600_000;
  if (!trading) return 1_800_000;
  return { 'stock-sector-index': 15_000, 'limit-break': 30_000 }[page] ?? 60_000;
}

export function startOfficialBoard({ token, params, withNavigation }) {
  const page = document.body.dataset.page;
  const content = $('#content');
  const mode = $('#mode');
  const updated = $('#updated');
  const refresh = $('#refresh');
  const nav = $('#nav');
  const countdown = $('#countdown');
  const auto = make('input', '', { type: 'checkbox' });
  const autoLabel = make('label', '自动刷新', { class: 'board-auto' });
  autoLabel.prepend(auto);
  countdown.replaceChildren(autoLabel);
  mode.setAttribute('role', 'status');
  const bridge = new MessageChannel();
  const send = (payload) => bridge.port1.postMessage(payload);
  let timer;
  let requestId = 0;
  let loading = false;
  let hasData = false;
  let active = true;
  let authNeeded = false;

  function schedule() {
    clearTimeout(timer);
    if (active && auto.checked && !loading && !authNeeded && !document.hidden) {
      timer = setTimeout(() => load(), refreshDelay(page));
    }
  }

  function load() {
    if (!active) return;
    clearTimeout(timer);
    authNeeded = false;
    loading = true;
    refresh.disabled = true;
    refresh.textContent = '加载中…';
    mode.textContent = hasData ? '正在更新' : '正在加载';
    mode.className = '';
    content.setAttribute('aria-busy', 'true');
    $('#load-error')?.remove();
    if (!hasData) content.replaceChildren(statusCard('正在加载看板', '正在查询金融数据。'));
    send({ type: 'load', id: ++requestId, params });
  }

  function loadError(error) {
    authNeeded = ['AUTH_LOGIN_REQUIRED', 'AUTH_EXPIRED', 'FUYAO_2001'].includes(error?.code);
    if (authNeeded) {
      disposeCharts();
      content.replaceChildren();
      hasData = false;
      updated.textContent = '';
    }
    const card = statusCard(
      authNeeded ? '连接金融数据账号' : hasData ? '更新失败，显示上次查询结果' : '暂时无法加载看板',
      error?.message ?? '请点击“刷新数据”重试。',
      true,
    );
    card.id = 'load-error';
    const action = make('button', authNeeded ? '打开账号' : '重试', {
      class: 'board-state-action primary', type: 'button',
    });
    action.addEventListener('click', () => authNeeded ? send({ type: 'account' }) : load());
    card.append(action);
    if (hasData) content.prepend(card);
    else content.replaceChildren(card);
    mode.textContent = authNeeded ? '待连接' : '查询失败';
    mode.className = 'failed';
  }

  nav.hidden = !withNavigation;
  if (withNavigation) {
    for (const [slug, , title] of officialBoardPages) {
      const button = make('button', title, { type: 'button' });
      if (slug === page) button.setAttribute('aria-current', 'page');
      else button.addEventListener('click', () => send({ type: 'navigate', page: slug }));
      nav.append(button);
    }
  }
  mountForm(page, params, (next) => {
    params = next;
    disposeCharts();
    hasData = false;
    updated.textContent = '';
    load();
  });
  refresh.addEventListener('click', () => load());
  auto.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', schedule);
  bridge.port1.onmessage = ({ data }) => {
    if (!active || data?.type !== 'result' || data.id !== requestId) return;
    try {
      if (!data.result?.ok) {
        loadError(data.result?.error);
      } else {
        const result = data.result.data;
        disposeCharts();
        renderBoard(page, result, params);
        renderDataStatus(result);
        hasData = true;
        mode.textContent = statusLabels[result.status] ?? '数据已更新';
        mode.className = result.status === 'ok' ? 'live' : '';
        updated.textContent = `查询时间 ${time(result.generated_at)}`;
      }
    } catch {
      disposeCharts();
      hasData = false;
      loadError({ message: '返回的数据暂时无法显示，请重试。' });
    } finally {
      loading = false;
      content.setAttribute('aria-busy', 'false');
      refresh.disabled = false;
      refresh.textContent = '刷新数据';
      schedule();
    }
  };
  const resize = new ResizeObserver(() => send({ type: 'height', height: document.body.getBoundingClientRect().height }));
  resize.observe(document.body);
  window.addEventListener('pagehide', () => {
    active = false;
    clearTimeout(timer);
    resize.disconnect();
    disposeCharts();
    bridge.port1.close();
  }, { once: true });
  parent.postMessage({ type: officialBoardChannel, token }, '*', [bridge.port2]);
  load();
}
