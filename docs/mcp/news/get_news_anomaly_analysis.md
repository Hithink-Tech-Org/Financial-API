# 日期范围异动解读

[业务导航](README.md)

> **info**
> 工具名：`get_news_anomaly_analysis`
>
> 对应 REST 端点：[`GET /api/news/anomaly/analysis`](../../api/news/anomaly-analysis.md)


## 工具描述

> 查询日期范围异动解读。指定标的最多返回 365 天范围，全量最多 30 天；超范围由数据提供方向结束日期截取，was_truncated 表示截断。四个时间字段保留原值，单位及标的编码格式待核实。空列表也可能表示服务降级，不能据此断言期间没有异动。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `begin_date` | string | 是 | — | 开始日期，格式yyyy-MM-dd。 |
| `end_date` | string | 是 | — | 结束日期，格式yyyy-MM-dd。 |
| `thscode` | string | 否 | — | 按上游要求提供的同花顺标的编码，格式待核实；省略查询全量。 |

## 调用示例

```text
工具：get_news_anomaly_analysis
参数：
  - begin_date: "2026-10-01"
  - end_date: "2026-10-15"
```

## 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [日期范围异动解读](../../api/news/anomaly-analysis.md#返回字段)。
