import { createElement as h, useEffect, useRef, useState } from 'react';
import { init, use } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatValue } from '../presentation/render.js';

use([BarChart, LineChart, AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent,
  TooltipComponent, CanvasRenderer]);

const palettes = {
  light: ['#195db3', '#ad3c56', '#0e7663', '#7f4bb7', '#965816', '#006c86'],
  dark: ['#86b9ff', '#fb99ae', '#6cd2b9', '#d3a3fe', '#f5b276', '#6ecde2'],
};
const rangeOptions = [20, 60, 120];
const abbreviate = (value, length) => value.length <= length ? value : `${value.slice(0, length - 1)}…`;
const mac = globalThis.navigator?.platform?.includes('Mac');

function zoomAxes(xAxisIndex, theme) {
  return [
    { type: 'inside', xAxisIndex, zoomOnMouseWheel: mac ? 'meta' : 'ctrl', moveOnMouseWheel: false, filterMode: 'none' },
    { type: 'slider', xAxisIndex, bottom: 6, height: 24, showDetail: false, showDataShadow: false,
      brushSelect: false, borderColor: theme.border, fillerColor: theme.selection, filterMode: 'none' },
  ];
}

function categoryAxis(labels, theme, more = {}) {
  return {
    type: 'category', data: labels, axisLabel: { color: theme.muted, hideOverlap: true, margin: 12 },
    axisTick: { show: false }, axisLine: { lineStyle: { color: theme.border } }, ...more,
  };
}

function valueAxis(field, theme, more = {}) {
  return {
    type: 'value', splitNumber: 4, axisLabel: { color: theme.muted, formatter: (value) => formatValue(value, field, true) },
    splitLine: { lineStyle: { color: theme.border } }, ...more,
  };
}

function tooltip(theme, formatter) {
  return {
    trigger: 'axis', renderMode: 'richText', backgroundColor: theme.fill, borderColor: theme.border,
    borderWidth: 1, textStyle: { color: theme.text, fontSize: 12, lineHeight: 19 }, confine: true,
    axisPointer: { type: 'cross', crossStyle: { color: theme.muted }, label: { show: false } },
    formatter,
  };
}

function seriesOption(data, template, theme) {
  const { labels, plots } = data;
  const ranking = template === 'ranking';
  const line = template === 'line';
  const seriesFields = [...new Map(plots.map(({ field }) => [`${field.format}:${field.unit ?? ''}`, field])).entries()];
  const axes = plots.map(({ field }) => seriesFields.findIndex(([key]) => key === `${field.format}:${field.unit ?? ''}`));
  const legend = plots.length > 1;
  const zoom = !ranking && (line || labels.length > 12);
  const rankingZoom = ranking && labels.length > 12;
  const category = ranking
    ? categoryAxis(labels, theme, { inverse: true, axisLabel: { color: theme.muted, formatter: (value) => abbreviate(value, 15) } })
    : categoryAxis(labels, theme, { boundaryGap: !line });
  const value = seriesFields.map(([, field], index) => valueAxis(field, theme, {
    ...(ranking ? { position: index % 2 ? 'top' : 'bottom' } : { position: index % 2 ? 'right' : 'left' }),
    offset: Math.floor(index / 2) * 57,
    scale: line, splitLine: { show: index === 0, lineStyle: { color: theme.border } },
  }));
  return {
    color: theme.palette,
    grid: { left: (ranking ? 126 : 62) + Math.floor((seriesFields.length - 1) / 2) * 57,
      right: (rankingZoom ? 47 : seriesFields.length > 1 ? 67 : 20)
        + Math.max(0, Math.floor((seriesFields.length - 2) / 2)) * 57,
      top: legend ? 36 : 17, bottom: zoom ? 53 : 34 },
    xAxis: ranking ? value : category,
    yAxis: ranking ? category : value,
    legend: legend ? { type: 'scroll', top: 1, left: 11, right: 11, textStyle: { color: theme.text } } : undefined,
    tooltip: tooltip(theme, (points) => {
      const index = points[0]?.dataIndex;
      if (index == null) return '';
      return [labels[index], ...points.map(({ seriesIndex }) => {
        const plot = plots[seriesIndex];
        return `${plot.name}  ${formatValue(plot.values[index], plot.field)}`;
      })].join('\n');
    }),
    dataZoom: zoom ? zoomAxes([0], theme) : rankingZoom ? [
      { type: 'slider', yAxisIndex: [0], right: 7, top: 38, bottom: 32, width: 20, showDetail: false,
        showDataShadow: false, brushSelect: false, borderColor: theme.border, fillerColor: theme.selection,
        startValue: 0, endValue: 11 },
    ] : undefined,
    series: plots.map(({ name, values }, index) => ({
      name, data: values, type: line ? 'line' : 'bar',
      ...(ranking ? { xAxisIndex: axes[index] } : { yAxisIndex: axes[index] }),
      ...(line ? { connectNulls: false, showSymbol: labels.length <= 30, symbolSize: 5, lineStyle: { width: 2 } }
        : { barMaxWidth: 34, itemStyle: { borderRadius: ranking ? [0, 4, 4, 0] : [4, 4, 0, 0] } }),
    })),
  };
}

function themeOf(element) {
  const style = getComputedStyle(element);
  const dark = document.body.hasAttribute('data-ds-dark-theme');
  // Computed color resolves host custom properties; the chart palette uses concrete colors.
  return {
    text: style.color, muted: dark ? '#aeb9c9' : '#526076', border: dark ? '#394352' : '#e3e8ef',
    fill: dark ? '#212a38' : '#fff', palette: palettes[dark ? 'dark' : 'light'],
    selection: dark ? 'rgba(134,185,255,.22)' : 'rgba(25,93,179,.13)',
  };
}

export function FinancialChart({ data, template, title }) {
  const chartElement = useRef(null);
  const chartRef = useRef(null);
  const [range, setRange] = useState(0);
  const [error, setError] = useState(false);
  const count = data.labels.length;
  const rangeEnabled = template === 'line' || (template === 'financial' && count > 12);

  useEffect(() => {
    const element = chartElement.current;
    let chart;
    const draw = () => {
      try {
        const theme = themeOf(element);
        const option = seriesOption(data, template, theme);
        if (!chart) {
          chart = init(element, undefined, { renderer: 'canvas' });
          chart.on('datazoom', () => setRange(null));
        }
        chartRef.current = chart;
        chart.setOption({ animation: false, textStyle: { fontFamily: getComputedStyle(element).fontFamily }, ...option },
          { notMerge: true });
        setError(false);
      } catch {
        setError(true);
      }
    };
    const resize = new ResizeObserver(() => {
      if (element.clientWidth === 0 || element.clientHeight === 0) return;
      if (chart) chart.resize();
      else draw();
    });
    const theme = new MutationObserver(() => {
      if (!chart) return;
      setRange(0);
      draw();
    });
    resize.observe(element);
    theme.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    return () => {
      resize.disconnect();
      theme.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, [data, template]);

  function selectRange(points) {
    chartRef.current?.dispatchAction({
      type: 'dataZoom', dataZoomIndex: 0, startValue: points ? Math.max(0, count - points) : 0, endValue: count - 1,
    });
    setRange(points);
  }

  return h('div', { className: 'hf-plot' },
    rangeEnabled && count > 1 && h('div', { className: 'hf-plot-actions' },
      h('p', { className: 'hf-plot-hint hf-note' },
        `拖动范围条，或按住 ${mac ? '⌘' : 'Ctrl'} 滚轮缩放`),
      count > rangeOptions[0] && h('div', { className: 'hf-range', role: 'group', 'aria-label': '选择数据范围' },
        [...rangeOptions.filter((points) => count > points), 0].map((points) => h('button', {
          key: points, type: 'button', className: 'hf-button', 'aria-pressed': range === points,
          onClick: () => selectRange(points),
        }, points ? `近 ${points} 点` : '全部')))),
    h('div', { className: `hf-plot-canvas hf-plot-${template}`, ref: chartElement, role: 'img',
      'aria-label': `${title}，详细记录可在数据表查看` }),
    error && h('p', { className: 'hf-error', role: 'alert' }, '图表暂时无法显示，可查看下方数据表。'),
  );
}
