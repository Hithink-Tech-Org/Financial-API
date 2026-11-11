# 除复权数据

[业务导航](README.md)

- [复权因子事件流 · `get_a_share_corporate_actions_adjustment_factors`](#get_a_share_corporate_actions_adjustment_factors)

<a id="get_a_share_corporate_actions_adjustment_factors"></a>
## 复权因子事件流


工具名：`get_a_share_corporate_actions_adjustment_factors`

<a id="get_a_share_corporate_actions_adjustment_factors--工具描述"></a>
### 工具描述

> 获取单只 A 股标的的原始 cash-dividend / stock-dividend / rights-issue 事件流，
> 调用方据此自行推导前 / 后复权因子。已预计算的复权后价格请直接调用
> [`get_a_share_prices_historical`](prices.md#get_a_share_prices_historical) 并设置
> `adjust=forward|backward`。每次只能传一个 `thscode`。

<a id="get_a_share_corporate_actions_adjustment_factors--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只标的 thscode，不接受逗号。 |
| `from` | string | 否 | — | 事件起始日，格式 `YYYY-MM-DD`。 |
| `to` | string | 否 | — | 事件截止日，格式 `YYYY-MM-DD`。 |

<a id="get_a_share_corporate_actions_adjustment_factors--调用示例"></a>
### 调用示例

```text
工具：get_a_share_corporate_actions_adjustment_factors
参数：
  - thscode: "600519.SH"
  - from: "2020-01-01"
  - to: "2026-01-01"
```

<a id="get_a_share_corporate_actions_adjustment_factors--返回"></a>
### 返回

返回 `{ thscode, ticker, item: [AdjustmentFactorItem, ...] }`，`item` 按 `ex_date_ms` 降序排列。
字段含义见 返回字段说明 [复权因子事件流](#get_a_share_corporate_actions_adjustment_factors--返回字段)。

```json
{
  "thscode": "600519.SH",
  "ticker": "600519",
  "item": [
    {
      "ticker": "600519",
      "ex_date_ms": 1766073600000,
      "dividend_per_share": 23.957,
      "per_share_bonus": 0
    },
    {
      "ticker": "600519",
      "ex_date_ms": 1437062400000,
      "dividend_per_share": 4.374,
      "per_share_bonus": 0.1
    }
  ]
}
```

> 注：响应不返回 `event_type` / `record_date` / `adjust_factor`，事件类型由 `dividend_per_share` 与 `per_share_bonus` 两个数值字段隐式区分。

<a id="get_a_share_corporate_actions_adjustment_factors--返回字段"></a>
### 返回字段

<a id="get_a_share_corporate_actions_adjustment_factors--除复权数据--响应字段"></a>
#### 除复权数据 · 响应字段

`data` 为 `AdjustmentFactorsData`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode（与 `item` 同级，标识本次返回所属标的）。 |
| `ticker` | string | 纯代码（无交易所后缀）。 |
| `item` | array | 事件列表，按 `ex_date_ms` 降序排列（最新在前）。 |

`item[]` 为 `AdjustmentFactorItem`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `ticker` | string | 纯代码（无交易所后缀），如 `600519`。 |
| `ex_date_ms` | long | 除权除息日，Asia/Shanghai 00:00:00 毫秒 Unix 时间戳。 |
| `dividend_per_share` | number | 每股现金分红（税前，原始货币）。非现金事件为 `0`。 |
| `per_share_bonus` | number | 每股送股比例（如 `0.1` 表示 10 送 1）。纯现金分红事件为 `0`。 |

> **note 字段约定差异**
> - 响应中**不返回** `event_type` / `record_date` / `adjust_factor`，事件类型由 `dividend_per_share` 与 `per_share_bonus` 两个数值字段隐式区分。
> - 复权因子需调用方按 `dividend_per_share` + `per_share_bonus` 自行推导；若仅需复权后价格，直接调用 [`get_a_share_prices_historical`](prices.md#get_a_share_prices_historical--返回字段) 并传 `adjust=forward|backward`。
