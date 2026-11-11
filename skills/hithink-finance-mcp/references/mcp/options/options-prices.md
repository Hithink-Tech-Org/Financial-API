# 期权行情

[业务导航](README.md)

- [期权K线 · `get_options_prices_daily`](#get_options_prices_daily)
- [期权分时 · `get_options_prices_intraday`](#get_options_prices_intraday)

<a id="get_options_prices_daily"></a>
## 期权K线


工具名：`get_options_prices_daily`

<a id="get_options_prices_daily--工具描述"></a>
### 工具描述

> 查询期权 K 线；端外仅允许 `day_1`，AI 客户端内可使用完整周期集合。

<a id="get_options_prices_daily--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期权合约完整同花顺代码。 |
| `start` | integer(int64) | 否 | — | 与 end 成对提供的正毫秒时间戳。 |
| `end` | integer(int64) | 否 | — | 与 start 成对提供且不早于 start。 |
| `time_period` | enum | 否 | — | 端外仅允许 `day_1`；AI 客户端内支持 `min_1`、`min_10`、`hour_1`、`day_1`、`week_1`、`month_1`、`quarter_1`、`year_1`。 |

<a id="get_options_prices_daily--调用示例"></a>
### 调用示例

```text
工具：get_options_prices_daily
参数：
  - thscode: "IO2601-C-4000.CFE"
  - start: "1788307200000"
  - end: "1789036800000"
  - time_period: "day_1"
```

<a id="get_options_prices_daily--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期权日K](#get_options_prices_daily--返回字段)。

<a id="get_options_prices_daily--返回字段"></a>
### 返回字段

<a id="get_options_prices_daily--期权k线--返回字段"></a>
#### 期权K线 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间，毫秒时间戳。 |
| `thscode` | string | 期权合约代码。 |
| `interval` | string | 实际返回的 K 线周期；端外调用固定为 `day_1`。 |
| `item[]` | array | 日 K 列表；每项含可空的 `timestamp`、`open_price`、`high_price`、`low_price`、`close_price`、`volume`、`turnover`。 |

<a id="get_options_prices_intraday"></a>
## 期权分时


工具名：`get_options_prices_intraday`

<a id="get_options_prices_intraday--工具描述"></a>
### 工具描述

> 查询期权合约当前或最近交易日指定行情阶段的分时行情。

<a id="get_options_prices_intraday--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期权合约完整同花顺代码。 |
| `session` | enum | 否 | — | 行情阶段：`pre_market`-盘前、`intraday`-盘中、`post_market`-盘后；省略时使用 `intraday`。 |
| `trade_date` | string | 否 | — | 端外仅允许 `0`；AI 客户端内可传 `0` 或合法历史交易日 `yyyyMMdd`。 |

<a id="get_options_prices_intraday--调用示例"></a>
### 调用示例

```text
工具：get_options_prices_intraday
参数：
  - thscode: "IO2601-C-4000.CFE"
  - session: "intraday"
  - trade_date: "0"
```

<a id="get_options_prices_intraday--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期权分时行情](#get_options_prices_intraday--返回字段)。

<a id="get_options_prices_intraday--返回字段"></a>
### 返回字段

<a id="get_options_prices_intraday--期权分时--返回字段"></a>
#### 期权分时 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间，毫秒时间戳。 |
| `thscode` / `date` / `session` | string | 合约代码、当前或最近交易日与行情阶段。 |
| `item[]` | array | 分时点列表；每项含可空的 `timestamp`、`price`、`volume`、`turnover`。 |
