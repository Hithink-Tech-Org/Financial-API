import { buildPresentation, historyMetrics } from '../presentation/index.js';
import { validRenderView } from '../presentation/render.js';

export function openAuthorizationWindow(browser) {
  const width = Math.min(1080, browser.screen.availWidth);
  const height = Math.min(760, browser.screen.availHeight);
  let popup;
  try {
    popup = browser.open('about:blank', '_blank', `popup,width=${width},height=${height}`);
    if (!popup) return null;
    popup.opener = null;
    popup.document.title = '同花顺账号授权';
    popup.document.body.textContent = '正在打开同花顺授权页…';
    return popup;
  } catch {
    popup?.close();
    return null;
  }
}

export function navigateAuthorizationWindow(popup, url) {
  if (!popup || popup.closed || !trustedAuthorizationUrl(url)) return false;
  try {
    popup.location.replace(url);
    return true;
  } catch {
    // Let the user open the same pending attempt using a normal browser link.
    return false;
  }
}

// Only an authenticated account RPC response reaches this check.
export function trustedAuthorizationUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.origin === 'https://upass.10jqka.com.cn' && !url.username && !url.password && !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function parseJson(value) {
  if (typeof value !== 'string' || value.length > 64_000) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function validPresentation(view) {
  if (view?.v !== 1 || typeof view.capability !== 'string') return false;
  if (view.kind === 'table') {
    return Array.isArray(view.columns) && view.columns.every((column) => typeof column === 'string') &&
      Array.isArray(view.rows) && view.rows.every(Array.isArray);
  }
  if (view.kind === 'snapshot') {
    return typeof view.currency === 'string' && Array.isArray(view.rows) &&
      view.rows.every((row) => row && typeof row === 'object');
  }
  if (view.kind === 'history') {
    return historyMetrics.includes(view.displayedMetric) && Array.isArray(view.dates) &&
      view.dates.every((date) => typeof date === 'string') && Array.isArray(view.series) &&
      view.series.every((group) => Array.isArray(group?.close) && group.close.length === view.dates.length);
  }
  return false;
}

export function recordedResult(block) {
  const output = (block?.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text).join('\n');
  const value = parseJson(output);
  const error = value?.ok === false ? value.error : block?.error;
  if (block?.isError || value?.ok === false) return { error: error ?? {} };
  const view = validRenderView(block?.meta) || validPresentation(block?.meta) ? block.meta
    : validRenderView(value?.view) ? value.view : buildPresentation(value);
  return { view, summary: view ? null : output.slice(0, 4000) };
}

// Without the trading calendar we can only certify adjacency for consecutive civil days.
export function seriesSegments(dates, values, calendar) {
  const segments = [];
  let segment = [];
  for (const [index, value] of values.entries()) {
    const gap = !calendar && index > 0 && Date.parse(dates[index]) - Date.parse(dates[index - 1]) !== 86_400_000;
    if (gap || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (Number.isFinite(value)) segment.push({ index, value });
  }
  if (segment.length) segments.push(segment);
  return segments;
}
