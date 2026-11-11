# 期权品种资料

[业务导航](README.md)

- [期权品种资料 · `get_options_varieties_list`](#get_options_varieties_list)

<a id="get_options_varieties_list"></a>
## 期权品种资料


工具名：`get_options_varieties_list`

<a id="get_options_varieties_list--工具描述"></a>
### 工具描述

> 查询期权品种、交易所、交易单位与交割方式等基础资料。

<a id="get_options_varieties_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无业务参数。 |

<a id="get_options_varieties_list--调用示例"></a>
### 调用示例

```text
工具：get_options_varieties_list
参数：
  无
```

<a id="get_options_varieties_list--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期权品种资料](#get_options_varieties_list--返回字段)。

<a id="get_options_varieties_list--返回字段"></a>
### 返回字段

<a id="get_options_varieties_list--期权品种资料--返回字段"></a>
#### 期权品种资料 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间，毫秒时间戳。 |
| `item[]` | array | 期权品种列表。 |
| `item[].variety_code` / `name` | string \| null | 品种代码与名称。 |
| `item[].exchange_code` / `exchange_name` | string \| null | 交易所代码与名称。 |
| `item[].has_night_session` | boolean \| null | 是否包含夜盘。 |
| `item[].margin_rate` | number \| null | 保证金率。 |
| `item[].trade_amount` | number \| null | 品种交易单位数量，单位由 `trade_unit` 字段给出。 |
| `item[].price_coefficient` / `tick_size` / `contract_multiplier` | number \| null | 价格系数、最小变动价位与合约乘数。 |
| `item[].price_unit` / `trade_unit` | string \| null | 价格单位与交易单位。 |
| `item[].transaction_fee` / `exercise_fee` | number \| null | 交易手续费与行权手续费。 |
| `item[].settlement_type` | string \| null | 品种交割方式：`physical`-实物交割、`cash`-现金交割。 |
| `item[].trade_sessions[]` | array | 交易时段；每项含 `start_time`、`end_time`、`session_type`。 |
