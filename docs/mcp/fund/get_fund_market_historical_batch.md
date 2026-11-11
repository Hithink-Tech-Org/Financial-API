# ETF批量历史日线行情

[业务导航](README.md)

> **info**
> 工具名：`get_fund_market_historical_batch`
>
> 对应 REST 端点：[`GET /api/fund/market/historical-batch`](../../api/fund/fund-market.md#market-historical-batch--historical-batch)


## 工具描述

> 比较多只 ETF 的前复权历史日线，单次最多 10 个代码，仅支持 `1d`。查询窗口最长 5 个自然年，可获取的实际行情为近 5 年；较早数据可能为空，5 年窗口上限并不保证任意历史年份均有行情。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `510300.SH,159915.SZ`；最多 10 个，按去重前数量计数。 |
| `interval` | string | 否 | `1d` | K 线周期，当前仅支持 `1d`（日线）。 |
| `start` | long | 是 | — | 起始时间，毫秒级 Unix 时间戳；须为非负毫秒时间戳。 |
| `end` | long | 是 | — | 结束时间，毫秒级 Unix 时间戳；必须不早于 `start`，且窗口最长 5 个自然年；须为非负毫秒时间戳。 |

## 调用示例

```text
工具：get_fund_market_historical_batch
参数：
  - thscodes: "510300.SH,159915.SZ"
  - interval: "1d"
  - start: 1735660800000
  - end: 1767196800000
```

## 返回

返回 `{ interval, adjust, item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[场内基金批量历史日线行情](../../api/fund/fund-market.md#market-historical-batch--historical-batch)。
