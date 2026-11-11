# 营业部数据

[业务导航](README.md)

- [营业部经典战绩 · `get_a_share_special_data_dragon_tiger_department_classic_record`](#get_a_share_special_data_dragon_tiger_department_classic_record)
- [营业部历史上榜记录 · `get_a_share_special_data_dragon_tiger_department_history`](#get_a_share_special_data_dragon_tiger_department_history)

<a id="get_a_share_special_data_dragon_tiger_department_classic_record"></a>
## 营业部经典战绩


工具名：`get_a_share_special_data_dragon_tiger_department_classic_record`

<a id="get_a_share_special_data_dragon_tiger_department_classic_record--工具描述"></a>
### 工具描述

查询营业部身份及一条代表战绩。无代表战绩时，`classic_record` 为 `null`。

<a id="get_a_share_special_data_dragon_tiger_department_classic_record--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `department_id` | string | 是 | — | 营业部业务标识 |

<a id="get_a_share_special_data_dragon_tiger_department_classic_record--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_dragon_tiger_department_classic_record
参数：
  - department_id: "Q1218139C1"
```

<a id="get_a_share_special_data_dragon_tiger_department_classic_record--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [营业部数据](#get_a_share_special_data_dragon_tiger_department_classic_record--返回字段)。

<a id="get_a_share_special_data_dragon_tiger_department_classic_record--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_dragon_tiger_department_classic_record--营业部经典战绩--返回字段"></a>
#### 营业部经典战绩 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `department_id` | string | 当前查询使用的营业部ID |
| `department_name` | string \| null | 营业部名称 |
| `organization_id` | string \| null | 组织业务标识 |
| `classic_record` | object \| null | 代表战绩对象，缺失时为null |

**`data.classic_record` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string \| null | 返回已提供标准股票代码 |
| `name` | string \| null | 股票名称 |
| `board_pattern` | string \| null | 几天几板原始描述 |

<a id="get_a_share_special_data_dragon_tiger_department_history"></a>
## 营业部历史上榜记录


工具名：`get_a_share_special_data_dragon_tiger_department_history`

<a id="get_a_share_special_data_dragon_tiger_department_history--工具描述"></a>
### 工具描述

分页查询营业部上榜股票，支持净买入金额档位和排序；同股不同上榜记录分别保留。

<a id="get_a_share_special_data_dragon_tiger_department_history--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `department_id` | string | 是 | — | 营业部业务标识 |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `30` | 每页1至30条，默认30 |
| `min_net_buy_amount` | integer | 否 | — | 净买入金额档位：5000000/30000000/50000000/100000000，单位元 |
| `sort_field` | string | 否 | `trade_date` | 排序字段：trade_date/change_ratio/net_buy_amount |
| `sort_dir` | string | 否 | `desc` | asc或desc |

<a id="get_a_share_special_data_dragon_tiger_department_history--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_dragon_tiger_department_history
参数：
  - department_id: "Q1218139C1"
  - page: 1
  - size: 30
```

<a id="get_a_share_special_data_dragon_tiger_department_history--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [营业部数据](#get_a_share_special_data_dragon_tiger_department_history--返回字段)。

代码与名称可能为null或空字符串，按源值返回；缺失值为null，整页记录与顺序保留。

<a id="get_a_share_special_data_dragon_tiger_department_history--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_dragon_tiger_department_history--营业部历史上榜记录--返回字段"></a>
#### 营业部历史上榜记录 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 业务记录列表 |
| `pagination` | object | 分页对象，包含page、size、total和has_next |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string \| null | 股票标准代码 ；源null或空字符串原样保留，缺失值为null |
| `name` | string \| null | 名称 ；源null或空字符串原样保留，缺失值为null |
| `trade_date` | date | 上榜交易日 |
| `change_ratio` | number \| null | 当日涨跌幅；单位：小数比例 |
| `net_buy_amount` | number \| null | 净买入；单位：元 |
| `rank_type` | integer | 保留返回榜单区间码 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |
