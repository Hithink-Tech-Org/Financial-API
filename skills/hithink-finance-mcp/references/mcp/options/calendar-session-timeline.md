# 期权交易时间轴

[业务导航](README.md)

- [期权会话时间轴 · `get_options_calendar_session_timeline`](#get_options_calendar_session_timeline)

<a id="get_options_calendar_session_timeline"></a>
## 期权会话时间轴

[业务导航](../meta/README.md)

工具名：`get_options_calendar_session_timeline`

<a id="get_options_calendar_session_timeline--工具描述"></a>
### 工具描述

> 查询期权合约所属交易会话时间轴。

<a id="get_options_calendar_session_timeline--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期权合约同花顺代码。 |

<a id="get_options_calendar_session_timeline--调用示例"></a>
### 调用示例

```text
工具：get_options_calendar_session_timeline
参数：
  - thscode: "IO2601-C-4000.CFE"
```

<a id="get_options_calendar_session_timeline--返回"></a>
### 返回

返回交易日期、时区、交易阶段与交易所会话时间范围。

<a id="get_options_calendar_session_timeline--返回字段"></a>
### 返回字段

<a id="get_options_calendar_session_timeline--期权交易时间轴--返回字段"></a>
#### 期权交易时间轴 · 返回字段

字段结构与[期货交易时间轴](#get_options_calendar_session_timeline--返回字段)一致，使用期权合约代码和最近交易日的交易时间。

<a id="get_options_calendar_session_timeline--期货交易时间轴--返回字段"></a>
#### 期货交易时间轴 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` / `thscode` / `trade_date` / `timezone` | long / string | 数据时间、合约代码、最近交易日与时区。 |
| `trade_stages[]` | array | 交易阶段；每项含 `trade_period` 与 `trade_ranges[]`，范围含毫秒 `begin_time`、`end_time`。 |
| `exchange_sessions[]` | array | 交易所阶段；每项含 `trade_phase` 与 `phase_range[]`，范围结构同上。 |
