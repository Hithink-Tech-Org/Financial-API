import assert from 'node:assert/strict';
import { acceptsFramePort, buildOfficialSample, buildPageDocument } from '../src/client/workbench-frame.js';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  navigateAuthorizationWindow, openAuthorizationWindow, recordedResult, seriesSegments, trustedAuthorizationUrl,
} from '../src/client/view-state.js';
import { financeTurnKey, financeTurnResults, renderToolName } from '../src/client/turn-tail.js';
import { customDocument } from '../src/client/custom-view.js';
import { acceptsOfficialBoardPort, officialBoardChannel, officialBoardDocument } from '../src/client/official-workbench/frame.js';
import { dailyValues } from '../src/client/official-workbench/charts.js';
import { allocationPresentation, etfFeeHighlight } from '../src/client/official-workbench/app.js';
import { readOfficialBoard } from '../src/client/official-workbench/remote.js';

test('a workbench value can show a live snapshot timestamp in Shanghai time', (t) => {
  const slot = {
    dataset: { hfQuery: 'quote', hfField: 'data.timestamp', hfView: 'value', hfFormat: 'datetime' },
    replaceChildren(element) { this.text = element.textContent; },
  };
  const document = {
    addEventListener() {},
    createElement: () => ({ content: { querySelectorAll: () => [] } }),
    querySelectorAll: () => [slot],
  };
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  t.after(() => { delete globalThis.document; });
  const { srcDoc } = buildPageDocument('', 'test-token');
  const bindingScript = srcDoc.match(/<script nonce="test-token">([\s\S]+)<\/script>/)[1];
  const port = { start() {} };
  runInNewContext(bindingScript, {
    document, MessageChannel: function () { this.port1 = port; },
    window: { addEventListener() {} }, parent: { postMessage() {} },
  });
  const show = (timestamp) => port.onmessage({ data: { type: 'results', results: {
    quote: { ok: true, data: { timestamp } },
  } } });
  show(Date.parse('2026-11-24T07:23:04Z'));
  assert.match(slot.text, /2026.*15:23:04/);
  show(0);
  assert.equal(slot.text, '—');
});

test('official board documents inline their trusted assets and safely serialize inputs', () => {
  const token = 'a'.repeat(32);
  const html = '<html><head><link rel="stylesheet" href="/remote.css"></head><body data-page="fund-dca">'
    + '<a class="wordmark" href="/elsewhere" target="_top">看板</a><section id="content"></section>'
    + '<script type="module" src="/remote.js"></script></body></html>';
  const src = officialBoardDocument({
    html, stylesheet: 'body{color:black}', runtime: 'const runtime = {}', token,
    params: { date: '</script><img src="/remote-image">' }, withNavigation: true,
  });
  assert.ok(src.includes(`script-src 'nonce-${token}'`));
  assert.ok(src.includes("default-src 'none'"));
  assert.ok(src.includes("form-action 'none'"));
  assert.match(src, /\\u003c\/script>/);
  assert.match(src, /<style>body\{color:black\}<\/style>/);
  assert.doesNotMatch(src, /href=|<script[^>]+src=|<img/);
});

test('official board handshakes require the isolated frame and active nonce', () => {
  const frame = {};
  const event = { source: frame, origin: 'null', data: { type: officialBoardChannel, token: 'current' }, ports: [{}] };
  assert.ok(acceptsOfficialBoardPort(event, frame, 'current'));
  assert.equal(acceptsOfficialBoardPort(event, {}, 'current'), false);
  assert.equal(acceptsOfficialBoardPort(event, frame, 'outdated'), false);
  assert.equal(acceptsOfficialBoardPort({ ...event, origin: 'https://elsewhere.test' }, frame, 'current'), false);
  assert.equal(acceptsOfficialBoardPort({ ...event, ports: [] }, frame, 'current'), false);
});

test('asset allocation keeps a partial disclosure as its original percentages', () => {
  const { html, composition } = allocationPresentation({ stock_ratio_pct: 60.125 });
  assert.equal(composition, null);
  assert.match(html, /已取得 1 \/ 4 类资产/);
  assert.match(html, /60\.125%/);
  assert.doesNotMatch(html, /100%/);
});

test('asset allocation draws a composition only for a complete and valid whole', () => {
  const complete = { stock_ratio_pct: 60.05, bond_ratio_pct: 20, deposit_ratio_pct: 10, other_ratio_pct: 10 };
  const result = allocationPresentation(complete);
  assert.deepEqual(result.composition.map(({ value }) => value), [60.05, 20, 10, 10]);
  for (const [other, readout] of [[0, '0%'], [-10, '-10%'], [20, '20%']]) {
    const fallback = allocationPresentation({ ...complete, other_ratio_pct: other });
    assert.equal(fallback.composition, null);
    assert.ok(fallback.html.includes(`<td>${readout}</td>`));
    assert.match(fallback.html, /无法组成完整分布/);
  }
});

test('ETF fee highlight distinguishes ties, unique minima and insufficient comparison', () => {
  const rows = ['510300.SH', '510330.SH', '159919.SZ'].map((code) => ({ code, fee: 0.15 }));
  assert.deepEqual(etfFeeHighlight(rows), { label: '并列 3 只', rate: 0.15 });
  rows[1].fee = 0.1;
  assert.deepEqual(etfFeeHighlight(rows), { label: '510330.SH', rate: 0.1 });
  assert.deepEqual(etfFeeHighlight([rows[0], { code: rows[1].code, fee: null }]),
    { label: '1 只费率可用', rate: 0.15 });
  assert.deepEqual(etfFeeHighlight([{ code: rows[0].code, fee: null }]), { label: '数据不足', rate: null });
});

test('official daily chart aligns Shanghai dates and leaves absent values missing', () => {
  const open = Date.parse('2026-11-24T09:30:00+08:00');
  const close = Date.parse('2026-11-24T15:00:00+08:00');
  const day = Date.parse('2026-11-24T00:00:00+08:00');
  const opening = dailyValues([{ timestamp: open, value: 100 }]);
  const closing = dailyValues([{ timestamp: close, value: 102 }, { timestamp: close + 86_400_000, value: null }]);
  assert.deepEqual([...opening], [[day, 100]]);
  assert.deepEqual([...closing], [[day, 102]]);
});

test('returning or aborting the official board result releases its stream lease', async () => {
  let disposed = 0;
  const first = { ok: true, data: { date: '2026-11-24' } };
  const completed = await readOfficialBoard(async () => ({
    async *[Symbol.asyncIterator]() { yield first; },
    dispose() { disposed++; },
  }), new AbortController().signal);
  assert.deepEqual(completed, first);
  assert.equal(disposed, 1);

  const opened = Promise.withResolvers();
  const start = Promise.withResolvers();
  const next = new AbortController();
  const pending = readOfficialBoard(async () => {
    start.resolve();
    return opened.promise;
  }, next.signal);
  await start.promise;
  next.abort();
  opened.resolve({
    async *[Symbol.asyncIterator]() { assert.fail('A retired stream may not deliver data.'); },
    dispose() { disposed++; },
  });
  assert.equal(await pending, undefined);
  assert.equal(disposed, 2);
});

test('custom document has a dedicated worker policy and contains only the trusted bootstrap', () => {
  const document = customDocument('fixture-token');
  for (const directive of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'",
    "form-action 'none'", 'worker-src blob:']) assert.ok(document.includes(directive));
  assert.match(document, /new Worker\(/);
  assert.match(document, /createTextNode/);
  assert.ok(document.includes('fixture-token'));
  assert.equal((document.match(/<script>/g) ?? []).length, 1);
});

test('authorization starts in a first-party window without an opener; blocked popups can use the link', () => {
  const popup = { opener: {}, document: { body: {} } };
  const browser = { screen: { availWidth: 1440, availHeight: 900 }, open(url, target) {
    assert.equal(url, 'about:blank');
    assert.equal(target, '_blank');
    return popup;
  } };
  assert.equal(openAuthorizationWindow(browser), popup);
  assert.equal(popup.opener, null);
  assert.equal(openAuthorizationWindow({ ...browser, open: () => null }), null);
  const url = 'https://upass.10jqka.com.cn/oidc/fuyao/authorize';
  let navigated;
  popup.location = { replace(value) { navigated = value; } };
  assert.equal(navigateAuthorizationWindow(popup, url), true);
  assert.equal(navigated, url);
  assert.equal(navigateAuthorizationWindow(popup, 'https://example.org/'), false);
  assert.equal(navigateAuthorizationWindow({ closed: true }, url), false);
  assert.equal(navigateAuthorizationWindow(null, url), false);
});

test('OAuth navigation accepts only the approved HTTPS issuer', () => {
  assert.ok(trustedAuthorizationUrl('https://upass.10jqka.com.cn/oidc/fuyao/authorize'));
  for (const url of [
    'http://upass.10jqka.com.cn/oidc/fuyao/authorize', 'https://upass.10jqka.com.cn.test.org/',
    'https://user@upass.10jqka.com.cn/', 'https://upass.10jqka.com.cn/#fragment',
    'javascript:alert(1)', undefined,
  ]) assert.equal(trustedAuthorizationUrl(url), null);
});

test('replay reads durable metadata or a historical text receipt without making a request', () => {
  const output = { ok: true, op: 'run', capability: 'market.snapshot', data: { item: [{ thscode: '600000.SH' }] } };
  const legacy = { content: [{ type: 'text', text: JSON.stringify(output) }], meta: { v: 2 } };
  const fallback = recordedResult(legacy);
  assert.equal(fallback.view.kind, 'snapshot');
  const replay = recordedResult({ content: [], meta: structuredClone(fallback.view) });
  assert.deepEqual(replay.view, fallback.view);
  assert.deepEqual(recordedResult({ isError: true, error: { code: 'CANCELLED' }, meta: replay.view }),
    { error: { code: 'CANCELLED' } });
});

test('chart segments break at missing values and unverified trading-day adjacency', () => {
  const days = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'];
  const prices = [10, null, 11, 12, 13];
  assert.deepEqual(seriesSegments(days, prices, true).map((segment) => segment.map((point) => point.index)), [[0], [2, 3, 4]]);
  assert.deepEqual(seriesSegments(days, prices, false).map((segment) => segment.map((point) => point.index)), [[0], [2], [3, 4]]);
});

test('turn tail reuses the latest recorded receipt for each financial view', () => {
  let state = financeTurnResults.start(null, { event: { data: { turn: 4 } } });
  const apply = (type, data, seq) => {
    const event = { type, data: { ...data, turn: 4 }, seq };
    if (financeTurnResults.match(event)) state = financeTurnResults.update({ state }, { event });
  };
  const snapshot = { v: 1, kind: 'snapshot', capability: 'market.snapshot', currency: 'CNY', rows: [], asOf: 1234 };
  const result = (callId, meta, isError) => ({ meta, message: { source: { callId }, content: [], isError } });
  apply('tool/call', { callId: 'foreign', name: 'another_tool' }, 2);
  apply('tool/result', result('foreign', snapshot), 3);
  assert.equal(financeTurnResults.buildLocationData({ state }, 'turn'), null);
  apply('tool/call', { callId: 'stock1', name: 'hithink_finance', arguments: '{}' }, 4);
  apply('tool/result', result('stock1', snapshot), 5);
  apply('tool/call', { callId: 'stock2', name: 'hithink_finance', arguments: '{}' }, 6);
  apply('tool/result', result('stock2', { ...snapshot, asOf: 2345 }, true), 7);
  apply('tool/result', result('stock2', { ...snapshot, asOf: 3456 }), 8);
  const location = financeTurnResults.buildLocationData({ state }, 'turn');
  assert.equal(location.key, financeTurnKey);
  assert.equal(location.value.length, 1);
  assert.equal(location.value[0].meta.asOf, 3456);
  assert.equal(location.value[0].seq, 8);
});

test('new card metadata replays independently of the model receipt and preserves all card calls', () => {
  let state = financeTurnResults.start(null, { event: { data: { turn: 14 } } });
  const snapshot = { version: 1, template: 'snapshot', rows: [{ thscode: '600000.SH', last_price: 10 }],
    fields: [{ key: 'thscode' }, { key: 'last_price' }], rowCount: 1, truncated: false };
  const apply = (type, data, seq) => {
    const event = { type, seq, data: { ...data, turn: 14 } };
    assert.ok(financeTurnResults.match(event));
    state = financeTurnResults.update({ state }, { event });
  };
  for (const [index, title] of ['快照一', '快照二'].entries()) {
    const callId = String(index);
    apply('tool/call', { callId, name: renderToolName, arguments: '{}' }, index * 2 + 1);
    apply('tool/result', { meta: { ...snapshot, title }, message: { source: { callId }, content: [
      { type: 'text', text: '{"ok":true,"template":"snapshot","rowCount":1}' },
    ] } }, index * 2 + 2);
  }
  assert.deepEqual(financeTurnResults.buildLocationData({ state }, 'turn').value.map(({ meta }) => meta.title), ['快照一', '快照二']);
  assert.deepEqual(recordedResult({ meta: snapshot }).view, snapshot);
  assert.deepEqual(recordedResult({ meta: { ...snapshot, fields: [null] } }).view, null);
});

test('a completed save notifies the workbench without treating reads or failed writes as saves', () => {
  let state = financeTurnResults.start(null, { event: { data: { turn: 10 } } });
  const update = (type, seq, data) => {
    const event = { type, seq, data: { turn: 10, ...data } };
    assert.ok(financeTurnResults.match(event));
    state = financeTurnResults.update({ state }, { event });
  };
  const board = { id: 'saved-board', title: '双股行情', revision: 2, directory: 'fixture', file: 'board.html' };
  function result(callId, seq, action, value, isError = false) {
    update('tool/call', seq - 1, { callId, name: 'hithink_finance_workbench_import', arguments: JSON.stringify({ action }) });
    update('tool/result', seq, { message: { source: { callId }, isError,
      content: [{ type: 'text', text: JSON.stringify(value) }] } });
  }
  result('read', 2, 'get', { ok: true, data: board });
  result('rejected', 4, 'save', { ok: false, error: {} });
  result('failed', 6, 'save', { ok: true, data: board }, true);
  assert.equal(financeTurnResults.buildLocationData({ state }, 'turn'), null);
  result('saved', 8, undefined, { ok: true, data: board });
  assert.deepEqual(financeTurnResults.buildLocationData({ state }, 'turn').value, [{ seq: 8, board }]);
});

test('workbench accepts only the isolated active frame with the current channel token', () => {
  const frame = {};
  const token = 'current';
  const event = { source: frame, origin: 'null', data: { type: 'hithink-finance:workbench', token }, ports: [{}] };
  assert.equal(acceptsFramePort(event, frame, token), true);
  assert.equal(acceptsFramePort(event, {}, token), false);
  assert.equal(acceptsFramePort(event, frame, 'previous'), false);
  assert.equal(acceptsFramePort({ ...event, origin: 'https://example.org' }, frame, token), false);
  assert.equal(acceptsFramePort({ ...event, ports: [] }, frame, token), false);
});

test('official sample retains the original document and limits its external resources', () => {
  const source = '<!doctype html><html><head><script>render()</script></head><body class="official">chart</body></html>';
  const sample = buildOfficialSample(source);
  assert.match(sample, /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/);
  assert.match(sample, /default-src 'none'/);
  assert.match(sample, /<script>render\(\)<\/script><\/head><body class="official">/);
});
