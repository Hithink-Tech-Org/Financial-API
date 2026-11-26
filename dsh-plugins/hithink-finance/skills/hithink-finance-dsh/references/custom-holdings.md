# 基金持仓占比自定义视图

将已有基金持仓记录呈现为占基金净值比例的横条。视图按数据顺序展示前十条，使用 0–100% 的统一条形比例。`0` 显示为 `0.00%`，空值显示 `—`，超出条形范围的数值保留文字。

## 直接运行

把以下参数传入 `hithink_finance_render`。内联示例包含三条演示记录。

```json
{
  "template": "custom",
  "title": "基金持仓占净值比例 · 示例",
  "data": [
    {
      "stock_name": "示例持仓一",
      "hold_ratio": 4.67
    },
    {
      "stock_name": "示例持仓二",
      "hold_ratio": 0
    },
    {
      "stock_name": "示例持仓三",
      "hold_ratio": null
    }
  ],
  "fields": [
    {
      "key": "name",
      "path": [
        "stock_name"
      ],
      "label": "持仓名称"
    },
    {
      "key": "weight",
      "path": [
        "hold_ratio"
      ],
      "label": "占基金净值比例",
      "format": "percent"
    }
  ],
  "custom": {
    "height": 370,
    "source": "function render(rows, action) {\n  const items = rows.slice(0, action === 'first3' ? 3 : 10);\n  const controls = el('div', [el('button', '前 3 条', {action:'first3', pressed:action === 'first3'}), el('button', '前 10 条', {action:'first10', pressed:action !== 'first3'})], {style:{display:'flex',gap:'8px',margin:'0 0 8px'}});\n  return el('section', [controls, ...items.map(({name, weight}) => {\n    const label = name ?? '名称未提供';\n    const known = Number.isFinite(weight);\n    const bar = known && weight >= 0 && weight <= 100 ? el('progress', [], {max:100,value:weight,label:label + '持仓占比',style:{width:'100%'}}) : '';\n    return el('div', [el('span', label), el('span', bar), el('output', known ? weight.toFixed(2) + '%' : '—', {style:{textAlign:'right'}})], {style:{display:'grid',gridTemplateColumns:'2fr 3fr 1fr',alignItems:'center',gap:'8px',padding:'4px 0'}});\n  })], {label:'基金持仓占净值比例'});\n}"
  }
}
```

## 使用工作区 JSON

已有 `fund holdings` 的完整 CLI 回执保存在当前会话工作区的 `holdings.json` 时，将上例的 `data` 替换成 `"file": "holdings.json"` 和 `"rowsPath": ["data", "item"]`。使用快照所属基金和报告期更新 `title`。`hold_ratio` 使用百分数原值，直接写入 `progress.value`。渲染工具读取现有文件，组件在隔离视图中接收投影后的 `name`、`weight` 两列。
