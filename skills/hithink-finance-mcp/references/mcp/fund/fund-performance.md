# 基金净值与业绩

[业务导航](README.md)

- [基金回撤指标 · `get_fund_performance_drawdowns`](#get_fund_performance_drawdowns)
- [基金历史业绩指标 · `get_fund_performance_indicators_historical`](#get_fund_performance_indicators_historical)
- [基金净值 · `get_fund_performance_nav`](#get_fund_performance_nav)
- [基金区间收益 · `get_fund_performance_returns`](#get_fund_performance_returns)

<a id="get_fund_performance_drawdowns"></a>
## 基金回撤指标


工具名：`get_fund_performance_drawdowns`

<a id="get_fund_performance_drawdowns--工具描述"></a>
### 工具描述

> 查询基金十个区间的最大回撤。

<a id="get_fund_performance_drawdowns--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |

<a id="get_fund_performance_drawdowns--调用示例"></a>
### 调用示例

```text
工具：get_fund_performance_drawdowns
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_performance_drawdowns--返回"></a>
### 返回

返回基金代码与十个区间最大回撤；字段见 [基金最大回撤](#get_fund_performance_drawdowns--返回字段)。

<a id="get_fund_performance_drawdowns--返回字段"></a>
### 返回字段

<a id="get_fund_performance_drawdowns--基金最大回撤--返回字段"></a>
#### 基金最大回撤 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` / `ticker` | string | 完整基金代码与纯代码。 |
| `week` / `month` / `tmonth` | number | 近一周、近一月、近三月最大回撤。 |
| `hyear` / `year` / `twoyear` | number | 近半年、近一年、近两年最大回撤。 |
| `tyear` / `fyear` | number | 近三年、近五年最大回撤。 |
| `nowyear` / `now` | number | 今年以来、成立以来最大回撤。 |

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

<a id="get_fund_performance_returns"></a>
## 基金区间收益


工具名：`get_fund_performance_returns`

<a id="get_fund_performance_returns--工具描述"></a>
### 工具描述

> 查询基金多区间收益率，并返回对应区间的同类平均、同类排名与参与排名总数。
> 收益率为百分数原值，如 `8.88` 表示 `8.88%`。

<a id="get_fund_performance_returns--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode，必须保留市场后缀。 |

<a id="get_fund_performance_returns--调用示例"></a>
### 调用示例

```text
工具：get_fund_performance_returns
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_performance_returns--返回"></a>
### 返回

返回 `{ timestamp, item: [FundReturnsItem, ...] }`。字段含义见 返回字段说明
[基金区间收益](#get_fund_performance_returns--返回字段)。

<a id="get_fund_performance_returns--返回字段"></a>
### 返回字段

<a id="get_fund_performance_returns--基金区间收益--返回字段"></a>
#### 基金区间收益 · 返回字段

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `return_month` | number | 近一月收益率，百分数原值。 |
| `return_week` | number | 近一周收益率，百分数原值。 |
| `return_tmonth` | number | 近三月收益率，百分数原值。 |
| `return_hyear` | number | 近半年收益率，百分数原值。 |
| `return_year` | number | 近一年收益率，百分数原值。 |
| `return_twoyear` | number | 近两年收益率，百分数原值。 |
| `return_tyear` | number | 近三年收益率，百分数原值。 |
| `return_fyear` | number | 近五年收益率，百分数原值。 |
| `return_nowyear` | number | 今年以来收益率，百分数原值。 |
| `return_now` | number | 成立以来收益率，百分数原值。 |
| `peer_average_*` | number | 对应周期的同类平均收益率；周期后缀覆盖 `week`、`month`、`tmonth`、`hyear`、`year`、`twoyear`、`tyear`、`fyear`。 |
| `rank_*` / `rank_total_*` | integer | 对应周期的同类排名与参与排名总数。 |
