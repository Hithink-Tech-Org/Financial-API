import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineStyle, TickMarkType, createChart,
} from 'lightweight-charts';
import { shanghaiTime } from '../presentation/index.js';
import { pricePrecision, recentKlineRange, validCandle } from '../presentation/kline.js';
import { formatValue } from '../presentation/render.js';

const presets = [20, 60, 0];
const priceOrder = [0, 3, 2, 1];

function themeOf(element) {
  const style = getComputedStyle(element);
  const read = (name) => style.getPropertyValue(`--hf-${name}`).trim();
  return {
    font: style.fontFamily, background: read('kline-bg'), muted: read('kline-muted'),
    grid: read('kline-grid'), border: read('kline-border'), cursor: read('kline-cursor'), cursorLabel: read('kline-cursor-label'),
    rise: read('rise'), fall: read('fall'), volumeUp: read('kline-volume-up'), volumeDown: read('kline-volume-down'),
    volumeFlat: read('kline-volume-flat'),
  };
}

function themeOptions(theme) {
  const cursor = { color: theme.cursor, style: LineStyle.Dashed, labelBackgroundColor: theme.cursorLabel };
  return {
    layout: {
      background: { type: ColorType.Solid, color: theme.background }, textColor: theme.muted,
      fontSize: 12, fontFamily: theme.font, attributionLogo: true,
      panes: { separatorColor: theme.border, separatorHoverColor: theme.cursor, enableResize: false },
    },
    grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
    crosshair: { mode: CrosshairMode.Normal, horzLine: cursor, vertLine: cursor },
    rightPriceScale: { visible: true, borderColor: theme.border },
    timeScale: { borderColor: theme.border },
  };
}

function candleColors(theme) {
  return {
    upColor: theme.rise, downColor: theme.fall,
    borderVisible: false, wickUpColor: theme.rise, wickDownColor: theme.fall,
  };
}

function histogramPoints(bars, theme) {
  return bars.map(({ time, volume, values: [open, close] }) => {
    if (!Number.isFinite(volume)) return { time };
    const color = open == null || close == null || close === open ? theme.volumeFlat
      : close > open ? theme.volumeUp : theme.volumeDown;
    return { time, value: volume, color };
  });
}

function chartTime(time) {
  return shanghaiTime(time * 1000) ?? '';
}

function tickLabel(time, tick) {
  const text = chartTime(time);
  if (tick === TickMarkType.Year) return text.slice(0, 4);
  if (tick === TickMarkType.Time) return text.slice(11, 16);
  if (tick === TickMarkType.TimeWithSeconds) return text.slice(11, 19);
  return text.slice(5, 10);
}

function priceText(value, field, formatter) {
  if (!Number.isFinite(value)) return '—';
  if (['percent', 'ratio'].includes(field.format)) return formatValue(value, field);
  return `${formatter.format(value)}${field.unit ? ` ${field.unit}` : ''}`;
}

function MarketPlot({ bars, fields, volume, title, symbols, group, onSymbol }) {
  const element = useRef(null);
  const applyRange = useRef(null);
  const [range, setRange] = useState(0);
  const [crosshair, setCrosshair] = useState(null);
  const [error, setError] = useState(false);
  const latest = bars.at(-1);
  const hasCandles = bars.some(validCandle);
  const intraday = bars.some(({ date }) => date.length > 10);
  const hasSeconds = bars.some(({ date }) => date.length > 10 && date.slice(-2) !== '00');
  const hasVolume = Boolean(volume && bars.some(({ volume }) => Number.isFinite(volume)));
  const precision = useMemo(() => pricePrecision(bars), [bars]);
  const formatter = useMemo(() => new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: precision, maximumFractionDigits: precision,
  }), [precision]);
  const indexed = useMemo(() => new Map(bars.map((bar) => [bar.time, bar])), [bars]);
  const reading = indexed.get(crosshair) ?? latest;

  useEffect(() => {
    if (!hasCandles) return;
    const canvas = element.current;
    const initial = themeOf(canvas);
    let chart;
    let observer;
    try {
      const options = themeOptions(initial);
      chart = createChart(canvas, {
        ...options, autoSize: true,
        leftPriceScale: { visible: false },
        rightPriceScale: { ...options.rightPriceScale, scaleMargins: { top: 0.13, bottom: 0.12 } },
        timeScale: {
          ...options.timeScale, rightOffset: 0.5, minBarSpacing: 0.5, maxBarSpacing: 58,
          lockVisibleTimeRangeOnResize: true, timeVisible: intraday, secondsVisible: hasSeconds, tickMarkFormatter: tickLabel,
        },
        localization: { locale: 'zh-CN', timeFormatter: (time) => chartTime(time).slice(0, intraday ? 19 : 10) },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      });
      const prices = chart.addSeries(CandlestickSeries, {
        ...candleColors(initial),
        lastValueVisible: validCandle(latest), priceLineVisible: validCandle(latest), priceLineStyle: LineStyle.Dotted,
        priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
      });
      prices.setData(bars.map((bar) => {
        const { time, values: [open, close, low, high] } = bar;
        return validCandle(bar) ? { time, open, close, low, high } : { time };
      }));
      const histogram = hasVolume ? chart.addSeries(HistogramSeries, {
        priceScaleId: 'right', base: 0, lastValueVisible: false, priceLineVisible: false,
        priceFormat: { type: 'custom', minMove: 1, formatter: (value) => formatValue(value, { ...volume, unit: undefined }, true) },
      }, 1) : null;
      if (histogram) {
        histogram.setData(histogramPoints(bars, initial));
        histogram.priceScale().applyOptions({ scaleMargins: { top: 0.17, bottom: 0.07 } });
        const [pricePane, volumePane] = chart.panes();
        pricePane.setStretchFactor(0.78);
        volumePane.setStretchFactor(0.22);
      }
      const horizontal = chart.timeScale();
      applyRange.current = (points) => {
        setRange(points);
        if (points === 0) {
          prices.priceScale().setAutoScale(true);
          histogram?.priceScale().setAutoScale(true);
          horizontal.fitContent();
        } else horizontal.setVisibleLogicalRange(recentKlineRange(bars.length, points));
      };
      const trackRange = (visible) => {
        if (!visible || visible.to < bars.length - 1.5) return setRange(null);
        if (visible.from <= 0.5) return setRange(0);
        const matched = presets.find((points) => points > 0 && bars.length > points
          && Math.abs(visible.from - recentKlineRange(bars.length, points).from) < 0.55);
        setRange(matched ?? null);
      };
      const trackCrosshair = ({ time }) => setCrosshair(indexed.has(time) ? time : null);
      horizontal.subscribeVisibleLogicalRangeChange(trackRange);
      chart.subscribeCrosshairMove(trackCrosshair);
      horizontal.fitContent();
      observer = new MutationObserver(() => {
        const theme = themeOf(canvas);
        chart.applyOptions(themeOptions(theme));
        prices.applyOptions(candleColors(theme));
        histogram?.setData(histogramPoints(bars, theme));
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
      setError(false);
      return () => {
        applyRange.current = null;
        observer.disconnect();
        horizontal.unsubscribeVisibleLogicalRangeChange(trackRange);
        chart.unsubscribeCrosshairMove(trackCrosshair);
        chart.remove();
      };
    } catch {
      applyRange.current = null;
      observer?.disconnect();
      chart?.remove();
      setError(true);
    }
  }, [bars, hasCandles, hasSeconds, hasVolume, indexed, intraday, latest, precision, volume]);

  const tone = !validCandle(reading) ? undefined
    : reading.values[1] > reading.values[0] ? 'hf-rise' : reading.values[1] < reading.values[0] ? 'hf-fall' : undefined;
  return h('div', { className: 'hf-plot hf-kline', 'data-hf-kline': true },
    h('div', { className: 'hf-kline-toolbar' },
      symbols.length > 1 ? h('select', { 'aria-label': '选择行情标的', value: group,
        onChange: (event) => onSymbol(event.target.value) },
      symbols.map((symbol) => h('option', { value: symbol, key: symbol }, symbol)))
        : group && h('strong', { className: 'hf-kline-symbol' }, group),
      hasCandles && h('div', { className: 'hf-range hf-kline-range', role: 'group', 'aria-label': '选择数据范围' },
        presets.map((points) => h('button', {
          key: points, type: 'button', className: 'hf-button', 'aria-pressed': range === points,
          disabled: error || (points > 0 && bars.length <= points),
          onClick: () => applyRange.current?.(points),
          title: points === 0 ? '显示全部记录并复位价格轴' : undefined,
        }, points ? `近 ${points} 点` : '全部')))),
    h('div', { className: 'hf-kline-reading', 'data-hf-kline-reading': true },
      h('p', { className: 'hf-kline-date' }, h('span', null, crosshair === null ? '最新' : '光标'), h('time', null, reading.date)),
      h('dl', { className: 'hf-kline-values' },
        priceOrder.map((index) => h('div', { key: fields[index].key },
          h('dt', null, fields[index].label),
          h('dd', { className: index === 1 ? `hf-kline-close ${tone ?? ''}` : undefined },
            priceText(reading.values[index], fields[index], formatter)))),
        volume && h('div', null, h('dt', null, volume.label), h('dd', null, formatValue(reading.volume, volume))))),
    !hasCandles ? h('p', { className: 'hf-note' }, '此标的缺少完整的开高低收数据，可查看下方数据表。')
      : h('div', { className: 'hf-plot-canvas hf-plot-kline', ref: element, role: 'region',
        'aria-label': `${title}，开高低收及成交量明细可在数据表查看` }),
    error && h('p', { className: 'hf-error', role: 'alert' }, '图表暂时无法显示，可查看下方数据表。'),
    hasCandles && h('footer', { className: 'hf-kline-footer hf-note' },
      h('span', { className: 'hf-kline-mouse-hint' }, '拖动平移 · 滚轮缩放 · 双击坐标轴复位'),
      h('span', { className: 'hf-kline-touch-hint' }, '横滑平移 · 双指缩放'),
      h('a', { href: 'https://www.tradingview.com/', target: '_blank', rel: 'noreferrer' },
        'TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc.')));
}

export function KlineChart({ data, title }) {
  const symbols = [...data.groups.keys()];
  const [selected, setSelected] = useState(symbols[0]);
  const group = data.groups.has(selected) ? selected : symbols[0];
  return h(MarketPlot, {
    key: group, bars: data.groups.get(group), fields: data.fields, volume: data.volume, title,
    symbols, group, onSymbol: setSelected,
  });
}
