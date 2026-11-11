# 估值数据

[业务导航](README.md)

- [A股估值快照 · `get_a_share_valuations_snapshot`](#get_a_share_valuations_snapshot)

<a id="get_a_share_valuations_snapshot"></a>
## A股估值快照


工具名：`get_a_share_valuations_snapshot`

<a id="get_a_share_valuations_snapshot--工具描述"></a>
### 工具描述

批量查询 A 股最新估值快照。`thscodes` 使用英文逗号分隔，大小写不敏感；
服务端会 trim、转为大写、去重并保留首次出现顺序，一次默认最多接受 100 个原始 token。

工具固定返回市盈率 TTM/MRQ、市净率 MRQ、市销率 TTM 和市现率 TTM 五个估值指标，
不提供历史估值、分页、指标选择或高低估结论。

<a id="get_a_share_valuations_snapshot--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | `600519.SH,000001.SZ` | 英文逗号分隔的 A 股 thscode 列表；每项必须为六位数字加 `.SH`、`.SZ` 或 `.BJ`。 |

<a id="get_a_share_valuations_snapshot--调用示例"></a>
### 调用示例

```text
工具：get_a_share_valuations_snapshot
参数：
  - thscodes: "600519.SH,000001.SZ"
```

<a id="get_a_share_valuations_snapshot--返回"></a>
### 返回

返回 `{ timestamp, total, item: [ValuationSnapshotItem, ...] }`。`item[]` 固定包含
`thscode`、`ticker`、`name`、`pe_ttm`、`pe_mrq`、`pb_mrq`、`ps_ttm`、`pcf_ttm`。

```json
{
  "timestamp": 1784736000000,
  "total": 1,
  "item": [
    {
      "thscode": "600519.SH",
      "ticker": "600519",
      "name": "贵州茅台",
      "pe_ttm": 21.3567,
      "pe_mrq": 20.8841,
      "pb_mrq": 7.1532,
      "ps_ttm": 10.3284,
      "pcf_ttm": 19.7716
    }
  ]
}
```

指标值为 `number | null`，负值和高精度十进制值原样返回。上游未返回的股票不生成占位项；
无匹配记录时返回 `total=0`、`item=[]`。完整字段和错误码见 返回字段说明
[估值数据](#get_a_share_valuations_snapshot--返回字段)。

<a id="get_a_share_valuations_snapshot--返回字段"></a>
### 返回字段

<a id="get_a_share_valuations_snapshot--估值数据--响应字段"></a>
#### 估值数据 · 响应字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | integer | 业务状态码，`0` 表示成功。 |
| `message` | string | 业务状态说明。 |
| `request_id` | string | 请求追踪 ID。 |
| `data.timestamp` | long \| null | 本次响应所用上游指标元数据中的最大有效时间，单位为毫秒；无有效时间时为 `null`。 |
| `data.total` | integer | 实际返回的股票条数。 |
| `data.item` | array | 估值快照列表，按去重后的请求顺序返回。 |
| `data.item[].thscode` | string | 带交易所后缀的完整 thscode。 |
| `data.item[].ticker` | string | 六位股票代码，不含交易所后缀。 |
| `data.item[].name` | string \| null | 本地 A 股代码表中的股票名称。 |
| `data.item[].pe_ttm` | number \| null | 市盈率 TTM。 |
| `data.item[].pe_mrq` | number \| null | 市盈率 MRQ。 |
| `data.item[].pb_mrq` | number \| null | 市净率 MRQ。 |
| `data.item[].ps_ttm` | number \| null | 市销率 TTM。 |
| `data.item[].pcf_ttm` | number \| null | 市现率 TTM。 |

> **note 数据语义**
> - 每个返回项固定包含 5 个指标字段；上游空值返回 `null`，不会补零。
> - 负值和高精度十进制值原样返回，服务端不做估值计算、聚合、取绝对值或四舍五入。
> - 上游未返回的股票不会生成占位项；无匹配记录时返回 `code=0`、`total=0`、`item=[]`。

<a id="get_a_share_valuations_snapshot--估值数据--错误与约束"></a>
#### 估值数据 · 错误与约束

| 场景 | `code` | 说明 |
|---|---|---|
| 缺少 `thscodes` | `1001` | 必填参数缺失。 |
| 存在空 token 或 thscode 格式非法 | `1002` | 每项必须为六位数字加 `.SH`、`.SZ` 或 `.BJ`。 |
| 原始 token 数超过服务端上限 | `1003` | 默认最多 100 个。 |
| 格式正确但代码表不存在 | `3001` | 目标不在 A 股代码表中。 |
| 数据源超时 | `5002` | DataAPI 请求超时。 |
| 数据源不可用 | `5003` | DataAPI 返回异常、空响应或非成功状态。 |
