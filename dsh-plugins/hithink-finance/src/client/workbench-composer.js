const referencePrefix = '看板引用：';

function jsonLine(value) {
  return JSON.stringify(value).replace(/[\u2028\u2029\ufffc]/gu, (character) =>
    '\\u' + character.charCodeAt(0).toString(16));
}

function boardReference({ title, id, revision, directory }) {
  if (typeof title !== 'string' || typeof id !== 'string' || !id || !Number.isSafeInteger(revision) || revision < 1
    || typeof directory !== 'string' || !directory) throw new Error('Invalid board reference');
  const target = { id, revision, expectedDirectory: directory };
  const heading = '请修改已有看板 ' + jsonLine(title) + '。';
  const line = referencePrefix + jsonLine(target);
  return { target, heading, line, prompt: heading + '\n' + line + '\n修改要求：' };
}

function referenceEdit(draft, reference, atoms) {
  const overlapsAtom = (start, end) => atoms.some(({ offset, length }) => start < offset + length && end > offset);
  const candidates = draft.matchAll(/^看板引用：(\{[^\r\n]*\})$/gm);
  for (const match of candidates) {
    const end = match.index + match[0].length;
    if (overlapsAtom(match.index, end)) continue;
    let existing;
    try { existing = JSON.parse(match[1]); } catch { continue; }
    if (existing.id !== reference.target.id || existing.expectedDirectory !== reference.target.expectedDirectory) continue;
    if (Number.isSafeInteger(existing.revision) && existing.revision >= reference.target.revision) return null;
    const lineStart = draft.lastIndexOf('\n', match.index - 2) + 1;
    const heading = draft.slice(lineStart, match.index - 1);
    const generatedHeading = /^请修改已有看板 "(?:[^"\\]|\\.)*"。$/u.test(heading) && !overlapsAtom(lineStart, match.index);
    return {
      start: generatedHeading ? lineStart : match.index,
      end,
      text: generatedHeading ? reference.heading + '\n' + reference.line : reference.line,
    };
  }
  return { start: draft.length, end: draft.length, text: reference.prompt, append: true };
}

function insertBoardReference(binding, input, state, resolver, reference) {
  const atoms = [...state.occurrences, ...(input.draftSnapshot?.quotes ?? [])];
  const edit = referenceEdit(state.draft, reference, atoms);
  if (!edit) return true;
  if (edit.append && typeof resolver.requestDraftInitialization === 'function') {
    return resolver.requestDraftInitialization(binding, { prompt: edit.text, whenDraftExists: 'append' }) === 'applied';
  }

  // DSH counts native references and quotes as single units for an editor span.
  const editorOffset = (offset) => atoms.reduce((position, atom) =>
    atom.offset + atom.length <= offset ? position - (atom.length - 1) : position, offset);
  const span = { start: editorOffset(edit.start), end: editorOffset(edit.end), draftRev: state.draftRev };
  const text = edit.append && state.draft ? '\n\n' + edit.text : edit.text;
  return binding.ctx.bail(binding.ctx, 'slash/input-insert-text', { text, span }) === true;
}

export function createWorkbenchComposer({ sessions, workspaces, conversation, uiWorkspace, layout }) {
  const listeners = new Set();
  const previousDrafts = new Map();
  const pending = new Map();
  let tail = null;
  let focusTarget = null;
  let disposed = false;
  const notify = () => { for (const listener of listeners) listener(); };
  const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
  const current = () => Object.values(sessions.list.getSnapshot().byId).find((row) => row.retainedBy.mainView > 0);
  const inputFor = (id) => {
    const binding = sessions.binding(id);
    return binding && conversation.input.for(binding.ctx);
  };

  function requestFocus(id) {
    focusTarget = { id };
    notify();
  }

  async function launch(prompt, revealComposer, reference) {
    if (disposed) return false;
    const navigation = layout.beginNavigation();
    const source = current();
    const sourceBinding = source && sessions.binding(source.id);
    const resolver = conversation.input;
    const sourceInput = sourceBinding && resolver.for(sourceBinding.ctx);
    const existing = sourceInput?.state.getSnapshot();
    const hasDraft = existing && (existing.draft !== '' || existing.attachmentIds.length > 0 || existing.phase !== 'plain');
    const reuse = existing?.phase === 'plain' && (reference
      ? insertBoardReference(sourceBinding, sourceInput, existing, resolver, reference)
      : source.blank && !source.running && existing.attachmentIds.length === 0 && (!hasDraft || existing.draft === prompt));
    if (reuse) {
      if (!reference && !hasDraft) sourceInput.setDraft(prompt);
      layout.selectPanel(null);
      revealComposer?.();
      requestFocus(source.id);
      return true;
    }

    const items = workspaces.list.getSnapshot().items;
    const workspace = items.find((item) => item.sessionIds.includes(source?.id))
      ?? (source?.cwd ? undefined : items.reduce((latest, item) => !latest || item.updatedAt > latest.updatedAt ? item : latest, undefined));
    const target = workspace ? { workspaceId: workspace.workspaceId } : source?.cwd ? { cwd: source.cwd } : {};
    const isCurrent = () => !disposed && !navigation.aborted && current()?.id === source?.id;
    const id = await sessions.create(target);
    if (!isCurrent()) return false;
    return sessions.using(id, { source: 'hithinkFinanceDraft' }, async (sessionReference) => {
      const binding = await sessionReference.ready;
      if (!isCurrent()) return false;
      const input = resolver.for(binding.ctx);
      const draft = input.state.getSnapshot();
      if (draft.draft || draft.attachmentIds.length || draft.phase !== 'plain') throw new Error('Draft is occupied');
      if (typeof resolver.requestDraftInitialization === 'function') {
        if (resolver.requestDraftInitialization(binding, { prompt, whenDraftExists: 'keep' }) !== 'applied') {
          throw new Error('Draft initialization did not apply');
        }
      } else {
        input.setDraft(prompt);
      }

      // DSH hides non-current blank sessions, and a released binding drops runtime attachments.
      const original = sourceInput?.state.getSnapshot();
      if (source && (reference || (original && (original.draft || original.attachmentIds.length || original.phase !== 'plain')))) {
        previousDrafts.set(id, sessions.retain(source.id, { source: 'hithinkFinanceDraft' }));
      }
      try {
        uiWorkspace.openSession(id);
      } catch (error) {
        previousDrafts.get(id)?.release();
        previousDrafts.delete(id);
        throw error;
      }
      requestFocus(id);
      return true;
    });
  }

  function enqueue(prompt, revealComposer, reference) {
    const key = JSON.stringify([Boolean(reference), prompt]);
    const existing = pending.get(key);
    if (existing) return existing;
    const run = () => launch(prompt, revealComposer, reference);
    const result = (tail ? tail.then(run, run) : run()).finally(() => {
      pending.delete(key);
      if (tail === result) tail = null;
    });
    pending.set(key, result);
    tail = result;
    return result;
  }

  return {
    subscribe,
    open: enqueue,
    async reference(board, revealComposer) {
      const reference = boardReference(board);
      return enqueue(reference.prompt, revealComposer, reference);
    },
    focusFor: (id) => focusTarget?.id === id ? focusTarget : null,
    focus(intent) {
      if (focusTarget !== intent) return;
      focusTarget = null;
      inputFor(intent.id)?.focus();
      notify();
    },
    hasPrevious: (id) => previousDrafts.has(id),
    returnToPrevious(id) {
      const reference = previousDrafts.get(id);
      if (!reference) return;
      const previous = reference.sessionId;
      uiWorkspace.openSession(previous);
      previousDrafts.delete(id);
      reference.release();
      requestFocus(previous);
    },
    dispose() {
      disposed = true;
      for (const reference of previousDrafts.values()) reference.release();
      previousDrafts.clear();
      listeners.clear();
    },
  };
}
