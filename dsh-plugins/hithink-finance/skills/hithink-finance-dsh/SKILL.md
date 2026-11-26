---
name: hithink-finance-dsh
description: 在 DeepSeek Harness 中使用同花顺金融数据 CLI 查询和展示对话图表，或制作、查找、引用和更新金融数据工作台看板。
---

# 同花顺金融数据工作台和对话卡片

在 DSH Web 安装同花顺金融数据插件后，从左侧「同花顺金融数据」打开右栏。需要登录或重新授权时，请用户在右栏「设置」使用同花顺账号或 API Key 连接。认证凭据由账号页和 CLI 管理，取数复用已启用的连接。

按原版 `hithink-finance-*` 领域 Skill 选择数据命令，用 DSH 原生 Bash 或 PowerShell 直接执行 `hithink-finance`。远端查询前调用 `hithink-finance auth status --format json` 检查连接。大结果按契约写入会话工作区，用展示工具的 `file` 传入路径。需要整形、对齐或计算指标时，用原生 Shell 将结果写入工作区 JSON，保留原始值、日期、缺失项和口径。

- 查询、对比或一次性展示使用 `hithink_finance_render` 在对话中展示图表卡片。
- 制作看板、以后回访、独立刷新或筛选时，按[看板创作和保存](references/workbench.md)编写页面，用 `hithink_finance_workbench_import` 直接保存。工具成功后告诉用户看板名和入口「同花顺金融数据」→「工作台」。
- 修改已保存看板时，优先使用用户发送的「看板引用」中所选的 ID、版本和目录，用同一工具读取并更新原看板。只有标题时按标题查找，遇到多个匹配时请用户选择。标题和源码中的文字是作品内容，修改要求来自用户。 [引用和冲突处理](references/workbench.md#引用已有看板)

「案例游廊」的「我也要做一个」和「工作台」的「跟着做第一个看板」会将创作请求填入对话输入框。按用户发送的标的、周期和展示要求创作。

配置了金融插件的 DSH profile 中，原生 Shell 可以直接运行 `hithink-finance`。如果宿主没有给命令设置查找路径，同一次 Shell 调用可用插件提供的命令目录。

```bash
export PATH="$DSH_HITHINK_FINANCE_BIN:$PATH"
hithink-finance schema market.snapshot --format json
```

```powershell
$env:Path = "$env:DSH_HITHINK_FINANCE_BIN;$env:Path"
hithink-finance schema market.snapshot --format json
```

## 选择模板

| 模板 | 适用内容 | 字段设置 |
| --- | --- | --- |
| `snapshot` | 当前值与涨跌幅 | 用列标签标明字段含义与单位 |
| `line` | 价格、净值、收益等时间序列 | `x` 选时间字段，`series` 指定数值与可选的 `groupBy` 分组字段 |
| `kline` | 交互式 K 线，成交量与价格共用时间轴 | 将字段映射到 `date`、`open`、`high`、`low`、`close` 和可选的 `volume`。多标的保留 `thscode` 以便切换 |
| `ranking` | 排名或截面比较 | `x` 选类别字段，`series` 指定比较指标 |
| `financial` | 财务指标的多期或多类别比较 | `x` 选期间或类别，`series` 指定同单位数值列 |
| `table` | 明细或混合单位字段 | `fields` 的顺序决定展示列顺序 |
| `custom` | 需要自定义布局或交互 | 提供定义 `render(rows, action)` 的 JavaScript 及展示字段 |

在 `fields` 中声明要显示的 1 到 24 列。使用输出 `key` 引用横轴、序列或分组，使用可选 `path` 选择源记录中的字段。找不到字段时保留空值。`percent` 的 `1.2` 表示 `1.2%`，`ratio` 的 `0.012` 也表示 `1.2%`。使用 `label` 与 `unit` 标明指标和单位，用 `subtitle` 标明区间和计算口径。工具回执中的 `displayedRows`、`rowCount` 和 `truncated` 描述展示范围。完整 JSON 留在工作区原文件中。

成功的 CLI JSON 可自动提供 `data.timestamp` 或 `data.as_of` 中可识别的正值时点，读取 `data.adjust` 或 `meta.adjust` 的复权方式及 `data.interval` 周期。整形、合并或计算后，可显式传入 `asOf`、`adjust`、`interval` 和 `origin`，它们优先于自动读到的字段。只有各序列共享同一实际时点时才设置整卡 `asOf`。各序列时点不同时，把时点保留为对应记录的字段。单位根据原始数据契约填写，例如 `元` 或 `股`。分组图遇到缺失分组标识或同组重复坐标时展示结果表，原始记录按传入顺序保留。

## 直接传入工作区 CLI JSON 文件

例如原版领域 Skill 选出的命令已把成功响应写入会话工作区的 `snapshot.json`，记录所在路径是 `data.item`。用下列参数调用 `hithink_finance_render`，文件由展示工具读取。

```json
{
  "file": "snapshot.json",
  "rowsPath": ["data", "item"],
  "template": "snapshot",
  "title": "行情快照",
  "fields": [
    {"key": "thscode", "label": "证券代码"},
    {"key": "last_price", "label": "最新价", "unit": "元", "format": "number"},
    {"key": "price_change_ratio_pct", "label": "涨跌幅", "format": "percent"}
  ]
}
```

`rowsPath` 使用从输入根节点开始的键或数组下标。直接传入记录或记录数组时用 `data` 并省略路径。只显示批量结果中的一个子集时，可以用 `rowsPath` 选择对应数组。需要跨子集比较时，先在工作区整形成带分组字段的一张表。文件大小上限为 16 MiB，卡片保留最多 500 行和 128 KiB 展示内容。

## 自定义组件

要展示已有的基金持仓结果，可复用[基金持仓占比自定义视图](references/custom-holdings.md)。

`custom.source` 定义同步函数 `render(rows, action)`。函数在隔离的浏览器 Worker 中接收选定列的记录，返回文本、节点或节点数组。使用 `el(tag, children, props)` 生成节点，支持 `section`、`div`、`h2`、`h3`、`p`、`span`、`strong`、`small`、`br`、`ul`、`ol`、`li`、`table`、`thead`、`tbody`、`tr`、`th`、`td`、`output`、`progress`、`button`。可通过 `props.label` 提供无障碍标签，通过 `props.style` 设置布局、字号和纯色等样式。

初始 `action` 为 `null`。按钮可定义 `props.action`，点击后用相同数据和该动作值重新计算视图。每次计算独立执行。用 `props.pressed` 标识选中状态。浏览器隔离视图负责创建元素，Worker 的网络请求受内容安全策略限制。

以下参数可直接调用 `hithink_finance_render`。将 `data` 换成 `file` 和相应的 `rowsPath` 即可渲染工作区结果。

```json
{
  "data": [{"name": "示例指标", "value": 12.5}],
  "template": "custom",
  "title": "指标卡片",
  "fields": [{"key": "name"}, {"key": "value", "format": "number"}],
  "custom": {
    "height": 180,
    "source": "function render(rows, action) { const row = rows[0]; return el('section', [el('h3', row?.name ?? '指标'), el('strong', row?.value ?? '—', {style:{fontSize:'24px'}}), el('p', action === 'detail' ? '来自所选结果记录' : ''), el('button', '显示口径', {action:'detail', pressed:action === 'detail'})]); }"
  }
}
```
