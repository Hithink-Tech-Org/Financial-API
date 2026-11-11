# 基金基本资料

[业务导航](README.md)

- [基金基本资料 · `get_fund_profile_detail`](#get_fund_profile_detail)

<a id="get_fund_profile_detail"></a>
## 基金基本资料


工具名：`get_fund_profile_detail`

<a id="get_fund_profile_detail--工具描述"></a>
### 工具描述

> 查询单只基金的基础资料，返回代码、名称、成立日期、公司、基金经理、规模、单位净值、交易规则与费率。
> 基金工具使用完整 `thscode` 唯一定位基金。

<a id="get_fund_profile_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode，必须保留市场后缀，如 `025480.OF` / `510300.SH`。 |

<a id="get_fund_profile_detail--调用示例"></a>
### 调用示例

```text
工具：get_fund_profile_detail
参数：
  - thscode: "025480.OF"
```

<a id="get_fund_profile_detail--返回"></a>
### 返回

返回 `{ timestamp, item: [FundProfileItem, ...] }`。字段含义见 返回字段说明
[基金基本资料](#get_fund_profile_detail--返回字段)。

<a id="get_fund_profile_detail--返回字段"></a>
### 返回字段

<a id="get_fund_profile_detail--基金基本资料--返回字段"></a>
#### 基金基本资料 · 返回字段

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带市场后缀的同花顺代码。 |
| `ticker` | string | 纯基金代码，仅用于展示。 |
| `fund_name` | string \| null | 基金名称。 |
| `estab_date` | long \| null | 成立日期，毫秒时间戳。 |
| `company_id` | string \| null | 基金公司 ID，可用于查询基金公司详情。 |
| `mgmt_name` | string \| null | 基金管理人名称。 |
| `manager_name` | string \| null | 基金经理姓名。 |
| `fund_scale` | number \| null | 基金规模。 |
| `unit_nav` | number \| null | 单位净值。 |
| `manager_info` | array | 基金经理引用，包含经理 ID、姓名、任职收益、任职天数与起止时间。 |
| `trade_rule` | array | 交易规则，包含标题、展示时间与毫秒时间戳。 |
| `rate_info` | array | 费率信息，包含费率类型、收费模式、条件、标准费率与优惠费率。 |

通用参数与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。
