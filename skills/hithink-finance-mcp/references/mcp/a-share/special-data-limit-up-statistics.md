# 涨停强度与晋级统计

[业务导航](README.md)

- [涨停市场汇总与连板统计 · `get_a_share_special_data_limit_up_statistics`](#get_a_share_special_data_limit_up_statistics)

<a id="get_a_share_special_data_limit_up_statistics"></a>
## 涨停市场汇总与连板统计


工具名：`get_a_share_special_data_limit_up_statistics`

<a id="get_a_share_special_data_limit_up_statistics--工具描述"></a>
### 工具描述

查询封板率、涨停打开家数、页面板数档位及精确连板家数。二、三、四和五板以上的晋级率为页面档位口径；五板以上为合并档位，精确家数仅包含实际返回的板数。

<a id="get_a_share_special_data_limit_up_statistics--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；省略使用当天或最近交易日，范围为一年 |

<a id="get_a_share_special_data_limit_up_statistics--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_limit_up_statistics
参数：
  - date: "2026-10-12"
```

<a id="get_a_share_special_data_limit_up_statistics--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [涨停市场统计](#get_a_share_special_data_limit_up_statistics--返回字段)。

<a id="get_a_share_special_data_limit_up_statistics--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_limit_up_statistics--涨停强度与晋级统计--返回字段"></a>
#### 涨停强度与晋级统计 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | integer | 采样时间；单位：毫秒 |
| `trade_date` | date | 业务所属交易日；核对请求日期 |
| `seal_rate` | number \| null | 数据返回封板率，小数保持原值；单位：小数比例 |
| `open_stock_count` | integer | 市场涨停打开股票家数；单位：家 |
| `limit_up_stock_count` | integer | 封板汇总家数；单位：家 |
| `touched_limit_up_stock_count` | integer | 返回封板率对应的汇总基数；单位：家 |
| `page_boards` | array | 页面板数档位 |
| `exact_boards` | array | 精确连板家数 |

**`data.page_boards[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `board_level` | enum | one/two/three/four/five_plus |
| `stock_count` | integer | 对应板数档位家数；单位：家 |
| `promotion_rate` | number \| null | 页面档位晋级率；five_plus为合并档位，one为null；单位：小数比例 |

**`data.exact_boards[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `board_num` | integer | 返回实际返回的精确板数，N≥2 |
| `stock_count` | integer | 恰好N板家数，由返回直接提供；单位：家 |
