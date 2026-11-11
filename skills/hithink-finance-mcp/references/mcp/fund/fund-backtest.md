# 基金在线回测

[业务导航](README.md)

- [基金回测指标 · `get_fund_backtest_indicators`](#get_fund_backtest_indicators)
- [基金在线回测 · `get_fund_backtest_result`](#get_fund_backtest_result)

<a id="get_fund_backtest_indicators"></a>
## 基金回测指标


工具名：`get_fund_backtest_indicators`

<a id="get_fund_backtest_indicators--工具描述"></a>
### 工具描述

> 返回上游定义的回测指标目录。

<a id="get_fund_backtest_indicators--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|

<a id="get_fund_backtest_indicators--调用示例"></a>
### 调用示例

```text
工具：get_fund_backtest_indicators
参数：{}
```

<a id="get_fund_backtest_indicators--返回"></a>
### 返回

返回指标编码、名称、操作符和状态规则；详见[基金回测可用指标](#get_fund_backtest_indicators--返回字段)。

<a id="get_fund_backtest_indicators--返回字段"></a>
### 返回字段

<a id="get_fund_backtest_indicators--基金回测可用指标--返回字段"></a>
#### 基金回测可用指标 · 返回字段

`data[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 指标标识。 |
| `indicator_name` | string | 指标名称。 |
| `indicator_code` | string | 指标编码。 |
| `type` | number | 上游定义的指标类型。 |
| `value_kind` | number | 上游定义的指标值类型。 |
| `support_operation` | string | 支持的条件操作符。 |
| `unit` | string \| null | 指标单位。 |
| `description` | string \| null | 指标说明。 |
| `state_rules` | string \| null | 状态规则。 |
| `create_time` | string | 上游记录创建时间，使用 ISO 本地日期时间。 |
| `update_time` | string | 上游记录更新时间，使用 ISO 本地日期时间。 |

<a id="get_fund_backtest_result"></a>
## 基金在线回测


工具名：`get_fund_backtest_result`

<a id="get_fund_backtest_result--工具描述"></a>
### 工具描述

> 使用完整基金代码、买卖条件和定投参数执行在线回测，返回交易、指标与收益曲线。

<a id="get_fund_backtest_result--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 含市场后缀的完整基金代码，例如 `000001.OF`。 |
| `buy_conditions` | string | 是 | — | 买入条件 JSON 字符串。 |
| `sell_conditions` | string | 是 | — | 卖出条件 JSON 字符串。 |
| `buy_frequency_type` | string | 是 | — | 买入频率。 |
| `max_buy_times` | number | 是 | — | 最大买入次数。 |
| `per_buy_amount` | number | 是 | — | 每次买入金额。 |

<a id="get_fund_backtest_result--调用示例"></a>
### 调用示例

```text
工具：get_fund_backtest_result
参数：
  - thscode: "000001.OF"
  - buy_conditions: "{\"indicator_code\":\"rsi_pct\",\"operator\":\">\",\"value\":0.5}"
  - sell_conditions: "{\"indicator_code\":\"rsi_pct\",\"operator\":\"<\",\"value\":0.3}"
  - buy_frequency_type: "WEEKLY"
  - max_buy_times: 5
  - per_buy_amount: 100
```

<a id="get_fund_backtest_result--返回"></a>
### 返回

返回交易明细、回测指标与收益曲线；详见[基金在线回测](#get_fund_backtest_result--返回字段)。

<a id="get_fund_backtest_result--返回字段"></a>
### 返回字段

<a id="get_fund_backtest_result--基金在线回测--返回字段"></a>
#### 基金在线回测 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `start_date` | string | 回测开始日期。 |
| `end_date` | string | 回测结束日期。 |
| `metrics` | object | 回测指标。 |
| `trade_count` | number | 交易次数。 |
| `trades` | array | 交易明细。 |
| `curve_points` | JSON | 收益曲线点集合，兼容数组或对象结构。 |

`data.metrics` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `strategy_return` | number | 策略收益。 |
| `fund_return` | number | 基金收益。 |
| `excess_return` | number | 超额收益。 |
| `win_rate` | number | 胜率。 |
| `max_drawdown` | number | 最大回撤。 |

`data.trades[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `trade_date` | string | 交易日期。 |
| `type` | string | 交易类型。 |
| `price` | number | 交易价格。 |
| `amount` | number | 交易金额。 |
| `shares` | number | 交易份额。 |
| `profit` | number \| null | 交易收益。 |
