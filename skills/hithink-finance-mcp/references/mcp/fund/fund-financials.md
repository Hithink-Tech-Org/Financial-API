# 基金财务数据

[业务导航](README.md)

- [基金资产负债表 · `get_fund_financials_balance_sheets`](#get_fund_financials_balance_sheets)
- [基金利润表 · `get_fund_financials_income_statements`](#get_fund_financials_income_statements)
- [基金财务指标 · `get_fund_financials_indicators`](#get_fund_financials_indicators)

<a id="get_fund_financials_balance_sheets"></a>
## 基金资产负债表


工具名：`get_fund_financials_balance_sheets`

<a id="get_fund_financials_balance_sheets--工具描述"></a>
### 工具描述

> 查询基金资产、负债与所有者权益。

<a id="get_fund_financials_balance_sheets--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |

<a id="get_fund_financials_balance_sheets--调用示例"></a>
### 调用示例

```text
工具：get_fund_financials_balance_sheets
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_financials_balance_sheets--返回"></a>
### 返回

返回报告期、资产、负债与所有者权益字段；字段见 [基金资产负债表](#get_fund_financials_balance_sheets--返回字段)。

<a id="get_fund_financials_balance_sheets--返回字段"></a>
### 返回字段

<a id="get_fund_financials_balance_sheets--基金资产负债表--返回字段"></a>
#### 基金资产负债表 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `start_date_ms` / `end_date_ms` / `publish_date_ms` | long | 报告期起止时间与发布日期。 |
| `total_assets` | number | 资产总计。 |
| `bank_deposit` | number | 银行存款。 |
| `fund_investment` / `stock_investment` / `bond_investment` | number | 基金、股票与债券投资。 |
| `transactional_financial_assets` / `other_assets` | number | 交易性金融资产与其他资产。 |
| `total_liability` / `other_liability` | number | 负债合计与其他负债。 |
| `owner_total_equity` / `undistributed_profit` | number | 所有者权益与未分配利润。 |
| `liability_and_owner_equity` | number | 负债和所有者权益总计。 |

通用鉴权与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。

<a id="get_fund_financials_income_statements"></a>
## 基金利润表


工具名：`get_fund_financials_income_statements`

<a id="get_fund_financials_income_statements--工具描述"></a>
### 工具描述

> 查询基金经营业绩及收益分配。

<a id="get_fund_financials_income_statements--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |

<a id="get_fund_financials_income_statements--调用示例"></a>
### 调用示例

```text
工具：get_fund_financials_income_statements
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_financials_income_statements--返回"></a>
### 返回

返回报告期、收入、费用与利润字段；字段见 [基金利润表](#get_fund_financials_income_statements--返回字段)。

<a id="get_fund_financials_income_statements--返回字段"></a>
### 返回字段

<a id="get_fund_financials_income_statements--基金利润表--返回字段"></a>
#### 基金利润表 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `start_date_ms` / `end_date_ms` / `publish_date_ms` | long | 报告期起止时间与发布日期。 |
| `income` / `total_income` | number | 收入与收入合计。 |
| `investment_income` | number | 投资收益。 |
| `stock_investment_income` / `bond_investment_income` / `fund_investment_income` | number | 股票、债券与基金投资收益。 |
| `dividend_income` / `interest_income` | number | 股利与利息收入。 |
| `fair_value_income` / `exchange_income` / `other_income` | number | 公允价值、汇兑及其他收入。 |
| `fee` / `total_fee` | number | 费用与费用合计。 |
| `manager_reward` / `custodian_fee` / `transaction_cost` / `tax_surcharge` | number | 管理人报酬、托管费、交易成本与税费。 |
| `total_profit` / `net_profit` | number | 利润总额与净利润。 |

<a id="get_fund_financials_indicators"></a>
## 基金财务指标


工具名：`get_fund_financials_indicators`

<a id="get_fund_financials_indicators--工具描述"></a>
### 工具描述

> 查询基金主要财务指标。

<a id="get_fund_financials_indicators--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |

<a id="get_fund_financials_indicators--调用示例"></a>
### 调用示例

```text
工具：get_fund_financials_indicators
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_financials_indicators--返回"></a>
### 返回

返回报告期及基金主要财务指标；字段见 [基金财务指标](#get_fund_financials_indicators--返回字段)。

<a id="get_fund_financials_indicators--返回字段"></a>
### 返回字段

<a id="get_fund_financials_indicators--基金财务指标--返回字段"></a>
#### 基金财务指标 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `start_date_ms` / `end_date_ms` / `publish_date_ms` | long | 报告期起止时间与发布日期。 |
| `distribution_profit` / `current_profit` / `current_income` | number | 可分配利润、本期利润与本期收入。 |
| `distribution_share_profit` | number | 每份可分配利润。 |
| `average_nav_profit_margin` / `average_share_current_profit` | number | 平均净值利润率与平均每份本期利润。 |
| `share_nav` / `sum_share_nav` | number | 单位净值与累计单位净值。 |
| `asset_nav` | number | 基金资产净值。 |
| `sum_nav_rate` / `nav_rate` | number | 累计净值增长率与净值增长率。 |
