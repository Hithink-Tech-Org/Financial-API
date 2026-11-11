# 基金分红记录

[业务导航](README.md)

- [基金分红记录 · `get_fund_corporate_actions_dividends`](#get_fund_corporate_actions_dividends)

<a id="get_fund_corporate_actions_dividends"></a>
## 基金分红记录


工具名：`get_fund_corporate_actions_dividends`

<a id="get_fund_corporate_actions_dividends--工具描述"></a>
### 工具描述

> 查询单只基金的历史分红记录。

<a id="get_fund_corporate_actions_dividends--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |

<a id="get_fund_corporate_actions_dividends--调用示例"></a>
### 调用示例

```text
工具：get_fund_corporate_actions_dividends
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_corporate_actions_dividends--返回"></a>
### 返回

返回现金分红、进度和关键日期；字段见 [基金分红记录](#get_fund_corporate_actions_dividends--返回字段)。

<a id="get_fund_corporate_actions_dividends--返回字段"></a>
### 返回字段

<a id="get_fund_corporate_actions_dividends--基金分红记录--返回字段"></a>
#### 基金分红记录 · 返回字段

`data` 元数据：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 接口响应时间戳，毫秒 Unix 时间戳。 |
| `dividend_count` | integer | 返回的分红记录总数。 |
| `dividend_total` | number | 服务端返回的累计分红汇总值；不要与每 10 份现金分红混用。 |

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `per_ten_cash_before_tax` / `per_ten_cash_after_tax` | number | 每 10 份税前/税后现金分红。 |
| `progress` | string | 分红进度。 |
| `publish_date_ms` / `registration_date_ms` / `ex_dividend_date_ms` | long | 公告日、权益登记日与除息日。 |
| `payment_date_ms` / `reinvestment_date_ms` | long | 派息日与红利再投资日。 |
| `profit_base_date_ms` / `in_dividend_date_ms` | long | 收益基准日及分红相关日期。 |

通用参数与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。
