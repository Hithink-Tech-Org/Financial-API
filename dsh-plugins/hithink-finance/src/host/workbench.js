import { defineTool } from '@deepseek-ai/dsh-tools';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { cancelled, checkedEnvelope, FinanceError, publicError } from './cli.js';
import { officialCase } from './official-cases.js';
import { createSchemaValidator, invalidQuery, queryArguments, runPageQuery } from './workbench-data.js';
import { workbenchNamespace } from './workbench-remote.js';
import { createPageStore, isRevision, maxPageBytes, pageContent, pageError } from './workbench-store.js';
import { readWorkspaceText } from './workspace-file.js';

const maxConcurrentQueries = 6;
const maxConcurrentCases = 2;
const maxToolBoards = 50;
const maxToolHtmlChars = 8_000;

function requireDirectory(directory) {
  if (typeof directory !== 'string' || !directory) {
    throw pageError('DIRECTORY_REQUIRED', '请先查找或读取当前看板库中的看板，再传入回执中的 directory。');
  }
}

export function createWorkbench({ cli, profileDirectory, userHome, signal, templates = [],
  getTemplateHtml = () => undefined, getTemplateSample = () => undefined }) {
  const validateBinding = createSchemaValidator(cli, signal);
  const store = createPageStore({ profileDirectory, userHome,
    validateBindings: (bindings) => Promise.all(bindings.map((binding) => validateBinding(binding))) });
  const library = new Map(templates.map((item) => [`template:${item.id}`, item]));
  const inFlight = new Map();
  const pending = new Set();
  const activeCases = new Set();
  let checkingAccount;

  function handle(run, callSignal = signal) {
    const operation = (async () => {
      try {
        if (callSignal.aborted) throw cancelled();
        return { ok: true, ...await run() };
      } catch (error) {
        const safe = callSignal.aborted ? cancelled() : error instanceof FinanceError
          ? error : pageError('STORAGE_ERROR', '无法读取或保存工作台页面，请检查本机存储后重试。');
        return { ok: false, error: publicError(safe) };
      }
    })();
    pending.add(operation);
    return operation.finally(() => pending.delete(operation));
  }

  function templateItem(id) {
    const found = library.get(id);
    if (!found) throw pageError('TEMPLATE_NOT_FOUND', '找不到此工作台模板。');
    return found;
  }

  function templateSummary(id, item) {
    const { title, description, category, prompt, previewUrl, imageUrl, dataMode, samplePeriod, sourceUrl, route, applicable, requirement } = item;
    return Object.fromEntries(Object.entries({ id, title, description, category, prompt, previewUrl,
      imageUrl, dataMode, samplePeriod, sourceUrl, route, applicable, requirement }).filter(([, value]) => value !== undefined));
  }

  async function templateDocument(id) {
    const item = templateItem(id);
    const summary = templateSummary(id, item);
    if (item.applicable === false) return { ...summary, queries: [] };
    const html = await getTemplateHtml(item.id);
    if (html === undefined) return { ...summary, queries: [] };
    return { ...summary, ...pageContent(item.title, html) };
  }

  async function trustedCopy(page) {
    const template = library.get(page.templateId);
    if (!template) return page;
    const sample = await getTemplateSample(template.id);
    // Only the shipped bytes are allowed to run in the bundled-sample frame.
    return typeof sample === 'string' && page.html === sample ? { ...page, trustedSample: true } : page;
  }

  async function checkRemoteAccount() {
    checkingAccount ??= cli.run(['auth', 'status'], { signal, timeoutMs: 12_000 })
      .then((result) => {
        const { data } = checkedEnvelope(result, 'auth.status', [0, 3]);
        if (data?.connected !== true || result.exitCode !== 0) {
          throw new FinanceError('AUTH_LOGIN_REQUIRED', '请在金融数据账号页连接或重新连接账号。');
        }
      }).finally(() => { checkingAccount = undefined; });
    await checkingAccount;
  }

  async function query({ pageId, revision, name, params, source, expectedDirectory }) {
    const page = library.has(pageId) ? await templateDocument(pageId) : await store.get(pageId, signal, expectedDirectory);
    if (page.revision !== undefined && (!isRevision(revision) || revision !== page.revision)) {
      throw pageError('CONFLICT', '页面已更新，请重新打开后再刷新。');
    }
    const binding = page.queries.find((entry) => entry.name === name);
    if (!binding) throw invalidQuery('当前页面未声明此查询。');
    const request = queryArguments(binding, params, source);
    const key = JSON.stringify([pageId, page.revision, request.argv]);
    const active = inFlight.get(key);
    if (active) return active;
    if (inFlight.size >= maxConcurrentQueries) throw pageError('BUSY', '正在刷新其他数据，请稍后重试。');
    const operation = (async () => {
      await validateBinding(binding, request.params, []);
      if (request.source === 'remote' || !['market.history', 'market.adjustment-factors'].includes(binding.command)) {
        await checkRemoteAccount();
      }
      return runPageQuery(cli, binding, request, signal);
    })();
    inFlight.set(key, operation);
    try {
      return await operation;
    } finally {
      inFlight.delete(key);
    }
  }

  function liveCase(input, invocationSignal) {
    const callSignal = invocationSignal ? AbortSignal.any([signal, invocationSignal]) : signal;
    return handle(async () => {
      const load = officialCase(input);
      await checkRemoteAccount();
      if (callSignal.aborted) throw cancelled();
      if ([...activeCases].filter((item) => !item.signal.aborted).length >= maxConcurrentCases) {
        throw pageError('BUSY', '正在刷新其他官方案例，请稍后重试。');
      }
      const lease = { signal: callSignal };
      activeCases.add(lease);
      try {
        return { data: await load(cli, callSignal) };
      } finally {
        activeCases.delete(lease);
      }
    }, callSignal);
  }

  return {
    list: () => handle(async () => ({ data: (await store.list(signal)).pages })),
    get: (id, expectedDirectory) => handle(async () => ({ data: await trustedCopy(await store.get(id, signal, expectedDirectory)) })),
    create: (input) => handle(async () => ({ data: await store.create(input, { signal }) })),
    update: (input) => handle(async () => ({ data: await trustedCopy(await store.update(input, signal)) })),
    deletePage: (input) => handle(async () => ({ data: await store.remove(input, signal) })),
    storage: () => handle(async () => ({ data: await store.settings() })),
    setStorage: (input) => handle(async () => ({ data: await store.setStorage(input, signal) })),
    templateList: () => handle(() => ({ data: [...library].map(([id, item]) => templateSummary(id, item)) })),
    templateGet: (id) => handle(async () => {
      const page = await templateDocument(id);
      if (page.applicable === false) return { data: page };
      const sampleHtml = await getTemplateSample(templateItem(id).id);
      return { data: typeof sampleHtml === 'string' ? { ...page, sampleHtml, trustedSample: true } : page };
    }),
    applyTemplate: ({ id, title }) => handle(async () => {
      const page = await templateDocument(id);
      if (typeof page.html !== 'string' || page.applicable === false) {
        throw pageError('TEMPLATE_UNAVAILABLE', '此案例提供创作提示词，可用来生成自己的页面。');
      }
      return { data: await trustedCopy(await store.create({ title: title ?? page.title, html: page.html }, { templateId: id, signal })) };
    }),
    query: (input) => handle(() => query(input)),
    liveCase,
    importPage(input, exec, getWorkspacePolicy) {
      const callSignal = exec.signal ? AbortSignal.any([signal, exec.signal]) : signal;
      return handle(async () => {
        const action = input.action ?? 'save';
        if (action === 'list') {
          if (input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 100)) {
            throw pageError('INVALID_SEARCH', '请输入不超过 100 个字符的看板标题关键词。');
          }
          const search = input.search?.trim().toLowerCase();
          const { directory, pages } = await store.list(callSignal);
          const matches = pages.filter(({ title }) => !search || title.toLowerCase().includes(search));
          return { data: { directory, pages: matches.slice(0, maxToolBoards).map(({ id, title, revision, updatedAt }) =>
            ({ id, title, revision, updatedAt })), truncated: matches.length > maxToolBoards } };
        }
        if (action === 'get') {
          const offset = input.offset ?? 0;
          if (offset > 0) requireDirectory(input.expectedDirectory);
          const { id, title, revision, directory, file, html } = await store.get(input.id, callSignal, input.expectedDirectory);
          if ((offset !== 0 || input.revision !== undefined) && input.revision !== revision) {
            throw pageError('CONFLICT', '请使用当前看板版本读取 HTML。');
          }
          const splitsCharacter = (index) => /[\udc00-\udfff]/u.test(html[index] ?? '');
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > html.length || splitsCharacter(offset)) {
            throw pageError('INVALID_OFFSET', '请使用上一次读取返回的续读位置。');
          }
          let end = Math.min(offset + maxToolHtmlChars, html.length);
          if (splitsCharacter(end)) end -= 1;
          return { data: { id, title, revision, directory, file, html: html.slice(offset, end),
            ...(end < html.length ? { nextOffset: end } : {}) } };
        }
        if (action !== 'save') throw pageError('INVALID_ACTION', '请选择保存、查找或读取看板。');
        if ((input.id === undefined) !== (input.revision === undefined)) {
          throw pageError('INVALID_REVISION', '更新看板时请同时提供现有看板的 ID 和版本。');
        }
        if (input.id !== undefined) requireDirectory(input.expectedDirectory);
        const pathError = pageError('INVALID_FILE', '请提供当前会话工作区内可读取的 UTF-8 HTML 文件。');
        const html = await readWorkspaceText(input.file, exec.agent?.session, getWorkspacePolicy(exec), callSignal, {
          extensions: ['.html', '.htm'], maxBytes: maxPageBytes, pathError, readError: pathError,
          workspaceError: pageError('WORKSPACE_REQUIRED', '请在有工作区的会话中保存 HTML 看板。'),
          sizeError: pageError('PAGE_TOO_LARGE', 'HTML 页面大小上限为 1 MiB。'),
        });
        const page = input.id === undefined
          ? await store.create({ title: input.title, html }, { expectedDirectory: input.expectedDirectory, signal: callSignal })
          : await store.update({ id: input.id, revision: input.revision, expectedDirectory: input.expectedDirectory,
            title: input.title, html }, callSignal);
        const { id, title, revision, directory, file } = page;
        return { data: { id, title, revision, directory, file } };
      }, callSignal);
    },
    close: () => Promise.allSettled([...pending]),
  };
}

export function mountWorkbenchService(ctx, workbench) {
  ctx.plugin(class FinanceWorkbenchService extends TypertRemoteService {
    constructor(serviceCtx) {
      super(serviceCtx, workbenchNamespace);
    }

    list() { return workbench.list(); }
    get(reference) {
      return typeof reference === 'string' ? workbench.get(reference) : workbench.get(reference.id, reference.expectedDirectory);
    }
    update(input) { return workbench.update(input); }
    deletePage(input) { return workbench.deletePage(input); }
    storage() { return workbench.storage(); }
    setStorage(input) { return workbench.setStorage(input); }
    templateList() { return workbench.templateList(); }
    templateGet(id) { return workbench.templateGet(id); }
    applyTemplate(input) { return workbench.applyTemplate(input); }
    query(input) { return workbench.query(input); }
    async *liveCase(input, signal) {
      const result = await workbench.liveCase(input, signal);
      if (!signal?.aborted) yield result;
    }
  });
}

export function workbenchImportTool(workbench, getWorkspacePolicy) {
  return defineTool({
    name: 'hithink_finance_workbench_import',
    description: '将完成的金融数据看板保存到本机金融数据工作台。可在其他会话查找或读取当前看板库中已保存的作品，并沿用原 ID 保存新版。',
    parameters: {
      action: { type: 'string', description: 'save 保存（默认），list 按更新时间查找看板，get 读取指定看板的位置和一段 HTML。' },
      file: { type: 'string', description: '保存时必填。会话工作区内的 UTF-8 .html 或 .htm 文件，最大 1 MiB。' },
      title: { type: 'string', description: '保存时必填。看板在工作台中显示的标题。' },
      id: { type: 'string', description: '读取或更新已有看板时传入其 ID。' },
      revision: { type: 'integer', description: '读取引用看板时使用引用版本。更新或续读必填，沿用读取或保存回执中的版本。' },
      expectedDirectory: { type: 'string', description: '读取引用看板时使用引用目录。更新或续读必填，沿用引用或工具回执中的目录，核对当前看板库。' },
      search: { type: 'string', description: '查找时可选。按看板标题关键词筛选，最多返回 50 条。' },
      offset: { type: 'integer', description: '读取时可选。传入上次读取返回的 nextOffset 继续读取 HTML。' },
    },
    timeoutMs: 10_000,
    output: { schema: { type: 'json' }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    execute: (input, exec) => workbench.importPage(input, exec, getWorkspacePolicy),
  });
}
