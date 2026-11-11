# 期货持仓

[业务导航](README.md)

- [期货公司列表 · `get_futures_positions_company_list`](#get_futures_positions_company_list)
- [公司品种日持仓 · `get_futures_positions_company_variety_daily`](#get_futures_positions_company_variety_daily)
- [期货合约日持仓 · `get_futures_positions_contract_daily`](#get_futures_positions_contract_daily)
- [期货合约历史持仓 · `get_futures_positions_contract_historical`](#get_futures_positions_contract_historical)
- [期货品种日持仓 · `get_futures_positions_variety_daily`](#get_futures_positions_variety_daily)

<a id="get_futures_positions_company_list"></a>
## 期货公司列表


工具名：`get_futures_positions_company_list`

<a id="get_futures_positions_company_list--工具描述"></a>
### 工具描述

> 查询可用于持仓检索的期货公司列表。

<a id="get_futures_positions_company_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无业务参数。 |

<a id="get_futures_positions_company_list--调用示例"></a>
### 调用示例

```text
工具：get_futures_positions_company_list
参数：
  无
```

<a id="get_futures_positions_company_list--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货公司列表](#get_futures_positions_company_list--返回字段)。

<a id="get_futures_positions_company_list--返回字段"></a>
### 返回字段

<a id="get_futures_positions_company_list--期货公司列表--返回字段"></a>
#### 期货公司列表 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 公司列表；每项含可空的 `company_id`、`company_name`。 |

<a id="get_futures_positions_company_variety_daily"></a>
## 公司品种日持仓


工具名：`get_futures_positions_company_variety_daily`

<a id="get_futures_positions_company_variety_daily--工具描述"></a>
### 工具描述

> 查询指定日期和品种集合的期货公司持仓。

<a id="get_futures_positions_company_variety_daily--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date` | string(date) | 是 | — | 交易日期。 |
| `varieties` | string | 是 | — | 1至5个逗号分隔的大写品种代码。 |

<a id="get_futures_positions_company_variety_daily--调用示例"></a>
### 调用示例

```text
工具：get_futures_positions_company_variety_daily
参数：
  - date: "2026-09-10"
  - varieties: "CU,AU"
```

<a id="get_futures_positions_company_variety_daily--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货公司品种日持仓](#get_futures_positions_company_variety_daily--返回字段)。

<a id="get_futures_positions_company_variety_daily--返回字段"></a>
### 返回字段

<a id="get_futures_positions_company_variety_daily--期货公司品种日持仓--返回字段"></a>
#### 期货公司品种日持仓 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 各期货公司的品种持仓列表。 |
| `date` / `variety_code` / `company_name` | string \| null | 交易日期（`yyyy-MM-dd`）、品种代码与公司名称。 |
| `volume` / `volume_change` / `long_position` / `long_position_change` / `short_position` / `short_position_change` / `net_position` / `net_position_change` | number \| null | 成交量、多空与净持仓及其变化。 |
| `price_spread_contract` | string \| null | 价差合约代码文本；多个代码按上游原值以逗号分隔。 |
| `day_profit` / `year_profit` / `week_win_rate` | number \| null | 日收益、年收益与周胜率。 |
| `day_mood` / `three_day_mood` / `five_day_mood` | number \| null | 不同周期情绪值。 |
| `three_day_net_change` / `five_day_net_change` / `max_funds` | number \| null | 净变化与最大资金。 |
| `year_profit_days` | integer \| null | 年度盈利天数。 |

<a id="get_futures_positions_contract_daily"></a>
## 期货合约日持仓


工具名：`get_futures_positions_contract_daily`

<a id="get_futures_positions_contract_daily--工具描述"></a>
### 工具描述

> 查询指定合约和交易日的公司持仓与多空均价。

<a id="get_futures_positions_contract_daily--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期货合约完整同花顺代码。 |
| `variety` | string | 是 | — | 与合约一致的大写品种代码。 |
| `date` | string(date) | 是 | — | 交易日期。 |

<a id="get_futures_positions_contract_daily--调用示例"></a>
### 调用示例

```text
工具：get_futures_positions_contract_daily
参数：
  - thscode: "CU2601.SHF"
  - variety: "CU"
  - date: "2026-09-10"
```

<a id="get_futures_positions_contract_daily--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货公司合约日持仓](#get_futures_positions_contract_daily--返回字段)。

<a id="get_futures_positions_contract_daily--返回字段"></a>
### 返回字段

<a id="get_futures_positions_contract_daily--期货公司合约日持仓--返回字段"></a>
#### 期货公司合约日持仓 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` / `date` | long / string \| null | 数据时间与查询交易日。 |
| `position_item[]` | array | 公司持仓；每项含 `date`、`thscode`、`ticker`、`company_name`、成交量、多空与净持仓及其变化。 |
| `average_item[]` | array | 独立均价序列；每项含 `date`、`company_long_avg`、`company_short_avg`，不得与持仓数组按位置关联。 |

<a id="get_futures_positions_contract_historical"></a>
## 期货合约历史持仓


工具名：`get_futures_positions_contract_historical`

<a id="get_futures_positions_contract_historical--工具描述"></a>
### 工具描述

> 查询指定公司在合约上的历史持仓与多空均价。

<a id="get_futures_positions_contract_historical--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期货合约完整同花顺代码。 |
| `variety` | string | 是 | — | 与合约一致的大写品种代码。 |
| `company` | string | 是 | — | 期货公司名称。 |
| `start_date` | string(date) | 是 | — | 调用日前一年内的开始日期；结束日期固定为调用日。 |

<a id="get_futures_positions_contract_historical--调用示例"></a>
### 调用示例

```text
工具：get_futures_positions_contract_historical
参数：
  - thscode: "CU2601.SHF"
  - variety: "CU"
  - company: "示例期货"
  - start_date: "2026-01-01"
```

<a id="get_futures_positions_contract_historical--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货公司合约历史持仓](#get_futures_positions_contract_historical--返回字段)。

<a id="get_futures_positions_contract_historical--返回字段"></a>
### 返回字段

<a id="get_futures_positions_contract_historical--期货公司合约历史持仓--返回字段"></a>
#### 期货公司合约历史持仓 · 返回字段

字段与[期货公司合约日持仓](#get_futures_positions_contract_historical--返回字段)一致；`position_item[]` 与 `average_item[]` 是独立序列。

<a id="get_futures_positions_contract_historical--期货公司合约日持仓--返回字段"></a>
#### 期货公司合约日持仓 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` / `date` | long / string \| null | 数据时间与查询交易日。 |
| `position_item[]` | array | 公司持仓；每项含 `date`、`thscode`、`ticker`、`company_name`、成交量、多空与净持仓及其变化。 |
| `average_item[]` | array | 独立均价序列；每项含 `date`、`company_long_avg`、`company_short_avg`，不得与持仓数组按位置关联。 |

<a id="get_futures_positions_variety_daily"></a>
## 期货品种日持仓


工具名：`get_futures_positions_variety_daily`

<a id="get_futures_positions_variety_daily--工具描述"></a>
### 工具描述

> 查询指定交易日的期货品种持仓。

<a id="get_futures_positions_variety_daily--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date` | string(date) | 是 | — | 交易日期，格式 yyyy-MM-dd。 |

<a id="get_futures_positions_variety_daily--调用示例"></a>
### 调用示例

```text
工具：get_futures_positions_variety_daily
参数：
  - date: "2026-09-10"
```

<a id="get_futures_positions_variety_daily--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货品种日持仓](#get_futures_positions_variety_daily--返回字段)。

<a id="get_futures_positions_variety_daily--返回字段"></a>
### 返回字段

<a id="get_futures_positions_variety_daily--期货品种日持仓--返回字段"></a>
#### 期货品种日持仓 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 品种日持仓列表。 |
| `date` / `variety_code` / `variety_name` | string \| null | 交易日期（`yyyy-MM-dd`）、品种代码与名称。 |
| `volume` / `volume_change` | number \| null | 成交量及变化。 |
| `long_position` / `long_position_change` / `short_position` / `short_position_change` | number \| null | 多空持仓及变化。 |
| `net_position` / `net_position_change` | number \| null | 净持仓及变化。 |
| `twenty_day_avg_price` / `main_close_price` / `index_close_price` / `main_settle_price` | number \| null | 均价、主力/指数收盘价及主力结算价。 |
| `change_risk` / `main_change_ratio` / `max_funds` / `capital_flow` | number \| null | 风险变化、涨跌幅、最大资金与资金流。 |
