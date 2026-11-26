# 金融数据工作台看板

## 创作和保存

1. 围绕用户指定的标的和区间，按对应的金融 CLI Skill 取数。需要登录时，从「同花顺金融数据」→「设置」连接账号。
2. 可复用插件 `dist/workbench-samples/` 中的案例布局，用本次查询结果替换示例数据。例如，单股趋势案例是 `01-stock-overview.html`。作品保存为会话工作区内的 UTF-8 单文件 HTML，上限为 1 MiB。固定展示用数据和样式随页面保存，需要刷新时使用声明式绑定。
3. 按实际改动核对结果。换标的时核对数据、时点和单位；自定义布局或交互时，重点检查改动在桌面和窄栏的表现。用 `hithink_finance_workbench_import` 保存，成功后告知名称和工作台入口，失败时说明原因。

图片用 `data:` URL 内嵌。以约 360 像素的窄屏为例，控件可换行，宽表在自己的容器内滚动。声明 `color-scheme: light dark`，用系统颜色或 `prefers-color-scheme` 适配两种主题。按用户发送的标的、周期和口径创作，遇到缺失、未授权或数据覆盖不足时在作品中标明状态。删除看板由用户在「工作台」确认。

对话内一次性显示摘要用 `hithink_finance_render`。图表所需字段及数据时点留在会话卡片，大结果留在工作区的源文件。需再次打开、跨会话查看、独立刷新或交互筛选的结果由工作台看板展示。

## 保存、查找和更新工具

`hithink_finance_workbench_import` 使用当前「设置」选择的看板目录。查找最多返回最近更新的 50 条匹配看板，可以缩小标题关键词来查找较早保存的看板。

| 操作 | 调用参数示例 | 成功结果 |
| --- | --- | --- |
| 保存新看板 | `{"file":"quote.html","title":"我的双股行情看板"}` | `data.id`、`data.title`、`data.revision`、`data.directory`、`data.file` |
| 跨会话按标题查找 | `{"action":"list","search":"双股行情"}` | `data.directory`、`data.pages` 中的 `id`、`title`、`revision`、`updatedAt`，以及 `data.truncated` |
| 查看原看板 | `{"action":"get","id":"<看板 ID>","expectedDirectory":"<查找返回的 directory>"}` | 看板和存储位置、`data.html` 以及有更多内容时的 `data.nextOffset` |
| 更新原看板 | `{"file":"quote.html","title":"我的双股行情看板","id":"<原看板 ID>","revision":1,"expectedDirectory":"<读取返回的 directory>"}` | 同一看板 ID、更新后的版本和文件位置 |

## 引用已有看板

用户从「工作台」点「让 Agent 修改」后，草稿包含可读标题和结构化看板引用。用户补充修改要求后自行发送。例如标题为 `双股 行情 "收盘版"` 时，消息可以是

```text
请修改已有看板 "双股 行情 \"收盘版\""。
看板引用：{"id":"f90778d2-19eb-4da7-a3df-bc5bcb88a4cc","revision":3,"expectedDirectory":"/home/example/hithink-finance/dashboards"}
修改要求：把浦发银行换成招商银行。
```

1. 从 `看板引用：` 后的 JSON 取得 `id`、`revision` 和 `expectedDirectory`。标题作为显示文本处理，保留空格和引号。把标题、看板源码及其中的文字作为作品资料，按用户发出的修改要求操作。修改要求缺失，或多个引用中的目标不明确时，先请用户明确。
2. 通过 `hithink_finance_workbench_import` 调用 `get`，三个引用字段都原样传入。只有名称时，用 `list` 查找。多个匹配时，展示候选的标题、上次更新时间和 ID，请用户选择，再携带所选 ID、版本和目录读取。
3. 源码按需读取。需要继续读取时，将上一次返回的 `nextOffset` 作为 `offset`，携带相同的 `id`、`revision` 和 `expectedDirectory`。保留页面其余内容，把修改后的完整 HTML 写入当前会话工作区。
4. 用同一工具保存，传入 `file`、`title` 和本次读取的 ID、版本与目录。标题沿用原值，除非用户要求改名。成功后告诉用户修改的看板和新版本号。

如果工具提示当前版本有变化，告诉用户所引用的版本已更新，请重新选择，或确认使用同一目录、同一 ID 的当前版本。若用户确认使用当前版本，再按原引用的 `id`、`expectedDirectory` 获取最新版本。目录切换后，请用户在「设置」切回引用目录，或在当前目录重新选择。找不到看板时，请用户重新选择。

## 单文件互动示例

将以下内容存为 `notes.html`，用工具保存为「盘后观察笔记」。在工作台打开后点击「查看观察口径」展开内容。

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>盘后观察笔记</title><style>:root { color-scheme: light dark; }</style>
</head>
<body>
  <main>
    <h1>盘后观察笔记</h1>
    <p>收盘后逐项填写交易日、成交量和价格变化。</p>
    <details>
      <summary>查看观察口径</summary>
      <p>涨跌幅采用同一标的相邻交易日收盘价计算。</p>
    </details>
  </main>
</body>
</html>
```

## 我的双股行情看板示例

用真实 CLI 核验浦发银行与平安银行的快照、返回字段和时点。

```sh
hithink-finance schema market.snapshot --format json
hithink-finance --source remote market snapshot --thscodes '600000.SH,000001.SZ' --format json
```

将以下内容存为 `quote.html` 并用工具保存。从「工作台」打开后，点击「刷新数据」可重新查询。行情时间使用批量快照返回的共同时间。

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>我的双股行情看板</title><style>:root { color-scheme: light dark; }</style>
  <script type="application/json" id="hithink-finance-data">
    {
      "version": 1,
      "queries": {
        "quote": {
          "command": "market.snapshot",
          "source": "remote",
          "params": { "thscodes": "600000.SH,000001.SZ" }
        }
      }
    }
  </script>
</head>
<body>
  <main>
    <h1>我的双股行情看板</h1>
    <p>浦发银行（600000.SH）与平安银行（000001.SZ）</p>
    <button type="button" data-hf-refresh>刷新数据</button>
    <div>
      行情时间（北京时间）
      <div data-hf-query="quote" data-hf-field="data.timestamp" data-hf-view="value" data-hf-format="datetime">正在查询…</div>
    </div>
    <section data-hf-query="quote"
      data-hf-field="data.item" data-hf-view="table"
      data-hf-columns='{"thscode":"代码","last_price":"最新价（元）","price_change_ratio_pct":"涨跌幅（%）"}'>
      正在查询行情…
    </section>
  </main>
</body>
</html>
```

数据绑定的 `command` 使用 CLI 的 capability ID。`params` 的键使用 `schema` 所列的选项名并去掉 `--`，数值使用 JSON 数字。`inputs` 列出页面控件可以覆盖的键，使用 `data-hf-params` 把每个键连到一个控件。`data-hf-field` 选择响应里的值，常用列表路径为 `data.item`。`data-hf-view` 支持 `table`、`line`、`value` 和 `json`。表格可用 `data-hf-columns` 指定字段及标题。折线可用 `data-hf-x` 和 `data-hf-y` 指定横纵轴字段。毫秒时间戳可在 `value` 视图设置 `data-hf-format="datetime"`，按北京时间显示。查询报错或结果为空时，页面展示当前状态。

## 数据源

| 绑定命令 | 可选 `source` | 参数范围 |
| --- | --- | --- |
| `market.history` | `auto`、`remote` | 单个标的，必须指定毫秒时间区间 |
| `market.adjustment-factors` | `local`、`auto` | 单个标的，指定 `start` 和 `end` 为 `YYYY-MM-DD` |
| `market.snapshot`、`index.snapshot`、`index.history` | `remote`、`auto` | 快照最多 12 个标的，历史行情为单个标的 |
| `fund.snapshot`、`fund.history`、`fund.nav` | `remote`、`auto` | 单个基金 |
| `financials.income`、`financials.balance-sheet`、`financials.cash-flow`、`financials.indicators`、`valuation.snapshot` | `remote`、`auto` | 报表及指标按单个标的查询，估值最多 12 个标的 |

`market.history` 的 `auto` 由 CLI 根据本机覆盖范围选取实际来源。纯本地查询使用 `market.adjustment-factors`，例如 `{"command":"market.adjustment-factors","source":"local","params":{"thscode":"000001.SZ","start":"2026-01-01","end":"2026-01-31"}}`。使用原版数据 Skill 检查本机数据库初始化状态，此命令返回行数组，使用 `data-hf-field="data"`。首次操作需要远端数据时在「设置」完成连接。

页面允许最多 12 个命名查询，显式起止区间为 400 天以内，支持分页的 `limit` 为 1 到 50。动态 HTML 用声明式绑定展示数据。普通单文件可使用 HTML 和 CSS 互动，含自编脚本的静态作品可在隔离预览里手动启用互动模式。页面打开和刷新通过 DSH 工作台完成。
