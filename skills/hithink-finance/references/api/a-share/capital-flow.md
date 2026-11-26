# 主力资金

[业务导航](README.md) · **端内专用** · **同花顺AI客户端可用** · [使用说明](../README.md#端内能力说明)

- [资金流向实时快照](#capital-flow-snapshot)：`GET /api/a-share/capital-flow/snapshot`
- [资金流向历史](#capital-flow-historical)：`GET /api/a-share/capital-flow/historical`
- [股票主力资金分钟序列](#capital-flow-intraday)：`GET /api/a-share/capital-flow/intraday`

股票资金快照、历史及分钟序列。本页接口仅供同花顺 AI 客户端使用，暂未开放外部接入。

- 本页接口结构用于说明同花顺AI客户端内的数据契约，当前不作为端外接入入口。
- 股票标的使用单个完整 `thscode`，格式为 `6 位代码.交易所后缀`，例如 `600519.SH`、`000001.SZ` 或 `920002.BJ`。
- 资金金额单位为元。数据缺失时返回 `null`，不转换为 `0`。

<a id="capital-flow-snapshot"></a>
<a id="capital-flow-snapshot--资金流向实时快照"></a>
## 资金流向实时快照

```text
GET /api/a-share/capital-flow/snapshot
```

查询单只 A 股最新的超大单、大单、中单和小单资金流入、流出及净额。

<a id="capital-flow-snapshot--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只 A 股完整代码；不支持批量、纯代码或非 A 股标的。 |

<a id="capital-flow-snapshot--请求示例"></a>
### 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/capital-flow/snapshot?thscode=600519.SH'
```

<a id="capital-flow-snapshot--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "6f6642eafac44c9489f1280bb2f16e1c",
  "data": {
    "timestamp": 1756742400000,
    "super_large": {
      "inflow_amount": 123456789.12,
      "outflow_amount": 100000000.00,
      "net_amount": 23456789.12
    },
    "large": {
      "inflow_amount": 86543210.50,
      "outflow_amount": 81234567.89,
      "net_amount": 5308642.61
    },
    "medium": {
      "inflow_amount": 45678901.23,
      "outflow_amount": 47890123.45,
      "net_amount": -2211222.22
    },
    "small": {
      "inflow_amount": 23456789.01,
      "outflow_amount": 26789012.34,
      "net_amount": -3332223.33
    }
  }
}
```

<a id="capital-flow-snapshot--返回字段"></a>
### 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long \| null | 最新有效数据时间；没有可用时间时为 `null`。 |
| `super_large` | object | 超大单资金对象。 |
| `large` | object | 大单资金对象。 |
| `medium` | object | 中单资金对象。 |
| `small` | object | 小单资金对象。 |

四类资金对象字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `inflow_amount` | number \| null | 流入金额，单位为元。 |
| `outflow_amount` | number \| null | 流出金额，单位为元。 |
| `net_amount` | number \| null | 净额，单位为元。 |

没有可用资金流向值时，接口仍返回 `code=0` 和四类资金对象，其中各金额字段为 `null`。

<a id="capital-flow-historical"></a>

<a id="capital-flow-historical--资金流向历史"></a>
## 资金流向历史

```text
GET /api/a-share/capital-flow/historical
```

查询单只 A 股的 1 分钟或日级资金流向历史。结果按 `date_ms` 升序排列。

<a id="capital-flow-historical--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只 A 股完整代码；不支持批量、纯代码或非 A 股标的。 |
| `interval` | enum | 是 | — | `1m`（1 分钟）或 `1d`（日）。 |
| `start` | long | 是 | — | 起始时间，毫秒级 Unix 时间戳，必须大于等于 `0`。 |
| `end` | long | 是 | — | 结束时间，毫秒级 Unix 时间戳，必须大于等于 `start`。`1m` 窗口最多 7 个自然日；`1d` 的结束日期不得晚于开始日期加 1 年。 |

<a id="capital-flow-historical--请求示例"></a>
### 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/capital-flow/historical?thscode=600519.SH&interval=1d&start=1725148800000&end=1756684800000'
```

<a id="capital-flow-historical--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "d3a7750a0e6b4176a0f9ae66a8010a43",
  "data": {
    "timestamp": 1756684800000,
    "thscode": "600519.SH",
    "interval": "1d",
    "item": [
      {
        "date_ms": 1756684800000,
        "super_large": {
          "inflow_amount": 123456789.12,
          "outflow_amount": 100000000.00
        },
        "large": {
          "inflow_amount": 86543210.50,
          "outflow_amount": 81234567.89
        },
        "medium": {
          "inflow_amount": 45678901.23,
          "outflow_amount": 47890123.45
        },
        "small": {
          "inflow_amount": 23456789.01,
          "outflow_amount": 26789012.34
        }
      }
    ]
  }
}
```

<a id="capital-flow-historical--返回字段"></a>
### 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long \| null | 返回序列中的最新有效时间点；无数据时为 `null`。 |
| `thscode` | string | 请求的 A 股完整代码。 |
| `interval` | string | 请求周期，值为 `1m` 或 `1d`。 |
| `item` | array | 按 `date_ms` 升序排列的历史点；无数据时为空数组。 |

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | 当前历史点时间，毫秒级 Unix 时间戳。 |
| `super_large` | object | 超大单资金对象。 |
| `large` | object | 大单资金对象。 |
| `medium` | object | 中单资金对象。 |
| `small` | object | 小单资金对象。 |

四类历史资金对象字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `inflow_amount` | number \| null | 流入金额，单位为元。 |
| `outflow_amount` | number \| null | 流出金额，单位为元。 |

历史接口不返回 `net_amount`。合法时间窗内没有数据时，接口返回 `code=0`、`timestamp=null` 和空 `item`。

<a id="capital-flow-intraday"></a>

<a id="capital-flow-intraday--股票主力资金分钟序列"></a>
## 股票主力资金分钟序列

```text
GET /api/a-share/capital-flow/intraday
```

查询单只股票的分钟资金金额。 本页接口仅供同花顺 AI 客户端使用，暂未开放外部接入。

<a id="capital-flow-intraday--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单个股票完整代码，例如 `600519.SH`。逗号列表和重复传参均拒绝。 |
| `interval` | enum | 是 | — | `1m`、`2m`、`3m`、`5m`、`10m`、`15m`、`30m`、`45m`、`60m`。 |
| `start` | long | 是 | — | 起始时间，Unix 毫秒，含该时刻。北京时间仅可查含今天在内的近 7 个自然日。 |
| `end` | long | 是 | — | 结束时间，Unix 毫秒，含该时刻。必须与 start 位于同一北京时间自然日，且大于或等于 start。 |

<a id="capital-flow-intraday--请求示例"></a>
### 请求示例

以下命令仅展示接口路径与参数格式，当前不可用于外部调用。示例查询 2026-11-23 的时间点；实际调用请换为近 7 个自然日内的毫秒时间戳。

```bash
curl 'https://fuyao.aicubes.cn/api/a-share/capital-flow/intraday?thscode=600519.SH&interval=1m&start=1795397460000&end=1795397460000'
```

<a id="capital-flow-intraday--响应示例"></a>
### 响应示例

金额为示意值，单位为元。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-stock-1m",
  "data": {
    "thscode": "600519.SH",
    "interval": "1m",
    "timestamp": 1795397460000,
    "series": {
      "date_ms": [
        1795397460000
      ],
      "super_large": {
        "inflow_amount": [
          1200000
        ],
        "outflow_amount": [
          900000
        ],
        "net_amount": [
          300000
        ]
      },
      "large": {
        "inflow_amount": [
          800000
        ],
        "outflow_amount": [
          850000
        ],
        "net_amount": [
          -50000
        ]
      },
      "medium": {
        "inflow_amount": [
          650000
        ],
        "outflow_amount": [
          650000
        ],
        "net_amount": [
          0
        ]
      },
      "small": {
        "inflow_amount": [
          200000
        ],
        "outflow_amount": [
          null
        ],
        "net_amount": [
          null
        ]
      }
    }
  }
}
```

<a id="capital-flow-intraday--返回字段"></a>
### 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long 或 null | 返回序列中最大的毫秒时间戳；无点时为 null。 |
| `thscode` | string | 请求的股票完整代码。 |
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
