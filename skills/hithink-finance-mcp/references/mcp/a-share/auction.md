# 集合竞价数据

[业务导航](README.md)

- [短线风向标竞价基准 · `get_a_share_auction_short_term_benchmark`](#get_a_share_auction_short_term_benchmark)
- [A股集合竞价快照 · `get_a_share_auction_snapshot`](#get_a_share_auction_snapshot)

<a id="get_a_share_auction_short_term_benchmark"></a>
## 短线风向标竞价基准


工具名：`get_a_share_auction_short_term_benchmark`

<a id="get_a_share_auction_short_term_benchmark--工具描述"></a>
### 工具描述

> 查询短线风向标集合竞价基准数据。未指定日期或传入空字符串时，默认查询 `Asia/Shanghai` 当日；显式指定非交易日时不自动回退。
> 返回的 `date` / `date_ms` 是最终查询日期，`timestamp` 是接口响应组装时间。

<a id="get_a_share_auction_short_term_benchmark--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date` | string | 否 | 上海时区当日 | `yyyy-MM-dd` 格式；缺失或空字符串时使用 `Asia/Shanghai` 当日。 |

<a id="get_a_share_auction_short_term_benchmark--调用示例"></a>
### 调用示例

```text
工具：get_a_share_auction_short_term_benchmark
参数：
  - date: "2026-08-14"
```

<a id="get_a_share_auction_short_term_benchmark--返回"></a>
### 返回

返回 `{ timestamp, date, date_ms, item[] }`。`timestamp` 是接口响应组装时间，`date` / `date_ms` 是最终查询日期；明细包含标准代码、名称、竞价涨跌幅和标签。字段见 [短线风向标竞价基准](#get_a_share_auction_short_term_benchmark--返回字段)。

<a id="get_a_share_auction_short_term_benchmark--返回字段"></a>
### 返回字段

<a id="get_a_share_auction_short_term_benchmark--短线风向标竞价基准--返回字段"></a>
#### 短线风向标竞价基准 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 接口响应组装时间，毫秒 Unix 时间戳。 |
| `date` | string | 最终查询日期，格式 `yyyy-MM-dd`。 |
| `date_ms` | long | 最终查询日期在 `Asia/Shanghai` 当日零点的毫秒 Unix 时间戳。 |
| `item` | array | 短线风向标竞价基准明细。 |

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 完整 A 股 thscode。 |
| `ticker` | string | 纯股票代码。 |
| `name` | string | 股票简称。 |
| `auction_pct` | number | 集合竞价涨跌幅，百分数原值。 |
| `tags` | array | 短线风向标标签。 |

通用鉴权、响应信封与错误码参见 [API 参考](../../../SKILL.md#调用规则)。

<a id="get_a_share_auction_snapshot"></a>
## A股集合竞价快照


工具名：`get_a_share_auction_snapshot`

<a id="get_a_share_auction_snapshot--工具描述"></a>
### 工具描述

> 查询一个或多个 A 股标的的集合竞价快照。
> `timestamp` 是接口响应组装时间，实时、终态、停牌及 `not_ready` 场景均会返回；上游行情时间仅用于判断数据新鲜度。

<a id="get_a_share_auction_snapshot--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 多个 A 股 thscode 使用英文逗号分隔；单次调用当前最多 100 个，按分隔后的原始 token 数在去重前校验。 |
| `stage` | enum | 否 | `final` | `live` / `final`。 |

<a id="get_a_share_auction_snapshot--调用示例"></a>
### 调用示例

```text
工具：get_a_share_auction_snapshot
参数：
  - thscodes: "600519.SH,000001.SZ"
  - stage: "final"
```

<a id="get_a_share_auction_snapshot--返回"></a>
### 返回

返回接口响应组装时间、集合竞价阶段、数据状态、总数及竞价明细；字段见 [A股集合竞价快照](#get_a_share_auction_snapshot--返回字段)。

<a id="get_a_share_auction_snapshot--返回字段"></a>
### 返回字段

<a id="get_a_share_auction_snapshot--a股集合竞价快照--返回字段"></a>
#### A股集合竞价快照 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.timestamp` | long | 接口响应组装时间，毫秒 Unix 时间戳；实时、终态、停牌及 `not_ready` 场景均会返回。上游竞价行情时间仅用于判断数据新鲜度。 |
| `data.auction_phase` | string | 集合竞价阶段。 |
| `data.data_status` | string | 数据状态。 |
| `data.total` | integer | 返回标的数量。 |
| `data.item` | array | 集合竞价明细列表。 |

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` / `ticker` / `name` | string | 标准代码、纯代码与股票简称。 |
| `auction_price` / `auction_pct` | number | 竞价价格与竞价涨跌幅百分数原值。 |
| `auction_volume` / `auction_amount` / `auction_unmatched` | number | 竞价成交量、成交额与未匹配量。 |
| `auction_turnover_pct` / `auction_yesterday_ratio_pct` / `auction_volume_ratio` | number | 竞价换手率、相对昨日成交量比例与竞价量比。 |
| `pre_close_price` / `open_price` / `last_price` | number | 前收盘价、开盘价与最新价。 |
| `float_market_cap` | number | 流通市值。 |
