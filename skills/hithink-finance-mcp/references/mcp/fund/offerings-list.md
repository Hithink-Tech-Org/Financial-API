# 基金募集列表

[业务导航](README.md)

- [基金募集列表 · `get_fund_offerings_list`](#get_fund_offerings_list)

<a id="get_fund_offerings_list"></a>
## 基金募集列表


工具名：`get_fund_offerings_list`

<a id="get_fund_offerings_list--工具描述"></a>
### 工具描述

> 查询当前募集或即将募集的新发基金。

<a id="get_fund_offerings_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `subscribe` | enum | 是 | — | `active` / `upcoming`。 |

<a id="get_fund_offerings_list--调用示例"></a>
### 调用示例

```text
工具：get_fund_offerings_list
参数：
  - subscribe: "active"
```

<a id="get_fund_offerings_list--返回"></a>
### 返回

返回基金代码与募集起止时间；字段见 [基金募集列表](#get_fund_offerings_list--返回字段)。

<a id="get_fund_offerings_list--返回字段"></a>
### 返回字段

<a id="get_fund_offerings_list--基金募集列表--返回字段"></a>
#### 基金募集列表 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 完整基金 thscode。 |
| `ticker` | string | 纯基金代码。 |
| `subscription_start_ms` | long | 募集开始时间，毫秒 Unix 时间戳。 |
| `subscription_end_ms` | long | 募集结束时间，毫秒 Unix 时间戳。 |

通用鉴权与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。
