import { recordedResult } from './view-state.js';

export const financeTurnKey = 'hithink-finance.results';
export const renderToolName = 'hithink_finance_render';
const saveToolName = 'hithink_finance_workbench_import';
const toolNames = ['hithink_finance', renderToolName, saveToolName];

function savedBoard(call, message) {
  try {
    const args = JSON.parse(call.argsRaw);
    if (args.action !== undefined && args.action !== 'save') return;
    const output = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('');
    const result = JSON.parse(output);
    if (result.ok === true && typeof result.data?.id === 'string' && Number.isSafeInteger(result.data.revision)) return result.data;
  } catch {
    return;
  }
}

// The Conversation runtime owns turn membership and the durable stream order.
export const financeTurnResults = {
  kind: financeTurnKey,
  match(event) {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' };
    if ((event.type === 'tool/call' && toolNames.includes(event.data.name)) || event.type === 'tool/result') {
      return { id: String(event.data.turn), role: 'update' };
    }
    return null;
  },
  start(_context, { event }) {
    return { turn: event.data.turn, calls: new Map(), results: [] };
  },
  update({ state }, { event }) {
    if (event.type === 'tool/call') {
      const calls = new Map(state.calls);
      calls.set(String(event.data.callId), { name: event.data.name, argsRaw: event.data.arguments });
      return { ...state, calls };
    }
    const { message, meta } = event.data;
    const call = state.calls.get(String(message?.source?.callId));
    if (!call || message?.isError) return state;
    if (call.name === saveToolName) {
      const board = savedBoard(call, message);
      return board ? { ...state, results: [...state.results, { seq: event.seq, board }] } : state;
    }
    const { view } = recordedResult({ content: message.content, meta });
    if (view?.version !== 1 && view?.kind !== 'snapshot' && view?.kind !== 'history') return state;
    const receipt = { seq: event.seq, call, meta: view };
    const retain = view.version === 1 ? state.results : state.results.filter((result) => result.meta?.kind !== view.kind);
    return { ...state, results: [...retain, receipt] };
  },
  buildLocationData({ state }, scope, previous) {
    if (scope !== 'turn' || !state?.results.length) return null;
    if (previous?.value === state.results) return previous;
    return { kind: 'turn', turn: state.turn, key: financeTurnKey, value: state.results };
  },
};
