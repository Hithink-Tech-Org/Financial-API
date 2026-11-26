# 基金区间收益

[业务导航](README.md)

> **info**
> 工具名：`get_fund_performance_returns`
>
> 对应 REST 端点：[`GET /api/fund/performance/returns`](../../api/fund/fund-performance.md#performance-returns--基金区间收益)


## 工具描述

> 单查或批量查询区间收益、同类平均与排名。收益率为百分数原值。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 否 | — | 单只基金的完整代码，与 `thscodes` 二选一。 |
| `thscodes` | string | 否 | — | 1 至 20 个完整基金代码，用英文逗号分隔，与 `thscode` 二选一。 |

## 调用示例

```text
工具：get_fund_performance_returns
参数：
  - thscodes: "510300.SH,158001.SZ"
```

## 返回

通过 `data.item[]` 返回收益指标。批量每条携带 `thscode`，收益缺值时仍可返回有值的排名与总数。字段见 [基金区间收益](../../api/fund/fund-performance.md#performance-returns--基金区间收益)。
