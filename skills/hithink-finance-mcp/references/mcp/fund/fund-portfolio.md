# 基金持仓与资产配置

[业务导航](README.md)

- [基金资产配置 · `get_fund_portfolio_asset_allocation`](#get_fund_portfolio_asset_allocation)
- [基金历史债券持仓 · `get_fund_portfolio_bond_history`](#get_fund_portfolio_bond_history)
- [基金债券持仓报告日期 · `get_fund_portfolio_bond_report_dates`](#get_fund_portfolio_bond_report_dates)
- [基金行业配置 · `get_fund_portfolio_industry_allocation`](#get_fund_portfolio_industry_allocation)
- [基金历史股票持仓 · `get_fund_portfolio_stock_history`](#get_fund_portfolio_stock_history)
- [基金股票持仓报告日期 · `get_fund_portfolio_stock_report_dates`](#get_fund_portfolio_stock_report_dates)

<a id="get_fund_portfolio_asset_allocation"></a>
## 基金资产配置


工具名：`get_fund_portfolio_asset_allocation`

<a id="get_fund_portfolio_asset_allocation--工具描述"></a>
### 工具描述

> 查询基金股票、债券、存款与其他资产配置比例。

<a id="get_fund_portfolio_asset_allocation--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |

<a id="get_fund_portfolio_asset_allocation--调用示例"></a>
### 调用示例

```text
工具：get_fund_portfolio_asset_allocation
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_portfolio_asset_allocation--返回"></a>
### 返回

返回报告日期与各资产配置比例；字段见 [基金资产配置](#get_fund_portfolio_asset_allocation--返回字段)。

<a id="get_fund_portfolio_asset_allocation--返回字段"></a>
### 返回字段

<a id="get_fund_portfolio_asset_allocation--基金资产配置--返回字段"></a>
#### 基金资产配置 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `report_date_ms` | long | 报告日期，毫秒 Unix 时间戳。 |
| `stock_ratio_pct` | number | 股票资产占比，百分数原值。 |
| `bond_ratio_pct` | number | 债券资产占比，百分数原值。 |
| `deposit_ratio_pct` | number | 存款占比，百分数原值。 |
| `other_ratio_pct` | number | 其他资产占比，百分数原值。 |

<a id="get_fund_portfolio_bond_history"></a>
## 基金历史债券持仓


工具名：`get_fund_portfolio_bond_history`

<a id="get_fund_portfolio_bond_history--工具描述"></a>
### 工具描述

> 查询基金指定报告期的历史债券持仓。

<a id="get_fund_portfolio_bond_history--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |
| `report_type` | string | 是 | — | 报告类型。 |
| `end_date` | string | 是 | — | 报告截止日期。 |

<a id="get_fund_portfolio_bond_history--调用示例"></a>
### 调用示例

```text
工具：get_fund_portfolio_bond_history
参数：
  - thscode: "510300.SH"
  - report_type: "quarter"
  - end_date: "2026-06-30"
```

<a id="get_fund_portfolio_bond_history--返回"></a>
### 返回

返回历史债券持仓明细；`rank` 仅前十大持仓为 `1`–`10`，其余持仓为 `null`。字段见 [基金历史债券持仓](#get_fund_portfolio_bond_history--返回字段)。

<a id="get_fund_portfolio_bond_history--返回字段"></a>
### 返回字段

<a id="get_fund_portfolio_bond_history--基金历史债券持仓--返回字段"></a>
#### 基金历史债券持仓 · 返回字段

字段结构与“基金历史股票持仓”一致；债券记录的 `asset_type` 为 `bond`。`rank` 仅前十大持仓返回 `1`–`10`，其余持仓返回 `null`。

<a id="get_fund_portfolio_bond_report_dates"></a>
## 基金债券持仓报告日期


工具名：`get_fund_portfolio_bond_report_dates`

<a id="get_fund_portfolio_bond_report_dates--工具描述"></a>
### 工具描述

> 查询基金债券持仓可用报告期。

<a id="get_fund_portfolio_bond_report_dates--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |
| `report_type` | string | 否 | — | 可选报告类型。 |

<a id="get_fund_portfolio_bond_report_dates--调用示例"></a>
### 调用示例

```text
工具：get_fund_portfolio_bond_report_dates
参数：
  - thscode: "510300.SH"
  - report_type: "quarter"
```

<a id="get_fund_portfolio_bond_report_dates--返回"></a>
### 返回

返回报告类型、名称与起止日期；字段见 [基金债券持仓报告日期](#get_fund_portfolio_bond_report_dates--返回字段)。

<a id="get_fund_portfolio_bond_report_dates--返回字段"></a>
### 返回字段

<a id="get_fund_portfolio_bond_report_dates--基金债券持仓报告日期--返回字段"></a>
#### 基金债券持仓报告日期 · 返回字段

字段结构与“基金股票持仓报告日期”一致。

<a id="get_fund_portfolio_industry_allocation"></a>
## 基金行业配置


工具名：`get_fund_portfolio_industry_allocation`

<a id="get_fund_portfolio_industry_allocation--工具描述"></a>
### 工具描述

> 查询单只基金的申万行业配置。

<a id="get_fund_portfolio_industry_allocation--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |

<a id="get_fund_portfolio_industry_allocation--调用示例"></a>
### 调用示例

```text
工具：get_fund_portfolio_industry_allocation
参数：
  - thscode: "510300.SH"
```

<a id="get_fund_portfolio_industry_allocation--返回"></a>
### 返回

返回报告期、行业名称与配置比例；字段见 [基金行业配置](#get_fund_portfolio_industry_allocation--返回字段)。

<a id="get_fund_portfolio_industry_allocation--返回字段"></a>
### 返回字段

<a id="get_fund_portfolio_industry_allocation--基金行业配置--返回字段"></a>
#### 基金行业配置 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `report_period` | string | 报告期。 |
| `industry_name` | string | 行业名称。 |
| `ratio_pct` | number | 行业配置比例，百分数原值。 |

以上接口的 `timestamp` 均为接口响应时间戳。通用参数与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。

<a id="get_fund_portfolio_stock_history"></a>
## 基金历史股票持仓


工具名：`get_fund_portfolio_stock_history`

<a id="get_fund_portfolio_stock_history--工具描述"></a>
### 工具描述

> 查询基金指定报告期的历史股票持仓。

<a id="get_fund_portfolio_stock_history--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |
| `report_type` | string | 是 | — | 报告类型。 |
| `end_date` | string | 是 | — | 报告截止日期。 |

<a id="get_fund_portfolio_stock_history--调用示例"></a>
### 调用示例

```text
工具：get_fund_portfolio_stock_history
参数：
  - thscode: "510300.SH"
  - report_type: "quarter"
  - end_date: "2026-06-30"
```

<a id="get_fund_portfolio_stock_history--返回"></a>
### 返回

返回历史股票持仓明细；`rank` 仅前十大持仓为 `1`–`10`，其余持仓为 `null`。字段见 [基金历史股票持仓](#get_fund_portfolio_stock_history--返回字段)。

<a id="get_fund_portfolio_stock_history--返回字段"></a>
### 返回字段

<a id="get_fund_portfolio_stock_history--基金历史股票持仓--返回字段"></a>
#### 基金历史股票持仓 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` / `ticker` / `name` | string | 持仓标的完整代码、纯代码与名称。 |
| `asset_type` | string | 资产类型，股票持仓为 `stock`。 |
| `hold_ratio` | number | 持仓占比，百分数原值。 |
| `market_value` | number | 持仓市值。 |
| `period_increase_pct` | number | 报告期增减比例，百分数原值。 |
| `rank` | integer \| null | 持仓排名；仅前十大持仓返回 `1`–`10`，其余持仓返回 `null`。 |
| `report_type` | string | 报告类型。 |
| `end_date_ms` | long | 报告截止日期，毫秒 Unix 时间戳。 |

<a id="get_fund_portfolio_stock_report_dates"></a>
## 基金股票持仓报告日期


工具名：`get_fund_portfolio_stock_report_dates`

<a id="get_fund_portfolio_stock_report_dates--工具描述"></a>
### 工具描述

> 查询基金股票持仓可用报告期。

<a id="get_fund_portfolio_stock_report_dates--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |
| `report_type` | string | 否 | — | 可选报告类型。 |

<a id="get_fund_portfolio_stock_report_dates--调用示例"></a>
### 调用示例

```text
工具：get_fund_portfolio_stock_report_dates
参数：
  - thscode: "510300.SH"
  - report_type: "quarter"
```

<a id="get_fund_portfolio_stock_report_dates--返回"></a>
### 返回

返回报告类型、名称与起止日期；字段见 [基金股票持仓报告日期](#get_fund_portfolio_stock_report_dates--返回字段)。

<a id="get_fund_portfolio_stock_report_dates--返回字段"></a>
### 返回字段

<a id="get_fund_portfolio_stock_report_dates--基金股票持仓报告日期--返回字段"></a>
#### 基金股票持仓报告日期 · 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `report_type` | string | 报告类型。 |
| `report_type_name` | string | 报告类型中文名称。 |
| `start_date_ms` / `end_date_ms` | long | 报告期起止日期，毫秒 Unix 时间戳。 |
