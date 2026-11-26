# 基金净值与业绩

[业务导航](README.md)

- [基金回撤指标 · `get_fund_performance_drawdowns`](#get_fund_performance_drawdowns)
- [基金历史业绩指标 · `get_fund_performance_indicators_historical`](#get_fund_performance_indicators_historical)
- [基金净值 · `get_fund_performance_nav`](#get_fund_performance_nav)
- [基金最新净值快照 · `get_fund_performance_nav_snapshot`](#get_fund_performance_nav_snapshot)
- [基金区间收益 · `get_fund_performance_returns`](#get_fund_performance_returns)

<a id="get_fund_performance_drawdowns"></a>
## 基金回撤指标


工具名：`get_fund_performance_drawdowns`

<a id="get_fund_performance_drawdowns--工具描述"></a>
### 工具描述

> 单查或批量查询十个区间的最大回撤。回撤为非负的百分数原值。

<a id="get_fund_performance_drawdowns--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 否 | — | 单只基金的完整代码，与 `thscodes` 二选一。 |
| `thscodes` | string | 否 | — | 1 至 20 个完整基金代码，用英文逗号分隔，与 `thscode` 二选一。 |

<a id="get_fund_performance_drawdowns--调用示例"></a>
### 调用示例

```text
工具：get_fund_performance_drawdowns
参数：
  - thscodes: "510300.SH,158001.SZ"
```

<a id="get_fund_performance_drawdowns--返回"></a>
### 返回

通过 `data.item[]` 返回基金代码及最大回撤。真实的零照常返回，缺值省略。字段见 [基金最大回撤](#get_fund_performance_drawdowns--返回字段)。

<a id="get_fund_performance_drawdowns--返回字段"></a>
### 返回字段

<a id="get_fund_performance_drawdowns--基金最大回撤--返回字段"></a>
#### 基金最大回撤 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 完整同花顺代码。 |
| `ticker` | string | 纯代码，用于展示。 |
| `week` | number | 近一周最大回撤。 |
| `month` | number | 近一月最大回撤。 |
| `tmonth` | number | 近三月最大回撤。 |
| `hyear` | number | 近半年最大回撤。 |
| `year` | number | 近一年最大回撤。 |
| `twoyear` | number | 近两年最大回撤。 |
| `tyear` | number | 近三年最大回撤。 |
| `fyear` | number | 近五年最大回撤。 |
| `nowyear` | number | 今年以来最大回撤。 |
| `now` | number | 成立以来最大回撤。 |

通用参数与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。

<a id="get_fund_performance_indicators_historical"></a>
## 基金历史业绩指标


工具名：`get_fund_performance_indicators_historical`

<a id="get_fund_performance_indicators_historical--工具描述"></a>
### 工具描述

> 查询基金净值波动、趋势强弱与估值百分位序列。指标周期固定为 `DAY_1`，响应 `data` 仅包含 `timestamp` 和 `item`，不返回顶层 `thscode` 或 `interval`。

<a id="get_fund_performance_indicators_historical--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |
| `start` | integer | 是 | — | 起始时间，毫秒 Unix 时间戳。 |
| `end` | integer | 是 | — | 结束时间，毫秒 Unix 时间戳。 |

`start` 和 `end` 必须同时提供；遗漏任一参数都会导致请求参数校验失败。

<a id="get_fund_performance_indicators_historical--调用示例"></a>
### 调用示例

```text
工具：get_fund_performance_indicators_historical
参数：
  - thscode: "510300.SH"
  - start: 1735689600000
  - end: 1767225599000
```

<a id="get_fund_performance_indicators_historical--返回"></a>
### 返回

返回 `{ timestamp, item[] }`，`timestamp` 保留明确的上游数据时间；固定周期 `DAY_1` 不作为顶层字段返回，也不返回顶层 `thscode` 或 `interval`。字段见 [基金历史业绩指标](#get_fund_performance_indicators_historical--返回字段)。

<a id="get_fund_performance_indicators_historical--返回字段"></a>
### 返回字段

<a id="get_fund_performance_indicators_historical--基金历史业绩指标--返回字段"></a>
#### 基金历史业绩指标 · 返回字段

`data` 仅包含 `timestamp` 和 `item`，其中 `timestamp` 保留明确的上游数据时间。指标周期固定为 `DAY_1`，不作为顶层字段返回；响应也不返回顶层 `thscode` 或 `interval`。

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | 指标日期，毫秒 Unix 时间戳。 |
| `rsi_pct` | number | 净值波动（RSI）指标值。 |
| `donchian_channel` | number | 趋势强弱（唐奇安通道）指标值。 |
| `track_index_pe_ttm_five_year_percentile` | number | 估值百分位（跟踪指数 PE TTM 五年分位）。 |

<a id="get_fund_performance_nav"></a>
## 基金净值


工具名：`get_fund_performance_nav`

<a id="get_fund_performance_nav--工具描述"></a>
### 工具描述

> 查询基金单位净值和复权净值。不传 `range` 时只返回最新一个净值日期；传入 `range`
> 时返回区间序列。`nav_type` 控制返回单位净值、复权净值或二者。

<a id="get_fund_performance_nav--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode，必须保留市场后缀。 |
| `range` | enum | 否 | 最新一条 | `week` / `month` / `tmonth` / `hyear` / `year` / `twoyear` / `tyear` / `fyear`。 |
| `nav_type` | enum | 否 | `unit,adj` | `unit`（单位净值）/ `adj`（复权净值）/ `unit,adj`。 |

<a id="get_fund_performance_nav--调用示例"></a>
### 调用示例

```text
工具：get_fund_performance_nav
参数：
  - thscode: "510300.SH"
  - range: "year"
  - nav_type: "unit"
```

<a id="get_fund_performance_nav--返回"></a>
### 返回

返回 `{ timestamp, item: [FundNavItem, ...] }`。字段含义见 返回字段说明
[基金净值](#get_fund_performance_nav--返回字段)。

<a id="get_fund_performance_nav--返回字段"></a>
### 返回字段

<a id="get_fund_performance_nav--基金净值--返回字段"></a>
#### 基金净值 · 返回字段

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `nav_date` | long | 净值日期，毫秒级 Unix 时间戳。 |
| `unit_nav` | number | 单位净值；未通过 `nav_type` 请求时不输出。 |
| `adj_nav` | number | 复权净值；未通过 `nav_type` 请求时不输出，不等同于累计净值。 |

<a id="get_fund_performance_nav_snapshot"></a>
## 基金最新净值快照


工具名：`get_fund_performance_nav_snapshot`

<a id="get_fund_performance_nav_snapshot--工具描述"></a>
### 工具描述

> 批量查询最新单位净值和复权净值。净值按四位小数返回。

<a id="get_fund_performance_nav_snapshot--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 1 至 20 个完整基金代码，用英文逗号分隔。 |

<a id="get_fund_performance_nav_snapshot--调用示例"></a>
### 调用示例

```text
工具：get_fund_performance_nav_snapshot
参数：
  - thscodes: "510300.SH,158001.SZ"
```

<a id="get_fund_performance_nav_snapshot--返回"></a>
### 返回

通过 `data.item[]` 返回 `thscode`、`unit_nav` 与 `adj_nav`。快照省略净值日期和时间戳。字段见 [基金最新净值快照](#get_fund_performance_nav_snapshot--返回字段)。

<a id="get_fund_performance_nav_snapshot--返回字段"></a>
### 返回字段

<a id="get_fund_performance_nav_snapshot--基金最新净值快照--返回字段"></a>
#### 基金最新净值快照 · 返回字段

`data` 只有 `item`，快照省略净值日期和时间戳。两项净值均以四位小数返回，缺值省略。

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带市场后缀的完整基金代码。 |
| `unit_nav` | number | 单位净值。 |
| `adj_nav` | number | 复权净值。 |

<a id="get_fund_performance_returns"></a>
## 基金区间收益


工具名：`get_fund_performance_returns`

<a id="get_fund_performance_returns--工具描述"></a>
### 工具描述

> 单查或批量查询区间收益、同类平均与排名。收益率为百分数原值。

<a id="get_fund_performance_returns--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 否 | — | 单只基金的完整代码，与 `thscodes` 二选一。 |
| `thscodes` | string | 否 | — | 1 至 20 个完整基金代码，用英文逗号分隔，与 `thscode` 二选一。 |

<a id="get_fund_performance_returns--调用示例"></a>
### 调用示例

```text
工具：get_fund_performance_returns
参数：
  - thscodes: "510300.SH,158001.SZ"
```

<a id="get_fund_performance_returns--返回"></a>
### 返回

通过 `data.item[]` 返回收益指标。批量每条携带 `thscode`，收益缺值时仍可返回有值的排名与总数。字段见 [基金区间收益](#get_fund_performance_returns--返回字段)。

<a id="get_fund_performance_returns--返回字段"></a>
### 返回字段

<a id="get_fund_performance_returns--基金区间收益--返回字段"></a>
#### 基金区间收益 · 返回字段

`data.item[]` 字段。外网完整视图包含 10 项自身收益、8 项同类平均、8 项同类排名和 8 项排名总数。

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 批量查询返回带市场后缀的完整基金代码，单查省略。 |
| `return_month` | number 或 null | 近一月收益率，百分数原值。 |
| `return_week` | number 或 null | 近一周收益率，百分数原值。 |
| `return_tmonth` | number 或 null | 近三月收益率，百分数原值。 |
| `return_hyear` | number 或 null | 近半年收益率，百分数原值。 |
| `return_year` | number 或 null | 近一年收益率，百分数原值。 |
| `return_twoyear` | number 或 null | 近两年收益率，百分数原值。 |
| `return_tyear` | number 或 null | 近三年收益率，百分数原值。 |
| `return_fyear` | number 或 null | 近五年收益率，百分数原值。 |
| `return_nowyear` | number 或 null | 今年以来收益率，百分数原值。 |
| `return_now` | number 或 null | 成立以来收益率，百分数原值。 |
| `peer_average_week` | number 或 null | 近一周同类平均收益率，百分数原值。 |
| `peer_average_month` | number 或 null | 近一月同类平均收益率，百分数原值。 |
| `peer_average_tmonth` | number 或 null | 近三月同类平均收益率，百分数原值。 |
| `peer_average_hyear` | number 或 null | 近半年同类平均收益率，百分数原值。 |
| `peer_average_year` | number 或 null | 近一年同类平均收益率，百分数原值。 |
| `peer_average_twoyear` | number 或 null | 近两年同类平均收益率，百分数原值。 |
| `peer_average_tyear` | number 或 null | 近三年同类平均收益率，百分数原值。 |
| `peer_average_fyear` | number 或 null | 近五年同类平均收益率，百分数原值。 |
| `rank_week` | integer 或 null | 近一周同类排名。 |
| `rank_month` | integer 或 null | 近一月同类排名。 |
| `rank_tmonth` | integer 或 null | 近三月同类排名。 |
| `rank_hyear` | integer 或 null | 近半年同类排名。 |
| `rank_year` | integer 或 null | 近一年同类排名。 |
| `rank_twoyear` | integer 或 null | 近两年同类排名。 |
| `rank_tyear` | integer 或 null | 近三年同类排名。 |
| `rank_fyear` | integer 或 null | 近五年同类排名。 |
| `rank_total_week` | integer 或 null | 近一周参与同类排名的基金总数。 |
| `rank_total_month` | integer 或 null | 近一月参与同类排名的基金总数。 |
| `rank_total_tmonth` | integer 或 null | 近三月参与同类排名的基金总数。 |
| `rank_total_hyear` | integer 或 null | 近半年参与同类排名的基金总数。 |
| `rank_total_year` | integer 或 null | 近一年参与同类排名的基金总数。 |
| `rank_total_twoyear` | integer 或 null | 近两年参与同类排名的基金总数。 |
| `rank_total_tyear` | integer 或 null | 近三年参与同类排名的基金总数。 |
| `rank_total_fyear` | integer 或 null | 近五年参与同类排名的基金总数。 |
