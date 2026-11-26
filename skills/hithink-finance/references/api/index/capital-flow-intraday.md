# 指数主力资金分时与分钟序列

[业务导航](README.md) · **端内专用** · **同花顺AI客户端可用** · [使用说明](../README.md#端内能力说明)

查询单只指数的分时和分钟主力资金。本页接口仅供同花顺 AI 客户端使用，暂未开放外部接入。

- 本页接口结构用于说明同花顺AI客户端内的数据契约，当前不作为端外接入入口。
- 指数标的使用单个完整 `thscode`，例如上证指数 `000001.SH`。
- 资金金额单位为元。数据缺失时返回 `null`，不转换为 `0`。

```text
GET /api/a-share-index/capital-flow/intraday
```

查询单只交易所指数或同花顺板块指数的原生分时或分钟资金金额。原生分时和 1 分钟对应不同的上游序列。 本页接口仅供同花顺 AI 客户端使用，暂未开放外部接入。

## 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单个指数完整代码，例如 `000001.SH`。逗号列表和重复传参均拒绝。 |
| `interval` | enum | 是 | — | `trend`（原生分时）、`1m`、`2m`、`3m`、`5m`、`10m`、`15m`、`30m`、`45m`、`60m`。 |
| `start` | long | 是 | — | 起始时间，Unix 毫秒，含该时刻。北京时间仅可查含今天在内的近 7 个自然日。 |
| `end` | long | 是 | — | 结束时间，Unix 毫秒，含该时刻。必须与 start 位于同一北京时间自然日，且大于或等于 start。 |

## 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。示例查询 2026-11-23 的时间点；实际调用请换为近 7 个自然日内的毫秒时间戳。

```bash
curl 'https://fuyao.aicubes.cn/api/a-share-index/capital-flow/intraday?thscode=000001.SH&interval=trend&start=1795397400000&end=1795397460000'
```

## 响应示例

金额为示意值，单位为元。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-index-trend",
  "data": {
    "thscode": "000001.SH",
    "interval": "trend",
    "timestamp": 1795397460000,
    "series": {
      "date_ms": [
        1795397400000,
        1795397460000
      ],
      "super_large": {
        "inflow_amount": [
          2900000000,
          7800000000
        ],
        "outflow_amount": [
          2500000000,
          6900000000
        ],
        "net_amount": [
          400000000,
          900000000
        ]
      },
      "large": {
        "inflow_amount": [
          1800000000,
          4300000000
        ],
        "outflow_amount": [
          1900000000,
          4500000000
        ],
        "net_amount": [
          -100000000,
          -200000000
        ]
      },
      "medium": {
        "inflow_amount": [
          1000000000,
          2500000000
        ],
        "outflow_amount": [
          1050000000,
          2700000000
        ],
        "net_amount": [
          -50000000,
          -200000000
        ]
      },
      "small": {
        "inflow_amount": [
          590000000,
          1400000000
        ],
        "outflow_amount": [
          610000000,
          1500000000
        ],
        "net_amount": [
          -20000000,
          -100000000
        ]
      }
    }
  }
}
```

## 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long 或 null | 返回序列中最大的毫秒时间戳；无点时为 null。 |
| `thscode` | string | 请求的指数完整代码。 |
| `interval` | string | 请求周期。 |
| `series` | object | 包含时间列和四档资金列。所有列等长，无数据时各列均为空数组。 |
| `series.date_ms` | long[] | 升序、无重复的 Unix 毫秒时间戳。 |
| `series.super_large`、`series.large`、`series.medium`、`series.small` | object | 超大单、大单、中单、小单。每档包含下列三个金额数组，单位为元。 |

| 分档字段 | 数组元素类型 | 说明 |
|---|---|---|
| `inflow_amount` | number 或 null | 流入金额。 |
| `outflow_amount` | number 或 null | 流出金额。 |
| `net_amount` | number 或 null | 上游返回的净流入金额。 |

按相同下标读取同一时刻的数据。例如，`series.large.net_amount[i]` 是 `series.date_ms[i]` 对应的大单净流入金额。某项金额缺失时，对应位置保留 `null`，实际金额为零时返回 `0`。
