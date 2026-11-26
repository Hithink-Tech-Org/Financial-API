import { createElement as h, useLayoutEffect, useMemo, useRef, useState } from 'react';
import runtime from 'hithink-official-board-runtime';
import auction from './official-workbench/auction-radar.html';
import dragon from './official-workbench/dragon-anomaly.html';
import etf from './official-workbench/etf-comparison.html';
import dca from './official-workbench/fund-dca.html';
import hot from './official-workbench/hot-rank.html';
import limit from './official-workbench/limit-break.html';
import linkage from './official-workbench/stock-sector-index.html';
import localPanel from './official-workbench/local-market-panel.html';
import websiteStyles from './official-workbench/styles.css';
import frameStyles from './official-workbench/frame.css';
import { connectOfficialBoard, officialBoardDocument } from './official-workbench/frame.js';
import { officialBoardPages } from './official-workbench/pages.js';

const documents = {
  'fund-dca': dca,
  'etf-compare': etf,
  'auction-radar': auction,
  'limit-break': limit,
  'hot-rank': hot,
  'dragon-anomaly': dragon,
  'stock-sector-index': linkage,
  'local-market-panel': localPanel,
};

export function OfficialLiveBoard({ item, workbench, isVisible = true, onOpenAccount, onOpenBoard }) {
  const params = useRef({});
  if (!isVisible) return null;
  const [page] = officialBoardPages.find(([, id]) => item.id === `template:${id}`) ?? [];
  if (!page) return h('p', { role: 'alert' }, '找不到此动态看板。');
  return h(BoardFrame, { key: item.id, item, page, params, workbench, onOpenAccount, onOpenBoard });
}

function BoardFrame({ item, page, params, workbench, onOpenAccount, onOpenBoard }) {
  const frame = useRef(null);
  const callbacks = useRef({ workbench, onOpenAccount, onOpenBoard });
  const [height, setHeight] = useState(460);
  const [token] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (value) => value.toString(16).padStart(2, '0')).join(''));
  const withNavigation = Boolean(onOpenBoard);
  useLayoutEffect(() => {
    callbacks.current = { workbench, onOpenAccount, onOpenBoard };
  }, [workbench, onOpenAccount, onOpenBoard]);
  const srcDoc = useMemo(() => officialBoardDocument({
    html: documents[page],
    stylesheet: websiteStyles + frameStyles,
    runtime,
    token,
    params: params.current,
    withNavigation,
  }), [page, params, token, withNavigation]);
  useLayoutEffect(() => connectOfficialBoard({
    frame: frame.current,
    token,
    load: (query, signal) => callbacks.current.workbench.liveCase({ id: item.id, params: query }, signal),
    onParams: (query) => { params.current = query; },
    onHeight: setHeight,
    onOpenAccount: () => callbacks.current.onOpenAccount?.(),
    onOpenBoard: (next) => {
      const [, id] = officialBoardPages.find(([slug]) => slug === next) ?? [];
      if (id && id !== item.id.slice('template:'.length)) callbacks.current.onOpenBoard?.(`template:${id}`);
    },
  }), [item.id, params, token]);
  return h('iframe', {
    ref: frame,
    className: 'hf-wb-official-board',
    title: item.title,
    sandbox: 'allow-scripts allow-forms',
    referrerPolicy: 'no-referrer',
    srcDoc,
    style: { display: 'block', width: '100%', height, border: 0 },
  });
}
