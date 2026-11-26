import { createElement as h, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { QUICK_START_PROMPT, QUICK_START_TITLE } from '../shared/quick-start.js';
import { Account, FinancePanelIcon } from './account.js';
import { DataSettings } from './data-settings.js';
import { OfficialLiveBoard } from './official-live-board.js';
import { acceptsFramePort, buildInteractiveDocument, buildOfficialSample, buildPageDocument } from './workbench-frame.js';

const docsUrl = 'https://fuyao.aicubes.cn/docs/';
const gallery = { view: 'templates' };
const pages = { view: 'pages' };
const galleryTitle = '案例游廊';
const caseLabels = { sample: '静态样例', live: '动态看板' };
const noConnection = '无法连接金融数据工作台。';
const pathIcon = {
  templates: 'M3 3h5v5H3z M12 3h5v5h-5z M3 12h5v5H3z M12 12h5v5h-5z',
  pages: 'M5 3h7l3 3v11H5z M12 3v4h4 M8 11h5 M8 14h5',
  settings: 'M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-5 1v4',
  docs: 'M10 5a8 8 0 0 0-7-2v12a8 8 0 0 1 7 2 8 8 0 0 1 7-2V3a8 8 0 0 0-7 2v12',
  side: 'M3 4h14v12H3z M12 4v12',
  main: 'M3 4h14v12H3z M3 7h14',
  add: 'M10 4v12 M4 10h12',
  back: 'M12 5l-5 5 5 5 M7 10h10',
  next: 'M8 5l5 5-5 5 M3 10h10',
  refresh: 'M16 8a6 6 0 1 0 0 5 M16 4v4h-4',
  search: 'M13 13l4 4 M14 8.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z',
  reference: 'M4 4h12v10h-8l-4 3v-13Z M7 8h6 M7 11h4',
  chevron: 'm7 5 5 5-5 5',
  guide: 'M10 3v14 M4 7l6-4 6 4 M4 13l6 4 6-4',
  notice: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z M10 7v.1 M10 10v3',
};

function Icon({ name }) {
  return h('svg', { width: 17, height: 17, viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': true },
    h('path', { d: pathIcon[name], stroke: 'currentColor', strokeWidth: 1.45, strokeLinecap: 'round', strokeLinejoin: 'round' }));
}

function Button({ icon, primary, danger, children, ...props }) {
  return h('button', { type: 'button', className: `hf-wb-button${primary ? ' hf-wb-primary' : ''}${danger ? ' hf-wb-danger' : ''}`, ...props },
    icon && h(Icon, { name: icon }), children);
}

function officialUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://fuyao.aicubes.cn' && url.pathname.startsWith('/best-practices/') ? url.href : null;
  } catch {
    return null;
  }
}

function useLoad(load, key, refreshOn, revision, sameData) {
  const [state, setState] = useState({});
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (refreshOn === false) return;
    let active = true;
    setState((current) => current.key === key ? { ...current, loading: true, error: undefined } : { key, loading: true });
    Promise.resolve().then(() => key == null ? load() : load(key)).then(
      (result) => {
        if (!active) return;
        if (!result?.ok) {
          setState({ key, error: result?.error?.message ?? noConnection });
          return;
        }
        setState((current) => ({ key, data: current.key === key && sameData?.(current.data, result.data) ? current.data : result.data }));
      },
      () => { if (active) setState({ key, error: noConnection }); },
    );
    return () => { active = false; };
  }, [attempt, key, load, refreshOn, revision, sameData]);
  return { ...(state.key === key ? state : { loading: true }), retry };
}

function LoadState({ state, label, preview }) {
  if (state.error) return h('div', { className: 'hf-wb-empty hf-wb-feedback hf-wb-feedback-error', role: 'alert' },
    h(Icon, { name: 'notice' }), h('strong', null, state.error), h(Button, { onClick: state.retry }, '重试'));
  return h('div', { className: 'hf-wb-loading', role: 'status' },
    h('p', null, label),
    preview && h('div', { className: 'hf-wb-placeholder', 'data-preview': preview, 'aria-hidden': true },
      [0, 1, 2].map((index) => h('span', { key: index }))));
}

function useRefreshOnFocus(isVisible, refresh) {
  useEffect(() => {
    if (!isVisible) return;
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [isVisible, refresh]);
}

function SearchField({ label, value, onChange }) {
  return h('label', { className: 'hf-wb-search' }, h(Icon, { name: 'search' }),
    h('input', { type: 'search', 'aria-label': label, placeholder: label, value,
      onChange: (event) => onChange(event.target.value) }));
}

function useSavedPage(workbench, id, directory, isVisible, revision, sameData) {
  const input = useMemo(() => directory ? { id, expectedDirectory: directory } : id, [directory, id]);
  return useLoad(workbench.get, input, isVisible, revision, sameData);
}

function TemplateArt({ item }) {
  const image = officialUrl(item.imageUrl);
  return h('span', { className: 'hf-wb-art' },
    image ? h('img', { alt: '', src: image, loading: 'lazy', decoding: 'async', referrerPolicy: 'no-referrer',
      onError: (event) => { event.currentTarget.hidden = true; } }) : null,
    h('span', { className: 'hf-wb-art-fallback', 'aria-hidden': true }, h(Icon, { name: 'templates' }), item.category),
  );
}

function CreateCase({ item, createCase, creating, disabled }) {
  const { prompt } = item;
  if (!prompt) return null;
  return h(Button, { icon: 'add', primary: true, disabled: disabled || Boolean(creating),
    onClick: () => createCase(item.id, prompt) }, creating === item.id ? '正在打开对话…' : '我也要做一个');
}

function TemplateList({ workbench, navigate, createCase, creating, createError, filters, setFilters }) {
  const state = useLoad(workbench.templateList, null);
  const { category, keyword } = filters;
  const rows = state.data ?? [];
  const categories = [...new Set(rows.map((item) => item.category).filter(Boolean))];
  const needle = keyword.trim().toLocaleLowerCase('zh-CN');
  const matches = rows.filter((item) => (!category || item.category === category)
    && (!needle || [item.title, item.category, item.description ?? item.summary].some((value) => value?.toLocaleLowerCase('zh-CN').includes(needle))));
  return h('div', { className: 'hf-wb-content' },
    h('header', { className: 'hf-wb-intro' },
      h('div', null, h('h1', null, galleryTitle), h('p', null, '浏览可刷新的动态看板和静态样例，用案例提示词做自己的看板。'))),
    createError && h('p', { role: 'alert', className: 'hf-wb-error' }, createError),
    state.loading || state.error ? h(LoadState, { state, label: '正在加载案例…', preview: 'gallery' })
      : h('div', { className: 'hf-wb-library' },
        h('div', { className: 'hf-wb-filters' },
          h('div', { className: 'hf-wb-categories', role: 'group', 'aria-label': '按场景浏览' },
            ['', ...categories].map((name) => h('button', {
              key: name, type: 'button', 'aria-pressed': name === category, onClick: () => setFilters({ ...filters, category: name }),
            }, name || '全部场景'))),
          h(SearchField, { label: '搜索案例', value: keyword, onChange: (value) => setFilters({ ...filters, keyword: value }) })),
        h('p', { className: 'hf-wb-count', role: 'status' }, `${matches.length} 个案例`),
        matches.length ? h('div', { className: 'hf-wb-gallery' },
          matches.map((item) => h('article', { key: item.id, className: 'hf-wb-template' },
            h('button', { type: 'button', className: 'hf-wb-card-button', onClick: () => navigate({ view: 'template', id: item.id }) },
              h(TemplateArt, { item }),
              h('span', { className: 'hf-wb-card-text' },
                h('span', { className: 'hf-wb-card-category' }, item.category,
                  h('span', { className: 'hf-wb-data-label' }, caseLabels[item.dataMode])),
                h('strong', { title: item.title }, item.title),
                h('span', { className: 'hf-wb-card-description' }, item.description ?? item.summary))),
            h('div', { className: 'hf-wb-card-actions' }, h(CreateCase, { item, createCase, creating }))))) :
          h('div', { className: 'hf-wb-empty' }, '没有匹配的案例。',
            h(Button, { onClick: () => setFilters({ category: '', keyword: '' }) }, '清除筛选')),
      ));
}

function formatDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function QuickStart({ navigate, createCase, creating, empty }) {
  const start = () => createCase('quick-start', QUICK_START_PROMPT);
  return h('details', { className: 'hf-wb-quick-start', open: empty },
    h('summary', null, h(Icon, { name: 'guide' }), h('span', null, '快速开始'), h(Icon, { name: 'chevron' })),
    h('div', { className: 'hf-wb-quick-body' },
      h('h2', null, `做一个「${QUICK_START_TITLE}」`),
      h('ol', null,
        h('li', null, '首次使用时，到', h('button', { type: 'button', className: 'hf-wb-inline',
          onClick: () => navigate({ view: 'settings' }) }, '设置'), '连接金融数据账号。'),
        h('li', null, '打开下方示例，在对话中发送问题，查询两只股票的最新行情。'),
        h('li', null, '助手会制作可刷新的看板并保存。'),
        h('li', null, '回到「工作台」，从「我的看板」再次打开。')),
      h(Button, { icon: 'next', primary: true, disabled: Boolean(creating), onClick: start },
        creating === 'quick-start' ? '正在打开对话…' : '跟着做第一个看板')));
}

function ReferenceButton({ item, referenceBoard, referenceAction }) {
  return h(Button, { icon: 'reference', primary: true, disabled: Boolean(referenceAction.pending || referenceAction.blocked),
    onClick: () => referenceBoard(item) }, referenceAction.pending === item.id ? '正在引用…' : '让 Agent 修改');
}

function ReferenceFeedback({ action }) {
  return action.error ? h('div', { className: 'hf-wb-feedback hf-wb-feedback-error', role: 'alert' },
    h(Icon, { name: 'notice' }), h('p', null, action.error))
    : action.title && h('div', { className: 'hf-wb-feedback', role: 'status' }, h(Icon, { name: 'reference' }),
      h('p', null, `已在对话中引用「${action.title}」。可以补充修改要求。`));
}

function MyPages({
  workbench, navigate, isVisible, createCase, creating, createError, keyword, setKeyword, libraryRevision, onBoardChange,
  referenceBoard, referenceAction,
}) {
  const state = useLoad(workbench.list, null, isVisible, libraryRevision);
  useRefreshOnFocus(isVisible, state.retry);
  const [confirm, setConfirm] = useState(null);
  const rows = state.data ?? [];
  const needle = keyword.trim().toLocaleLowerCase('zh-CN');
  const matches = rows.filter((item) => item.title.toLocaleLowerCase('zh-CN').includes(needle));
  const empty = Boolean(state.data && !rows.length);
  return h('div', { className: 'hf-wb-content hf-wb-own-boards' },
    h('header', { className: 'hf-wb-intro' },
      h('div', null, h('h1', null, '我的看板'), h('p', null, '打开你在对话中制作或从案例游廊保存的看板。'))),
    createError && h('p', { role: 'alert', className: 'hf-wb-error' }, createError),
    h(ReferenceFeedback, { action: referenceAction }),
    h(QuickStart, { empty, navigate, createCase, creating }),
    h('div', { className: 'hf-wb-pages-filter' },
      h(SearchField, { label: '搜索我的看板', value: keyword, onChange: setKeyword }),
      h(Button, { icon: 'refresh', onClick: state.retry, disabled: state.loading }, '刷新列表')),
    (state.loading && !state.data) || state.error ? h(LoadState, { state, label: '正在读取看板…', preview: 'list' })
      : matches.length ? h('ul', { className: 'hf-wb-pages' }, matches.map((item) =>
        h('li', { key: item.id },
          h('button', { type: 'button', className: 'hf-wb-page-link',
            onClick: () => navigate({ view: 'page', id: item.id, directory: item.directory }) },
            h('span', { className: 'hf-wb-page-glyph' }, h(Icon, { name: 'pages' })),
            h('span', { className: 'hf-wb-page-info' },
              h('strong', { title: item.title }, item.title), h('span', null, item.queries?.length ? '动态看板' : '静态看板',
                item.updatedAt && ` · 更新于 ${formatDate(item.updatedAt)}`))),
          h('div', { className: 'hf-wb-actions' },
            h(ReferenceButton, { item, referenceBoard, referenceAction }),
            h(Button, { onClick: () => navigate({ view: 'edit', id: item.id, directory: item.directory }),
              'aria-label': `编辑 ${item.title}` }, '编辑'),
            h(Button, { danger: true, onClick: () => setConfirm(item), 'aria-label': `删除 ${item.title}` }, '删除')))))
        : h('div', { className: 'hf-wb-empty hf-wb-empty-pages' },
          h('strong', null, empty ? '还没有保存的看板' : '没有匹配的看板'),
          empty ? h(Button, { onClick: () => navigate(gallery) }, '浏览案例')
            : h(Button, { onClick: () => setKeyword('') }, '清除搜索')),
    confirm && h(DeletePage, { workbench, item: confirm, dismiss: () => setConfirm(null),
      onDelete: () => { setConfirm(null); onBoardChange(); } }));
}

function PageFrame({ page, workbench, isVisible }) {
  const frame = useRef(null);
  const port = useRef(null);
  const [state, setState] = useState({ label: '' });
  const [interactive, setInteractive] = useState(false);
  const visible = useRef(isVisible);
  const requestedOnce = useRef(false);
  const loadedInteractive = useRef(false);
  visible.current = isVisible;
  const queries = page.queries ?? [];
  const dynamic = Boolean(queries.length);
  const { token, srcDoc, scriptsRemoved } = useMemo(() => {
    const token = dynamic ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(18)), (value) => value.toString(16).padStart(2, '0')).join('') : '';
    return { token, ...buildPageDocument(page.html, token) };
  }, [dynamic, page.html]);
  const supportsInteractive = !dynamic && scriptsRemoved > 0;
  const interactiveDocument = useMemo(() => supportsInteractive && interactive ? buildInteractiveDocument(page.html) : null,
    [supportsInteractive, interactive, page.html]);
  const turnOnInteractive = () => {
    loadedInteractive.current = false;
    setInteractive((value) => !value);
  };
  const refresh = () => port.current?.postMessage({ type: 'refresh' });
  useLayoutEffect(() => {
    if (!dynamic) return;
    let operation = 0;
    let active = true;
    let pending = Promise.resolve();
    const loading = setTimeout(() => {
      if (!port.current) setState({ label: '未找到数据绑定。请检查 HTML 中的 data-hf-query。', failed: true });
    }, 2500);
    const declared = new Map(queries.map(({ name, inputs }) => [name, new Set(inputs ?? [])]));
    const receive = (event) => {
      if (port.current || !acceptsFramePort(event, frame.current?.contentWindow, token)) return;
      clearTimeout(loading);
      const connection = event.ports[0];
      port.current = connection;
      connection.onmessage = ({ data }) => {
        if (!visible.current || data?.type !== 'read' || !Array.isArray(data.requests)) return;
        requestedOnce.current = true;
        const run = ++operation;
        const current = () => active && run === operation;
        setState({ label: '正在刷新数据…', busy: true });
        const requested = new Map();
        for (const request of data.requests) {
          const { name, params } = request ?? {};
          if (typeof name !== 'string' || requested.has(name)) continue;
          requested.set(name, params);
        }
        pending = pending.then(async () => {
          const requests = [...requested];
          const results = [];
          const batchSize = 3;
          for (let offset = 0; offset < requests.length; offset += batchSize) {
            if (!current()) return;
            const batch = await Promise.all(requests.slice(offset, offset + batchSize).map(async ([name, params]) => {
              const inputNames = declared.get(name);
              if (!inputNames) return [name, { ok: false, error: { message: `未声明数据查询「${name}」。` } }];
              const allowed = Object.fromEntries(Object.entries(params ?? {}).filter(([key]) => inputNames.has(key)));
              try {
                return [name, await workbench.query({
                  pageId: page.id, revision: page.revision, expectedDirectory: page.directory, name, params: allowed,
                })];
              } catch {
                return [name, { ok: false, error: { message: noConnection } }];
              }
            }));
            results.push(...batch);
          }
          if (!current()) return;
          const failures = results.filter(([, result]) => !result?.ok);
          const success = results.find(([, result]) => result?.ok)?.[1];
          setState({
            label: failures.length ? failures[0][1]?.error?.message ?? '有数据未能刷新。'
              : success ? `已更新 · ${formatDate(success.meta?.fetchedAt ?? Date.now())}` : '页面未声明数据查询。',
            failed: Boolean(failures.length),
          });
          connection.postMessage({ type: 'results', results: Object.fromEntries(results) });
        }).catch(() => {
          if (current()) setState({ label: noConnection, failed: true });
        });
      };
      if (visible.current) refresh();
    };
    window.addEventListener('message', receive);
    return () => {
      active = false;
      clearTimeout(loading);
      window.removeEventListener('message', receive);
      port.current?.close();
      port.current = null;
    };
  }, [dynamic, page.id, page.revision, queries, token, workbench]);
  useEffect(() => {
    if (isVisible && port.current && !requestedOnce.current) refresh();
  }, [isVisible]);
  return h('div', { className: 'hf-wb-run' },
    (dynamic || scriptsRemoved > 0) && h('div', { className: 'hf-wb-runbar' },
      h('div', null,
        dynamic && h('p', { role: state.failed ? 'alert' : 'status', className: state.failed ? 'hf-wb-error' : 'hf-wb-quiet' },
          state.label || '正在连接页面…'),
        scriptsRemoved > 0 && h('p', { className: 'hf-wb-quiet' }, dynamic
          ? '金融数据页使用声明式绑定运行。自定义脚本已暂停。'
            : interactive ? '内联脚本已开启。此预览未连接金融数据服务。'
            : '当前为静态预览。可选择在隔离环境中运行 HTML 内联脚本。')),
      dynamic && h(Button, { icon: 'refresh', disabled: state.busy || !port.current, onClick: refresh }, '刷新数据'),
      supportsInteractive && h(Button, { 'aria-pressed': interactive, onClick: turnOnInteractive }, interactive ? '返回静态预览' : '运行内联脚本')),
    h('iframe', {
      key: interactiveDocument ? 'interactive' : 'declarative', ref: frame, title: page.title, className: 'hf-wb-frame',
      sandbox: 'allow-scripts', referrerPolicy: 'no-referrer', credentialless: '',
      srcDoc: interactiveDocument ?? srcDoc,
      onLoad: interactiveDocument ? () => {
        if (loadedInteractive.current) setInteractive(false);
        loadedInteractive.current = true;
      } : undefined,
    }),
  );
}

function TemplateDetail({ workbench, id, navigate, isVisible, createCase, creating, createError, onBoardChange }) {
  const view = useLoad(workbench.templateGet, id);
  const [action, setAction] = useState({});
  const item = view.data;
  const sample = useMemo(() => item?.dataMode === 'sample' && item.trustedSample === true && item.sampleHtml
    ? buildOfficialSample(item.sampleHtml) : null, [item]);
  if (!item) return h('div', { className: 'hf-wb-content' },
    h(Button, { icon: 'back', onClick: () => navigate(gallery) }, '返回案例游廊'),
    h(LoadState, { state: view, label: '正在打开案例…' }));
  const { prompt } = item;
  async function apply() {
    setAction({ busy: true });
    try {
      const result = await workbench.applyTemplate({ id: item.id });
      if (result?.ok) {
        onBoardChange(result.data);
        navigate({ view: 'page', id: result.data.id, directory: result.data.directory });
      } else setAction({ error: result?.error?.message ?? noConnection });
    } catch {
      setAction({ error: noConnection });
    }
  }
  return h('div', { className: 'hf-wb-detail' },
    h('div', { className: 'hf-wb-detail-head' },
      h('button', { type: 'button', className: 'hf-wb-back', onClick: () => navigate(gallery) }, h(Icon, { name: 'back' }), galleryTitle),
      h('div', { className: 'hf-wb-detail-title' },
        h('div', null,
          h('span', { className: 'hf-wb-card-category' }, h('span', { className: 'hf-wb-data-label' }, caseLabels[item.dataMode]),
            item.samplePeriod && ` · ${item.samplePeriod}`),
          h('h1', null, item.title), h('p', null, item.description ?? item.summary)),
        h('div', { className: 'hf-wb-actions' },
          item.applicable === true && h(Button, { disabled: action.busy || Boolean(creating), onClick: apply },
            action.busy ? '正在保存…' : '保存到我的看板'),
          h(CreateCase, { item, createCase, creating, disabled: action.busy }))),
      prompt && h('details', { className: 'hf-wb-prompt' },
        h('summary', null, '创作提示词'), h('pre', null, prompt)),
      (action.error || createError) && h('p', { role: 'alert', className: 'hf-wb-error' }, action.error ?? createError)),
    item.dataMode === 'live' ? h(OfficialLiveBoard, { item, workbench, isVisible,
      onOpenAccount: () => navigate({ view: 'settings' }), onOpenBoard: (boardId) => navigate({ view: 'template', id: boardId }) })
      : sample ? h('iframe', { title: `${item.title}静态样例`, className: 'hf-wb-frame', sandbox: 'allow-scripts',
        referrerPolicy: 'no-referrer', srcDoc: sample })
        : h('p', { className: 'hf-wb-empty', role: 'status' }, '静态样例暂不可用。'));
}

function DeletePage({ workbench, item, onDelete, dismiss }) {
  const dialog = useRef(null);
  const description = useId();
  const [action, setAction] = useState({});
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function remove() {
    setAction({ busy: true });
    try {
      const result = await workbench.deletePage({
        id: item.id, revision: item.revision, expectedDirectory: item.directory, confirm: true,
      });
      if (result?.ok) onDelete();
      else setAction({ error: result?.error?.message ?? noConnection });
    } catch {
      setAction({ error: noConnection });
    }
  }
  return h('dialog', { ref: dialog, className: 'hf-wb-dialog', 'aria-label': '删除看板', 'aria-describedby': description, onCancel: (event) => {
    if (action.busy) event.preventDefault();
    else dismiss();
  } },
    h('h2', null, '删除看板'), h('p', { id: description }, `确认删除「${item.title}」？删除后无法恢复。`),
    action.error && h('p', { role: 'alert', className: 'hf-wb-error' }, action.error),
    h('div', { className: 'hf-wb-actions' }, h(Button, { autoFocus: true, disabled: action.busy, onClick: dismiss }, '取消'),
      h(Button, { danger: true, disabled: action.busy, onClick: remove }, action.busy ? '正在删除…' : '确认删除')));
}

const samePageRevision = (previous, next) => previous?.revision === next?.revision && previous?.file === next?.file;

function SavedPage({ workbench, id, directory, navigate, isVisible, libraryRevision, onBoardChange, referenceBoard, referenceAction }) {
  const view = useSavedPage(workbench, id, directory, isVisible, libraryRevision, samePageRevision);
  useRefreshOnFocus(isVisible, view.retry);
  const [confirm, setConfirm] = useState(null);
  const item = view.data;
  const sample = useMemo(() => item?.trustedSample === true ? buildOfficialSample(item.sampleHtml ?? item.html) : null, [item]);
  return h('div', { className: 'hf-wb-detail' },
    h('header', { className: 'hf-wb-detail-head' },
      h('button', { type: 'button', className: 'hf-wb-back', onClick: () => navigate(pages) }, h(Icon, { name: 'back' }), '我的看板'),
      item && h('div', { className: 'hf-wb-detail-title' },
        h('div', null, h('h1', null, item.title), item.updatedAt && h('p', null, `更新于 ${formatDate(item.updatedAt)}`)),
        h('div', { className: 'hf-wb-actions' },
          h(ReferenceButton, { item, referenceBoard, referenceAction }),
          h(Button, { onClick: () => navigate({ view: 'edit', id, directory: item.directory }) }, '编辑看板'),
          h(Button, { onClick: () => setConfirm(item), danger: true }, '删除'))),
      h(ReferenceFeedback, { action: referenceAction })),
    sample ? h('iframe', { title: item.title, className: 'hf-wb-frame', sandbox: 'allow-scripts',
      referrerPolicy: 'no-referrer', srcDoc: sample })
      : item ? h(PageFrame, { key: item.file ?? item.revision, page: item, workbench, isVisible })
        : h(LoadState, { state: view, label: '正在打开看板…' }),
    confirm && h(DeletePage, { workbench, item: confirm, onDelete: () => { onBoardChange(); navigate(pages); },
      dismiss: () => setConfirm(null) }));
}

export function createPageDrafts() {
  const values = new Map();
  const listeners = new Set();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (key) => values.get(key),
    set(key, value) {
      if (value) values.set(key, value);
      else values.delete(key);
      for (const listener of listeners) listener();
    },
  };
}

function PageForm({ item, workbench, navigate, drafts, onBoardChange, onEditSaved }) {
  const { id, directory } = item;
  const key = JSON.stringify([directory, id]);
  const initial = useMemo(() => ({ title: item.title, html: item.html, revision: item.revision }), [item]);
  const { title, html, revision } = useSyncExternalStore(drafts.subscribe, () => drafts.get(key) ?? initial);
  const update = (fields) => drafts.set(key, { ...(drafts.get(key) ?? initial), ...fields });
  const [action, setAction] = useState({});
  const back = () => navigate({ view: 'page', id, directory });
  const discard = () => {
    drafts.set(key, null);
    back();
  };
  async function save(event) {
    event.preventDefault();
    if (action.busy || action.conflict) return;
    if (!title.trim() || !html.trim()) return setAction({ error: '请填写看板名称和 HTML 源码。' });
    if (new TextEncoder().encode(html).byteLength > 1024 * 1024) return setAction({ error: 'HTML 页面大小上限为 1 MiB。' });
    const snapshot = drafts.get(key);
    setAction({ busy: true });
    try {
      const result = await workbench.update({ id, revision, expectedDirectory: directory, title: title.trim(), html });
      if (result?.ok) {
        if (drafts.get(key) === snapshot) drafts.set(key, null);
        onBoardChange(result.data);
        onEditSaved({ view: 'page', id, directory });
      } else setAction({ error: result?.error?.message ?? noConnection, conflict: result?.error?.code === 'FINANCE_WORKBENCH_CONFLICT' });
    } catch {
      setAction({ error: noConnection });
    }
  }
  async function loadLatest() {
    const snapshot = drafts.get(key);
    setAction({ busy: true, conflict: true });
    try {
      const result = await workbench.get({ id, expectedDirectory: directory });
      if (result?.ok) {
        if (result.data.directory !== directory) {
          setAction({ error: '看板目录已切换。请切回原目录后继续编辑。', conflict: true });
          return;
        }
        if (drafts.get(key) !== snapshot) {
          setAction({ error: '草稿已在另一处更新。请重新检查版本冲突。', conflict: true });
          return;
        }
        const { title, html, revision } = result.data;
        drafts.set(key, { title, html, revision });
        setAction({});
      } else setAction({ error: result?.error?.message ?? noConnection, conflict: true });
    } catch {
      setAction({ error: noConnection, conflict: true });
    }
  }
  return h('div', { className: 'hf-wb-content' },
    h('button', { type: 'button', className: 'hf-wb-back', onClick: back }, h(Icon, { name: 'back' }), '返回看板'),
    h('header', { className: 'hf-wb-intro' }, h('h1', null, '编辑看板')),
    h('form', { className: 'hf-wb-form', onSubmit: save },
      h('label', { className: 'hf-wb-field' }, '看板名称',
        h('input', { value: title, maxLength: 100, required: true, disabled: action.busy,
          onChange: (event) => update({ title: event.target.value }) })),
      h('details', { className: 'hf-wb-prompt' },
        h('summary', null, '编辑 HTML 源码'),
        h('textarea', { 'aria-label': 'HTML 源码', className: 'hf-wb-source', value: html, rows: 11,
          disabled: action.busy, spellCheck: false, onChange: (event) => update({ html: event.target.value }) })),
      action.error && h('p', { role: 'alert', className: 'hf-wb-error' }, action.error),
      action.conflict && h('div', null,
        h('p', { className: 'hf-wb-quiet' }, '载入最新版本会替换当前草稿。'),
        h(Button, { onClick: loadLatest, disabled: action.busy }, '载入最新版本')),
      h('div', { className: 'hf-wb-actions' },
        h(Button, { type: 'submit', primary: true, disabled: action.busy || action.conflict }, action.busy ? '正在处理…' : '保存并打开'),
        h(Button, { onClick: discard, disabled: action.busy }, '放弃草稿'))));
}

function EditPage({ workbench, id, directory, navigate, drafts, onBoardChange, onEditSaved }) {
  const state = useSavedPage(workbench, id, directory);
  return state.data ? h(PageForm, { item: state.data, workbench, navigate, drafts, onBoardChange, onEditSaved })
    : h('div', { className: 'hf-wb-content' }, h(Button, { icon: 'back', onClick: () => navigate(pages) }, '我的看板'),
      h(LoadState, { state, label: '正在读取看板…' }));
}

function DirectorySettings({ workbench, isVisible, pickDirectory, onChange }) {
  const state = useLoad(workbench.storage, null, isVisible);
  const migrationHint = useId();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [previousDirectory, setPreviousDirectory] = useState(null);
  const [migrateExisting, setMigrateExisting] = useState(false);
  const [action, setAction] = useState({});
  useEffect(() => { if (state.data) setSaved(null); }, [state.data]);
  const data = saved ?? state.data;
  if (!data) return h(LoadState, { state, label: '正在读取看板目录…' });
  const input = draft ?? data.directory;
  const hasDefault = data.defaultDirectory !== data.directory;
  const canSwitchBack = Boolean(previousDirectory && previousDirectory !== data.directory);
  const hasPrevious = canSwitchBack && previousDirectory !== data.defaultDirectory;
  async function save(directory) {
    if (action.busy) return;
    setAction({ busy: migrateExisting ? '正在复制看板并切换目录…' : '正在切换目录…' });
    try {
      const result = await workbench.setStorage({ directory, expectedDirectory: data.directory, migrateExisting });
      if (!result?.ok) {
        setAction({ error: result?.error?.message ?? '无法保存看板目录，请重试。' });
        if (result?.error?.code === 'FINANCE_WORKBENCH_DIRECTORY_CHANGED') state.retry();
        return;
      }
      const settings = result.data;
      setSaved(settings);
      setDraft(null);
      setMigrateExisting(false);
      setAction({ success: settings });
      if (data.directory !== settings.directory) {
        setPreviousDirectory(settings.previousDirectory);
        onChange();
      }
    } catch {
      setAction({ error: '无法保存看板目录，请重试。' });
    }
  }
  async function choose() {
    setAction({ busy: '正在打开目录选择器…' });
    try {
      const directory = await pickDirectory();
      if (directory) setDraft(directory);
      setAction({});
    } catch {
      setAction({ error: '无法打开目录选择器。可以直接输入保存目录。' });
    }
  }
  return h('div', { className: 'hf-wb-storage' },
    h('dl', { className: 'hf-wb-directory' },
      h('dt', null, '当前目录'), h('dd', null, h('code', null, data.directory)),
      hasDefault && h('dt', null, previousDirectory === data.defaultDirectory ? '切换前（默认）' : '默认目录'),
      hasDefault && h('dd', null, h('code', null, data.defaultDirectory)),
      hasPrevious && h('dt', null, '切换前的目录'),
      hasPrevious && h('dd', null, h('code', null, previousDirectory))),
    h('p', { className: 'hf-wb-quiet' }, '工作台显示当前目录的看板。切回原目录即可再次打开其中的看板。'),
    h('form', { className: 'hf-wb-form', onSubmit: (event) => { event.preventDefault(); void save(input.trim()); } },
      h('label', { className: 'hf-wb-field' }, '保存目录',
        h('input', { type: 'text', value: input, spellCheck: false, required: true, disabled: action.busy,
          onChange: (event) => { setDraft(event.target.value); setAction({}); } })),
      h('div', { className: 'hf-wb-migration' },
        h('label', null, h('input', { type: 'checkbox', checked: migrateExisting, disabled: action.busy,
          'aria-describedby': migrationHint, onChange: (event) => { setMigrateExisting(event.target.checked); setAction({}); } }),
        '复制当前目录的看板到目标目录'),
        h('p', { id: migrationHint, className: 'hf-wb-quiet' }, '勾选后进行一次性复制。源目录和目标目录中已有的看板都会保留。')),
      h('div', { className: 'hf-wb-actions' },
        pickDirectory && h(Button, { disabled: action.busy, onClick: choose }, '选择目录'),
        h(Button, { type: 'submit', primary: true, disabled: action.busy || !input.trim() || input.trim() === data.directory }, '保存目录'),
        h(Button, { disabled: action.busy || (data.directory === data.defaultDirectory && input === data.directory),
          onClick: () => { void save(null); } }, '恢复默认'),
        canSwitchBack && h(Button, { disabled: action.busy, onClick: () => { void save(previousDirectory); } }, '切回上一目录'))),
    action.busy && h('p', { className: 'hf-wb-quiet', role: 'status' }, action.busy),
    action.success && h('div', { className: 'hf-wb-storage-result', role: 'status' },
      h('p', { className: 'hf-connected' }, `目录已保存。已复制 ${action.success.copied} 个看板，跳过 ${action.success.skipped} 个。`),
      h('p', { className: 'hf-wb-quiet' }, '后续看板将保存到 ', h('code', null, action.success.directory))),
    action.error && h('p', { className: 'hf-wb-error', role: 'alert' }, action.error));
}

function Settings({ account, workbench, localData, isVisible, pickDirectory, onStorageChange }) {
  return h('div', { className: 'hf-wb-content hf-wb-settings' },
    h('header', { className: 'hf-wb-intro' }, h('h1', null, '设置')),
    h('section', null,
      h('h2', null, '账号连接'),
      h(Account, { account, isVisible })),
    h('section', null,
      h('h2', null, '看板目录'),
      h(DirectorySettings, { workbench, isVisible, pickDirectory, onChange: onStorageChange })),
    h('section', { className: 'hf-wb-data-settings' },
      h('h2', null, '本地数据'),
      h(DataSettings, { localData, isVisible, Button })));
}

const destinations = [
  ['pages', '工作台', 'pages'],
  ['templates', galleryTitle, 'templates'],
  ['docs', '接口文档', 'docs'],
  ['settings', '设置', 'settings'],
];

function sectionOf(view) {
  if (view === 'edit' || view === 'page') return 'pages';
  if (view === 'template') return 'templates';
  if (view === 'account') return 'settings';
  return destinations.find(([name]) => name === view)?.[0] ?? 'pages';
}

const defaultRoutes = { pages, templates: gallery, docs: { view: 'docs' }, settings: { view: 'settings' } };
const views = { templates: TemplateList, pages: MyPages, template: TemplateDetail, edit: EditPage, page: SavedPage, settings: Settings };

export function FinanceWorkbench({
  route, navigationRevision, destination, account, workbench, localData, drafts, boards, move, openComposer, openReference,
  pickDirectory, dock, isVisible = true,
}) {
  const tabId = useId();
  const { library: libraryRevision, storage: storageRevision } = useSyncExternalStore(boards.subscribe, boards.getSnapshot);
  const initialStorageRevision = useRef(storageRevision);
  const lastDestination = useRef(null);
  const [active, setActive] = useState(() => sectionOf(route?.view));
  const [routes, setRoutes] = useState(() => route ? { ...defaultRoutes, [sectionOf(route.view)]: route } : defaultRoutes);
  const [visited, setVisited] = useState(() => new Set([sectionOf(route?.view)]));
  const [creation, setCreation] = useState({});
  const [referenceAction, setReferenceAction] = useState({});
  const [caseFilters, setCaseFilters] = useState({ category: '', keyword: '' });
  const [boardKeyword, setBoardKeyword] = useState('');
  function select(section) {
    setActive(section);
    setVisited((current) => current.has(section) ? current : new Set([...current, section]));
  }
  function navigate(target) {
    const section = sectionOf(target.view);
    setRoutes((current) => ({ ...current, [section]: target }));
    select(section);
  }
  useLayoutEffect(() => {
    if (route) navigate(route);
  }, [route, navigationRevision]);
  useLayoutEffect(() => {
    if (!destination || lastDestination.current === destination) return;
    lastDestination.current = destination;
    navigate(destination.route);
  }, [destination]);
  useLayoutEffect(() => {
    if (initialStorageRevision.current === storageRevision) return;
    initialStorageRevision.current = storageRevision;
    setRoutes((current) => ({ ...current, pages }));
  }, [storageRevision]);

  async function createCase(caseId, prompt) {
    if (creation.id || referenceAction.pending) return;
    setCreation({ id: caseId });
    try {
      await openComposer(prompt);
      setCreation({});
    } catch {
      setCreation({ error: '无法打开对话草稿。请检查 DSH 连接后重试。' });
    }
  }

  async function referenceBoard(board) {
    if (creation.id || referenceAction.pending) return;
    setReferenceAction({ pending: board.id });
    try {
      const opened = await openReference(board);
      setReferenceAction(opened ? { title: board.title } : {});
    } catch {
      setReferenceAction({ error: '无法在对话中引用此看板。请刷新工作台后重试。' });
    }
  }

  function tabKeys(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % destinations.length;
    else if (event.key === 'ArrowLeft') next = (index + destinations.length - 1) % destinations.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = destinations.length - 1;
    else return;
    event.preventDefault();
    const section = destinations[next][0];
    select(section);
    document.getElementById(tabId + '-' + section)?.focus();
  }

  const onStorageChange = () => boards.changed(undefined, true);
  return h('section', { className: 'hf-widget hf-wb', 'aria-label': '同花顺金融数据工作台' },
    h('header', { className: 'hf-wb-nav' },
      h('div', { className: 'hf-wb-nav-inner' },
        h('button', { type: 'button', className: 'hf-wb-brand', onClick: () => navigate(pages) },
          h(FinancePanelIcon, { size: 24 }), '同花顺金融数据'),
        h('div', { className: 'hf-wb-dock-actions' },
          h(Button, { icon: dock ? 'main' : 'side', onClick: () => move(routes[active]) }, dock ? '转到主工作区' : '在右侧打开')),
        h('nav', { role: 'tablist', 'aria-label': '金融数据入口' },
          destinations.map(([section, label, icon], index) => h('button', {
            key: section, type: 'button', role: 'tab', id: tabId + '-' + section, tabIndex: active === section ? 0 : -1,
            'aria-selected': active === section, 'aria-controls': tabId + '-' + section + '-panel',
            onClick: () => select(section), onKeyDown: (event) => tabKeys(event, index),
          }, h(Icon, { name: icon }), label))))),
    h('div', { className: 'hf-wb-panels' },
      destinations.map(([section]) => {
        const pageRoute = routes[section];
        const { view, id, directory } = pageRoute;
        const Node = views[view] ?? views[section];
        const selected = section === active;
        const docs = section === 'docs';
        const props = { id, directory, account, workbench, localData, drafts, libraryRevision, navigate, createCase,
          creating: creation.id ?? referenceAction.pending, createError: creation.error, referenceBoard,
          referenceAction: { ...referenceAction, blocked: Boolean(creation.id) },
          isVisible: isVisible && selected, pickDirectory, onStorageChange, onBoardChange: boards.changed,
          onEditSaved: (target) => setRoutes((current) => current.pages === pageRoute ? { ...current, pages: target } : current),
          filters: caseFilters, setFilters: setCaseFilters,
          keyword: boardKeyword, setKeyword: setBoardKeyword };
        return h('div', {
          key: section, role: 'tabpanel', id: tabId + '-' + section + '-panel', 'aria-labelledby': tabId + '-' + section,
          'aria-hidden': !selected || undefined, inert: !selected || undefined, hidden: !selected && !docs,
          className: 'hf-wb-body' + (docs ? ' hf-wb-docs' : ''),
        }, visited.has(section) && (docs
          ? h('iframe', { className: 'hf-docs-frame', src: docsUrl, title: '同花顺金融数据官方接口文档',
            referrerPolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-forms' })
          : h(Node, { ...props, key: JSON.stringify([view, id, directory]) })));
      })),
  );
}
