# 期货基差

[业务导航](README.md)

- [期货历史基差 · `get_futures_basis_historical`](#get_futures_basis_historical)
- [期货主连最新基差 · `get_futures_basis_main_continuous_latest`](#get_futures_basis_main_continuous_latest)

<a id="get_futures_basis_historical"></a>
## 期货历史基差


工具名：`get_futures_basis_historical`

<a id="get_futures_basis_historical--工具描述"></a>
### 工具描述

> 查询指定期货合约的历史基差序列。

<a id="get_futures_basis_historical--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期货合约完整同花顺代码。 |
| `spot_indicator_id` | string | 否 | — | 可选现货指标 ID；省略时使用上游默认口径。 |

<a id="get_futures_basis_historical--调用示例"></a>
### 调用示例

```text
工具：get_futures_basis_historical
参数：
  - thscode: "CU2601.SHF"
  - spot_indicator_id: "spot-cu"
```

<a id="get_futures_basis_historical--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货历史基差](#get_futures_basis_historical--返回字段)。

<a id="get_futures_basis_historical--返回字段"></a>
### 返回字段

<a id="get_futures_basis_historical--期货历史基差--返回字段"></a>
#### 期货历史基差 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[].date` | string \| null | 记录日期。 |
| `item[].spot_price` / `converted_spot_price` / `close_price` / `settle_price` | number \| null | 现货、折算现货、收盘与结算价格。 |
| `item[].close_basis` / `settle_basis` / `close_basis_rate` / `settle_basis_rate` | number \| null | 收盘/结算基差及其比例。 |

<a id="get_futures_basis_main_continuous_latest"></a>
## 期货主连最新基差


工具名：`get_futures_basis_main_continuous_latest`

<a id="get_futures_basis_main_continuous_latest--工具描述"></a>
### 工具描述

> 查询期货主连的最新现货、期货价格与基差。

<a id="get_futures_basis_main_continuous_latest--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无业务参数。 |

<a id="get_futures_basis_main_continuous_latest--调用示例"></a>
### 调用示例

```text
工具：get_futures_basis_main_continuous_latest
参数：
  无
```

<a id="get_futures_basis_main_continuous_latest--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货主连最新基差](#get_futures_basis_main_continuous_latest--返回字段)。

<a id="get_futures_basis_main_continuous_latest--返回字段"></a>
### 返回字段

<a id="get_futures_basis_main_continuous_latest--期货主连最新基差--返回字段"></a>
#### 期货主连最新基差 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `thscode` / `ticker` / `name` / `variety_name` | string \| null | 主连代码与名称信息。 |
| `reference_site` / `updated_at` / `spot_publish_date` / `spot_indicator_id` / `default_value` | string \| null | 参考来源、更新时间、现货发布日期、指标 ID 与默认口径原值。 |
| `spot_price` / `converted_spot_price` / `close_price` / `settle_price` | number \| null | 现货、折算现货、收盘与结算价格。 |
| `close_basis` / `settle_basis` / `close_basis_rate` / `settle_basis_rate` | number \| null | 收盘/结算基差及其比例。 |
| `average_close_basis` / `average_settle_basis` | number \| null | 平均收盘与结算基差。 |
