# 股票行情数据

[业务导航](README.md)

- [A股历史K线 · `get_a_share_prices_historical`](#get_a_share_prices_historical)
- [A股批量历史K线 · `get_a_share_prices_historical_batch`](#get_a_share_prices_historical_batch)
- [A股行情快照 · `get_a_share_prices_snapshot`](#get_a_share_prices_snapshot)

<a id="get_a_share_prices_historical"></a>
## A股历史K线


工具名：`get_a_share_prices_historical`

<a id="get_a_share_prices_historical--工具描述"></a>
### 工具描述

> 获取单只 A 股标的的历史 K 线数据，窗口最长 10 年。支持前复权 / 后复权 / 不复权。
> 每次只能传一个 `thscode`，多标的可使用 [A股批量历史K线](#get_a_share_prices_historical_batch)。

<a id="get_a_share_prices_historical--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只标的 thscode，不接受逗号。 |
| `interval` | enum | 是 | `1d` | K 线周期，**当前仅支持** `1d`(日线)。 |
| `start` | long | 是 | — | 起始时间，毫秒 Unix 时间戳。 |
| `end` | long | 是 | — | 结束时间，毫秒 Unix 时间戳。`end - start` 不超过 10 年。 |
| `adjust` | enum | 否 | `forward` | 复权方式：`none` / `forward` / `backward`。 |

<a id="get_a_share_prices_historical--调用示例"></a>
### 调用示例

```text
工具：get_a_share_prices_historical
参数：
  - thscode: "600519.SH"
  - interval: "1d"
  - start: 1716105600000
  - end: 1747641600000
  - adjust: "forward"
```

<a id="get_a_share_prices_historical--返回"></a>
### 返回

返回 `{ timestamp, item: [PriceBarItem, ...] }`。字段含义见 返回字段说明
[历史 K 线](#get_a_share_prices_historical--返回字段)。

```json
{
  "timestamp": 1747584000000,
  "item": [
    {
      "date_ms": 1716134400000,
      "open_price": 1611.602,
      "high_price": 1626.602,
      "low_price": 1601.722,
      "close_price": 1602.612,
      "volume": 3142572.0,
      "turnover": 5401389334.87
    }
  ]
}
```

<a id="get_a_share_prices_historical--返回字段"></a>
### 返回字段

<a id="get_a_share_prices_historical--历史-k-线--响应字段"></a>
#### 历史 K 线 · 响应字段

`data` 为 `HistoricalData`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间（毫秒），为序列中最新一根 K 线的上游有效时间。 |
| `item` | array | K 线列表。 |

`item[]` 为 `PriceBarItem`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | K 线日期（毫秒）。 |
| `open_price` | number | 开盘价。 |
| `high_price` | number | 最高价。 |
| `low_price` | number | 最低价。 |
| `close_price` | number | 收盘价。 |
| `volume` | number | 成交量（股）。 |
| `turnover` | number | 成交额（原始货币）。 |

<a id="get_a_share_prices_historical_batch"></a>
## A股批量历史K线


工具名：`get_a_share_prices_historical_batch`

<a id="get_a_share_prices_historical_batch--工具描述"></a>
### 工具描述

> 在同一时间窗口比较多只 A 股的历史走势。单次最多 10 个代码，支持 `1d` / `1w` / `1mo`，窗口跨度最长 10 个自然年；复权方式为 `forward` / `none` / `backward`，默认 `forward`。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

<a id="get_a_share_prices_historical_batch--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `600519.SH,000001.SZ`；最多 10 个，按去重前数量计数。 |
| `interval` | string | 是 | — | K 线周期：`1d`（日线）/ `1w`（周线）/ `1mo`（月线）。 |
| `start` | long | 是 | - | 起始时间，毫秒 Unix 时间戳。缺失返回 `code=1001`；须为非负毫秒时间戳。 |
| `end` | long | 是 | - | 结束时间，毫秒 Unix 时间戳。`end - start` 超过 10 年返回 `code=1003`；须为非负毫秒时间戳。 |
| `adjust` | string | 否 | `forward` | 复权方式：`none` / `forward`(前复权) / `backward`(后复权)。 |

<a id="get_a_share_prices_historical_batch--调用示例"></a>
### 调用示例

```text
工具：get_a_share_prices_historical_batch
参数：
  - thscodes: "600519.SH,000001.SZ"
  - interval: "1d"
  - start: 1735660800000
  - end: 1767196800000
  - adjust: "forward"
```

<a id="get_a_share_prices_historical_batch--返回"></a>
### 返回

返回 `{ interval, adjust, item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[批量历史 K 线](#get_a_share_prices_historical_batch--返回字段)。

<a id="get_a_share_prices_historical_batch--返回字段"></a>
### 返回字段

<a id="get_a_share_prices_historical_batch--批量历史-k-线--返回字段"></a>
#### 批量历史 K 线 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `interval` | string | `1d` / `1w` / `1mo`，整批共用。 |
| `adjust` | string | `forward` / `none` / `backward`，与本次请求一致。 |
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原 K 线字段和升序；K 线记录本身不增加标的代码。
详细业务字段、单位和空值说明见[历史 K 线](#get_a_share_prices_historical_batch--返回字段)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

<a id="get_a_share_prices_historical_batch--历史-k-线--响应字段"></a>
#### 历史 K 线 · 响应字段

`data` 为 `HistoricalData`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间（毫秒），为序列中最新一根 K 线的上游有效时间。 |
| `item` | array | K 线列表。 |

`item[]` 为 `PriceBarItem`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | K 线日期（毫秒）。 |
| `open_price` | number | 开盘价。 |
| `high_price` | number | 最高价。 |
| `low_price` | number | 最低价。 |
| `close_price` | number | 收盘价。 |
| `volume` | number | 成交量（股）。 |
| `turnover` | number | 成交额（原始货币）。 |

<a id="get_a_share_prices_snapshot"></a>
## A股行情快照


工具名：`get_a_share_prices_snapshot`

<a id="get_a_share_prices_snapshot--工具描述"></a>
### 工具描述

> 获取 A 股行情快照。`thscodes` 显式给定时按入参顺序批量取数；省略时遍历完整 A 股代码表
> 并按 `limit`/`offset` 分页。返回每只标的的最新价、涨跌额、涨跌幅、开盘 / 最高 / 最低 / 前收价、成交量、成交额。
> 不返回中文名 `name`，如需展示请配合 `get_meta_tickers_search` / `get_meta_tickers_list`。

<a id="get_a_share_prices_snapshot--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 否 | — | 逗号分隔的 thscode 列表，如 `600519.SH,000001.SZ`。给定时忽略 `limit` / `offset`。 |
| `limit` | integer | 否 | `100` | 分页大小，仅在 `thscodes` 省略时生效。 |
| `offset` | integer | 否 | `0` | 分页偏移，仅在 `thscodes` 省略时生效。 |

<a id="get_a_share_prices_snapshot--调用示例"></a>
### 调用示例

```text
工具：get_a_share_prices_snapshot
参数：
  - thscodes: "600519.SH,000001.SZ"
```

<a id="get_a_share_prices_snapshot--返回"></a>
### 返回

返回 `{ timestamp, total, item: [PriceSnapshotItem, ...] }`。字段含义见 返回字段说明
[行情快照](#get_a_share_prices_snapshot--返回字段)。

```json
{
  "timestamp": 1784275991000,
  "total": 2,
  "item": [
    {
      "thscode": "600519.SH",
      "ticker": "600519",
      "last_price": 1277.8,
      "price_change": 21.8,
      "price_change_ratio_pct": 1.735669,
      "open_price": 1252.08,
      "high_price": 1282,
      "low_price": 1250.21,
      "prev_price": 1256,
      "volume": 3098875,
      "turnover": 3937375200
    }
  ]
}
```

<a id="get_a_share_prices_snapshot--返回字段"></a>
### 返回字段

<a id="get_a_share_prices_snapshot--行情快照--响应字段"></a>
#### 行情快照 · 响应字段

`data` 为 `SnapshotData`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long \| null | 数据就绪时间（毫秒），为本次快照中最新的上游有效时间；无有效数据时为 `null`。 |
| `total` | int | 全市场代码表总数（用于分页模式估算页数）。 |
| `item` | array | 快照记录列表，单条记录也以数组返回。 |

`item[]` 为 `PriceSnapshotItem`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的完整 thscode，如 `600519.SH`。 |
| `ticker` | string | 纯代码（无交易所后缀），如 `600519`。 |
| `last_price` | number | 最新成交价（原始货币）。 |
| `price_change` | number | 相对前收盘价的涨跌额（原始货币）。 |
| `price_change_ratio_pct` | number | 涨跌幅，单位为百分比数值（如 `1.74` 表示 +1.74%）。 |
| `open_price` | number | 当日开盘价。 |
| `high_price` | number | 当日最高价。 |
| `low_price` | number | 当日最低价。 |
| `prev_price` | number | 前收盘价。 |
| `volume` | number | 成交量（股）。 |
| `turnover` | number | 成交额（原始货币）。 |

> **note 中文名解析**
> 快照响应不返回标的中文名 `name`。如需展示中文名，请配合 [`get_meta_tickers_search`](../meta/tickers-search.md#get_meta_tickers_search--返回字段) 或 [`get_meta_tickers_list`](../meta/tickers-list.md#get_meta_tickers_list--返回字段) 解析。
