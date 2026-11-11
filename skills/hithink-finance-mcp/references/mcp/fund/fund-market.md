# 基金行情数据

[业务导航](README.md)

- [ETF 历史日线行情 · `get_fund_market_historical`](#get_fund_market_historical)
- [ETF批量历史日线行情 · `get_fund_market_historical_batch`](#get_fund_market_historical_batch)
- [基金行情快照 · `get_fund_market_snapshot`](#get_fund_market_snapshot)

<a id="get_fund_market_historical"></a>
## ETF 历史日线行情


工具名：`get_fund_market_historical`

<a id="get_fund_market_historical--工具描述"></a>
### 工具描述

> 查询单只 ETF 的前复权历史日线行情。仅支持 `interval=1d`，查询窗口最长 5 个自然年。
> LOF、场外基金和 REITs 返回 `code=3004`。

<a id="get_fund_market_historical--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 单只 ETF thscode，如 `510300.SH`。不接受逗号多值。 |
| `interval` | enum | 否 | `1d` | K 线周期，当前仅支持 `1d`。 |
| `start` | long | 是 | — | 起始时间，毫秒 Unix 时间戳。 |
| `end` | long | 是 | — | 结束时间，毫秒 Unix 时间戳；必须不早于 `start`，窗口最长 5 个自然年。 |

<a id="get_fund_market_historical--调用示例"></a>
### 调用示例

```text
工具：get_fund_market_historical
参数：
  - thscode: "510300.SH"
  - interval: "1d"
  - start: 1626364800000
  - end: 1784217600000
```

<a id="get_fund_market_historical--返回"></a>
### 返回

返回 `{ timestamp, thscode, interval, adjust, item: [PriceBarItem, ...] }`，其中
价格字段采用前复权口径；`adjust` 固定为 `null`。字段含义见 返回字段说明
[场内基金历史日线行情](#get_fund_market_historical--返回字段)。

<a id="get_fund_market_historical--返回字段"></a>
### 返回字段

<a id="get_fund_market_historical--场内基金历史日线行情--返回字段"></a>
#### 场内基金历史日线行情 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间，取序列中最新一根 K 线的有效时间。 |
| `thscode` | string | 请求中的 ETF thscode。 |
| `interval` | string | K 线周期，固定为 `1d`。 |
| `adjust` | null | 当前固定为 `null`；价格数据仍采用前复权口径。 |
| `item` | array | 历史日线数据列表。 |

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | 交易日期，毫秒级 Unix 时间戳。 |
| `open_price` | number | 前复权开盘价。 |
| `high_price` | number | 前复权最高价。 |
| `low_price` | number | 前复权最低价。 |
| `close_price` | number | 前复权收盘价。 |
| `volume` | number | 成交量。 |
| `turnover` | number | 成交额。 |

通用参数与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。

<a id="get_fund_market_historical_batch"></a>
## ETF批量历史日线行情


工具名：`get_fund_market_historical_batch`

<a id="get_fund_market_historical_batch--工具描述"></a>
### 工具描述

> 比较多只 ETF 的前复权历史日线，单次最多 10 个代码，仅支持 `1d`。查询窗口最长 5 个自然年，可获取的实际行情为近 5 年；较早数据可能为空，5 年窗口上限并不保证任意历史年份均有行情。
> 原生批量查询，所有代码共用查询条件；代码规范化后去重并保留首次出现顺序，上限按去重前代码项数检查。

<a id="get_fund_market_historical_batch--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 英文逗号分隔的完整代码，如 `510300.SH,159915.SZ`；最多 10 个，按去重前数量计数。 |
| `interval` | string | 否 | `1d` | K 线周期，当前仅支持 `1d`（日线）。 |
| `start` | long | 是 | — | 起始时间，毫秒级 Unix 时间戳；须为非负毫秒时间戳。 |
| `end` | long | 是 | — | 结束时间，毫秒级 Unix 时间戳；必须不早于 `start`，且窗口最长 5 个自然年；须为非负毫秒时间戳。 |

<a id="get_fund_market_historical_batch--调用示例"></a>
### 调用示例

```text
工具：get_fund_market_historical_batch
参数：
  - thscodes: "510300.SH,159915.SZ"
  - interval: "1d"
  - start: 1735660800000
  - end: 1767196800000
```

<a id="get_fund_market_historical_batch--返回"></a>
### 返回

返回 `{ interval, adjust, item: [{ thscode, timestamp, item[] }] }`。
有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

详细字段与错误处理见[场内基金批量历史日线行情](#get_fund_market_historical_batch--返回字段)。

<a id="get_fund_market_historical_batch--返回字段"></a>
### 返回字段

<a id="get_fund_market_historical_batch--场内基金批量历史日线行情--返回字段"></a>
#### 场内基金批量历史日线行情 · 返回字段

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
详细业务字段、单位和空值说明见[场内基金历史日线行情](#get_fund_market_historical_batch--返回字段)。

有效标的按规范化代码首次出现顺序返回；未知或资产类型不匹配的代码省略其组，保留有效目标组并返回外层 `code=0`。有效标的无记录时保留 `{thscode,timestamp:null,item:[]}`。去重后仅一个目标且类型不支持返回 `3004`；其它全部无有效目标返回 `3001`。参数、整体上游或协议错误返回普通非零信封，`data=null`；目录不可用或身份歧义按整体错误处理。

<a id="get_fund_market_historical_batch--场内基金历史日线行情--返回字段"></a>
#### 场内基金历史日线行情 · 返回字段

`data` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间，取序列中最新一根 K 线的有效时间。 |
| `thscode` | string | 请求中的 ETF thscode。 |
| `interval` | string | K 线周期，固定为 `1d`。 |
| `adjust` | null | 当前固定为 `null`；价格数据仍采用前复权口径。 |
| `item` | array | 历史日线数据列表。 |

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | 交易日期，毫秒级 Unix 时间戳。 |
| `open_price` | number | 前复权开盘价。 |
| `high_price` | number | 前复权最高价。 |
| `low_price` | number | 前复权最低价。 |
| `close_price` | number | 前复权收盘价。 |
| `volume` | number | 成交量。 |
| `turnover` | number | 成交额。 |

通用参数与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。

<a id="get_fund_market_snapshot"></a>
## 基金行情快照


工具名：`get_fund_market_snapshot`

<a id="get_fund_market_snapshot--工具描述"></a>
### 工具描述

> 查询 ETF 和 LOF 的行情快照。`thscode` 接受 1 至 100 个英文逗号分隔的完整代码，原始项数先限额，规范化后稳定去重；响应为平铺行情记录。
> 未知、不支持或缺报价项省略；单唯一目标不支持返回 `3004`，其它零有效目标返回 `3001`，有效目标全部无报价返回 `3002`。空段返回 `1002`，超限返回 `1003`。

<a id="get_fund_market_snapshot--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 1 至 100 个完整 ETF/LOF 代码，以英文逗号分隔，如 `510300.SH,161725.SZ`；含市场后缀。 |

系统会根据 `thscode` 识别标的类型。

<a id="get_fund_market_snapshot--调用示例"></a>
### 调用示例

```text
工具：get_fund_market_snapshot
参数：
  - thscode: "510300.SH,161725.SZ"
```

<a id="get_fund_market_snapshot--返回"></a>
### 返回

返回 `{ timestamp, item: [FundMarketSnapshotItem, ...] }`。字段含义见 返回字段说明
[场内基金行情快照](#get_fund_market_snapshot--返回字段)。

<a id="get_fund_market_snapshot--返回字段"></a>
### 返回字段

<a id="get_fund_market_snapshot--场内基金行情快照--返回字段"></a>
#### 场内基金行情快照 · 返回字段

`data.timestamp` 为本次快照最新的上游有效时间，使用毫秒级 Unix 时间戳；无有效数据时为 `null`。

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | ETF 或 LOF 的完整同花顺代码。 |
| `ticker` | string | ETF 或 LOF 的纯基金代码，仅用于展示。 |
| `last_price` | number | 最新价。 |
| `open_price` | number | 开盘价。 |
| `high_price` | number | 最高价。 |
| `low_price` | number | 最低价。 |
| `prev_price` | number | 昨收价。 |
| `price_change_ratio_pct` | number | 涨跌幅，百分数原值。 |
| `price_change` | number | 涨跌额。 |
| `price_amplitude_ratio_pct` | number | 振幅，百分数原值。 |
| `volume` | number | 成交量。 |
| `turnover` | number | 成交额。 |
| `turnover_ratio_pct` | number | 换手率，百分数原值。 |
