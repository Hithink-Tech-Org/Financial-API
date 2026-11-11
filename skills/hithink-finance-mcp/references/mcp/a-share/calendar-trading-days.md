# 交易日历

[业务导航](README.md)

- [A股交易日历 · `get_a_share_calendar_trading_days`](#get_a_share_calendar_trading_days)

<a id="get_a_share_calendar_trading_days"></a>
## A股交易日历

[业务导航](../meta/README.md)

工具名：`get_a_share_calendar_trading_days`

<a id="get_a_share_calendar_trading_days--工具描述"></a>
### 工具描述

> 获取 A 股近一年交易日序列，固定窗口为 `[今日 - 1 年, 今日]`（Asia/Shanghai 自然日），
> 无任何请求参数。每个交易日同时返回毫秒戳 `date_ms` 与可读日期 `date`（`yyyyMMdd`），
> 按时间升序。

<a id="get_a_share_calendar_trading_days--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无入参。 |

<a id="get_a_share_calendar_trading_days--调用示例"></a>
### 调用示例

```text
工具：get_a_share_calendar_trading_days
参数：（无）
```

<a id="get_a_share_calendar_trading_days--返回"></a>
### 返回

返回 `{ timestamp, item: [TradingDayItem, ...] }`，按时间升序。
字段含义见 返回字段说明 [交易日序列](#get_a_share_calendar_trading_days--返回字段)。

```json
{
  "timestamp": 1748102400000,
  "item": [
    { "date_ms": 1716566400000, "date": "20250525" },
    { "date_ms": 1716652800000, "date": "20250526" },
    { "date_ms": 1716739200000, "date": "20250527" }
  ]
}
```

<a id="get_a_share_calendar_trading_days--返回字段"></a>
### 返回字段

<a id="get_a_share_calendar_trading_days--交易日历--响应字段"></a>
#### 交易日历 · 响应字段

`data` 为 `TradingDaysData`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间（毫秒）。 |
| `item` | array | 交易日列表，按时间升序。 |

`item[]` 为 `TradingDayItem`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | 单个交易日的 Asia/Shanghai 00:00:00 毫秒戳。 |
| `date` | string | 同一交易日的 `yyyyMMdd` 格式（Asia/Shanghai），方便直接展示 / 对账。 |
