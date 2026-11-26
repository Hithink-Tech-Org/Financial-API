export function money(v){if(v===null||v===undefined||v==='')return '—';const x=Number(v);if(!Number.isFinite(x))return '—';if(Math.abs(x)>=1e8)return `${(x/1e8).toFixed(2)}亿`;if(Math.abs(x)>=1e4)return `${(x/1e4).toFixed(1)}万`;return x.toLocaleString('zh-CN')}
export function number(v,d=2){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toFixed(d):'—'}
export function pct(v){if(v===null||v===undefined||v==='')return '—';const x=Number(v);return Number.isFinite(x)?`${x>0?'+':''}${x.toFixed(2)}%`:'—'}
export function tone(v){return Number(v)>0?'up':Number(v)<0?'down':''}
export function time(v){return v?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(v)):'—'}

const chartColor=(el,name)=>getComputedStyle(el).getPropertyValue(`--${name}`).trim();
function canvas(el){if(!el)return null;el._dispose?.();el.classList.remove('empty-chart');const c=document.createElement('canvas');c.setAttribute('role','img');c.setAttribute('aria-label',el.closest('.panel')?.querySelector('h2')?.textContent||'数据图表');el.replaceChildren(c);return {c,ctx:c.getContext('2d')}}
function responsive(el,c,ctx,paint){const draw=()=>{const r=el.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,r.width*dpr);c.height=Math.max(1,r.height*dpr);c.style.width=`${r.width}px`;c.style.height=`${r.height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);paint(r.width,r.height)};draw();const ro=new ResizeObserver(draw);ro.observe(el);el._dispose=()=>ro.disconnect()}

const shanghaiOffset = 8 * 60 * 60 * 1000;
const day = 86_400_000;
const axisDate = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' });

export function dailyValues(data) {
  return new Map(data.filter(({ timestamp, value }) => Number.isFinite(timestamp) && Number.isFinite(value))
    .map(({ timestamp, value }) => [Math.floor((timestamp + shanghaiOffset) / day) * day - shanghaiOffset, value]));
}

export function lineChart(el, series) {
  if (!el) return;
  const inputs = series.map(({ color, data }) => ({ color, points: dailyValues(data) }))
    .filter(({ points }) => points.size > 0);
  if (!inputs.length) return;
  const firstShared = [...inputs[0].points.keys()].sort((a, b) => a - b)
    .find((date) => inputs.every(({ points }) => points.get(date) > 0));
  if (firstShared === undefined) {
    el.classList.add('empty-chart');
    el.textContent = '各序列暂无共同交易日。';
    return;
  }
  const rebased = inputs.map(({ color, points }) => ({
    color,
    values: new Map([...points].filter(([date]) => date >= firstShared)
      .map(([date, value]) => [date, value / points.get(firstShared) * 100])),
  }));
  const dates = [...new Set(rebased.flatMap(({ values }) => [...values.keys()]))].sort((a, b) => a - b);
  const values = rebased.flatMap((line) => [...line.values.values()]);
  const min = Math.min(...values, 99.99);
  const max = Math.max(...values, 100.01);
  const { c, ctx } = canvas(el);
  responsive(el, c, ctx, (width, height) => {
    const p = { l: 42, r: 14, t: 14, b: 28 };
    const xAt = (index) => p.l + index / Math.max(1, dates.length - 1) * (width - p.l - p.r);
    const yAt = (value) => p.t + (max - value) / (max - min) * (height - p.t - p.b);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = chartColor(el, 'line');
    ctx.fillStyle = chartColor(el, 'muted');
    ctx.font = '10px sans-serif';
    for (let i = 0; i < 4; i++) {
      const level = max - (max - min) * i / 3;
      ctx.beginPath();
      ctx.moveTo(p.l, yAt(level));
      ctx.lineTo(width - p.r, yAt(level));
      ctx.stroke();
      ctx.fillText(level.toFixed(1), 4, yAt(level) + 3);
    }
    ctx.fillText(axisDate.format(dates[0]), p.l, height - 6);
    if (dates.length > 1) {
      ctx.textAlign = 'right';
      ctx.fillText(axisDate.format(dates.at(-1)), width - p.r, height - 6);
    }
    for (const { color, values } of rebased) {
      ctx.fillStyle = ctx.strokeStyle = color || '#57a7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let previous = false;
      for (const [index, date] of dates.entries()) {
        const value = values.get(date);
        if (!Number.isFinite(value)) {
          previous = false;
          continue;
        }
        const x = xAt(index), y = yAt(value);
        if (previous) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        if (!previous && !values.has(dates[index + 1])) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        previous = true;
      }
      ctx.stroke();
    }
  });
}

export function barChart(el,rows,{horizontal=true,percent=false}={}){
  if(!el||!rows?.length)return;const {c,ctx}=canvas(el),valid=rows.filter(x=>Number.isFinite(Number(x.value)));if(!valid.length)return;
  responsive(el,c,ctx,(w,h)=>{ctx.clearRect(0,0,w,h);const p={l:horizontal?88:34,r:horizontal?78:18,t:16,b:28},max=Math.max(...valid.map(x=>Math.abs(Number(x.value))),1),slot=(horizontal?(h-p.t-p.b):(w-p.l-p.r))/valid.length;
    ctx.font='11px sans-serif';valid.forEach((x,i)=>{const v=Number(x.value),color=x.color||(v>=0?'#d9343e':'#079267');ctx.fillStyle=chartColor(el,'muted');if(horizontal){const y=p.t+i*slot+slot*.2,bh=slot*.55,barW=Math.abs(v)/max*(w-p.l-p.r);ctx.textAlign='right';ctx.fillText(String(x.label).slice(0,8),p.l-8,y+bh*.78);ctx.fillStyle=color;ctx.fillRect(p.l,y,barW,bh);ctx.textAlign='right';ctx.fillStyle=chartColor(el,'muted');ctx.fillText(percent?pct(v):money(v),w-8,y+bh*.78)}else{const x0=p.l+i*slot+slot*.2,bw=slot*.58,bh=Math.abs(v)/max*(h-p.t-p.b);ctx.fillStyle=color;ctx.fillRect(x0,h-p.b-bh,bw,bh);ctx.textAlign='center';ctx.fillStyle=chartColor(el,'muted');ctx.fillText(String(x.label).slice(0,6),x0+bw/2,h-8)}})});
}

export function donutChart(el,rows){
  if(!el||!rows?.some(x=>Number(x.value)>0))return;const {c,ctx}=canvas(el),total=rows.reduce((a,x)=>a+Math.max(0,Number(x.value)||0),0);
  responsive(el,c,ctx,(w,h)=>{ctx.clearRect(0,0,w,h);const cx=w*.36,cy=h*.5,r=Math.min(w,h)*.32,inner=r*.6;let a=-Math.PI/2;rows.forEach(x=>{const span=Math.max(0,Number(x.value)||0)/total*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,r,a,a+span);ctx.arc(cx,cy,inner,a+span,a,true);ctx.closePath();ctx.fillStyle=x.color;ctx.fill();a+=span});ctx.font='11px sans-serif';rows.forEach((x,i)=>{ctx.fillStyle=x.color;ctx.fillRect(w*.68,28+i*24,8,8);ctx.fillStyle=chartColor(el,'muted');ctx.fillText(`${String(x.label).slice(0,8)} ${x.value}%`,w*.68+14,37+i*24)})});
}

export function scatterChart(el,rows,{xLabel='X',yLabel='Y'}={}){
  if(!el||!rows?.length)return;const {c,ctx}=canvas(el),xs=rows.map(x=>Number(x.x)).filter(Number.isFinite),ys=rows.map(x=>Number(x.y)).filter(Number.isFinite);if(!xs.length||!ys.length)return;
  responsive(el,c,ctx,(w,h)=>{ctx.clearRect(0,0,w,h);const p={l:48,r:22,t:20,b:40},xmin=Math.min(...xs,0),xmax=Math.max(...xs,1),ymin=Math.min(...ys,0),ymax=Math.max(...ys,1),xa=v=>p.l+(v-xmin)/Math.max(.001,xmax-xmin)*(w-p.l-p.r),ya=v=>p.t+(ymax-v)/Math.max(.001,ymax-ymin)*(h-p.t-p.b);ctx.strokeStyle=chartColor(el,'line');ctx.beginPath();ctx.moveTo(p.l,ya(0));ctx.lineTo(w-p.r,ya(0));ctx.moveTo(xa(0),p.t);ctx.lineTo(xa(0),h-p.b);ctx.stroke();ctx.fillStyle=chartColor(el,'muted');ctx.font='10px sans-serif';ctx.textAlign='right';ctx.fillText(xLabel,w-p.r,h-10);ctx.textAlign='left';ctx.fillText(yLabel,6,p.t+5);rows.forEach(x=>{const px=xa(Number(x.x)||0),py=ya(Number(x.y)||0),r=Math.max(5,Math.min(15,Number(x.size)||8));ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fillStyle=x.color||'rgba(23,105,224,.72)';ctx.fill();ctx.fillStyle=chartColor(el,'muted');const label=String(x.label).slice(0,9),labelWidth=ctx.measureText(label).width;ctx.textAlign=px+r+4+labelWidth>w-p.r?'right':'left';ctx.fillText(label,ctx.textAlign==='right'?px-r-4:px+r+4,py+3);ctx.textAlign='left'})});
}

export function rankFlowChart(el,rows){
  if(!el||!rows?.length)return;const {c,ctx}=canvas(el),cols=['历史','24H','小时'];responsive(el,c,ctx,(w,h)=>{ctx.clearRect(0,0,w,h);const xs=[74,w/2,w-90],top=32,usable=h-52,maxRank=Math.max(30,...rows.flatMap(r=>r.ranks.filter(Number.isFinite))),y=v=>top+(Math.max(1,v)-1)/Math.max(1,maxRank-1)*usable;ctx.font='10px sans-serif';ctx.fillStyle=chartColor(el,'muted');cols.forEach((x,i)=>ctx.fillText(x,xs[i]-12,14));rows.forEach((r,i)=>{ctx.strokeStyle=r.color||['#5a4bb4','#d9343e','#146b92','#079267','#d98200'][i%5];ctx.lineWidth=i<3?2:1;ctx.globalAlpha=i<6?.85:.3;ctx.beginPath();r.ranks.forEach((v,j)=>{if(!Number.isFinite(v))return;const yy=y(v);Number.isFinite(r.ranks[j-1])?ctx.lineTo(xs[j],yy):ctx.moveTo(xs[j],yy)});ctx.stroke();ctx.globalAlpha=1;const last=r.ranks[2];if(Number.isFinite(last)){ctx.fillStyle=ctx.strokeStyle;ctx.fillText(String(r.label).slice(0,7),xs[2]+7,y(last)+3)}})});
}

export function klineChart(el,bars){
  if(!el||!bars?.length)return;
  const data = bars.filter((row) => [row.timestamp, row.open, row.high, row.low, row.close].every(Number.isFinite)).slice(-90);
  if(!data.length)return;const {c,ctx}=canvas(el);
  responsive(el,c,ctx,(w,h)=>{ctx.clearRect(0,0,w,h);const p={l:48,r:12,t:18,b:22},volumeH=Math.max(42,h*.2),priceBottom=h-p.b-volumeH-12,high=Math.max(...data.map(x=>x.high)),low=Math.min(...data.map(x=>x.low)),range=Math.max(.001,high-low),maxVolume=Math.max(1,...data.map(x=>x.volume)),slot=(w-p.l-p.r)/data.length,body=Math.max(1,Math.min(7,slot*.62)),y=v=>p.t+(high-v)/range*(priceBottom-p.t);
    ctx.font='10px sans-serif';ctx.strokeStyle=chartColor(el,'line');ctx.fillStyle=chartColor(el,'muted');ctx.lineWidth=1;for(let i=0;i<4;i++){const yy=p.t+i*(priceBottom-p.t)/3,val=high-range*i/3;ctx.beginPath();ctx.moveTo(p.l,yy);ctx.lineTo(w-p.r,yy);ctx.stroke();ctx.fillText(val.toFixed(2),3,yy+3)}
    data.forEach((x,i)=>{const xx=p.l+(i+.5)*slot,up=x.close>=x.open,color=up?'#d9343e':'#079267',top=y(Math.max(x.open,x.close)),bottom=y(Math.min(x.open,x.close));ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(xx,y(x.high));ctx.lineTo(xx,y(x.low));ctx.stroke();ctx.fillRect(xx-body/2,top,body,Math.max(1,bottom-top));if(Number.isFinite(x.volume)){const vh=x.volume/maxVolume*volumeH;ctx.globalAlpha=.45;ctx.fillRect(xx-body/2,h-p.b-vh,body,vh);ctx.globalAlpha=1}});
    const ma=data.map((_,i)=>i<19?null:data.slice(i-19,i+1).reduce((sum,x)=>sum+x.close,0)/20);ctx.strokeStyle='#d6a94a';ctx.lineWidth=1.5;ctx.beginPath();ma.forEach((v,i)=>{if(v===null)return;const xx=p.l+(i+.5)*slot,yy=y(v);i===19?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy)});ctx.stroke();ctx.fillStyle='#d6a94a';ctx.fillText('MA20',p.l+4,p.t+11);ctx.fillStyle=chartColor(el,'muted');ctx.fillText('VOL',p.l+4,priceBottom+22);
    const dateAt=i=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'}).format(new Date(data[i].timestamp));ctx.fillText(dateAt(0),p.l,h-5);ctx.textAlign='right';ctx.fillText(dateAt(data.length-1),w-p.r,h-5);ctx.textAlign='left';
  });
}
