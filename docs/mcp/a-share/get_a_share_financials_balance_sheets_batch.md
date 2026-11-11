# 批量资产负债表

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_financials_balance_sheets_batch`
>
> 对应 REST 端点：[`GET /api/a-share/financials/balance-sheets-batch`](../../api/a-share/financials.md#financials-balance-sheets-batch--balance-sheets-batch)


## 工具描述

> 对比多只 A 股的整体合并资产负债表，单次最多 10 个代码。所有标的共用报告期和取数模式：`annual` / `quarterly`；最近 N 期的 `limit` 默认 4、范围 1 至 20；或同时提供 `start` / `end` 查询不超过 10 个自然年的区间。两种模式互斥，半开区间或区间与 `limit` 混用返回 `1004`。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000858.SZ`；最多 10 个，按去重前数量计数。 |
| `period` | enum | 是 | — | `annual`（仅 Q4 报告期）/ `quarterly`（每个季度末）。 |
| `limit` | integer | 否 | `4` | 最近 N 期模式，范围 `[1, 20]`；与 `start` / `end` 互斥。 |
| `start` | long | 否 | — | 时间区间模式起始毫秒戳，需与 `end` 同传；须为非负毫秒时间戳。 |
| `end` | long | 否 | — | 时间区间模式结束毫秒戳，需满足 `end >= start`；须为非负毫秒时间戳。 |

## 调用示例

```text
工具：get_a_share_financials_balance_sheets_batch
参数：
  - thscodes: "600519.SH,000858.SZ"
  - period: "annual"
  - limit: 4
```

## 返回

返回 `{ item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[批量资产负债表](../../api/a-share/financials.md#financials-balance-sheets-batch--balance-sheets-batch)。
