# 财务报表

[业务导航](README.md)

- [资产负债表 · `get_a_share_financials_balance_sheets`](#get_a_share_financials_balance_sheets)
- [批量资产负债表 · `get_a_share_financials_balance_sheets_batch`](#get_a_share_financials_balance_sheets_batch)
- [现金流量表 · `get_a_share_financials_cash_flow_statements`](#get_a_share_financials_cash_flow_statements)
- [批量现金流量表 · `get_a_share_financials_cash_flow_statements_batch`](#get_a_share_financials_cash_flow_statements_batch)
- [利润表 · `get_a_share_financials_income_statements`](#get_a_share_financials_income_statements)
- [批量利润表 · `get_a_share_financials_income_statements_batch`](#get_a_share_financials_income_statements_batch)

<a id="get_a_share_financials_balance_sheets"></a>
## 资产负债表


工具名：`get_a_share_financials_balance_sheets`

<a id="get_a_share_financials_balance_sheets--工具描述"></a>
### 工具描述

> 获取单只 A 股标的的整体合并资产负债表多期序列。取数模式同利润表：不传 `start`/`end`
> 返回最近 `limit` 期；同时传 `start`+`end` 返回时间区间内全部报告期。均按 `period_end`
> 降序。返回资产总计、流动资产、货币资金、负债合计、股东权益合计等字段。

<a id="get_a_share_financials_balance_sheets--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只标的 thscode，不接受逗号；含交易所后缀（如 `000858.SZ`）。 |
| `period` | string | 是 | `annual` | 报告期类型：`annual`(仅 Q4) / `quarterly`(每季度末)。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式：范围 `[1, 20]`。与 `start`/`end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式：起始毫秒戳，需与 `end` 同传；窗口 ≤ 10 年。 |
| `end` | long | 否 | — | 时间区间模式：结束毫秒戳，`end >= start`。 |

<a id="get_a_share_financials_balance_sheets--调用示例"></a>
### 调用示例

```text
工具：get_a_share_financials_balance_sheets
参数：
  - thscode: "000858.SZ"
  - period: "quarterly"
```

<a id="get_a_share_financials_balance_sheets--返回"></a>
### 返回

返回 `{ timestamp, item: [BalanceSheetItem, ...] }`，按 `period_end` 降序。
字段含义见 返回字段说明 [资产负债表返回字段](#get_a_share_financials_balance_sheets--返回字段) 与
[共有响应字段](#get_a_share_financials_balance_sheets--返回字段)。

```json
{
  "timestamp": 1735574400000,
  "item": [
    {
      "thscode": "000858.SZ",
      "ticker": "000858",
      "period": "quarterly",
      "fiscal_year": 2024,
      "fiscal_period": "Q4",
      "report_date_ms": 1735574400000,
      "period_end_ms": 1735574400000,
      "currency": "CNY",
      "assets_total": 250000000000,
      "total_current_assets": 200000000000,
      "non_current_nets_total": 50000000000,
      "cash": 130000000000,
      "accounts_receivable": 500000000,
      "total_debt": 60000000000,
      "holder_equity_total": 190000000000
    }
  ]
}
```

<a id="get_a_share_financials_balance_sheets--返回字段"></a>
### 返回字段

<a id="get_a_share_financials_balance_sheets--资产负债表--共有响应字段"></a>
#### 资产负债表 · 共有响应字段

每条 `item` 都含以下元数据字段，`data.timestamp` 取响应中最大的 `period_end_ms`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode。 |
| `ticker` | string | 纯代码（不含后缀）。 |
| `period` | enum | 入参 `period` 回显。 |
| `fiscal_year` | int | 财年（自然年）。 |
| `fiscal_period` | string | `FY` / `Q1` / `Q2` / `Q3` / `Q4`。 |
| `report_date_ms` | long | 披露日（毫秒）。 |
| `period_end_ms` | long | 报告期末（Asia/Shanghai 零点毫秒戳）。 |
| `currency` | string | 币种，A 股恒为 `CNY`。 |

<a id="get_a_share_financials_balance_sheets--资产负债表--返回字段"></a>
#### 资产负债表 · 返回字段

除上文“共有响应字段”外，资产负债表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `assets_total` | number | 资产总计（原币元）。 |
| `total_current_assets` | number | 流动资产合计（原币元）。 |
| `non_current_nets_total` | number | 非流动资产合计（原币元）。 |
| `cash` | number | 货币资金（原币元）。 |
| `accounts_receivable` | number | 应收账款（原币元）。 |
| `total_debt` | number | 负债合计（原币元）。 |
| `holder_equity_total` | number | 所有者权益（股东权益）合计（原币元）。 |

<a id="get_a_share_financials_balance_sheets_batch"></a>
## 批量资产负债表


工具名：`get_a_share_financials_balance_sheets_batch`

<a id="get_a_share_financials_balance_sheets_batch--工具描述"></a>
### 工具描述

> 对比多只 A 股的整体合并资产负债表，单次最多 10 个代码。所有标的共用报告期和取数模式：`annual` / `quarterly`；最近 N 期的 `limit` 默认 4、范围 1 至 20；或同时提供 `start` / `end` 查询不超过 10 个自然年的区间。两种模式互斥，半开区间或区间与 `limit` 混用返回 `1004`。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

<a id="get_a_share_financials_balance_sheets_batch--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000858.SZ`；最多 10 个，按去重前数量计数。 |
| `period` | enum | 是 | — | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传；须为非负毫秒时间戳。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`；须为非负毫秒时间戳。 |

<a id="get_a_share_financials_balance_sheets_batch--调用示例"></a>
### 调用示例

```text
工具：get_a_share_financials_balance_sheets_batch
参数：
  - thscodes: "600519.SH,000858.SZ"
  - period: "annual"
  - limit: 4
```

<a id="get_a_share_financials_balance_sheets_batch--返回"></a>
### 返回

返回 `{ item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[批量资产负债表](#get_a_share_financials_balance_sheets_batch--返回字段)。

<a id="get_a_share_financials_balance_sheets_batch--返回字段"></a>
### 返回字段

<a id="get_a_share_financials_balance_sheets_batch--批量资产负债表--共有响应字段"></a>
#### 批量资产负债表 · 共有响应字段

每条 `item` 都含以下元数据字段，`data.timestamp` 取响应中最大的 `period_end_ms`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode。 |
| `ticker` | string | 纯代码（不含后缀）。 |
| `period` | enum | 入参 `period` 回显。 |
| `fiscal_year` | int | 财年（自然年）。 |
| `fiscal_period` | string | `FY` / `Q1` / `Q2` / `Q3` / `Q4`。 |
| `report_date_ms` | long | 披露日（毫秒）。 |
| `period_end_ms` | long | 报告期末（Asia/Shanghai 零点毫秒戳）。 |
| `currency` | string | 币种，A 股恒为 `CNY`。 |

<a id="get_a_share_financials_balance_sheets_batch--批量资产负债表--返回字段"></a>
#### 批量资产负债表 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原财报的全部字段及报告期倒序，包括行级 `thscode`、`ticker`、报告期和币种等元数据。`limit` 按每个代码分别生效。
详细业务字段、单位和空值说明见[资产负债表](#get_a_share_financials_balance_sheets_batch--返回字段)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

<a id="get_a_share_financials_balance_sheets_batch--资产负债表--返回字段"></a>
#### 资产负债表 · 返回字段

除上文“共有响应字段”外，资产负债表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `assets_total` | number | 资产总计（原币元）。 |
| `total_current_assets` | number | 流动资产合计（原币元）。 |
| `non_current_nets_total` | number | 非流动资产合计（原币元）。 |
| `cash` | number | 货币资金（原币元）。 |
| `accounts_receivable` | number | 应收账款（原币元）。 |
| `total_debt` | number | 负债合计（原币元）。 |
| `holder_equity_total` | number | 所有者权益（股东权益）合计（原币元）。 |

<a id="get_a_share_financials_cash_flow_statements"></a>
## 现金流量表


工具名：`get_a_share_financials_cash_flow_statements`

<a id="get_a_share_financials_cash_flow_statements--工具描述"></a>
### 工具描述

> 获取单只 A 股标的的整体合并现金流量表多期序列。取数模式同利润表：不传 `start`/`end`
> 返回最近 `limit` 期；同时传 `start`+`end` 返回时间区间内全部报告期。均按 `period_end`
> 降序。返回经营 / 投资 / 筹资活动现金流量净额、现金及现金等价物净增加额等字段。

<a id="get_a_share_financials_cash_flow_statements--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只标的 thscode，不接受逗号；含交易所后缀（如 `600519.SH`）。 |
| `period` | string | 是 | `annual` | 报告期类型：`annual`(仅 Q4) / `quarterly`(每季度末)。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式：范围 `[1, 20]`。与 `start`/`end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式：起始毫秒戳，需与 `end` 同传；窗口 ≤ 10 年。 |
| `end` | long | 否 | — | 时间区间模式：结束毫秒戳，`end >= start`。 |

<a id="get_a_share_financials_cash_flow_statements--调用示例"></a>
### 调用示例

```text
工具：get_a_share_financials_cash_flow_statements
参数：
  - thscode: "600519.SH"
  - period: "annual"
  - start: 1577808000000
  - end: 1735574400000
```

<a id="get_a_share_financials_cash_flow_statements--返回"></a>
### 返回

返回 `{ timestamp, item: [CashFlowStatementItem, ...] }`，按 `period_end` 降序。
字段含义见 返回字段说明 [现金流量表返回字段](#get_a_share_financials_cash_flow_statements--返回字段) 与
[共有响应字段](#get_a_share_financials_cash_flow_statements--返回字段)。

```json
{
  "timestamp": 1735574400000,
  "item": [
    {
      "thscode": "600519.SH",
      "ticker": "600519",
      "period": "annual",
      "fiscal_year": 2024,
      "fiscal_period": "FY",
      "report_date_ms": 1735574400000,
      "period_end_ms": 1735574400000,
      "currency": "CNY",
      "act_cash_flow_net": 92000000000,
      "invest_cash_flow_net": -3000000000,
      "financing_cash_flow_net": -65000000000,
      "pay_fixed_assets_etc_cash": 3500000000,
      "pay_dividends_profits_interest_cash": 64000000000,
      "cash_equivalents_net_addition": 24000000000
    }
  ]
}
```

<a id="get_a_share_financials_cash_flow_statements--返回字段"></a>
### 返回字段

<a id="get_a_share_financials_cash_flow_statements--现金流量表--共有响应字段"></a>
#### 现金流量表 · 共有响应字段

每条 `item` 都含以下元数据字段，`data.timestamp` 取响应中最大的 `period_end_ms`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode。 |
| `ticker` | string | 纯代码（不含后缀）。 |
| `period` | enum | 入参 `period` 回显。 |
| `fiscal_year` | int | 财年（自然年）。 |
| `fiscal_period` | string | `FY` / `Q1` / `Q2` / `Q3` / `Q4`。 |
| `report_date_ms` | long | 披露日（毫秒）。 |
| `period_end_ms` | long | 报告期末（Asia/Shanghai 零点毫秒戳）。 |
| `currency` | string | 币种，A 股恒为 `CNY`。 |

<a id="get_a_share_financials_cash_flow_statements--现金流量表--返回字段"></a>
#### 现金流量表 · 返回字段

除上文“共有响应字段”外，现金流量表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `act_cash_flow_net` | number | 经营活动产生的现金流量净额（原币元）。 |
| `invest_cash_flow_net` | number | 投资活动产生的现金流量净额（原币元）。 |
| `financing_cash_flow_net` | number | 筹资活动产生的现金流量净额（原币元）。 |
| `pay_fixed_assets_etc_cash` | number | 购建固定资产、无形资产和其他长期资产支付的现金（原币元）。 |
| `pay_dividends_profits_interest_cash` | number | 分配股利、利润或偿付利息支付的现金（原币元）。 |
| `cash_equivalents_net_addition` | number | 现金及现金等价物净增加额（原币元）。 |

<a id="get_a_share_financials_cash_flow_statements_batch"></a>
## 批量现金流量表


工具名：`get_a_share_financials_cash_flow_statements_batch`

<a id="get_a_share_financials_cash_flow_statements_batch--工具描述"></a>
### 工具描述

> 对比多只 A 股的整体合并现金流量表，单次最多 10 个代码。所有标的共用报告期和取数模式：`annual` / `quarterly`；最近 N 期的 `limit` 默认 4、范围 1 至 20；或同时提供 `start` / `end` 查询不超过 10 个自然年的区间。两种模式互斥，半开区间或区间与 `limit` 混用返回 `1004`。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

<a id="get_a_share_financials_cash_flow_statements_batch--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000858.SZ`；最多 10 个，按去重前数量计数。 |
| `period` | enum | 是 | — | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传；须为非负毫秒时间戳。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`；须为非负毫秒时间戳。 |

<a id="get_a_share_financials_cash_flow_statements_batch--调用示例"></a>
### 调用示例

```text
工具：get_a_share_financials_cash_flow_statements_batch
参数：
  - thscodes: "600519.SH,000858.SZ"
  - period: "annual"
  - limit: 4
```

<a id="get_a_share_financials_cash_flow_statements_batch--返回"></a>
### 返回

返回 `{ item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[批量现金流量表](#get_a_share_financials_cash_flow_statements_batch--返回字段)。

<a id="get_a_share_financials_cash_flow_statements_batch--返回字段"></a>
### 返回字段

<a id="get_a_share_financials_cash_flow_statements_batch--批量现金流量表--共有响应字段"></a>
#### 批量现金流量表 · 共有响应字段

每条 `item` 都含以下元数据字段，`data.timestamp` 取响应中最大的 `period_end_ms`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode。 |
| `ticker` | string | 纯代码（不含后缀）。 |
| `period` | enum | 入参 `period` 回显。 |
| `fiscal_year` | int | 财年（自然年）。 |
| `fiscal_period` | string | `FY` / `Q1` / `Q2` / `Q3` / `Q4`。 |
| `report_date_ms` | long | 披露日（毫秒）。 |
| `period_end_ms` | long | 报告期末（Asia/Shanghai 零点毫秒戳）。 |
| `currency` | string | 币种，A 股恒为 `CNY`。 |

<a id="get_a_share_financials_cash_flow_statements_batch--批量现金流量表--返回字段"></a>
#### 批量现金流量表 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原财报的全部字段及报告期倒序，包括行级 `thscode`、`ticker`、报告期和币种等元数据。`limit` 按每个代码分别生效。
详细业务字段、单位和空值说明见[现金流量表](#get_a_share_financials_cash_flow_statements_batch--返回字段)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

<a id="get_a_share_financials_cash_flow_statements_batch--现金流量表--返回字段"></a>
#### 现金流量表 · 返回字段

除上文“共有响应字段”外，现金流量表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `act_cash_flow_net` | number | 经营活动产生的现金流量净额（原币元）。 |
| `invest_cash_flow_net` | number | 投资活动产生的现金流量净额（原币元）。 |
| `financing_cash_flow_net` | number | 筹资活动产生的现金流量净额（原币元）。 |
| `pay_fixed_assets_etc_cash` | number | 购建固定资产、无形资产和其他长期资产支付的现金（原币元）。 |
| `pay_dividends_profits_interest_cash` | number | 分配股利、利润或偿付利息支付的现金（原币元）。 |
| `cash_equivalents_net_addition` | number | 现金及现金等价物净增加额（原币元）。 |

<a id="get_a_share_financials_income_statements"></a>
## 利润表


工具名：`get_a_share_financials_income_statements`

<a id="get_a_share_financials_income_statements--工具描述"></a>
### 工具描述

> 获取单只 A 股标的的整体合并利润表多期序列。两种取数模式互斥：不传 `start`/`end`
> 返回最近 `limit` 期；同时传 `start`+`end` 返回时间区间内全部报告期。均按 `period_end`
> 降序。返回营业收入、营业利润、净利润、归母净利润、基本每股收益等字段。

<a id="get_a_share_financials_income_statements--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只标的 thscode，不接受逗号；含交易所后缀（如 `600519.SH`）。 |
| `period` | string | 是 | `annual` | 报告期类型：`annual`(仅 Q4) / `quarterly`(每季度末)。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式：范围 `[1, 20]`。与 `start`/`end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式：起始毫秒戳，需与 `end` 同传；窗口 ≤ 10 年。 |
| `end` | long | 否 | — | 时间区间模式：结束毫秒戳，`end >= start`。 |

<a id="get_a_share_financials_income_statements--调用示例"></a>
### 调用示例

```text
工具：get_a_share_financials_income_statements
参数：
  - thscode: "600519.SH"
  - period: "annual"
  - limit: 3
```

<a id="get_a_share_financials_income_statements--返回"></a>
### 返回

返回 `{ timestamp, item: [IncomeStatementItem, ...] }`，按 `period_end` 降序。
字段含义见 返回字段说明 [利润表返回字段](#get_a_share_financials_income_statements--返回字段) 与
[共有响应字段](#get_a_share_financials_income_statements--返回字段)。

```json
{
  "timestamp": 1735574400000,
  "item": [
    {
      "thscode": "600519.SH",
      "ticker": "600519",
      "period": "annual",
      "fiscal_year": 2024,
      "fiscal_period": "FY",
      "report_date_ms": 1735574400000,
      "period_end_ms": 1735574400000,
      "currency": "CNY",
      "operating_income": 174144000000,
      "operating_profit": 124000000000,
      "net_profit": 93000000000,
      "parent_holder_net_profit": 86000000000,
      "basic_eps": 68.50
    }
  ]
}
```

<a id="get_a_share_financials_income_statements--返回字段"></a>
### 返回字段

<a id="get_a_share_financials_income_statements--利润表--共有响应字段"></a>
#### 利润表 · 共有响应字段

每条 `item` 都含以下元数据字段，`data.timestamp` 取响应中最大的 `period_end_ms`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode。 |
| `ticker` | string | 纯代码（不含后缀）。 |
| `period` | enum | 入参 `period` 回显。 |
| `fiscal_year` | int | 财年（自然年）。 |
| `fiscal_period` | string | `FY` / `Q1` / `Q2` / `Q3` / `Q4`。 |
| `report_date_ms` | long | 披露日（毫秒）。 |
| `period_end_ms` | long | 报告期末（Asia/Shanghai 零点毫秒戳）。 |
| `currency` | string | 币种，A 股恒为 `CNY`。 |

<a id="get_a_share_financials_income_statements--利润表--返回字段"></a>
#### 利润表 · 返回字段

除上文“共有响应字段”外，利润表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `operating_income` | number | 营业收入（原币元）。 |
| `operating_costs` | number | 营业成本（原币元）。 |
| `operating_expenses` | number | 营业总成本（原币元）。 |
| `sales_fee` | number | 销售费用（原币元）。 |
| `manage_fee` | number | 管理费用（原币元）。 |
| `research_and_development_expenses` | number | 研发费用（原币元）。 |
| `operating_profit` | number | 营业利润（原币元）。 |
| `interest_expenses` | number | 利息费用（原币元）。 |
| `profit_total` | number | 利润总额（原币元）。 |
| `income_tax_expense` | number | 所得税费用（原币元）。 |
| `net_profit` | number | 净利润（原币元）。 |
| `parent_holder_net_profit` | number | 归属于母公司股东的净利润（原币元）。 |
| `basic_eps` | number | 基本每股收益（元/股）。 |

<a id="get_a_share_financials_income_statements_batch"></a>
## 批量利润表


工具名：`get_a_share_financials_income_statements_batch`

<a id="get_a_share_financials_income_statements_batch--工具描述"></a>
### 工具描述

> 对比多只 A 股的整体合并利润表，单次最多 10 个代码。所有标的共用报告期和取数模式：`annual` / `quarterly`；最近 N 期的 `limit` 默认 4、范围 1 至 20；或同时提供 `start` / `end` 查询不超过 10 个自然年的区间。两种模式互斥，半开区间或区间与 `limit` 混用返回 `1004`。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

<a id="get_a_share_financials_income_statements_batch--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000858.SZ`；最多 10 个，按去重前数量计数。 |
| `period` | enum | 是 | — | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传；须为非负毫秒时间戳。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`；须为非负毫秒时间戳。 |

<a id="get_a_share_financials_income_statements_batch--调用示例"></a>
### 调用示例

```text
工具：get_a_share_financials_income_statements_batch
参数：
  - thscodes: "600519.SH,000858.SZ"
  - period: "annual"
  - limit: 4
```

<a id="get_a_share_financials_income_statements_batch--返回"></a>
### 返回

返回 `{ item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[批量利润表](#get_a_share_financials_income_statements_batch--返回字段)。

<a id="get_a_share_financials_income_statements_batch--返回字段"></a>
### 返回字段

<a id="get_a_share_financials_income_statements_batch--批量利润表--共有响应字段"></a>
#### 批量利润表 · 共有响应字段

每条 `item` 都含以下元数据字段，`data.timestamp` 取响应中最大的 `period_end_ms`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode。 |
| `ticker` | string | 纯代码（不含后缀）。 |
| `period` | enum | 入参 `period` 回显。 |
| `fiscal_year` | int | 财年（自然年）。 |
| `fiscal_period` | string | `FY` / `Q1` / `Q2` / `Q3` / `Q4`。 |
| `report_date_ms` | long | 披露日（毫秒）。 |
| `period_end_ms` | long | 报告期末（Asia/Shanghai 零点毫秒戳）。 |
| `currency` | string | 币种，A 股恒为 `CNY`。 |

<a id="get_a_share_financials_income_statements_batch--批量利润表--返回字段"></a>
#### 批量利润表 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原财报的全部字段及报告期倒序，包括行级 `thscode`、`ticker`、报告期和币种等元数据。`limit` 按每个代码分别生效。
详细业务字段、单位和空值说明见[利润表](#get_a_share_financials_income_statements_batch--返回字段)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

<a id="get_a_share_financials_income_statements_batch--利润表--返回字段"></a>
#### 利润表 · 返回字段

除上文“共有响应字段”外，利润表 `data.item[]` 还包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `operating_income` | number | 营业收入（原币元）。 |
| `operating_costs` | number | 营业成本（原币元）。 |
| `operating_expenses` | number | 营业总成本（原币元）。 |
| `sales_fee` | number | 销售费用（原币元）。 |
| `manage_fee` | number | 管理费用（原币元）。 |
| `research_and_development_expenses` | number | 研发费用（原币元）。 |
| `operating_profit` | number | 营业利润（原币元）。 |
| `interest_expenses` | number | 利息费用（原币元）。 |
| `profit_total` | number | 利润总额（原币元）。 |
| `income_tax_expense` | number | 所得税费用（原币元）。 |
| `net_profit` | number | 净利润（原币元）。 |
| `parent_holder_net_profit` | number | 归属于母公司股东的净利润（原币元）。 |
| `basic_eps` | number | 基本每股收益（元/股）。 |
