# 期货交易日

[业务导航](README.md)

- [期货交易日日程 · `get_futures_calendar_trading_schedule`](#get_futures_calendar_trading_schedule)

<a id="get_futures_calendar_trading_schedule"></a>
## 期货交易日日程

[业务导航](../meta/README.md)

工具名：`get_futures_calendar_trading_schedule`

<a id="get_futures_calendar_trading_schedule--工具描述"></a>
### 工具描述

> 查询指定期货合约在日期范围内的交易日列表及对应交易时间安排。

<a id="get_futures_calendar_trading_schedule--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期货合约完整同花顺代码。 |
| `start_date` | string(date) | 是 | — | 开始日期。 |
| `end_date` | string(date) | 是 | — | 结束日期。 |

<a id="get_futures_calendar_trading_schedule--调用示例"></a>
### 调用示例

```text
工具：get_futures_calendar_trading_schedule
参数：
  - thscode: "CU2601.SHF"
  - start_date: "2026-01-09"
  - end_date: "2026-01-09"
```

<a id="get_futures_calendar_trading_schedule--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货交易日](#get_futures_calendar_trading_schedule--返回字段)。

<a id="get_futures_calendar_trading_schedule--返回字段"></a>
### 返回字段

<a id="get_futures_calendar_trading_schedule--期货交易日--返回字段"></a>
#### 期货交易日 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` / `thscode` / `timezone` | long / string | 数据时间、合约代码与时区。 |
| `trade_dates[]` | array | ISO 交易日期。 |
| `regular_schedules[]` | array | 常规日程；含 `start_date`、`end_date`、`times[]`，时间项含 `start_time`、`end_time`、`offset`、`trans_day_type`、`type`。 |
| `special_schedules[]` | array | 特殊日程；含 `date`、`times[]`，时间项含毫秒 `start_time`、`end_time` 与 `type`。 |
| `daylight_saving_periods[]` | array | 夏令时原值；每项含 `start`、`end`、`offset`。 |
