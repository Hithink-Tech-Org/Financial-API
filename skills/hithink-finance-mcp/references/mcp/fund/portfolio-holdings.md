# 基金重仓持仓

[业务导航](README.md)

- [基金重仓股 · `get_fund_portfolio_holdings`](#get_fund_portfolio_holdings)

<a id="get_fund_portfolio_holdings"></a>
## 基金重仓股


工具名：`get_fund_portfolio_holdings`

<a id="get_fund_portfolio_holdings--工具描述"></a>
### 工具描述

> 查询单只基金定期披露的股票、债券和基金持仓，并返回持仓占比、排名与汇总指标。
> 持仓来自定期披露，不代表实时持仓。

<a id="get_fund_portfolio_holdings--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | `025480.OF` | 完整基金 thscode，必须保留市场后缀，如 `025480.OF` / `510300.SH` / `161725.SZ`。 |

<a id="get_fund_portfolio_holdings--调用示例"></a>
### 调用示例

```text
工具：get_fund_portfolio_holdings
参数：
  - thscode: "025480.OF"
```

<a id="get_fund_portfolio_holdings--返回"></a>
### 返回

返回 `{ timestamp, item: [FundHoldingItem, ...] }`。字段含义见 返回字段说明
[基金重仓股](#get_fund_portfolio_holdings--返回字段)。

<a id="get_fund_portfolio_holdings--返回字段"></a>
### 返回字段

<a id="get_fund_portfolio_holdings--基金重仓持仓--返回字段"></a>
#### 基金重仓持仓 · 返回字段

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 持仓股票的完整 thscode。 |
| `ticker` | string | 持仓股票的纯代码。 |
| `stock_name` | string | 资产名称；字段名为兼容既有契约而保留。 |
| `hold_ratio` | number | 占基金净值比例的百分数原值。 |
| `asset_type` | string | 资产类型，如 `stock` / `bond` / `fund`。 |
| `position_capital` / `position_count` | number | 持仓市值与持仓数量。 |
| `security_market_value_rate_pct` / `period_increase_rate_pct` | number | 证券市值占比与报告期增减比例。 |
| `investment_rank` | integer | 持仓排名。 |
| `start_date_ms` / `end_date_ms` / `publish_date_ms` / `modify_time_ms` | long | 报告期、发布日期与修改时间。 |

`data` 还可能包含 `total_stock_ratio_pct`、`total_bond_ratio_pct`、`total_fund_ratio_pct`、`turnover_rate_pct`、`stock_ratio_pct`、`main_industry` 与 `concentration_ratio` 等持仓汇总字段。

通用参数与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。
