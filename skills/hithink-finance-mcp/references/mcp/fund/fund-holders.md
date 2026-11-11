# 基金持有人数据

[业务导航](README.md)

- [基金持有人结构 · `get_fund_holders_detail`](#get_fund_holders_detail)
- [基金前十大持有人 · `get_fund_holders_top`](#get_fund_holders_top)

<a id="get_fund_holders_detail"></a>
## 基金持有人结构


工具名：`get_fund_holders_detail`

<a id="get_fund_holders_detail--工具描述"></a>
### 工具描述

> 查询基金持有人结构，支持合并份额、独立份额或全部披露口径，返回实际口径、报告日、机构占比、持有人户数、户均持有份额、个人投资者占比和管理人员工持有比例。暂无可用数据时返回 `code=3002`。

<a id="get_fund_holders_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode，必须保留市场后缀。 |
| `merge_scope` | enum | 否 | `all` | `all` / `merged` / `separate`；`all` 分别返回合并与独立份额的最新记录。 |

<a id="get_fund_holders_detail--调用示例"></a>
### 调用示例

```text
工具：get_fund_holders_detail
参数：
  - thscode: "161725.SZ"
  - merge_scope: "all"
```

<a id="get_fund_holders_detail--返回"></a>
### 返回

返回 `{ timestamp, item: [FundHoldersItem, ...] }`。`all` 时 `item` 最多包含 `merged` 和 `separate` 两条最新记录；单一口径最多一条。字段含义见 返回字段说明
[基金持有人结构](#get_fund_holders_detail--返回字段)。

<a id="get_fund_holders_detail--返回字段"></a>
### 返回字段

<a id="get_fund_holders_detail--基金持有人结构--返回字段"></a>
#### 基金持有人结构 · 返回字段

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `merge_scope` | string | 该条记录的实际披露口径：`merged` 或 `separate`。 |
| `report_date_ms` | integer | 该条记录的披露报告日，毫秒 Unix 时间戳。 |
| `ins_position` | number | 机构投资者占比，百分数原值。 |
| `holder_amount` | integer | 基金份额持有人户数。 |
| `avg_holder_share` | number | 平均每户持有基金份额。 |
| `psnl_rate` | number | 个人投资者占比，百分数原值。 |
| `mgmt_staff_hold_rate` | number | 管理人员工持有比例，百分数原值。 |

`merge_scope=all` 时 `item` 最多包含两条：`merged` 和 `separate` 口径各自报告日最新的记录。指定单一口径时最多返回一条。`data.timestamp` 取返回记录中最新的报告日；所选口径暂无可用数据时返回 `code=3002`。

<a id="get_fund_holders_top"></a>
## 基金前十大持有人


工具名：`get_fund_holders_top`

<a id="get_fund_holders_top--工具描述"></a>
### 工具描述

> 查询基金前十大持有人及持有份额。

<a id="get_fund_holders_top--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |
| `limit` | integer | 否 | — | 返回条数，最大 10。 |

<a id="get_fund_holders_top--调用示例"></a>
### 调用示例

```text
工具：get_fund_holders_top
参数：
  - thscode: "510300.SH"
  - limit: 10
```

<a id="get_fund_holders_top--返回"></a>
### 返回

返回持有人、排名、份额、比例与报告日期；字段见 [基金前十大持有人](#get_fund_holders_top--返回字段)。

<a id="get_fund_holders_top--返回字段"></a>
### 返回字段

<a id="get_fund_holders_top--基金前十大持有人--返回字段"></a>
#### 基金前十大持有人 · 返回字段

`data` 元数据：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 接口响应时间戳，毫秒 Unix 时间戳。 |
| `limit` | integer | 服务端实际采用的返回条数上限。 |

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `holder_id` / `holder_code` | string | 持有人 ID 与代码。 |
| `holder_name` | string | 持有人名称。 |
| `holder_type` | string | 持有人类型。 |
| `rank` | integer | 持有排名。 |
| `hold_share` | number | 持有份额。 |
| `hold_rate_pct` | number | 持有比例，百分数原值。 |
| `report_date_ms` / `publish_date_ms` | long | 报告日与发布日期，毫秒 Unix 时间戳。 |

通用参数与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。
