# 基金经理数据

[业务导航](README.md)

- [基金经理详情 · `get_fund_managers_detail`](#get_fund_managers_detail)
- [基金经理从业经历 · `get_fund_managers_experience`](#get_fund_managers_experience)
- [基金经理投资风格 · `get_fund_managers_investment_style`](#get_fund_managers_investment_style)
- [基金经理业绩 · `get_fund_managers_performance`](#get_fund_managers_performance)

<a id="get_fund_managers_detail"></a>
## 基金经理详情


工具名：`get_fund_managers_detail`

<a id="get_fund_managers_detail--工具描述"></a>
### 工具描述

> 查询基金经理基本信息与雷达对比。

<a id="get_fund_managers_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `manager_id` | string | 是 | — | 基金经理 ID。 |

<a id="get_fund_managers_detail--调用示例"></a>
### 调用示例

```text
工具：get_fund_managers_detail
参数：
  - manager_id: "H000200384"
```

<a id="get_fund_managers_detail--返回"></a>
### 返回

返回经理资料、公司、收益与雷达对比；字段见 [基金经理详情](#get_fund_managers_detail--返回字段)。

<a id="get_fund_managers_detail--返回字段"></a>
### 返回字段

<a id="get_fund_managers_detail--基金经理详情--返回字段"></a>
#### 基金经理详情 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `manager_id` / `manager_name` | string | 基金经理 ID 与姓名。 |
| `sex` / `degree` | string \| null | 性别与学历。 |
| `company_id` / `company_name` | string \| null | 所属基金公司 ID 与名称。 |
| `resume` / `photo_url` | string \| null | 履历与头像链接。 |
| `annual_return_pct` / `maximum_return_pct` | number \| null | 年化收益率与最大收益率。 |
| `radar_comparison` | array | 雷达图对比数据。 |

以上接口的 `timestamp` 均为接口响应时间戳。通用错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。

<a id="get_fund_managers_experience"></a>
## 基金经理从业经历


工具名：`get_fund_managers_experience`

<a id="get_fund_managers_experience--工具描述"></a>
### 工具描述

> 查询基金经理荣誉、重仓资产与投资经历。

<a id="get_fund_managers_experience--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `manager_id` | string | 是 | — | 基金经理 ID。 |

<a id="get_fund_managers_experience--调用示例"></a>
### 调用示例

```text
工具：get_fund_managers_experience
参数：
  - manager_id: "H000200384"
```

<a id="get_fund_managers_experience--返回"></a>
### 返回

返回荣誉、重仓资产与投资经历三组结构化数据；字段见 [从业经历](#get_fund_managers_experience--返回字段)。

<a id="get_fund_managers_experience--返回字段"></a>
### 返回字段

<a id="get_fund_managers_experience--从业经历--返回字段"></a>
#### 从业经历 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `awards` | array \| object \| null | 获奖经历，保留上游结构；已验证样例返回数组。 |
| `heavy_assets` | object | 代表性重仓资产，保留上游结构。 |
| `investment_history` | object | 投资与从业经历，保留上游结构。 |

`data.timestamp` 为接口响应时间戳。

<a id="get_fund_managers_investment_style"></a>
## 基金经理投资风格


工具名：`get_fund_managers_investment_style`

<a id="get_fund_managers_investment_style--工具描述"></a>
### 工具描述

> 查询基金经理代表基金、投资理念与行业偏好。

<a id="get_fund_managers_investment_style--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `manager_id` | string | 是 | — | 基金经理 ID。 |

<a id="get_fund_managers_investment_style--调用示例"></a>
### 调用示例

```text
工具：get_fund_managers_investment_style
参数：
  - manager_id: "H000200384"
```

<a id="get_fund_managers_investment_style--返回"></a>
### 返回

返回代表基金、投资理念、管理规模与行业偏好；字段见 [投资风格](#get_fund_managers_investment_style--返回字段)。

<a id="get_fund_managers_investment_style--返回字段"></a>
### 返回字段

<a id="get_fund_managers_investment_style--投资风格--返回字段"></a>
#### 投资风格 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `representative_fund_thscode` / `representative_fund_ticker` | string \| null | 代表基金完整代码与纯代码。 |
| `representative_fund_name` | string \| null | 代表基金名称。 |
| `investment_idea` | string \| null | 投资理念。 |
| `total_fund_scale` | number \| null | 管理基金总规模。 |
| `industry_preferences` | array \| object \| null | 行业偏好，保留上游结构；已验证样例返回年度记录数组。 |

关联基金解析失败时对应字段为空，不影响主能力；`data.timestamp` 为接口响应时间戳。

<a id="get_fund_managers_performance"></a>
## 基金经理业绩


工具名：`get_fund_managers_performance`

<a id="get_fund_managers_performance--工具描述"></a>
### 工具描述

> 查询基金经理、同类与基准的收益序列。

<a id="get_fund_managers_performance--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `manager_id` | string | 是 | — | 基金经理 ID。 |
| `range` | enum | 是 | — | `month` / `tmonth` / `year` / `nowyear` / `now`。 |

<a id="get_fund_managers_performance--调用示例"></a>
### 调用示例

```text
工具：get_fund_managers_performance
参数：
  - manager_id: "H000200384"
  - range: "year"
```

<a id="get_fund_managers_performance--返回"></a>
### 返回

返回经理、同类和基准的收益序列；字段见 [基金经理业绩](#get_fund_managers_performance--返回字段)。

<a id="get_fund_managers_performance--返回字段"></a>
### 返回字段

<a id="get_fund_managers_performance--基金经理业绩--返回字段"></a>
#### 基金经理业绩 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | 数据日期，毫秒 Unix 时间戳。 |
| `manager_return_pct` | number | 基金经理收益率，百分数原值。 |
| `peer_return_pct` | number | 同类收益率，百分数原值。 |
| `benchmark_return_pct` | number | 基准收益率，百分数原值。 |
