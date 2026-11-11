# 标的列表获取

[业务导航](README.md)

- [标的目录（代码表浏览） · `get_meta_tickers_list`](#get_meta_tickers_list)

<a id="get_meta_tickers_list"></a>
## 标的目录（代码表浏览）


工具名：`get_meta_tickers_list`

<a id="get_meta_tickers_list--工具描述"></a>
### 工具描述

> 批量获取代码表，支持按资产类别过滤。采用简单 offset/limit 分页，
> 调用方循环递增 `offset` 直到 `item.length < limit` 即可取尽。

<a id="get_meta_tickers_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `asset_type` | enum | 否 | — | 资产类别过滤，支持单值或逗号分隔多值；省略时返回全部类型。 |
| `limit` | integer | 否 | `1000` | 单页条数，最大 `10000`。 |
| `offset` | integer | 否 | `0` | 分页偏移。 |

`asset_type` 枚举含义：

| 值 | 含义 |
|---|---|
| `a-share` | A 股股票 |
| `a-share-index` | A 股指数、同花顺指数或板块 |
| `fund-otc` | 场外公募基金 |
| `fund-etf` | ETF 基金 |
| `fund-lof` | LOF 基金 |
| `fund-reits` | 公募 REITs |
| `forex` | 外汇 |
| `futures` | 期货 |
| `futures-commodity-index` | 期货商品指数合约 |
| `options` | 期权 |

<a id="get_meta_tickers_list--调用示例"></a>
### 调用示例

```text
工具：get_meta_tickers_list
参数：
  - asset_type: "a-share"
  - limit: 1000
  - offset: 0
```

<a id="get_meta_tickers_list--返回"></a>
### 返回

返回 `{ timestamp, item: [TickerItem, ...] }`，结构与 [`get_meta_tickers_search`](tickers-search.md#get_meta_tickers_search) 一致。
字段含义见 返回字段说明 [标的列表获取](#get_meta_tickers_list--返回字段)。

<a id="get_meta_tickers_list--分页取尽"></a>
### 分页取尽

```text
offset = 0
loop:
  resp = get_meta_tickers_list(offset=offset, limit=1000)
  consume(resp.item)
  if len(resp.item) < 1000: break
  offset += 1000
```

<a id="get_meta_tickers_list--返回字段"></a>
### 返回字段

<a id="get_meta_tickers_list--标的列表获取--响应字段"></a>
#### 标的列表获取 · 响应字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间（毫秒），为当前代码表快照的上游加载时间。 |
| `item` | array | 标的列表。 |

`item[]` 为 `TickerItem`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 完整 thscode，如 `600519.SH`。 |
| `ticker` | string | 纯代码，如 `600519`。 |
| `name` | string | 展示名称。 |
| `exchange` | string \| null | 交易所后缀（`SH` / `SZ` / `BJ`）；场外基金为 `null`，`.OF` 不是交易所。 |
| `asset_type` | string | 规范化资产类型；每条记录仅返回一个叶子类型，含义同请求参数枚举表。 |
| `currency` | string | 币种代码；当前基金统一为 `CNY`。 |
| `list_date` | string \| null | 上市日期，格式 `yyyy-MM-dd`。 |
| `end_date` | string \| null | 合约到期日，格式 `yyyy-MM-dd`。 |
| `last_trade_date` | string \| null | 最后交易日，格式 `yyyy-MM-dd`。 |
| `last_delivery_date` | string \| null | 最后交割日，格式 `yyyy-MM-dd`。 |
