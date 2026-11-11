# 期货历史仓单

[业务导航](README.md)

- [期货历史仓单 · `get_futures_warehouse_receipts_historical`](#get_futures_warehouse_receipts_historical)

<a id="get_futures_warehouse_receipts_historical"></a>
## 期货历史仓单


工具名：`get_futures_warehouse_receipts_historical`

<a id="get_futures_warehouse_receipts_historical--工具描述"></a>
### 工具描述

> 查询期货合约在指定日期范围内的仓单记录。

<a id="get_futures_warehouse_receipts_historical--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 期货合约完整同花顺代码。 |
| `start_date` | string(date) | 是 | — | 开始日期。 |
| `end_date` | string(date) | 是 | — | 结束日期。 |

<a id="get_futures_warehouse_receipts_historical--调用示例"></a>
### 调用示例

```text
工具：get_futures_warehouse_receipts_historical
参数：
  - thscode: "CU2601.SHF"
  - start_date: "2026-09-01"
  - end_date: "2026-09-10"
```

<a id="get_futures_warehouse_receipts_historical--返回"></a>
### 返回

返回统一数据对象；字段、空值和数组语义见 [期货历史仓单](#get_futures_warehouse_receipts_historical--返回字段)。

<a id="get_futures_warehouse_receipts_historical--返回字段"></a>
### 返回字段

<a id="get_futures_warehouse_receipts_historical--期货历史仓单--返回字段"></a>
#### 期货历史仓单 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 仓单列表；每项含 `date` 与可空的 `amount`、`amount_change`、`equivalent_lots`。 |
