# 期权合约基础资料

[业务导航](README.md)

- [期权合约详情 · `get_options_contracts_detail`](#get_options_contracts_detail)
- [期权合约基础信息列表 · `get_options_contracts_list`](#get_options_contracts_list)

<a id="get_options_contracts_detail"></a>
## 期权合约详情


工具名：`get_options_contracts_detail`

<a id="get_options_contracts_detail--工具描述"></a>
### 工具描述

> 按完整同花顺代码查询期权合约详情。

<a id="get_options_contracts_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期权合约完整同花顺代码。 |

<a id="get_options_contracts_detail--调用示例"></a>
### 调用示例

```text
工具：get_options_contracts_detail
参数：
  - thscode: "IO2601-C-4000.CFE"
```

<a id="get_options_contracts_detail--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期权合约详情](#get_options_contracts_detail--返回字段)。

<a id="get_options_contracts_detail--返回字段"></a>
### 返回字段

<a id="get_options_contracts_detail--期权合约详情--返回字段"></a>
#### 期权合约详情 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间，毫秒时间戳。 |
| `thscode` / `ticker` / `display_code` | string \| null | 完整代码、纯代码与展示代码。 |
| `name` / `variety_code` / `pinyin` | string \| null | 合约名称、品种代码与拼音。 |
| `list_date` | string \| null | 合约上市日期；来源缺失时为 `null`。 |
| `end_date` | string \| null | 合约上市结束日期。 |
| `last_trade_date` / `last_delivery_date` | string \| null | 最后交易日与最后交割日；来源缺失时为 `null`。 |
| `margin_rate` / `strike_price` | number \| null | 保证金率与行权价。 |
| `trade_amount` | number \| null | 合约交易单位数量。 |
| `underlying_code` | string \| null | 上游标的代码，不保证为规范 `thscode`。 |
| `exercise_style` | string \| null | 行权方式：`bermudan`、`american` 或 `european`。 |
| `option_type` | string \| null | 期权方向：`call` 或 `put`。 |

<a id="get_options_contracts_list"></a>
## 期权合约基础信息列表


工具名：`get_options_contracts_list`

<a id="get_options_contracts_list--工具描述"></a>
### 工具描述

> 从完整目录快照分页查询期权合约基础信息。

<a id="get_options_contracts_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `limit` | integer | 否 | `100` | 单页条数，范围 1-1000。 |
| `offset` | integer | 否 | `0` | 分页偏移。 |

<a id="get_options_contracts_list--调用示例"></a>
### 调用示例

```text
工具：get_options_contracts_list
参数：
  - limit: 100
  - offset: 0
```

<a id="get_options_contracts_list--返回"></a>
### 返回

返回期权合约基础信息分页列表，字段详见 [期权合约基础资料](#get_options_contracts_list--返回字段)。

<a id="get_options_contracts_list--返回字段"></a>
### 返回字段

<a id="get_options_contracts_list--期权合约基础信息列表--返回字段"></a>
#### 期权合约基础信息列表 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间，毫秒时间戳。 |
| `total` | integer | 合约总数。 |
| `item[]` | array | 合约基础信息列表。 |

响应 `data.item[]` 的每项包含 `thscode`、`ticker`、`name`、`exchange_code`、
`variety_code`、`list_date`、`end_date`、`last_trade_date` 与 `last_delivery_date`；
日期和来源缺失字段可为 `null`。
