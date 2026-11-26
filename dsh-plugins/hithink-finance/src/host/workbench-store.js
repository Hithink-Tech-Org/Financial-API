import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { FinanceError } from './cli.js';
import { pageQueries } from './workbench-data.js';
import { readJson, regularFile, writeAtomic, writeExclusive } from './workbench-files.js';
import { createStorageSettings } from './workbench-storage.js';
import { readSingleLinkText } from './workspace-file.js';

export const maxPageBytes = 1024 * 1024;
const maxSavedBlob = 6 * maxPageBytes + 64 * 1024;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const versionFile = /^(\d+)\.json$/;
const boardPrefix = 'dashboard-';
export const isPageId = (value) => typeof value === 'string' && idPattern.test(value);
export const isRevision = (value) => Number.isSafeInteger(value) && value >= 1;

export function pageError(code, message) {
  return new FinanceError(`FINANCE_WORKBENCH_${code}`, message);
}

export function pageContent(title, html) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 || /[\x00-\x1f\x7f]/.test(title)) {
    throw pageError('INVALID_TITLE', '页面标题应为 1 到 100 个字符的单行文本。');
  }
  if (typeof html !== 'string' || !html.trim() || html.includes('\0') || !/<(?:!doctype\s+html|[a-z][a-z0-9-]*(?:[\s/>]))/i.test(html)) {
    throw pageError('INVALID_HTML', '请输入非空的 UTF-8 HTML 页面或片段。');
  }
  if (Buffer.byteLength(html) > maxPageBytes) throw pageError('PAGE_TOO_LARGE', 'HTML 页面大小上限为 1 MiB。');
  if (
    /<(?:script|iframe|frame|embed|source|video|audio)\b[^>]*\b(?:src|srcset)\s*=|<link\b[^>]*\bhref\s*=|<base\b/iu.test(html)
  ) throw pageError('EXTERNAL_RESOURCE', '请把脚本、样式和其他资源内嵌到 HTML 中。');
  for (const [tag] of html.matchAll(/<img\b[^>]*>/giu)) {
    const source = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu.exec(tag);
    if (source && !/^data:image\//iu.test(source[1] ?? source[2] ?? source[3])) {
      throw pageError('EXTERNAL_RESOURCE', '页面图片须以 data URL 内嵌到 HTML 中。');
    }
    if (/\bsrcset\s*=/iu.test(tag)) throw pageError('EXTERNAL_RESOURCE', '单文件页面不支持外部图片列表。');
  }
  return { title: title.trim(), html, queries: pageQueries(html) };
}

function notFound() {
  return pageError('NOT_FOUND', '找不到此工作台页面。');
}

function conflict() {
  return pageError('CONFLICT', '页面已有新版本。请重新打开页面后再操作。');
}

function revisions(files) {
  return files.map((entry) => (entry.isFile() ? Number(versionFile.exec(entry.name)?.[1]) : NaN))
    .filter(isRevision).sort((a, b) => b - a);
}

async function statIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

async function isManagedDirectory(path) {
  const info = await statIfPresent(path);
  return info?.isDirectory() && await realpath(path) === path;
}

const htmlName = (revision, blob) => `revision-${revision}-${blob}.html`;

async function currentVersion(path, id, { includeHtml = false, legacy = false, signal } = {}) {
  if (!(await isManagedDirectory(path))) return null;
  // A newer atomic version can retire the file between readdir and readFile.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [revision] = revisions(await readdir(path, { withFileTypes: true }));
    if (revision === undefined) return null;
    try {
      const pointer = await regularFile(path, `${revision}.json`, 36);
      if (!pointer) throw new Error('Invalid page revision');
      const blob = await readFile(pointer, 'utf8');
      if (blob === '-') return { id, revision, deleted: true };
      if (!isPageId(blob)) throw new Error('Invalid page revision');
      const payload = await regularFile(path, `${blob}.page`, maxSavedBlob);
      if (!payload) continue;
      const value = JSON.parse(await readSingleLinkText(payload, path, signal, { maxBytes: maxSavedBlob }));
      if (value?.id !== id || value.revision !== revision) throw new Error('Invalid saved page');
      if (legacy || !includeHtml) return value;
      const document = await regularFile(path, htmlName(revision, blob), maxPageBytes);
      if (document) {
        const html = await readSingleLinkText(document, path, signal, { maxBytes: maxPageBytes, preserveBom: true });
        return { ...value, file: document, html };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const [latest] = revisions(await readdir(path, { withFileTypes: true }));
        if (latest === revision) throw error;
      }
    }
  }
  throw conflict();
}

async function publish(path, page, signal) {
  if (!(await isManagedDirectory(path))) throw notFound();
  const blob = randomUUID();
  const { html, revision, ...summary } = page;
  const filename = htmlName(revision, blob);
  const staged = [];
  try {
    if (!page.deleted) {
      const document = join(path, filename);
      await writeExclusive(document, html, signal);
      staged.push(document);
      const metadata = join(path, `${blob}.page`);
      await writeExclusive(metadata, JSON.stringify({ ...summary, revision }), signal);
      staged.push(metadata);
    }
    // The revision claim is immutable even after its previous document is retired.
    await writeAtomic(join(path, `${revision}.json`), page.deleted ? '-' : blob, { signal });
    return filename;
  } catch (error) {
    await Promise.allSettled(staged.map((file) => rm(file, { force: true })));
    if (error.code === 'EEXIST') throw conflict();
    throw error;
  }
}

async function retireVersion(path, revision) {
  const claim = await regularFile(path, `${revision}.json`, 36);
  const blob = claim && await readFile(claim, 'utf8');
  if (!isPageId(blob) || !(await isManagedDirectory(path))) return;
  await Promise.allSettled([
    rm(join(path, `${blob}.page`), { force: true }),
    rm(join(path, htmlName(revision, blob)), { force: true }),
  ]);
}

async function installPage(root, path, page, signal, skipExisting = false) {
  if (await statIfPresent(path)) {
    if (skipExisting) return;
    throw conflict();
  }
  const staging = await mkdtemp(join(root, '.dashboard-'));
  let installed = false;
  try {
    const filename = await publish(staging, page, signal);
    signal?.throwIfAborted();
    await rename(staging, path);
    installed = true;
    return filename;
  } catch (error) {
    if (!skipExisting || !(await statIfPresent(path))) throw error;
  } finally {
    if (!installed) {
      const files = await readdir(staging).catch(() => []);
      await Promise.allSettled(files.map((file) => rm(join(staging, file), { force: true })));
      await rmdir(staging).catch(() => {});
    }
  }
}

async function legacyMigration(profileDirectory, config) {
  if (typeof profileDirectory !== 'string' || !isAbsolute(profileDirectory)) return;
  const profile = await realpath(profileDirectory).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!profile) return;
  const legacy = join(profile, 'hithink-finance', 'workbench');
  if (!(await isManagedDirectory(legacy))) return;
  const key = `migration-${createHash('sha256').update(profile).digest('hex')}`;
  const complete = `${key}.done`;
  if (await regularFile(config, complete, 0)) return;
  return { legacy, complete, anchor: `${key}.json` };
}

async function migrateLegacy({ legacy, complete, anchor }, { config, directory }, signal) {
  // Pin retries and concurrent profile hosts to the same destination.
  await writeAtomic(join(config, anchor), JSON.stringify({ directory }), { signal }).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const filename = await regularFile(config, anchor, 16 * 1024);
  if (!filename) throw new Error('Invalid workbench migration record');
  const state = await readJson(filename, null);
  if (state?.directory !== directory) return;
  for (const entry of await readdir(legacy, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isPageId(entry.name)) continue;
    signal?.throwIfAborted();
    const page = await currentVersion(join(legacy, entry.name), entry.name, { legacy: true, signal });
    if (!page) continue;
    if (!page.deleted && (typeof page.html !== 'string' || Buffer.byteLength(page.html) > maxPageBytes)) {
      throw new Error('Invalid legacy page');
    }
    await installPage(directory, join(directory, `${boardPrefix}${entry.name}`), page, signal, true);
  }
  await writeAtomic(join(config, complete), '', { signal }).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
}

async function managedBoardIds(directory) {
  const ids = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(boardPrefix)) continue;
    const id = entry.name.slice(boardPrefix.length);
    if (isPageId(id)) ids.push(id);
  }
  return ids;
}

function boardPath(directory, id) {
  if (!isPageId(id)) throw notFound();
  return join(directory, `${boardPrefix}${id}`);
}

async function savedBoard(directory, id, signal) {
  const value = await currentVersion(boardPath(directory, id), id, { includeHtml: true, signal });
  if (!value || value.deleted) return value;
  const { file, ...page } = value;
  return page;
}

function migrationConflict(page) {
  return pageError('MIGRATION_CONFLICT', `目标目录已有「${page.title}」的其他版本或删除记录。请选择其他目录，或只切换目录。`);
}

function pageDigest(page) {
  return createHash('sha256').update(JSON.stringify(page)).digest('hex');
}

function migrationSourceChanged() {
  return pageError('MIGRATION_SOURCE_CHANGED', '原看板目录有变更，请重试迁移。');
}

async function migrateBoards(source, target, signal) {
  try {
    const plan = [];
    const snapshot = new Map();
    let skipped = 0;
    for (const id of await managedBoardIds(source)) {
      signal?.throwIfAborted();
      const page = await savedBoard(source, id, signal);
      if (!page || page.deleted) continue;
      snapshot.set(id, pageDigest(page));
      const path = boardPath(target, id);
      if (source === target) {
        skipped += 1;
      } else if (await statIfPresent(path)) {
        const existing = await savedBoard(target, id, signal);
        if (!isDeepStrictEqual(existing, page)) throw migrationConflict(page);
        skipped += 1;
      } else {
        plan.push(id);
      }
    }
    for (const id of plan) {
      signal?.throwIfAborted();
      const page = await savedBoard(source, id, signal);
      if (!page || page.deleted || pageDigest(page) !== snapshot.get(id)) throw migrationSourceChanged();
      const path = boardPath(target, id);
      if (await statIfPresent(path)) throw migrationConflict(page);
      await installPage(target, path, page, signal);
    }
    if (source !== target) {
      // Catch external file changes as well as guarding plugin writes with the storage lock.
      let unchanged = 0;
      for (const id of await managedBoardIds(source)) {
        signal?.throwIfAborted();
        const page = await savedBoard(source, id, signal);
        if (!page || page.deleted) continue;
        if (pageDigest(page) !== snapshot.get(id)) throw migrationSourceChanged();
        unchanged += 1;
      }
      if (unchanged !== snapshot.size) throw migrationSourceChanged();
    }
    return { copied: plan.length, skipped, count: snapshot.size };
  } catch (error) {
    if (error instanceof FinanceError) throw error;
    throw pageError('MIGRATION_FAILED', '看板迁移未完成。请检查目录或重试。已经复制的相同看板会在重试时跳过。');
  }
}

export function createPageStore({ profileDirectory, userHome = homedir(), validateBindings }) {
  const storage = createStorageSettings(userHome);

  async function location(signal, expectedDirectory, locked = false) {
    const state = await storage.location(expectedDirectory);
    const migration = await legacyMigration(profileDirectory, state.config);
    if (migration) {
      if (!locked) return storage.write(signal, () => location(signal, expectedDirectory, true));
      await migrateLegacy(migration, state, signal);
    }
    return state.directory;
  }

  function setStorage(input, signal) {
    return storage.set(input, signal, async (state, target) => {
      const migration = await legacyMigration(profileDirectory, state.config);
      if (migration) await migrateLegacy(migration, state, signal);
      return migrateBoards(state.directory, target, signal);
    });
  }

  async function requirePage(path, id, includeHtml, signal) {
    const page = await currentVersion(path, id, { includeHtml, signal });
    if (!page || page.deleted) throw notFound();
    return page;
  }

  async function get(id, signal, expectedDirectory) {
    if (!isPageId(id)) throw notFound();
    const directory = await location(signal, expectedDirectory);
    return { ...await requirePage(boardPath(directory, id), id, true, signal), directory };
  }

  async function list(signal) {
    const directory = await location(signal);
    const pages = [];
    for (const id of await managedBoardIds(directory)) {
      signal?.throwIfAborted();
      const page = await currentVersion(boardPath(directory, id), id, { signal });
      if (!page || page.deleted) continue;
      pages.push({ ...page, directory });
    }
    pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    return { directory, pages };
  }

  async function create({ title, html }, { templateId, expectedDirectory, signal } = {}) {
    const content = pageContent(title, html);
    await validateBindings(content.queries);
    const id = randomUUID();
    const now = new Date().toISOString();
    const page = { id, revision: 1, createdAt: now, updatedAt: now, ...content, ...(templateId ? { templateId } : {}) };
    return storage.write(signal, async () => {
      const directory = await location(signal, expectedDirectory, true);
      const path = boardPath(directory, id);
      const filename = await installPage(directory, path, page, signal);
      return { ...page, directory, file: join(path, filename) };
    });
  }

  async function mutate(input, remove, signal) {
    const { id, revision } = input;
    if (!isRevision(revision)) throw conflict();
    if (!isPageId(id)) throw notFound();
    return storage.write(signal, async () => {
      const directory = await location(signal, input.expectedDirectory, true);
      const path = boardPath(directory, id);
      const original = await requirePage(path, id, false, signal);
      if (revision !== original.revision) throw conflict();
      let updated = { id, revision: revision + 1, deleted: true };
      if (!remove) {
        const content = pageContent(input.title, input.html);
        await validateBindings(content.queries);
        updated = { ...original, ...content, revision: revision + 1, updatedAt: new Date().toISOString() };
      }
      const filename = await publish(path, updated, signal);
      await retireVersion(path, revision).catch(() => {});
      return remove ? { id } : { ...updated, directory, file: join(path, filename) };
    });
  }

  return { list, get, create, settings: storage.get, setStorage,
    update: (input, signal) => mutate(input, false, signal),
    remove(input, signal) {
      if (input.confirm !== true) throw pageError('CONFIRM_REQUIRED', '请确认删除此页面。');
      return mutate(input, true, signal);
    },
  };
}
