# 基金最新净值快照

[业务导航](README.md)

> **info**
> 工具名：`get_fund_performance_nav_snapshot`
>
> 对应 REST 端点：[`GET /api/fund/performance/nav-snapshot`](../../api/fund/fund-performance.md#performance-nav-snapshot--基金最新净值快照)


## 工具描述

> 批量查询最新单位净值和复权净值。净值按四位小数返回。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 1 至 20 个完整基金代码，用英文逗号分隔。 |

## 调用示例

```text
工具：get_fund_performance_nav_snapshot
参数：
  - thscodes: "510300.SH,158001.SZ"
```

## 返回

通过 `data.item[]` 返回 `thscode`、`unit_nav` 与 `adj_nav`。快照省略净值日期和时间戳。字段见 [基金最新净值快照](../../api/fund/fund-performance.md#performance-nav-snapshot--基金最新净值快照)。
