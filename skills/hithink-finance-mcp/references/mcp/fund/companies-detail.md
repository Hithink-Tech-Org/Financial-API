# 基金公司详情

[业务导航](README.md)

- [基金公司详情 · `get_fund_companies_detail`](#get_fund_companies_detail)

<a id="get_fund_companies_detail"></a>
## 基金公司详情


工具名：`get_fund_companies_detail`

<a id="get_fund_companies_detail--工具描述"></a>
### 工具描述

> 按基金公司 ID 查询公司详情。

<a id="get_fund_companies_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `company_id` | string | 是 | — | 基金公司 ID。 |

<a id="get_fund_companies_detail--调用示例"></a>
### 调用示例

```text
工具：get_fund_companies_detail
参数：
  - company_id: "00089990"
```

<a id="get_fund_companies_detail--返回"></a>
### 返回

返回 `{ timestamp, item[] }`；字段见 [基金公司详情](#get_fund_companies_detail--返回字段)。

<a id="get_fund_companies_detail--返回字段"></a>
### 返回字段

<a id="get_fund_companies_detail--基金公司详情--返回字段"></a>
#### 基金公司详情 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `company_id` | string | 基金公司 ID。 |
| `company_name` | string | 基金公司名称。 |
| `company_type` | string | 基金公司类型。 |
| `established_date_ms` | long | 成立日期，毫秒 Unix 时间戳。 |
| `fund_count` | integer | 公司旗下基金数量。 |
| `scale` | number | 公司管理规模。 |

通用鉴权与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。
