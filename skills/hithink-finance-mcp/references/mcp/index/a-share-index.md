# 指数数据

[业务导航](README.md)

- [THS 指数目录 · `get_a_share_index_catalog_ths_index_list`](#get_a_share_index_catalog_ths_index_list)
- [THS 指数成分股列表 · `get_a_share_index_constituents_ths_stock_list`](#get_a_share_index_constituents_ths_stock_list)
- [A股指数历史K线 · `get_a_share_index_prices_historical`](#get_a_share_index_prices_historical)
- [A股指数批量历史K线 · `get_a_share_index_prices_historical_batch`](#get_a_share_index_prices_historical_batch)
- [A股指数行情快照 · `get_a_share_index_prices_snapshot`](#get_a_share_index_prices_snapshot)

<a id="get_a_share_index_catalog_ths_index_list"></a>
## THS 指数目录


工具名：`get_a_share_index_catalog_ths_index_list`

<a id="get_a_share_index_catalog_ths_index_list--工具描述"></a>
### 工具描述

> 按 `tag`（概念 / 区域 / 特色 / 行业）列出同花顺指数清单。当用户提到「板块」「概念」
> 或某类指数（如「白酒概念」「锂电池」「半导体行业」）时，**先用本工具拿到目标指数的
> `thscode`**，再交给
> [`get_a_share_index_constituents_ths_stock_list`](#get_a_share_index_constituents_ths_stock_list)
> 取成分股。单 `tag` 一次性全量返回，无需分页。

<a id="get_a_share_index_catalog_ths_index_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tag` | enum | 否 | `cn_concept` | 标签白名单：`cn_concept`(A 股概念) / `region`(区域指数) / `tszs`(特色指数) / `industry`(行业指数)。大小写不敏感。 |

<a id="get_a_share_index_catalog_ths_index_list--调用示例"></a>
### 调用示例

```text
工具：get_a_share_index_catalog_ths_index_list
参数：
  - tag: "cn_concept"
```

<a id="get_a_share_index_catalog_ths_index_list--返回"></a>
### 返回

返回 `{ timestamp, item: [{ thscode, name }, ...] }`。字段含义见 返回字段说明
[同花顺指数列表和成分股 · 同花顺指数列表](#get_a_share_index_catalog_ths_index_list--返回字段)。

```json
{
  "timestamp": 1748102400000,
  "item": [
    { "thscode": "886042.TI", "name": "白酒概念" },
    { "thscode": "886041.TI", "name": "新能源车" }
  ]
}
```

<a id="get_a_share_index_catalog_ths_index_list--为什么是前置工具"></a>
### 为什么是前置工具

LLM 无法从「白酒概念」「半导体行业」这类口语化标签直接推断到同花顺指数的
`thscode`（如 `886042.TI`）。先用本工具按 `tag` 全量取一次，再按 `name` 匹配出目标
`thscode`，可避免编造代码。

<a id="get_a_share_index_catalog_ths_index_list--返回字段"></a>
### 返回字段

<a id="get_a_share_index_catalog_ths_index_list--同花顺指数列表--响应字段"></a>
#### 同花顺指数列表 · 响应字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间戳（毫秒）。 |
| `item[].thscode` | string | 同花顺指数的完整 thscode，如 `886042.TI`。 |
| `item[].name` | string | 同花顺指数展示名称。 |

> 指数维度不暴露纯代码 `ticker`。

<a id="get_a_share_index_constituents_ths_stock_list"></a>
## THS 指数成分股列表


工具名：`get_a_share_index_constituents_ths_stock_list`

<a id="get_a_share_index_constituents_ths_stock_list--工具描述"></a>
### 工具描述

> 按单个指数 `thscode` 返回当前成分股清单。支持同花顺板块指数（如 `886042.TI`）与
> 标准指数（如沪深 300 `000300.SH` / `399300.SZ`）。不接受逗号，单次只能查一个指数。
> 拿到成分股 `thscode` 列表后，可继续调
> [`get_a_share_prices_snapshot`](../a-share/prices.md#get_a_share_prices_snapshot) 取实时行情，或调
> [`get_a_share_prices_historical`](../a-share/prices.md#get_a_share_prices_historical) 取历史 K 线。

<a id="get_a_share_index_constituents_ths_stock_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 指数 thscode，形如 `{ticker}.{suffix}`。入参会被 `trim().toUpperCase()` 标准化。**不接受逗号**，单次仅支持一个指数。 |

<a id="get_a_share_index_constituents_ths_stock_list--调用示例"></a>
### 调用示例

```text
工具：get_a_share_index_constituents_ths_stock_list
参数：
  - thscode: "886042.TI"
```

<a id="get_a_share_index_constituents_ths_stock_list--返回"></a>
### 返回

返回 `{ timestamp, item: [{ thscode, ticker, name }, ...] }`。字段含义见 返回字段说明
[同花顺指数列表和成分股 · 同花顺指数成分股](#get_a_share_index_constituents_ths_stock_list--返回字段)。

```json
{
  "timestamp": 1748102400000,
  "item": [
    { "thscode": "600519.SH", "ticker": "600519", "name": "贵州茅台" },
    { "thscode": "000858.SZ", "ticker": "000858", "name": "五粮液" }
  ]
}
```

<a id="get_a_share_index_constituents_ths_stock_list--与价格工具的组合"></a>
### 与价格工具的组合

成分股 `thscode` 取出后逗号拼接（必要时分批控制单次请求长度），即可喂给
[`get_a_share_prices_snapshot`](../a-share/prices.md#get_a_share_prices_snapshot) 拿到批量实时行情，
完成「指数 → 成分股 → 行情」完整链路。

<a id="get_a_share_index_constituents_ths_stock_list--返回字段"></a>
### 返回字段

<a id="get_a_share_index_constituents_ths_stock_list--同花顺指数成分股--响应字段"></a>
#### 同花顺指数成分股 · 响应字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间戳（毫秒）。 |
| `item[].thscode` | string | 成分股完整 thscode。 |
| `item[].ticker` | string | 成分股纯代码。 |
| `item[].name` | string | 成分股展示名称。 |

<a id="get_a_share_index_prices_historical"></a>
## A股指数历史K线


工具名：`get_a_share_index_prices_historical`

<a id="get_a_share_index_prices_historical--工具描述"></a>
### 工具描述

> 获取单只指数的历史 K 线数据，覆盖上证交易所指数、深证交易所指数、同花顺板块与同花顺行业指数。
> 每次只能传一个 `thscode`，只支持 `start` / `end` 时间区间模式，查询范围为近 5 个自然年，下界以查询日（`Asia/Shanghai`）向前滚动 5 年的当地零点计算。指数没有复权语义，因此不提供 `adjust` 参数。

<a id="get_a_share_index_prices_historical--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只指数 thscode，不接受逗号，如 `000001.SH` / `399001.SZ` / `886042.TI` / `881101.TI`。 |
| `interval` | string | 是 | `1d` | K 线周期，当前仅支持 `1d`（日线）。 |
| `start` | long | 是 | — | 起始时间，毫秒 Unix 时间戳。 |
| `end` | long | 是 | — | 结束时间，毫秒 Unix 时间戳；必须不早于 `start`，且查询区间需落在近 5 年的数据范围内。 |

<a id="get_a_share_index_prices_historical--调用示例"></a>
### 调用示例

```text
工具：get_a_share_index_prices_historical
参数：
  - thscode: "000001.SH"
  - interval: "1d"
  - start: 1716105600000
  - end: 1747641600000
```

<a id="get_a_share_index_prices_historical--返回"></a>
### 返回

返回 `{ timestamp, adjust, item: [PriceBarItem, ...] }`，其中 `adjust` 固定为 `null`。字段含义见 返回字段说明
[指数历史 K 线](#get_a_share_index_prices_historical--返回字段)。

```json
{
  "timestamp": 1747584000000,
  "adjust": null,
  "item": [
    {
      "date_ms": 1716134400000,
      "open_price": 3108.22,
      "high_price": 3125.74,
      "low_price": 3101.15,
      "close_price": 3120.68,
      "volume": 281000000,
      "turnover": 360000000000
    }
  ]
}
```

<a id="get_a_share_index_prices_historical--返回字段"></a>
### 返回字段

<a id="get_a_share_index_prices_historical--指数历史-k-线--响应字段"></a>
#### 指数历史 K 线 · 响应字段

`data` 为 `HistoricalData`，`item[]` 为 `PriceBarItem`，字段结构与
[A 股历史 K 线](#get_a_share_index_prices_historical--返回字段) 一致。指数接口响应中的 `data.adjust`
固定为 `null`。

<a id="get_a_share_index_prices_historical--历史-k-线--响应字段"></a>
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

<a id="get_a_share_index_prices_historical_batch"></a>
## A股指数批量历史K线


工具名：`get_a_share_index_prices_historical_batch`

<a id="get_a_share_index_prices_historical_batch--工具描述"></a>
### 工具描述

> 在同一时间窗口比较交易所指数、同花顺概念或行业指数。单次最多 10 个代码，仅支持日线 `1d`；查询范围为近 5 个自然年，下界以本次查询日（`Asia/Shanghai`）向前滚动 5 年的当地零点计算。例如查询日为 2026-11-03，下界为 2021-11-03 零点；并非任意两个历史日期间的 5 年跨度。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

<a id="get_a_share_index_prices_historical_batch--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `000001.SH,399001.SZ`；最多 10 个，按去重前数量计数。 |
| `interval` | string | 是 | — | K 线周期，当前仅支持 `1d`（日线）。 |
| `start` | long | 是 | - | 起始时间，毫秒 Unix 时间戳；须为非负毫秒时间戳。 |
| `end` | long | 是 | - | 结束时间，毫秒 Unix 时间戳；必须不早于 `start`，且查询区间需落在近 5 年的数据范围内；须为非负毫秒时间戳。 |

<a id="get_a_share_index_prices_historical_batch--调用示例"></a>
### 调用示例

```text
工具：get_a_share_index_prices_historical_batch
参数：
  - thscodes: "000001.SH,399001.SZ"
  - interval: "1d"
  - start: 1735660800000
  - end: 1767196800000
```

<a id="get_a_share_index_prices_historical_batch--返回"></a>
### 返回

返回 `{ interval, adjust, item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[指数批量历史 K 线](#get_a_share_index_prices_historical_batch--返回字段)。

<a id="get_a_share_index_prices_historical_batch--返回字段"></a>
### 返回字段

<a id="get_a_share_index_prices_historical_batch--指数批量历史-k-线--返回字段"></a>
#### 指数批量历史 K 线 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `interval` | string | 固定为 `1d`（日线）。 |
| `adjust` | null | 固定为 `null`。 |
| `item` | array | 按规范化代码首次出现顺序返回的有效标的组。 |
| `item[].thscode` | string | 该组的完整同花顺代码。 |
| `item[].timestamp` | long \| null | 该组数据时间；合法空组为 `null`。 |
| `item[].item` | array | 该标的的原始业务记录；合法空组为 `[]`。 |

每组 `item[]` 沿用原 K 线字段和升序；K 线记录本身不增加标的代码。
详细业务字段、单位和空值说明见[指数历史 K 线](#get_a_share_index_prices_historical_batch--返回字段)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

<a id="get_a_share_index_prices_historical_batch--指数历史-k-线--响应字段"></a>
#### 指数历史 K 线 · 响应字段

`data` 为 `HistoricalData`，`item[]` 为 `PriceBarItem`，字段结构与
[A 股历史 K 线](#get_a_share_index_prices_historical_batch--返回字段) 一致。指数接口响应中的 `data.adjust`
固定为 `null`。

<a id="get_a_share_index_prices_historical_batch--历史-k-线--响应字段"></a>
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

<a id="get_a_share_index_prices_snapshot"></a>
## A股指数行情快照


工具名：`get_a_share_index_prices_snapshot`

<a id="get_a_share_index_prices_snapshot--工具描述"></a>
### 工具描述

> 按 `thscodes` 批量获取指数最新行情，覆盖上证交易所指数、深证交易所指数、同花顺板块与同花顺行业指数。
> 本工具必须显式传入 `thscodes`，不支持空参数枚举全指数。返回最新价、涨跌额、涨跌幅、开盘 / 最高 / 最低 / 前收价、成交量、成交额。

<a id="get_a_share_index_prices_snapshot--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 逗号分隔的指数 thscode 列表，如 `000001.SH,399001.SZ,886042.TI,881101.TI`。 |

<a id="get_a_share_index_prices_snapshot--调用示例"></a>
### 调用示例

```text
工具：get_a_share_index_prices_snapshot
参数：
  - thscodes: "000001.SH,399001.SZ,886042.TI,881101.TI"
```

<a id="get_a_share_index_prices_snapshot--返回"></a>
### 返回

返回 `{ timestamp, total, item: [PriceSnapshotItem, ...] }`。字段含义见 返回字段说明
[指数行情快照](#get_a_share_index_prices_snapshot--返回字段)。

```json
{
  "timestamp": 1784275991000,
  "total": 4,
  "item": [
    {
      "thscode": "000001.SH",
      "ticker": "000001",
      "last_price": 3388.06,
      "price_change": 12.21,
      "price_change_ratio_pct": 0.3617,
      "open_price": 3370.25,
      "high_price": 3392.18,
      "low_price": 3365.4,
      "prev_price": 3375.85,
      "volume": 321000000,
      "turnover": 420000000000
    }
  ]
}
```

<a id="get_a_share_index_prices_snapshot--返回字段"></a>
### 返回字段

<a id="get_a_share_index_prices_snapshot--指数行情快照--响应字段"></a>
#### 指数行情快照 · 响应字段

`data` 为 `SnapshotData`，`item[]` 为 `PriceSnapshotItem`，字段结构与
[A 股行情快照](#get_a_share_index_prices_snapshot--返回字段) 一致。

<a id="get_a_share_index_prices_snapshot--行情快照--响应字段"></a>
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
