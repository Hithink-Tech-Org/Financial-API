# 基金行情快照

[业务导航](README.md)

> **info**
> 工具名：`get_fund_market_snapshot`
>
> 对应 REST 端点：[`GET /api/fund/market/snapshot`](../../api/fund/fund-market.md#market-snapshot--场内基金行情快照)


## 工具描述

> 查询 ETF 和 LOF 的行情快照。`thscode` 接受 1 至 100 个英文逗号分隔的完整代码，原始项数先限额，规范化后稳定去重；响应为平铺行情记录。
> 未知、不支持或缺报价项省略；单唯一目标不支持返回 `3004`，其它零有效目标返回 `3001`，有效目标全部无报价返回 `3002`。空段返回 `1002`，超限返回 `1003`。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 1 至 100 个完整 ETF/LOF 代码，以英文逗号分隔，如 `510300.SH,161725.SZ`；含市场后缀。 |

系统会根据 `thscode` 识别标的类型。

## 调用示例

```text
工具：get_fund_market_snapshot
参数：
  - thscode: "510300.SH,161725.SZ"
```

## 返回

返回 `{ timestamp, item: [FundMarketSnapshotItem, ...] }`。字段含义见 REST 端点
[场内基金行情快照](../../api/fund/fund-market.md#market-snapshot--场内基金行情快照)。
