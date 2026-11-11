# 个股机构交易详情

[业务导航](README.md)

- [个股龙虎榜机构金额详情 · `get_a_share_special_data_dragon_tiger_stock_institution`](#get_a_share_special_data_dragon_tiger_stock_institution)

<a id="get_a_share_special_data_dragon_tiger_stock_institution"></a>
## 个股龙虎榜机构金额详情


工具名：`get_a_share_special_data_dragon_tiger_stock_institution`

<a id="get_a_share_special_data_dragon_tiger_stock_institution--工具描述"></a>
### 工具描述

按股票和交易日查询机构买入、卖出、净买入金额，以及机构数量、比例和营业部身份。同一股票的一日与三日上榜区间分别保留；省略区间参数时返回实际记录。

<a id="get_a_share_special_data_dragon_tiger_stock_institution--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单个A股标准代码 |
| `date` | string | 否 | — | 查询日期，YYYY-MM-DD；默认日期与有效范围见接口说明；省略使用最近已完成交易日，查询范围为一年 |
| `range_days` | integer | 否 | — | 上榜区间，1或3；省略返回两类实际记录 |

<a id="get_a_share_special_data_dragon_tiger_stock_institution--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_dragon_tiger_stock_institution
参数：
  - thscode: "301052.SZ"
  - date: "2026-10-12"
```

<a id="get_a_share_special_data_dragon_tiger_stock_institution--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [个股机构交易详情](#get_a_share_special_data_dragon_tiger_stock_institution--返回字段)。

<a id="get_a_share_special_data_dragon_tiger_stock_institution--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_dragon_tiger_stock_institution--个股机构交易详情--返回字段"></a>
#### 个股机构交易详情 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 股票标识 |
| `trade_date` | date | 查询日 |
| `item` | array | 业务记录列表 |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `range_days` | integer | 上榜统计区间 |
| `start_date` | date | 区间起日 |
| `end_date` | date | 区间末日 |
| `org_buy_value` | number \| null | 机构买入汇总；单位：元 |
| `org_sell_value` | number \| null | 机构卖出汇总；单位：元 |
| `org_net_value` | number \| null | 机构净买入；单位：元 |
| `org_buy_num` | integer \| null | 买入机构数 |
| `org_sell_num` | integer \| null | 卖出机构数 |
| `org_net_rate` | number \| null | 区间机构净买入比例；单位：小数比例 |
| `buy_departments[]` | array[object] | 买入席位ID与名称索引 |
| `sell_departments[]` | array[object] | 卖出席位ID与名称索引 |

营业部身份对象包含 `department_id`（营业部业务标识）与 `name`（名称，可空）。
