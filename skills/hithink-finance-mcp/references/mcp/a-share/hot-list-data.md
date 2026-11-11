# 同花顺热榜

[业务导航](README.md)

- [A股热股榜 · `get_a_share_special_data_hot_stock_list`](#get_a_share_special_data_hot_stock_list)
- [A股历史热股榜 · `get_a_share_special_data_hot_stock_list_history`](#get_a_share_special_data_hot_stock_list_history)
- [A股热股排名趋势 · `get_a_share_special_data_hot_stock_rank_trend`](#get_a_share_special_data_hot_stock_rank_trend)
- [A股飙升榜 · `get_a_share_special_data_skyrocket_list`](#get_a_share_special_data_skyrocket_list)

<a id="get_a_share_special_data_hot_stock_list"></a>
## A股热股榜


工具名：`get_a_share_special_data_hot_stock_list`

<a id="get_a_share_special_data_hot_stock_list--工具描述"></a>
### 工具描述

> 返回 A 股热股榜单。`period` 缺省为 `day`；`day` 表示 24 小时榜，`hour` 表示小时榜。
> 响应包含排名、热度、排名变化和排名趋势。

<a id="get_a_share_special_data_hot_stock_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `period` | string | 否 | `day` | 榜单周期：`day` 24 小时榜 / `hour` 小时榜。 |
| `limit` | integer | 否 | `30` | 返回条数，范围1..100；不足时返回源实际条数。 |

<a id="get_a_share_special_data_hot_stock_list--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_hot_stock_list
参数：
  - period: "day"
```

<a id="get_a_share_special_data_hot_stock_list--返回"></a>
### 返回

返回 `{ timestamp, item: [HotListItem, ...] }`。字段含义见 返回字段说明 [A股热股榜单](#get_a_share_special_data_hot_stock_list--返回字段)。

```json
{
  "timestamp": 1748102400000,
  "item": [
    {
      "thscode": "603822.SH",
      "ticker": "603822",
      "name": "嘉澳环保",
      "rank": 1,
      "heat": "1941909",
      "rank_change": 7,
      "rank_trend": "up"
    }
  ]
}
```

<a id="get_a_share_special_data_hot_stock_list--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_hot_stock_list--a股热股榜单--响应字段"></a>
#### A股热股榜单 · 响应字段

响应结构与 [飙升榜](#get_a_share_special_data_hot_stock_list--返回字段) 一致，`data.item[]` 为 A 股热股榜单股票条目。

<a id="get_a_share_special_data_hot_stock_list--a股热股榜单--约束与错误"></a>
#### A股热股榜单 · 约束与错误

- `period` 仅接受 `day` / `hour`，否则返回 `code=1002`。

<a id="get_a_share_special_data_hot_stock_list--飙升榜--响应字段"></a>
#### 飙升榜 · 响应字段

`data` 元数据：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 榜单时间戳，毫秒级 Unix 时间戳。 |
| `item` | array | 榜单股票条目，按limit返回，默认30条、最多100条，不足请求条数时返回实际条数。 |

`item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的标准代码，例如 `603822.SH`。 |
| `ticker` | string | 6 位股票代码。 |
| `name` | string | 股票简称。 |
| `rank` | integer | 当前排名。 |
| `heat` | string | 热度值，保留上游原始字符串。 |
| `rank_change` | integer \| null | 排名变化，正数表示上升，负数表示下降；上游缺失时为 `null`。 |
| `rank_trend` | string | 排名趋势：`up` / `down` / `flat` / `unknown`。 |

<a id="get_a_share_special_data_hot_stock_list_history"></a>
## A股历史热股榜


工具名：`get_a_share_special_data_hot_stock_list_history`

<a id="get_a_share_special_data_hot_stock_list_history--工具描述"></a>
### 工具描述

> 查询指定自然日的 A 股历史热股榜排行。调用方只需要传 `YYYY-MM-DD` 自然日，
> 服务端按 `Asia/Shanghai` 当日 00:00 转换上游时间戳。

<a id="get_a_share_special_data_hot_stock_list_history--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date` | string | 是 | — | 目标自然日，格式 `YYYY-MM-DD`；只支持一年内数据。 |

<a id="get_a_share_special_data_hot_stock_list_history--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_hot_stock_list_history
参数：
  - date: "2026-06-21"
```

<a id="get_a_share_special_data_hot_stock_list_history--返回"></a>
### 返回

返回 `{ date, date_ms, item: [HotListHistoryItem, ...] }`。`date` / `date_ms` 是整批榜单日期，
不会在每个 `item` 内重复出现。字段含义见 返回字段说明 [历史热股排行](#get_a_share_special_data_hot_stock_list_history--返回字段)。

```json
{
  "date": "2026-06-21",
  "date_ms": 1781971200000,
  "item": [
    {
      "thscode": "000725.SZ",
      "ticker": "000725",
      "name": "京东方A",
      "rank": 1
    }
  ]
}
```

<a id="get_a_share_special_data_hot_stock_list_history--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_hot_stock_list_history--历史热股排行--响应字段"></a>
#### 历史热股排行 · 响应字段

`data` 为 `DataPayload<HotListHistoryItem>`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date` | string | 查询自然日，格式 `yyyy-MM-dd`。 |
| `date_ms` | long | 查询自然日 `Asia/Shanghai` 00:00 毫秒时间戳。 |
| `item` | array | 历史热股榜股票条目，最多 30 条。 |

`item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的标准代码，例如 `000725.SZ`。 |
| `ticker` | string | 6 位股票代码。 |
| `name` | string | 股票简称。 |
| `rank` | integer | 当日热榜排名。 |

<a id="get_a_share_special_data_hot_stock_list_history--历史热股排行--约束与错误"></a>
#### 历史热股排行 · 约束与错误

- `date` 必须为 `yyyy-MM-dd`，否则返回 `code=1002`。
- `date` 不在一年内时返回 `code=1003`。

<a id="get_a_share_special_data_hot_stock_rank_trend"></a>
## A股热股排名趋势


工具名：`get_a_share_special_data_hot_stock_rank_trend`

<a id="get_a_share_special_data_hot_stock_rank_trend--工具描述"></a>
### 工具描述

> 查询单只 A 股在指定日期区间内的热股榜排名走势。`thscode` 必填且仅支持单只；
> `start_date` / `end_date` 使用 `YYYY-MM-DD`，查询窗口限制在一年内。

<a id="get_a_share_special_data_hot_stock_rank_trend--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只 A 股 thscode，不接受逗号，例如 `300033.SZ`。 |
| `start_date` | string | 是 | — | 起始日期，格式 `YYYY-MM-DD`。 |
| `end_date` | string | 是 | — | 结束日期，格式 `YYYY-MM-DD`。 |

<a id="get_a_share_special_data_hot_stock_rank_trend--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_hot_stock_rank_trend
参数：
  - thscode: "300034.SZ"
  - start_date: "2026-06-21"
  - end_date: "2026-07-01"
```

<a id="get_a_share_special_data_hot_stock_rank_trend--返回"></a>
### 返回

返回 `{ timestamp, item: [HotListRankTrendItem, ...] }`。字段含义见 返回字段说明 [个股排名走势](#get_a_share_special_data_hot_stock_rank_trend--返回字段)。

```json
{
  "timestamp": 1781971200000,
  "item": [
    {
      "thscode": "300034.SZ",
      "ticker": "300034",
      "date": "2026-06-21",
      "date_ms": 1781971200000,
      "rank": 1740
    }
  ]
}
```

<a id="get_a_share_special_data_hot_stock_rank_trend--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_hot_stock_rank_trend--个股排名走势--响应字段"></a>
#### 个股排名走势 · 响应字段

`data` 为 `DataPayload<HotListRankTrendItem>`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 起始自然日 `Asia/Shanghai` 00:00 毫秒时间戳。 |
| `item` | array | 日线排名走势点位。 |

`item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 入参标准代码。 |
| `ticker` | string | 6 位股票代码。 |
| `date` | string | 自然日，格式 `yyyy-MM-dd`。 |
| `date_ms` | long | 该自然日 `Asia/Shanghai` 00:00 毫秒时间戳。 |
| `rank` | integer | 当日热榜排名。 |

<a id="get_a_share_special_data_hot_stock_rank_trend--个股排名走势--约束与错误"></a>
#### 个股排名走势 · 约束与错误

- `start_date` / `end_date` 必须为 `yyyy-MM-dd`，否则返回 `code=1002`。
- 日期不在一年内，或查询窗口超过一年时返回 `code=1003`。
- `start_date > end_date` 时返回 `code=1004`。
- `thscode` 无法映射到上游代码时返回业务错误。

<a id="get_a_share_special_data_skyrocket_list"></a>
## A股飙升榜


工具名：`get_a_share_special_data_skyrocket_list`

<a id="get_a_share_special_data_skyrocket_list--工具描述"></a>
### 工具描述

> 返回 A 股飙升热榜。`period` 缺省为 `day`；`day` 表示日榜，`hour` 表示小时榜。
> 响应按热榜排名正序返回，包含排名、热度、排名变化和排名趋势。

<a id="get_a_share_special_data_skyrocket_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `period` | string | 否 | `day` | 榜单周期：`day` 日榜 / `hour` 小时榜。 |
| `limit` | integer | 否 | `30` | 返回条数，范围1..100；不足时返回源实际条数。 |

<a id="get_a_share_special_data_skyrocket_list--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_skyrocket_list
参数：
  - period: "hour"
```

<a id="get_a_share_special_data_skyrocket_list--返回"></a>
### 返回

返回 `{ timestamp, item: [HotListItem, ...] }`。字段含义见 返回字段说明 [飙升榜](#get_a_share_special_data_skyrocket_list--返回字段)。

```json
{
  "timestamp": 1748102400000,
  "item": [
    {
      "thscode": "603822.SH",
      "ticker": "603822",
      "name": "嘉澳环保",
      "rank": 1,
      "heat": "1941909",
      "rank_change": 7,
      "rank_trend": "up"
    }
  ]
}
```

<a id="get_a_share_special_data_skyrocket_list--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_skyrocket_list--飙升榜--响应字段"></a>
#### 飙升榜 · 响应字段

`data` 元数据：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 榜单时间戳，毫秒级 Unix 时间戳。 |
| `item` | array | 榜单股票条目，按limit返回，默认30条、最多100条，不足请求条数时返回实际条数。 |

`item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的标准代码，例如 `603822.SH`。 |
| `ticker` | string | 6 位股票代码。 |
| `name` | string | 股票简称。 |
| `rank` | integer | 当前排名。 |
| `heat` | string | 热度值，保留上游原始字符串。 |
| `rank_change` | integer \| null | 排名变化，正数表示上升，负数表示下降；上游缺失时为 `null`。 |
| `rank_trend` | string | 排名趋势：`up` / `down` / `flat` / `unknown`。 |

<a id="get_a_share_special_data_skyrocket_list--飙升榜--约束与错误"></a>
#### 飙升榜 · 约束与错误

- `period` 仅接受 `day` / `hour`，否则返回 `code=1002`。
