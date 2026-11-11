# 期货行情

[业务导航](README.md)

- [期货K线 · `get_futures_prices_daily`](#get_futures_prices_daily)
- [期货分时 · `get_futures_prices_intraday`](#get_futures_prices_intraday)

<a id="get_futures_prices_daily"></a>
## 期货K线


工具名：`get_futures_prices_daily`

<a id="get_futures_prices_daily--工具描述"></a>
### 工具描述

> 查询期货 K 线；端外仅允许 `day_1`，AI 客户端内可使用完整周期集合。

<a id="get_futures_prices_daily--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期货合约或期货商品指数完整同花顺代码，例如 `CU2601.SHF`、`850002.TI`。 |
| `start` | integer(int64) | 否 | — | 与 end 成对提供的正毫秒时间戳。 |
| `end` | integer(int64) | 否 | — | 与 start 成对提供且不早于 start。 |
| `time_period` | enum | 否 | — | 端外仅允许 `day_1`；AI 客户端内支持 `min_1`、`min_10`、`hour_1`、`day_1`、`week_1`、`month_1`、`quarter_1`、`year_1`。 |

<a id="get_futures_prices_daily--调用示例"></a>
### 调用示例

```text
工具：get_futures_prices_daily
参数：
  - thscode: "CU2601.SHF"
  - start: "1788307200000"
  - end: "1789036800000"
  - time_period: "day_1"
```

<a id="get_futures_prices_daily--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货日K](#get_futures_prices_daily--返回字段)。

<a id="get_futures_prices_daily--返回字段"></a>
### 返回字段

<a id="get_futures_prices_daily--期货k线--返回字段"></a>
#### 期货K线 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `thscode` | string | 期货合约或期货商品指数代码。 |
| `interval` | string | 实际返回的 K 线周期；端外调用固定为 `day_1`。 |
| `item[]` | array | 日 K；每项含可空的 `timestamp`、`open_price`、`high_price`、`low_price`、`close_price`、`volume`、`turnover`。 |

<a id="get_futures_prices_intraday"></a>
## 期货分时


工具名：`get_futures_prices_intraday`

<a id="get_futures_prices_intraday--工具描述"></a>
### 工具描述

> 查询期货合约或期货商品指数当前或最近交易日指定行情阶段的分时行情。

<a id="get_futures_prices_intraday--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期货合约或期货商品指数完整同花顺代码，例如 `CU2601.SHF`、`850002.TI`。 |
| `session` | enum | 否 | — | 行情阶段：`pre_market`-盘前、`intraday`-盘中、`post_market`-盘后；省略时使用 `intraday`。 |
| `trade_date` | string | 否 | — | 端外仅允许 `0`；AI 客户端内可传 `0` 或合法历史交易日 `yyyyMMdd`。 |

<a id="get_futures_prices_intraday--调用示例"></a>
### 调用示例

```text
工具：get_futures_prices_intraday
参数：
  - thscode: "CU2601.SHF"
  - session: "intraday"
  - trade_date: "0"
```

<a id="get_futures_prices_intraday--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货分时行情](#get_futures_prices_intraday--返回字段)。

<a id="get_futures_prices_intraday--返回字段"></a>
### 返回字段

<a id="get_futures_prices_intraday--期货分时--返回字段"></a>
#### 期货分时 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `thscode` / `date` / `session` | string | 行情标的代码、当前或最近交易日与行情阶段。 |
| `item[]` | array | 分时点；每项含可空的 `timestamp`、`price`、`volume`、`turnover`。 |
