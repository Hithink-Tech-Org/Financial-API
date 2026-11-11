# 基金诊断详情

[业务导航](README.md)

- [基金诊断详情 · `get_fund_diagnostics_detail`](#get_fund_diagnostics_detail)

<a id="get_fund_diagnostics_detail"></a>
## 基金诊断详情


工具名：`get_fund_diagnostics_detail`

<a id="get_fund_diagnostics_detail--工具描述"></a>
### 工具描述

> 查询基金诊断维度、同类对比与韧性指标。

<a id="get_fund_diagnostics_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |

<a id="get_fund_diagnostics_detail--调用示例"></a>
### 调用示例

```text
工具：get_fund_diagnostics_detail
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_diagnostics_detail--返回"></a>
### 返回

返回诊断维度、同类维度、概率、区间和韧性结构；字段见 [基金诊断详情](#get_fund_diagnostics_detail--返回字段)。

<a id="get_fund_diagnostics_detail--返回字段"></a>
### 返回字段

<a id="get_fund_diagnostics_detail--基金诊断详情--返回字段"></a>
#### 基金诊断详情 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 完整基金 thscode。 |
| `ticker` | string | 纯基金代码。 |
| `fund_type` | string | 基金类型。 |
| `peer_code` | string | 同类比较分组代码。 |
| `dimensions` / `peer_dimensions` | object | 基金诊断维度及同类对比数据，保留上游结构。 |
| `probabilities` / `ranges` | object | 概率与区间数据，保留上游结构。 |
| `resilience` / `peer_resilience` | object | 基金韧性及同类韧性数据，保留上游结构。 |

通用鉴权与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。
