import {lineChart,klineChart,barChart,donutChart,scatterChart,rankFlowChart,dailyValues,money,number,pct,tone} from './charts.js';

const $ = (selector) => document.querySelector(selector);
const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sym=(r,name='name')=>`<span class="symbol">${esc(r[name]||r.stock_name||r.code||r.ticker)}<small>${esc(r.thscode||r.code||'')}</small></span>`;
const value=(v,kind='pct')=>`<span class="${tone(v)} num">${kind==='money'?money(v):kind==='num'?number(v):pct(v)}</span>`;
const legend=s=>`<div class="legend">${s.map(x=>`<span><i style="background:${esc(x.color)}"></i>${esc(x.name)}</span>`).join('')}</div>`;
const sourceChips=(sources=[])=>`<div class="source-list">${sources.map(x=>`<span class="source-chip">${esc(x.label||x.source)}${x.as_of?` · ${esc(x.as_of)}`:''}</span>`).join('')}</div>`;
const table=(heads,rows)=>`<div class="table-wrap" tabindex="0" role="region" aria-label="数据明细，可横向滚动"><table class="table"><thead><tr>${heads.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td class="empty-cell" colspan="${heads.length}">当前条件下暂无数据</td></tr>`}</tbody></table></div>`;
const finite = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const difference = (left, right) => left === null || right === null ? null : left - right;

function after(draw, element, ...args) {
  draw(element, ...args);
  if (element && !element.querySelector('canvas') && !element.textContent.trim()) {
    element.classList.add('empty-chart');
    element.textContent = '暂无可绘制的数据';
  }
}

function periodReturns(series, days) {
  const aligned = series.map(({ data }) => dailyValues(data));
  const common = [...aligned[0].keys()].filter((date) => aligned.every((values) => values.has(date)))
    .sort((left, right) => left - right);
  if (common.length <= days) return aligned.map(() => null);
  return aligned.map((values) => {
    const first = values.get(common.at(-days - 1));
    return first ? (values.get(common.at(-1)) / first - 1) * 100 : null;
  });
}

function bindTabs(previous) {
  const tabs = Array.from(document.querySelectorAll('[data-table-target]'));
  const tables = Array.from(document.querySelectorAll('[data-table]'));
  const activate = (tab) => {
    for (const table of tables) table.hidden = table.dataset.table !== tab.dataset.tableTarget;
    for (const candidate of tabs) {
      candidate.classList.toggle('active', candidate === tab);
      candidate.setAttribute('aria-pressed', String(candidate === tab));
    }
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab));
    if (tab.dataset.tableTarget === previous) activate(tab);
  }
}

export function allocationPresentation(allocation) {
  const rows = [
    ['股票', allocation?.stock_ratio_pct, '#b85c38'], ['债券', allocation?.bond_ratio_pct, '#496e9c'],
    ['存款', allocation?.deposit_ratio_pct, '#d6a94a'], ['其他', allocation?.other_ratio_pct, '#8c8f87'],
  ].map(([label, value, color]) => ({
    label, color, value: typeof value === 'number' || (typeof value === 'string' && value.trim()) ? finite(value) : null,
  }));
  const disclosed = rows.filter(({ value }) => value !== null);
  const total = disclosed.reduce((sum, { value }) => sum + value, 0);
  // 四个百分比各四舍五入至一位小数时，合计最多偏离 0.2 个百分点。
  const whole = disclosed.length === rows.length && disclosed.every(({ value }) => value >= 0 && value <= 100)
    && Math.abs(total - 100) <= 0.2 + 1e-9;
  if (whole) return { html: '<div id="allocation" class="chart short"></div>', composition: rows };

  const note = disclosed.length < rows.length
    ? `已取得 ${disclosed.length} / ${rows.length} 类资产的披露占比。`
    : '四类资产均有披露值，当前比例无法组成完整分布。';
  const values = table(['资产类别', '披露占比'], rows.map(({ label, value }) => `<tr><td>${label}</td>
    <td>${value === null ? '—' : `${value}%`}</td></tr>`));
  return { html: `<div id="allocation"><p class="notice">${note}</p>${values}</div>`, composition: null };
}

function renderDca(d, params) {
  const s = d.signal, q = d.quotes, p = d.profile || {}, r = d.returns || {}, dd = d.drawdowns || {};
  const base = finite(d.selection.base ?? params.base) ?? 1000;
  const freq = d.selection.frequency ?? params.frequency ?? 'monthly';
  const day = finite(d.selection.day ?? params.day) ?? 10;
  const pe = finite(s.pe_percentile), rsi = finite(s.rsi), hasPe = pe !== null;
  const asOf = d.signal.valuation_scope?.as_of;
  const valuationDate = Number.isFinite(asOf) ? new Date(asOf).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '';
  const mult=!hasPe?1:pe<=20?1.5:pe<=40?1.25:pe>70?.75:1,amount=Math.round(base*mult*100)/100,label=!hasPe?'估值待补，按基础金额测算':mult>1?'估值分位触发计划加码':mult<1?'估值分位触发计划降档':'按基础计划投入';
  const allocation = allocationPresentation(d.allocation_latest);
  const returnRows=[['近1月',r.return_month],['近3月',r.return_tmonth],['近半年',r.return_hyear],['近1年',r.return_year],['同类1年',r.peer_average_year]].filter(([, value]) => finite(value) !== null).map(([label, value]) => ({ label, value: Number(value) }));
  $('#content').innerHTML=`<section class="dca-ledger"><div class="dca-ticket"><span>本期计划单</span><strong>¥${amount.toLocaleString('zh-CN')}</strong><b>${label}</b><dl><div><dt>基础金额</dt><dd>¥${base.toLocaleString('zh-CN')}</dd></div><div><dt>规则倍数</dt><dd>× ${mult.toFixed(2)}</dd></div><div><dt>执行频率</dt><dd>${freq==='monthly'?`每月 ${day} 日`:`每周`}</dd></div><div><dt>执行 ETF</dt><dd>${esc(d.selection.fund)}</dd></div></dl><p>定投金额为规则测算。</p></div><div class="valuation-band"><div class="section-label"><b>ETF 自身跟踪指数估值</b><small>PE 五年分位 · 基金历史指标${valuationDate?` · ${valuationDate}`:''}</small></div><div class="thermometer"><i style="left:${hasPe?Math.max(0,Math.min(100,pe)):0}%"></i></div><div class="band-labels"><span>低估 ≤20</span><span>偏低 20–40</span><span>中性 40–70</span><span>偏高 ＞70</span></div><div class="valuation-read"><strong>${hasPe?`${number(pe,1)}%`:'数据缺失'}</strong><span>RSI ${rsi!==null?number(rsi,1):'—'} · 唐奇安位置 ${number(s.donchian,2)}</span></div><div class="rules"><div class="rule ${hasPe&&pe<=20?'hit':''}"><i>1</i><span>PE 分位 ≤20%<small>倍数 1.50</small></span><b>${hasPe&&pe<=20?'命中':'未命中'}</b></div><div class="rule ${hasPe&&pe>20&&pe<=40?'hit':''}"><i>2</i><span>20%＜PE 分位≤40%<small>倍数 1.25</small></span><b>${hasPe&&pe>20&&pe<=40?'命中':'未命中'}</b></div><div class="rule ${hasPe&&pe>70?'hit':''}"><i>3</i><span>PE 分位＞70%<small>倍数 0.75</small></span><b>${hasPe&&pe>70?'命中':'未命中'}</b></div></div></div></section>
  <div class="dca-evidence"><section class="panel return-panel"><div class="panel-title"><h2>基金收益与同类基准</h2><small>${esc(p.fund_name||d.selection.fund)}</small></div><div id="returns" class="chart short"></div><div class="mini-facts"><span>近一年最大回撤 <b>${pct(dd.year)}</b></span><span>同类排名 <b>${esc(r.rank_year??'—')}/${esc(r.rank_total_year??'—')}</b></span><span>规模 <b>${money(p.fund_scale)}</b></span></div></section><section class="panel"><div class="panel-title"><h2>资产配置</h2><small>披露期数据</small></div>${allocation.html}</section><section class="panel fund-facts"><div class="panel-title"><h2>产品与数据口径</h2><small>Fuyao 基金资料</small></div><p><b>${esc(p.fund_name||d.selection.fund)}</b></p><p>管理人 ${esc(p.mgmt_name||'—')} · 基金经理 ${esc(p.manager_name||'—')}</p><p>ETF 最新单位净值 ${number(q.fund?.last_price,4)} <span class="${tone(q.fund?.price_change_ratio_pct)}">${pct(q.fund?.price_change_ratio_pct)}</span></p></section></div>
  <div class="grid two dca-charts"><section class="panel"><div class="panel-title"><h2>ETF 与比较指数相对表现</h2><small>起点 = 100</small></div>${legend(d.series)}<div id="line" class="chart"></div></section><section class="panel"><div class="panel-title"><h2>比较指数价格结构</h2><small>日线蜡烛 · MA20 + VOL</small></div><div id="kline" class="chart"></div></section></div>`;
  after(barChart, $('#returns'), returnRows, { horizontal: true, percent: true });
  if (allocation.composition) donutChart($('#allocation'), allocation.composition);
  after(lineChart, $('#line'), d.series);
  after(klineChart, $('#kline'), d.bars);
}

export function etfFeeHighlight(rows) {
  const disclosed = rows.filter(({ fee }) => Number.isFinite(fee));
  if (!disclosed.length) return { label: '数据不足', rate: null };
  const rate = Math.min(...disclosed.map(({ fee }) => fee));
  if (disclosed.length === 1) return { label: '1 只费率可用', rate };
  const lowest = disclosed.filter(({ fee }) => fee === rate);
  return { label: lowest.length > 1 ? `并列 ${lowest.length} 只` : lowest[0].code, rate };
}

function renderEtf(d) {
  const rows = d.rows.map((row) => ({ ...row, deviation: finite(row.deviation), fee: finite(row.management_fee_pct) }));
  const scale = rows.filter((row) => finite(row.scale) !== null).sort((a, b) => b.scale - a.scale)[0];
  const fee = etfFeeHighlight(rows);
  const track = rows.filter((row) => row.deviation !== null).sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation))[0];
  $('#content').innerHTML=`<section class="etf-scoreboard"><div><span>规模优先</span><strong>${esc(scale?.code||'数据不足')}</strong><small>${scale?money(scale.scale):'缺少规模'}</small></div><div><span>已披露年管理费率</span><strong>${esc(fee.label)}</strong><small>${fee.rate===null?'暂无可比管理费率':`${number(fee.rate, 3)}%`}</small></div><div><span>净值贴合优先</span><strong>${esc(track?.code||'数据不足')}</strong><small>60日相对偏离 ${track?pct(track.deviation):'—'}</small></div></section>
  <div class="etf-workbench"><section class="panel"><div class="panel-title"><h2>基金规模 × 相对偏离</h2><small>纵轴为净值相对指数表现</small></div><div id="etf-scatter" class="chart tall"></div></section><section class="panel"><div class="panel-title"><h2>净值与指数走势</h2><small>净值口径 · 起点100</small></div>${legend(d.series)}<div id="line" class="chart tall"></div></section></div>
  <section class="panel etf-matrix"><div class="panel-title"><h2>同指数 ETF 选择矩阵</h2><small>相对偏离不是标准化跟踪误差</small></div>${table(['ETF','管理人','规模','最新单位净值','单日净值变化','60日相对指数','标准年管理费率'],rows.map(r=>`<tr><td>${sym(r)}</td><td>${esc(r.manager||'—')}</td><td>${money(r.scale)}</td><td>${number(r.last,4)}</td><td>${value(r.change)}</td><td>${r.deviation===null?'—':value(r.deviation)}</td><td>${r.fee===null?'—':`${number(r.fee, 3)}%`}</td></tr>`))}</section>`;
  const points = rows.filter((row) => finite(row.scale) > 0 && row.deviation !== null)
    .map((row, i) => ({ label: row.code, x: Math.log10(row.scale), y: row.deviation, size: 9,
      color: ['#3157d5', '#8a54cc', '#18a27b', '#d06a3d', '#d3a629', '#68768c'][i] }));
  after(scatterChart, $('#etf-scatter'), points, { xLabel: '基金规模(log)', yLabel: '60日相对偏离' });
  after(lineChart, $('#line'), d.series);
}

function renderAuction(d){
  const rows = d.rows ?? [], ctx = d.context?.items ?? [];
  const market = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const minute = market.getHours() * 60 + market.getMinutes();
  const active = d.phase === 'closed' || market.getDay() === 0 || market.getDay() === 6 ? -1
    : minute >= 555 && minute < 560 ? 0 : minute >= 560 && minute < 565 ? 1 : minute >= 565 && minute <= 570 ? 2 : -1;
  $('#content').innerHTML=`<div class="phase-strip"><div class="${active===0?'active':''}"><b>09:15–09:20</b> 可撤单 / 观察试探</div><div class="${active===1?'active':''}"><b>09:20–09:25</b> 不可撤 / 重点确认</div><div class="${active===2?'active':''}"><b>09:25–09:30</b> 撮合完成 / 准备开盘</div></div>
  <div class="auction-grid ${ctx.length?'':'no-context'}"><section class="panel auction-scatter"><div class="panel-title"><h2>竞价量价分布</h2><small>横轴竞价涨幅 · 纵轴量比 · 气泡=竞价金额</small></div><div id="auction-scatter" class="chart tall"></div></section>${ctx.length?`<aside class="panel context-console"><div class="panel-title"><h2>隔夜与盘前事实</h2><small>不合成主观分数</small></div><div class="context-list">${ctx.map(x=>`<div class="context-item"><span>${esc(x.label)}<small>${esc(x.group)} · ${esc(x.as_of||'')}</small></span><b>${esc(x.value)}</b></div>`).join('')}</div>${sourceChips(d.context?.sources||[])}</aside>`:''}<aside class="panel benchmark"><div class="panel-title"><h2>Fuyao 短线竞价基准</h2><small>独立参考组</small></div>${(d.benchmark||[]).length?(d.benchmark||[]).map(x=>`<div class="benchmark-row"><span>${sym(x)}</span><b class="${tone(x.auction_pct)}">${pct(x.auction_pct)}</b><small>${esc(x.label||x.tag_name||'')}</small></div>`).join(''):'<div class="notice">当前基准数据不可用，不影响自选股竞价快照。</div>'}</aside></div>
  <section class="panel auction-table"><div class="panel-title"><h2>自选股竞价明细</h2><small>${esc(({ final: '终态', live: '实时', unknown: '状态未知', pending: '尚未开始' })[d.data_status] ?? d.data_status)} · ${rows.length} 只</small></div>${table(['标的','竞价价','幅度','竞价金额','未匹配量','量比','昨量占比'],rows.map(r=>`<tr><td>${sym(r)}</td><td>${number(r.auction_price,2)}</td><td>${value(r.auction_pct)}</td><td>${money(r.auction_amount)}</td><td>${number(r.auction_unmatched,0)}</td><td>${number(r.auction_volume_ratio)}</td><td>${pct(r.auction_yesterday_ratio_pct)}</td></tr>`))}</section>`;
  const points = rows.filter((row) => finite(row.auction_pct) !== null && finite(row.auction_volume_ratio) !== null)
    .map((row) => ({ label: row.name ?? row.thscode, x: Number(row.auction_pct), y: Number(row.auction_volume_ratio),
      size: 5 + Math.min(12, Math.log10(Math.max(1, finite(row.auction_amount) ?? 1))),
      color: Number(row.auction_pct) >= 0 ? '#e64b55' : '#17b184' }));
  after(scatterChart, $('#auction-scatter'), points, { xLabel: '竞价涨幅%', yLabel: '量比' });
}

function renderLimit(d){
  const l = d.ladder?.boards ?? {};
  const rate = finite(d.stats.break_rate);
  const retain = rate === null ? null : 100 - rate;
  const mood = rate === null ? '炸板率暂无数据' : rate < 20 ? '封板稳定' : rate < 35 ? '分歧可控' : '炸板压力偏高';
  const rowHtml = (kind,list)=>table(['标的','状态','涨跌幅','连板 / 开板','题材原因','封单 / 成交'],list.map(r=>`<tr><td>${sym(r)}</td><td class="${kind==='涨停'?'up':kind==='跌停'?'down':'gold'}">${kind}</td><td>${value(r.price_change_ratio_pct)}</td><td>${kind==='炸板'?`开 ${number(r.open_times,0)} 次`:`${number(r.continue_day_cnt,0)} 板`}</td><td>${esc(r.limit_up_reason||'—')}</td><td>${money(r.seal_money??r.turnover)}</td></tr>`));
  $('#content').innerHTML=`<header class="limit-head"><div><span>市场情绪截面</span><strong>${mood}</strong></div><dl><div><dt>涨停样本</dt><dd class="up">${esc(d.stats.up)}${d.stats.up!=null&&d.stats.truncated?'＋':''}</dd></div><div><dt>炸板率</dt><dd class="gold">${pct(rate)}</dd></div><div><dt>封板留存</dt><dd>${pct(retain)}</dd></div><div><dt>跌停样本</dt><dd class="down">${esc(d.stats.down)}${d.stats.down!=null&&d.stats.truncated?'＋':''}</dd></div></dl></header><div class="limit-layout"><section class="panel reason-chart"><div class="panel-title"><h2>涨停题材分布</h2><small>按 Fuyao 涨停原因统计</small></div><div id="reasons" class="chart tall ${d.reasons?.length?'':'empty-chart'}">${d.reasons?.length?'':'所选日期暂无可用涨停池样本。'}</div></section><section class="panel ladder-board"><div class="panel-title"><h2>连板高度结构</h2><small>${esc(d.ladder?.date||'交易日梯队')}</small></div><div class="ladder">${[['two_board','二板'],['three_board','三板'],['four_board','四板'],['five_board','五板+']].map(([k,t])=>`<div><h3>${t}</h3>${(l[k]||[]).length?(l[k]||[]).map(x=>`<p>${esc(x.name)} <b class="up">${number(x.board_num,0)}</b></p>`).join(''):'<p class="muted">暂无</p>'}</div>`).join('')}</div></section></div><section class="limit-ledger"><div class="tabs"><button class="tab active" aria-pressed="true" data-table-target="up">涨停池</button><button class="tab" aria-pressed="false" data-table-target="breaks">炸板池</button><button class="tab" aria-pressed="false" data-table-target="down">跌停池</button></div><div data-table="up">${rowHtml('涨停',d.up)}</div><div data-table="breaks" hidden>${rowHtml('炸板',d.breaks)}</div><div data-table="down" hidden>${rowHtml('跌停',d.down)}</div></section>`;
  after(barChart,$('#reasons'),d.reasons||[],{horizontal:true});
}

function renderHot(d){
  const indexed = (rows) => new Map(rows.filter((row) => row.thscode).map((row) => [row.thscode, row]));
  const dayMap = indexed(d.day), historyMap = indexed(d.history);
  const rows = d.hour;
  const hourCovered = ['ok', 'empty'].includes(d.coverage?.hour);
  const known = (field) => new Set(rows.filter((row) => row[field] === true && row.thscode).map((row) => row.thscode)).size;
  const fast = d.comparisons?.fast_count ?? known('fast');
  const persist = d.comparisons?.persistent_count ?? known('persist');
  const attention = !hourCovered && !rows.length ? '小时榜暂不可用'
    : fast ? `已确认 ${fast} 只快速升温` : d.comparisons?.fast_count === 0 ? '未见快速升温标的' : '升温情况待确认';
  const overlap = persist ? `已确认 ${persist} 只同时进入小时与24小时榜`
    : d.comparisons?.persistent_count === 0 ? '暂无同时进入两榜的标的' : '双榜重合情况待确认';
  const labels = { rising: '快速升温', persistent: '持续在榜', 'hour-only': '小时新增' };
  const state = (row) => labels[row.classification] ?? '关联状态未知';
  const movers = rows.filter((row) => finite(row.rank_change) !== null)
    .sort((left, right) => Number(right.rank_change) - Number(left.rank_change)).slice(0, 8);
  const current = indexed(rows);
  const unique = [...indexed([...d.day, ...rows]).values(), ...rows.filter((row) => !row.thscode)];
  const flow = unique.slice(0, 12).map((row, i) => ({ label: row.name,
    color: ['#6b4bd3', '#eb5a7a', '#2a8bd3', '#21a579', '#e2a72e'][i % 5],
    ranks: [historyMap.get(row.thscode)?.rank, dayMap.get(row.thscode)?.rank, current.get(row.thscode)?.rank] }));
  $('#content').innerHTML=`<section class="hot-hero"><div><span>注意力状态</span><strong>${attention}</strong><p>${overlap}。</p></div><div class="heat-pills">${rows.slice(0,5).map(x=>`<b>${number(x.rank,0)}<small>${esc(x.name)}</small></b>`).join('')}</div></section><div class="hot-layout"><section class="panel rank-flow"><div class="panel-title"><h2>历史 → 24H → 小时名次流</h2><small>Fuyao 历史热股 + 当前榜单</small></div><div id="rank-flow" class="chart tall"></div></section><aside class="panel mover-list"><div class="panel-title"><h2>关注度加速</h2><small>小时排名变化</small></div>${movers.map(x=>`<div class="mover-line"><span>${sym(x)}</span><b class="${tone(x.rank_change)}">${Number(x.rank_change)>0?'+':''}${number(x.rank_change,0)}</b><small>${state(x)}</small></div>`).join('')||'<div class="notice">当前暂无关注度变化数据</div>'}</aside></div><section class="panel hot-table"><div class="panel-title"><h2>三榜交叉明细</h2><small>历史数据 ${esc(d.history_date||'不可用')}</small></div>${table(['标的','历史','24H','小时','排名变化','状态','热度'],rows.map(r=>`<tr><td>${sym(r)}</td><td>${number(r.history_rank,0)}</td><td>${number(r.day_rank,0)}</td><td>${number(r.rank,0)}</td><td>${value(r.rank_change,'num')}</td><td><span class="evidence-tag${r.fast||r.persist?' matched':''}">${state(r)}</span></td><td>${number(r.heat,0)}</td></tr>`))}</section>${hotRankingTabs(d)}`;
  after(rankFlowChart,$('#rank-flow'),flow);
}

function hotRankingTabs(data) {
  const groups = [['hour', '小时榜', data.hour], ['day', '24 小时榜', data.day], ['rise', '飙升榜', data.rise]];
  return `<section class="panel hot-table"><div class="panel-title"><h2>榜单明细</h2></div>
    <div class="tabs">${groups.map(([id, label], index) => `<button class="tab${index === 0 ? ' active' : ''}"
      aria-pressed="${index === 0}" data-table-target="${id}">${label}</button>`).join('')}</div>
    ${groups.map(([id, , rows], index) => `<div data-table="${id}" ${index ? 'hidden' : ''}>
      ${table(['标的', '名次', '名次变化', '热度'], rows.map((row) => `<tr><td>${sym(row)}</td>
        <td>${number(row.rank, 0)}</td><td>${value(row.rank_change, 'num')}</td><td>${number(row.heat, 0)}</td></tr>`))}
      </div>`).join('')}</section>`;
}

function renderDragon(d){
  const dragonMap = new Map();
  for (const row of d.dragon) {
    if (!row.thscode) continue;
    if (!dragonMap.has(row.thscode)) dragonMap.set(row.thscode, []);
    dragonMap.get(row.thscode).push(row);
  }
  const quoteMap = new Map(d.quotes.filter((row) => row.thscode).map((row) => [row.thscode, row]));
  const merged = d.anomaly.map((row) => ({ ...row, matches: dragonMap.get(row.thscode) ?? [], quote: quoteMap.get(row.thscode) }));
  const counts = d.stock_counts ?? {};
  const matched = counts.matched;
  const inst = counts.org_positive;
  const hot = counts.hot_money_positive;
  const board = d.selection?.board;
  const netField = board === 'hot_money' ? 'hot_money_item_net_value' : 'net_value';
  const netTitle = board === 'hot_money' ? '该席位净额' : '榜单净额';
  const flows = d.dragon.filter((row) => finite(row[netField]) !== null).slice(0, 9)
    .map((row) => ({ label: row.name, value: Number(row[netField]), color: Number(row[netField]) >= 0 ? '#a63e37' : '#267461' }));
  $('#content').innerHTML=`<section class="case-summary"><div><span>盘中异动记录</span><strong>${esc(d.anomaly_count??(d.anomaly.length||null))}</strong><small>分钟级线索</small></div><i>→</i><div><span>同代码上榜个股</span><strong>${esc(matched)}</strong><small>${esc(d.trade_date||'榜单日期暂无')}</small></div><i>→</i><div><span>机构净买个股</span><strong>${esc(inst)}</strong><small>同代码资金证据</small></div><div><span>游资净买个股</span><strong>${esc(hot)}</strong><small>同代码资金证据</small></div></section><div class="case-layout"><section class="panel evidence-flow"><div class="panel-title"><h2>${netTitle}分布</h2><small>正值净买入 · 负值净卖出</small></div><div id="dragon-flow" class="chart tall"></div></section><section class="panel clue-stream"><div class="panel-title"><h2>盘中异动线索</h2><small>与当前行情并列阅读</small></div>${merged.slice(0,9).map(x=>`<article><b>${esc(x.stock_name)}</b><span class="${tone(x.quote?.price_change_ratio_pct)}">${pct(x.quote?.price_change_ratio_pct)}</span><small>${esc(x.tag_name)} · ${esc(x.analysis_content)}</small><em class="evidence-tag ${x.matches.length?'matched':''}">${x.matches.length?'同代码上榜':'暂无同代码记录'}</em></article>`).join('')||'<div class="notice">当前暂无盘中异动线索</div>'}</section></div><section class="panel case-table"><div class="panel-title"><h2>异动—行情—席位合并表</h2><small>不将龙虎榜表述为异动原因验证</small></div>${table(['标的','当前涨跌','异动类型','异动说明','关联状态',netTitle,'机构净额','游资净额'],merged.map(r=>`<tr><td>${sym(r,'stock_name')}</td><td>${value(r.quote?.price_change_ratio_pct)}</td><td>${esc(r.tag_name)}</td><td style="max-width:320px;white-space:normal;text-align:left">${esc(r.analysis_content)}</td><td>${r.matches.length?'<span class="evidence-tag matched">同代码上榜</span>':'<span class="evidence-tag">暂无同代码记录</span>'}</td><td>${r.matches.length?value(r.matches.length===1?r.matches[0][netField]:null,'money'):'—'}</td><td>${r.matches.length?value(r.matches.length===1?r.matches[0].org_net_value:null,'money'):'—'}</td><td>${r.matches.length?value(r.matches.length===1?r.matches[0].hot_money_net_value:null,'money'):'—'}</td></tr>`))}</section>${dragonRows(d)}`;
  after(barChart,$('#dragon-flow'),flows,{horizontal:true});
}

function dragonRows(data) {
  const bySeat = data.selection?.board === 'hot_money';
  const columns = bySeat ? ['席位', '标的', '上榜理由', '该席位净额']
    : ['标的', '上榜理由', '榜单净额', '机构净额', '游资净额'];
  const rows = data.dragon.map((row) => {
    const stock = `<td>${sym(row)}</td><td>${esc(row.reason ?? row.reason_detail ?? row.tag_name)}</td>`;
    if (bySeat) return `<tr><td>${esc(row.seat_name ?? row.seat_id)}</td>${stock}<td>${value(row.hot_money_item_net_value, 'money')}</td></tr>`;
    return `<tr>${stock}<td>${value(row.net_value, 'money')}</td><td>${value(row.org_net_value, 'money')}</td>
      <td>${value(row.hot_money_net_value, 'money')}</td></tr>`;
  });
  return `<section class="panel case-table"><div class="panel-title"><h2>龙虎榜明细</h2><small>${esc(data.trade_date)}</small></div>
    ${table(columns, rows)}</section>`;
}

function renderLinkage(d){
  const q = d.quotes, [stock, sector, index] = d.series, breadth = d.breadth ?? {};
  const sr = finite(q.stock?.price_change_ratio_pct), br = finite(q.sector?.price_change_ratio_pct);
  const ir = finite(q.index?.price_change_ratio_pct);
  const [s20, b20, i20] = periodReturns(d.series, 20), [s60, b60, i60] = periodReturns(d.series, 60);
  const state = [sr, br, ir].some((change) => change === null) ? '快照不足，等待方向确认'
    : sr > br && br > ir ? '个股 > 板块 > 指数' : sr < br && br < ir ? '个股 < 板块 < 指数'
      : Math.sign(sr) === Math.sign(br) && Math.sign(br) === Math.sign(ir) ? '方向一致，强弱混合' : '方向分化';
  const membership = d.membership?.verified === true ? '已由成分股列表验证' : d.membership?.verified === false ? '未在成分股列表中查到' : '数据不足';
  const coverage = breadth.requested > 0
    ? `前 ${breadth.requested} 只可识别成分股发起行情查询，${breadth.sample} 只参与上涨广度计算`
    : '暂无可用成分股行情';
  $('#content').innerHTML=`<section class="link-map"><div class="node stock-node"><span>个股</span><strong>${esc(d.selection.stock)}</strong><b class="${tone(sr)}">${pct(sr)}</b></div><i>相对板块 ${pct(difference(sr,br))}</i><div class="node sector-node"><span>板块</span><strong>${esc(d.selection.sector)}</strong><b class="${tone(br)}">${pct(br)}</b></div><i>相对指数 ${pct(difference(br,ir))}</i><div class="node index-node"><span>指数</span><strong>${esc(d.selection.index)}</strong><b class="${tone(ir)}">${pct(ir)}</b></div></section><div class="link-state"><strong>${state}</strong><span>板块归属 ${membership} · 板块上涨广度 ${breadth.ratio===null?'—':pct(breadth.ratio)}${breadth.sample?`（${esc(breadth.rising)}/${esc(breadth.sample)}）`:''} · ${coverage}</span></div><div class="link-dashboard"><section class="panel relative-chart"><div class="panel-title"><h2>1日 / 20日 / 60日相对强弱</h2><small>按共同交易日计算累计变化</small></div><div class="period-matrix"><div></div><b>1日</b><b>20日</b><b>60日</b>${[[stock,sr,s20,s60],[sector,br,b20,b60],[index,ir,i20,i60]].map(([x,a,b,c])=>`<span>${esc(x.name)}</span><strong class="${tone(a)}">${pct(a)}</strong><strong class="${tone(b)}">${pct(b)}</strong><strong class="${tone(c)}">${pct(c)}</strong>`).join('')}</div><div id="leaders" class="chart short"></div></section><section class="panel"><div class="panel-title"><h2>三者归一化走势</h2><small>起点 = 100</small></div>${legend(d.series)}<div id="line" class="chart tall"></div></section><section class="panel"><div class="panel-title"><h2>个股日线结构</h2><small>日线蜡烛 · MA20 + VOL</small></div><div id="kline" class="chart tall"></div></section></div>`;
  after(barChart,$('#leaders'),(breadth.leaders||[]).filter(x=>finite(x.price_change_ratio_pct)!==null).map(x=>({label:x.name||x.thscode,value:Number(x.price_change_ratio_pct)})),{horizontal:true,percent:true});after(lineChart,$('#line'),d.series);after(klineChart,$('#kline'),d.bars);
}

function renderLocalMarketPanel({ selection, coverage, rows }) {
  const coverageRows = coverage.map(({ thscode, start, end, days }) =>
    `<tr><td>${esc(thscode)}</td><td>${esc(start)}</td><td>${esc(end)}</td><td>${number(days, 0)}</td></tr>`);
  const bars = rows.map(({ thscode, date, open, high, low, close, volume }) =>
    `<tr><td>${esc(thscode)}</td><td>${esc(date)}</td><td>${number(open)}</td><td>${number(high)}</td>
    <td>${number(low)}</td><td>${number(close)}</td><td>${number(volume, 0)}</td></tr>`);
  $('#content').innerHTML = `<section class="panel">
    <div class="panel-title"><h2>实际记录范围</h2><small>${esc(selection.start)} 至 ${esc(selection.end)}</small></div>
    <p>起止日期和条数以本地实际记录为准。核对完整覆盖时请结合交易日历。</p>
    ${table(['标的', '最早记录', '最新记录', '记录数'], coverageRows)}
  </section><section class="panel">
    <div class="panel-title"><h2>未复权日线明细</h2><small>本地数据 · ${number(rows.length, 0)} 条</small></div>
    ${table(['标的', '交易日', '开盘价（元）', '最高价（元）', '最低价（元）', '收盘价（元）', '成交量（股）'], bars)}
  </section>`;
}

const renderers={'fund-dca':renderDca,'etf-compare':renderEtf,'auction-radar':renderAuction,'limit-break':renderLimit,'hot-rank':renderHot,'dragon-anomaly':renderDragon,'stock-sector-index':renderLinkage,'local-market-panel':renderLocalMarketPanel};

export function renderBoard(page, data, params) {
  const selectedTab = $('[data-table-target][aria-pressed="true"]')?.dataset.tableTarget;
  renderers[page](data, params);
  bindTabs(selectedTab);
}
