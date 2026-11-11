# 期货主力与指数合约

[业务导航](README.md)

- [期货商品指数资料 · `get_futures_contracts_commodity_index_list`](#get_futures_contracts_commodity_index_list)
- [期货主连列表 · `get_futures_contracts_main_continuous_list`](#get_futures_contracts_main_continuous_list)
- [期货主力合约列表 · `get_futures_contracts_main_list`](#get_futures_contracts_main_list)
- [期货次主力合约列表 · `get_futures_contracts_secondary_main_list`](#get_futures_contracts_secondary_main_list)

<a id="get_futures_contracts_commodity_index_list"></a>
## 期货商品指数资料


工具名：`get_futures_contracts_commodity_index_list`

<a id="get_futures_contracts_commodity_index_list--工具描述"></a>
### 工具描述

> 查询期货商品指数资料。

<a id="get_futures_contracts_commodity_index_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无业务参数。 |

<a id="get_futures_contracts_commodity_index_list--调用示例"></a>
### 调用示例

```text
工具：get_futures_contracts_commodity_index_list
参数：
  {}
```

<a id="get_futures_contracts_commodity_index_list--返回"></a>
### 返回

返回期货商品指数合约列表；也可用 `asset_type=futures-commodity-index` 在标的目录中发现。

<a id="get_futures_contracts_commodity_index_list--返回字段"></a>
### 返回字段

<a id="get_futures_contracts_commodity_index_list--商品指数合约列表--返回字段"></a>
#### 商品指数合约列表 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 商品指数合约列表；每项含可空的 `thscode`、`ticker`、`name`、`list_date`、`end_date`。 |
| `item[].end_date` | string \| null | 合约上市结束日期。 |

<a id="get_futures_contracts_main_continuous_list"></a>
## 期货主连列表


工具名：`get_futures_contracts_main_continuous_list`

<a id="get_futures_contracts_main_continuous_list--工具描述"></a>
### 工具描述

> 查询期货主连资料。

<a id="get_futures_contracts_main_continuous_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无业务参数。 |

<a id="get_futures_contracts_main_continuous_list--调用示例"></a>
### 调用示例

```text
工具：get_futures_contracts_main_continuous_list
参数：
  {}
```

<a id="get_futures_contracts_main_continuous_list--返回"></a>
### 返回

返回期货主连列表，字段详见 [期货主力与指数合约](#get_futures_contracts_main_continuous_list--返回字段)。

<a id="get_futures_contracts_main_continuous_list--返回字段"></a>
### 返回字段

<a id="get_futures_contracts_main_continuous_list--期货主连资料--返回字段"></a>
#### 期货主连资料 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 主连列表。 |
| `thscode` / `ticker` / `name` / `variety_code` / `variety_name` / `exchange_code` | string \| null | 主连代码、名称、品种与交易所信息。 |
| `minute_visit_count` / `kline_visit_count` | integer \| null | 分时与 K 线访问次数。 |
| `statistics_date` | string \| null | 统计日期。 |

<a id="get_futures_contracts_main_list"></a>
## 期货主力合约列表


工具名：`get_futures_contracts_main_list`

<a id="get_futures_contracts_main_list--工具描述"></a>
### 工具描述

> 查询期货主力合约。

<a id="get_futures_contracts_main_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无业务参数。 |

<a id="get_futures_contracts_main_list--调用示例"></a>
### 调用示例

```text
工具：get_futures_contracts_main_list
参数：
  {}
```

<a id="get_futures_contracts_main_list--返回"></a>
### 返回

返回期货主力合约列表，字段详见 [期货主力与指数合约](#get_futures_contracts_main_list--返回字段)。

<a id="get_futures_contracts_main_list--返回字段"></a>
### 返回字段

<a id="get_futures_contracts_main_list--期货主力合约--返回字段"></a>
#### 期货主力合约 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 主力合约列表。 |
| `thscode` / `ticker` / `name` / `variety_code` / `variety_name` / `exchange_code` | string \| null | 合约、品种与交易所信息。 |
| `list_date` | string \| null | 合约上市日期。 |
| `end_date` | string \| null | 合约上市结束日期。 |
| `last_trade_date` / `last_delivery_date` | string \| null | 最后交易日与最后交割日。 |
| `margin_rate` / `transaction_fee` / `transaction_fee_rate` | number \| null | 保证金率、手续费与手续费率。 |

<a id="get_futures_contracts_secondary_main_list"></a>
## 期货次主力合约列表


工具名：`get_futures_contracts_secondary_main_list`

<a id="get_futures_contracts_secondary_main_list--工具描述"></a>
### 工具描述

> 查询期货次主力合约。

<a id="get_futures_contracts_secondary_main_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无业务参数。 |

<a id="get_futures_contracts_secondary_main_list--调用示例"></a>
### 调用示例

```text
工具：get_futures_contracts_secondary_main_list
参数：
  {}
```

<a id="get_futures_contracts_secondary_main_list--返回"></a>
### 返回

返回期货次主力合约列表，字段详见 [期货主力与指数合约](#get_futures_contracts_secondary_main_list--返回字段)。

<a id="get_futures_contracts_secondary_main_list--返回字段"></a>
### 返回字段

<a id="get_futures_contracts_secondary_main_list--期货次主力合约--返回字段"></a>
#### 期货次主力合约 · 返回字段

字段结构与[期货主力合约](#get_futures_contracts_secondary_main_list--返回字段)一致；合法无数据返回空数组。

<a id="get_futures_contracts_secondary_main_list--期货主力合约--返回字段"></a>
#### 期货主力合约 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 主力合约列表。 |
| `thscode` / `ticker` / `name` / `variety_code` / `variety_name` / `exchange_code` | string \| null | 合约、品种与交易所信息。 |
| `list_date` | string \| null | 合约上市日期。 |
| `end_date` | string \| null | 合约上市结束日期。 |
| `last_trade_date` / `last_delivery_date` | string \| null | 最后交易日与最后交割日。 |
| `margin_rate` / `transaction_fee` / `transaction_fee_rate` | number \| null | 保证金率、手续费与手续费率。 |
