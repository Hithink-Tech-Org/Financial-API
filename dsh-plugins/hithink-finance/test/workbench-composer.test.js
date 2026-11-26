import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkbenchComposer } from '../src/client/workbench-composer.js';

const prompt = '请创作案例。\n\n注明数据时点。';
const board = { id: 'board-id', title: '行情 "收盘"', revision: 1, directory: 'D:/看板 库' };

function fixture({ draft = '', blank = true, native = false, attachments = [], waitForCreate,
  phase = 'plain', running = false, hasSession = true, occurrences = [], quotes = [] } = {}) {
  const writes = [];
  const focuses = [];
  const created = [];
  const released = [];
  const bindings = new Map();
  const rows = { original: { id: 'original', blank, running, retainedBy: hasSession ? { mainView: 1 } : {} } };
  function addBinding(id, initial, attachmentIds = [], editor = {}) {
    const state = { draft: initial, attachmentIds, phase: 'plain', draftRev: 1, occurrences: [], ...editor };
    const input = {
      state: { getSnapshot: () => state },
      setDraft: (text) => { writes.push([id, text]); state.draft = text; state.draftRev++; },
      focus: () => focuses.push(id),
      draftSnapshot: { quotes: editor.quotes ?? [] },
    };
    const ctx = { input, bail(context, event, { text, span }) {
      assert.equal(context, ctx);
      assert.equal(event, 'slash/input-insert-text');
      assert.equal(state.phase, 'plain');
      assert.equal(span.draftRev, state.draftRev);
      const atoms = [...state.occurrences, ...input.draftSnapshot.quotes];
      const textOffset = (offset) => atoms.sort((left, right) => left.offset - right.offset).reduce((index, atom) =>
        atom.offset < index ? index + atom.length - 1 : index, offset);
      const start = textOffset(span.start);
      const end = textOffset(span.end);
      input.setDraft(state.draft.slice(0, start) + text + state.draft.slice(end));
      return true;
    } };
    bindings.set(id, { ctx });
  }
  addBinding('original', draft, attachments, { phase, occurrences, quotes });
  let navigation = new AbortController();
  const layout = {
    beginNavigation() { navigation.abort(); navigation = new AbortController(); return navigation.signal; },
    selectPanel(panel) { assert.equal(panel, null); navigation.abort(); },
  };
  let selected = hasSession ? 'original' : undefined;
  const sessions = {
    binding: (id) => bindings.get(id),
    list: { getSnapshot: () => ({ byId: rows }) },
    async create(target) {
      created.push(target);
      const id = created.length === 1 ? 'new' : 'new-' + created.length;
      await waitForCreate;
      addBinding(id, '');
      rows[id] = { id, blank: true, retainedBy: {} };
      return id;
    },
    using(id, options, callback) { return callback(this.retain(id, options)); },
    retain(id) { return { sessionId: id, ready: Promise.resolve(bindings.get(id)), release: () => released.push(id) }; },
  };
  const input = { for: (ctx) => ctx.input };
  if (native) input.requestDraftInitialization = (binding, options) => {
    const composer = binding.ctx.input;
    const existing = composer.state.getSnapshot().draft;
    assert.ok(['keep', 'append'].includes(options.whenDraftExists));
    composer.setDraft(options.whenDraftExists === 'append' && existing ? existing + '\n\n' + options.prompt : options.prompt);
    return 'applied';
  };
  const composer = createWorkbenchComposer({ sessions, layout, conversation: { input }, workspaces: { list: {
    getSnapshot: () => ({ items: [{ workspaceId: 'workspace', sessionIds: ['original'] }] }),
  } }, uiWorkspace: {
    openSession(id) {
      if (selected) rows[selected].retainedBy = {};
      selected = id;
      rows[selected].retainedBy = { mainView: 1 };
      layout.selectPanel(null);
    },
  } });
  return { composer, writes, focuses, created, released, layout, selected: () => selected,
    input: (id = 'original') => bindings.get(id).ctx.input };
}

test('an empty native conversation takes the complete prompt and focuses once', async () => {
  const { composer, writes, created, focuses } = fixture();
  assert.equal(await composer.open(prompt), true);
  assert.deepEqual(writes, [['original', prompt]]);
  const intent = composer.focusFor('original');
  assert.equal(composer.focusFor('another'), null);
  composer.focus(intent);
  composer.focus(intent);
  assert.deepEqual(focuses, ['original']);
  assert.equal(await composer.open(prompt), true);
  assert.deepEqual(writes, [['original', prompt]]);
  assert.deepEqual(created, []);
});

for (const native of [false, true]) {
  test(`a separate draft preserves existing text and attachments (${native ? 'rc5' : 'rc2'} draft API)`, async () => {
    const { composer, writes, created, released, selected } = fixture({ draft: '原草稿', attachments: ['file'], native });
    const first = composer.open(prompt);
    assert.equal(composer.open(prompt), first);
    assert.equal(await first, true);
    assert.deepEqual(created, [{ workspaceId: 'workspace' }]);
    assert.deepEqual(writes, [['new', prompt]]);
    assert.equal(selected(), 'new');
    assert.equal(composer.hasPrevious('new'), true);
    composer.returnToPrevious('new');
    assert.equal(selected(), 'original');
    assert.deepEqual(released, ['original']);
  });
}

test('a used conversation gives the case its own draft and navigation can supersede preparation', async () => {
  let complete;
  const waitForCreate = new Promise((resolve) => { complete = resolve; });
  const { composer, writes, selected, layout } = fixture({ blank: false, waitForCreate });
  const pending = composer.open(prompt);
  layout.beginNavigation();
  complete();
  assert.equal(await pending, false);
  assert.deepEqual(writes, []);
  assert.equal(selected(), 'original');
  assert.equal(await composer.open(prompt), true);
  assert.equal(selected(), 'new-2');
  assert.deepEqual(writes, [['new-2', prompt]]);
  assert.equal(composer.hasPrevious('new-2'), false);
});

const references = (text) => [...text.matchAll(/^看板引用：(\{.*\})$/gm)].map((match) => JSON.parse(match[1]));
const target = (item) => ({ id: item.id, revision: item.revision, expectedDirectory: item.directory });

for (const interruptReference of [false, true]) {
  test(`quick-start runs once after a ${interruptReference ? 'superseded' : 'pending'} board reference`, async () => {
    let complete;
    const waitForCreate = new Promise((resolve) => { complete = resolve; });
    const { composer, writes, created, layout, selected } = fixture({
      phase: 'sending', draft: '正在发送的草稿', waitForCreate,
    });
    const reference = composer.reference(board);
    if (interruptReference) layout.beginNavigation();
    const creation = composer.open(prompt);
    assert.equal(composer.open(prompt), creation);
    assert.equal(created.length, 1);
    complete();
    assert.equal(await reference, !interruptReference);
    assert.equal(await creation, true);
    assert.equal(created.length, 2);
    assert.equal(selected(), 'new-2');
    assert.deepEqual(writes.map(([id, text]) => [id, references(text).length ? references(text) : text]),
      interruptReference ? [['new-2', prompt]] : [['new', [target(board)]], ['new-2', prompt]]);
  });
}

for (const native of [false, true]) {
  test(`referencing an existing dashboard appends to the active draft and keeps attachments (${native ? 'rc5' : 'rc2'})`, async () => {
    const draft = '保留这段原文和 @文件名';
    const chip = { offset: draft.indexOf('@'), length: '@文件名'.length };
    const { composer, selected, input, writes, created } = fixture({ draft, blank: false, running: true, native,
      attachments: ['file'], occurrences: [chip] });
    const state = () => input().state.getSnapshot();
    assert.equal(await composer.reference(board), true);
    assert.equal(selected(), 'original');
    assert.ok(state().draft.startsWith(draft + '\n\n请修改已有看板 "行情 \\"收盘\\""。'));
    assert.deepEqual(references(state().draft), [target(board)]);
    assert.deepEqual(state().attachmentIds, ['file']);
    assert.deepEqual(state().occurrences, [chip]);
    assert.equal(await composer.reference(board), true);
    assert.equal(writes.length, 1);
    assert.deepEqual(created, []);

    const namesake = { ...board, id: 'different-id' };
    assert.equal(await composer.reference(namesake), true);
    const otherLibrary = { ...board, directory: 'D:/另一个看板库' };
    assert.equal(await composer.reference(otherLibrary), true);
    assert.deepEqual(references(state().draft), [target(board), target(namesake), target(otherLibrary)]);
  });
}

test('a newer revision replaces the original reference in place and keeps the user request and native quote', async () => {
  const draft = '> 摘录原文';
  const quote = { offset: 0, length: draft.length };
  const { composer, input, created } = fixture({ draft, native: true, quotes: [quote] });
  assert.equal(await composer.reference(board), true);
  const state = () => input().state.getSnapshot();
  input().setDraft(state().draft + '请更新表格样式。');
  const latest = { ...board, title: '已改名\u2028行情', revision: 2 };
  assert.equal(await composer.reference(latest), true);
  assert.ok(state().draft.startsWith(draft));
  assert.ok(state().draft.includes('已改名\\u2028行情'));
  assert.ok(state().draft.endsWith('修改要求：请更新表格样式。'));
  assert.deepEqual(references(state().draft), [target(latest)]);
  assert.equal(await composer.reference(board), true);
  assert.deepEqual(references(state().draft), [target(latest)]);
  assert.deepEqual(created, []);
});

test('a reference inside quoted conversation text is independent from the editable board reference', async () => {
  const originalQuote = '引用旧消息\n看板引用：' + JSON.stringify(target(board));
  const quote = { offset: 0, length: originalQuote.length };
  const { composer, input, created, writes } = fixture({ draft: originalQuote, native: true, quotes: [quote] });
  const read = () => input().state.getSnapshot().draft;
  assert.equal(await composer.reference(board), true);
  assert.deepEqual(references(read()), [target(board), target(board)]);
  assert.equal(await composer.reference(board), true);
  assert.equal(writes.length, 1);
  const latest = { ...board, revision: 2 };
  assert.equal(await composer.reference(latest), true);
  assert.ok(read().startsWith(originalQuote + '\n\n'));
  assert.deepEqual(references(read()), [target(board), target(latest)]);
  assert.deepEqual(created, []);
});

test('an unavailable or busy composer opens a fresh draft and preserves the original when present', async () => {
  for (const hasSession of [false, true]) {
    const { composer, selected, input, created } = fixture({ hasSession, phase: 'sending', draft: '正在发送', attachments: ['file'] });
    assert.equal(await composer.reference(board), true);
    assert.equal(selected(), 'new');
    assert.deepEqual(created, [{ workspaceId: 'workspace' }]);
    assert.deepEqual(references(input('new').state.getSnapshot().draft), [target(board)]);
    assert.equal(composer.hasPrevious('new'), hasSession);
    if (hasSession) {
      composer.returnToPrevious('new');
      assert.equal(selected(), 'original');
      assert.equal(input().state.getSnapshot().draft, '正在发送');
      assert.deepEqual(input().state.getSnapshot().attachmentIds, ['file']);
    }
  }
});
