# 基金回撤指标

[业务导航](README.md)

> **info**
> 工具名：`get_fund_performance_drawdowns`
>
> 对应 REST 端点：[`GET /api/fund/performance/drawdowns`](../../api/fund/fund-performance.md#performance-drawdowns--基金最大回撤)


## 工具描述

> 单查或批量查询十个区间的最大回撤。回撤为非负的百分数原值。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 否 | — | 单只基金的完整代码，与 `thscodes` 二选一。 |
| `thscodes` | string | 否 | — | 1 至 20 个完整基金代码，用英文逗号分隔，与 `thscode` 二选一。 |

## 调用示例

```text
工具：get_fund_performance_drawdowns
参数：
  - thscodes: "510300.SH,158001.SZ"
```

## 返回

通过 `data.item[]` 返回基金代码及最大回撤。真实的零照常返回，缺值省略。字段见 [基金最大回撤](../../api/fund/fund-performance.md#performance-drawdowns--基金最大回撤)。
