# 基金净值与业绩

[业务导航](README.md)

- [基金净值](#performance-nav)：`GET /api/fund/performance/nav`
- [基金最新净值快照](#performance-nav-snapshot)：`GET /api/fund/performance/nav-snapshot`
- [基金区间收益](#performance-returns)：`GET /api/fund/performance/returns`
- [基金历史业绩指标](#performance-indicators-historical)：`GET /api/fund/performance/indicators-historical`
- [基金最大回撤](#performance-drawdowns)：`GET /api/fund/performance/drawdowns`

- 本页接口返回统一 `ApiResponse` 信封；响应中的时间戳采用毫秒级 Unix 时间戳，时区按 `Asia/Shanghai`。
- `thscode` 是基金唯一标识，必须保留市场后缀。收益率、占比和回撤字段为百分数原值。
- 区间收益、最大回撤和最新净值快照支持每批 1 至 20 只。用英文逗号分隔完整代码，按首次出现的请求顺序返回有数据的基金，重复代码只计一次查询。批次全未知返回 `3001`，查询成功但全批无可用数据返回 `3002`。

<a id="performance-nav"></a>
<a id="performance-nav--基金净值"></a>
## 基金净值

```text
GET /api/fund/performance/nav
```

<a id="performance-nav--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode，必须保留市场后缀。 |
| `range` | string | 否 | 最新一条 | `week` / `month` / `tmonth` / `hyear` / `year` / `twoyear` / `tyear` / `fyear`。 |
| `nav_type` | string | 否 | `unit,adj` | `unit`（单位净值）/ `adj`（复权净值）/ `unit,adj`（同时返回）。 |

不传 `range` 时最多返回最新一个净值日期；传入后按 `nav_date` 升序返回区间序列。
`unit_nav` 为单位净值，`adj_nav` 为复权净值，复权净值不等同于累计净值。

<a id="performance-nav--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/fund/performance/nav?thscode=510300.SH&range=year&nav_type=unit' \
  -H 'X-api-key: <your-api-key>'
```

<a id="performance-nav--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "97634b0fbf4746afaa32e8a71adbd636",
  "data": {
    "timestamp": 1784131200000,
    "item": [
      {
        "nav_date": 1752595200000,
        "unit_nav": 4.0713
      },
      {
        "nav_date": 1752681600000,
        "unit_nav": 4.1015
      }
    ]
  }
}
```

<a id="performance-nav--返回字段"></a>
### 返回字段

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `nav_date` | long | 净值日期，毫秒级 Unix 时间戳。 |
| `unit_nav` | number | 单位净值；未通过 `nav_type` 请求时不输出。 |
| `adj_nav` | number | 复权净值；未通过 `nav_type` 请求时不输出，不等同于累计净值。 |

<a id="performance-nav-snapshot"></a>

<a id="performance-nav-snapshot--基金最新净值快照"></a>
## 基金最新净值快照

```text
GET /api/fund/performance/nav-snapshot
```

批量查询上游已写入的最新单位净值与复权净值。更新期间，快照与历史净值序列末值可能短暂不同。需要净值日期时请查询[基金净值](#performance-nav--基金净值)。

<a id="performance-nav-snapshot--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscodes` | string | 是 | — | 1 至 20 个完整基金代码，用英文逗号分隔。 |

<a id="performance-nav-snapshot--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/fund/performance/nav-snapshot?thscodes=510300.SH%2C158001.SZ' \
  -H 'X-api-key: <your-api-key>'
```

<a id="performance-nav-snapshot--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request-id",
  "data": {
    "item": [
      {
        "thscode": "510300.SH",
        "unit_nav": 4.1015,
        "adj_nav": 4.3217
      },
      {
        "thscode": "158001.SZ",
        "unit_nav": 1.0463,
        "adj_nav": 1.0463
      }
    ]
  }
}
```

<a id="performance-nav-snapshot--返回字段"></a>
### 返回字段

`data` 只有 `item`，快照省略净值日期和时间戳。两项净值均以四位小数返回，缺值省略。

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带市场后缀的完整基金代码。 |
| `unit_nav` | number | 单位净值。 |
| `adj_nav` | number | 复权净值。 |

<a id="performance-returns"></a>

<a id="performance-returns--基金区间收益"></a>
## 基金区间收益

```text
GET /api/fund/performance/returns
```

单查与批查使用同一统计口径。收益率使用百分数原值。可见指标的缺值返回 `null`。即使收益率或同类平均缺值，只要上游有排名或排名总数，仍会独立返回。

<a id="performance-returns--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 否 | — | 单只基金的完整代码，与 `thscodes` 二选一。 |
| `thscodes` | string | 否 | — | 1 至 20 个完整基金代码，用英文逗号分隔，与 `thscode` 二选一。 |

缺少两种参数时返回 `1001`，同时提供时返回 `1004`。批量代码格式有误返回 `1002`，超过 20 个输入代码返回 `1003`。

<a id="performance-returns--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/fund/performance/returns?thscode=510300.SH' \
  -H 'X-api-key: <your-api-key>'

curl 'https://fuyao.aicubes.cn/api/fund/performance/returns?thscodes=510300.SH%2C158001.SZ' \
  -H 'X-api-key: <your-api-key>'
```

<a id="performance-returns--响应示例"></a>
### 响应示例

以下为批量响应，节选部分指标。通过 `thscode` 单查时，每条结果省略 `thscode` 字段。

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request-id",
  "data": {
    "timestamp": 1794967200000,
    "item": [
      {
        "thscode": "510300.SH",
        "return_month": -3.33,
        "return_tmonth": 0.03,
        "return_hyear": 0.19,
        "return_year": 19.66,
        "return_tyear": 28.69,
        "return_fyear": 1.77,
        "return_nowyear": 2.49,
        "return_now": 121.58
      },
      {
        "thscode": "158001.SZ",
        "return_year": null,
        "return_now": -0.32,
        "peer_average_year": null,
        "rank_year": 615,
        "rank_total_year": 4754
      }
    ]
  }
}
```

<a id="performance-returns--返回字段"></a>
### 返回字段

`data.item[]` 字段。外网完整视图包含 10 项自身收益、8 项同类平均、8 项同类排名和 8 项排名总数。

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 批量查询返回带市场后缀的完整基金代码，单查省略。 |
| `return_month` | number 或 null | 近一月收益率，百分数原值。 |
| `return_week` | number 或 null | 近一周收益率，百分数原值。 |
| `return_tmonth` | number 或 null | 近三月收益率，百分数原值。 |
| `return_hyear` | number 或 null | 近半年收益率，百分数原值。 |
| `return_year` | number 或 null | 近一年收益率，百分数原值。 |
| `return_twoyear` | number 或 null | 近两年收益率，百分数原值。 |
| `return_tyear` | number 或 null | 近三年收益率，百分数原值。 |
| `return_fyear` | number 或 null | 近五年收益率，百分数原值。 |
| `return_nowyear` | number 或 null | 今年以来收益率，百分数原值。 |
| `return_now` | number 或 null | 成立以来收益率，百分数原值。 |
| `peer_average_week` | number 或 null | 近一周同类平均收益率，百分数原值。 |
| `peer_average_month` | number 或 null | 近一月同类平均收益率，百分数原值。 |
| `peer_average_tmonth` | number 或 null | 近三月同类平均收益率，百分数原值。 |
| `peer_average_hyear` | number 或 null | 近半年同类平均收益率，百分数原值。 |
| `peer_average_year` | number 或 null | 近一年同类平均收益率，百分数原值。 |
| `peer_average_twoyear` | number 或 null | 近两年同类平均收益率，百分数原值。 |
| `peer_average_tyear` | number 或 null | 近三年同类平均收益率，百分数原值。 |
| `peer_average_fyear` | number 或 null | 近五年同类平均收益率，百分数原值。 |
| `rank_week` | integer 或 null | 近一周同类排名。 |
| `rank_month` | integer 或 null | 近一月同类排名。 |
| `rank_tmonth` | integer 或 null | 近三月同类排名。 |
| `rank_hyear` | integer 或 null | 近半年同类排名。 |
| `rank_year` | integer 或 null | 近一年同类排名。 |
| `rank_twoyear` | integer 或 null | 近两年同类排名。 |
| `rank_tyear` | integer 或 null | 近三年同类排名。 |
| `rank_fyear` | integer 或 null | 近五年同类排名。 |
| `rank_total_week` | integer 或 null | 近一周参与同类排名的基金总数。 |
| `rank_total_month` | integer 或 null | 近一月参与同类排名的基金总数。 |
| `rank_total_tmonth` | integer 或 null | 近三月参与同类排名的基金总数。 |
| `rank_total_hyear` | integer 或 null | 近半年参与同类排名的基金总数。 |
| `rank_total_year` | integer 或 null | 近一年参与同类排名的基金总数。 |
| `rank_total_twoyear` | integer 或 null | 近两年参与同类排名的基金总数。 |
| `rank_total_tyear` | integer 或 null | 近三年参与同类排名的基金总数。 |
| `rank_total_fyear` | integer 或 null | 近五年参与同类排名的基金总数。 |

<a id="performance-indicators-historical"></a>

<a id="performance-indicators-historical--基金历史业绩指标"></a>
## 基金历史业绩指标

```text
GET /api/fund/performance/indicators-historical
```

<a id="performance-indicators-historical--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |
| `start` | long | 是 | — | 起始时间，毫秒 Unix 时间戳。 |
| `end` | long | 是 | — | 结束时间，毫秒 Unix 时间戳。 |

> **caution 参数必填**
> `start` 和 `end` 均为必填参数。此前未传这两个参数的客户端需要补充起止时间后再调用。

<a id="performance-indicators-historical--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/fund/performance/indicators-historical?thscode=510300.SH&start=1735689600000&end=1767225599000' \
  -H 'X-api-key: <your-api-key>'
```

<a id="performance-indicators-historical--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "046f8a0b787c44a7b995c568096fa16c",
  "data": {
    "timestamp": 1767225599000,
    "item": [
      {
        "date_ms": 1767139200000,
        "rsi_pct": 53.8,
        "donchian_channel": 0.42,
        "track_index_pe_ttm_five_year_percentile": 61.3
      }
    ]
  }
}
```

<a id="performance-indicators-historical--返回字段"></a>
### 返回字段

`data` 仅包含 `timestamp` 和 `item`，其中 `timestamp` 保留明确的上游数据时间。指标周期固定为 `DAY_1`，不作为顶层字段返回；响应也不返回顶层 `thscode` 或 `interval`。

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `date_ms` | long | 指标日期，毫秒 Unix 时间戳。 |
| `rsi_pct` | number | 净值波动（RSI）指标值。 |
| `donchian_channel` | number | 趋势强弱（唐奇安通道）指标值。 |
| `track_index_pe_ttm_five_year_percentile` | number | 估值百分位（跟踪指数 PE TTM 五年分位）。 |

<a id="performance-drawdowns"></a>

<a id="performance-drawdowns--基金最大回撤"></a>
## 基金最大回撤

```text
GET /api/fund/performance/drawdowns
```

最大回撤使用非负的百分数原值。例如 `2.3574` 表示最大回撤幅度为 `2.3574%`。真实的 `0` 照常返回，缺值省略。

<a id="performance-drawdowns--请求参数"></a>
### 请求参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 否 | — | 单只基金的完整代码，与 `thscodes` 二选一。 |
| `thscodes` | string | 否 | — | 1 至 20 个完整基金代码，用英文逗号分隔，与 `thscode` 二选一。 |

缺少两种参数时返回 `1001`，同时提供时返回 `1004`。批量代码格式有误返回 `1002`，超过 20 个输入代码返回 `1003`。

<a id="performance-drawdowns--请求示例"></a>
### 请求示例

```bash
curl 'https://fuyao.aicubes.cn/api/fund/performance/drawdowns?thscode=510300.SH' \
  -H 'X-api-key: <your-api-key>'

curl 'https://fuyao.aicubes.cn/api/fund/performance/drawdowns?thscodes=510300.SH%2C158001.SZ' \
  -H 'X-api-key: <your-api-key>'
```

<a id="performance-drawdowns--响应示例"></a>
### 响应示例

```json
{
  "code": 0,
  "message": "success",
  "request_id": "example-request-id",
  "data": {
    "timestamp": 1794967200000,
    "item": [
      {
        "thscode": "510300.SH",
        "ticker": "510300",
        "week": 2.3574,
        "month": 3.6,
        "tmonth": 6.8,
        "hyear": 9.1,
        "year": 12.5,
        "twoyear": 18.4,
        "tyear": 21.7,
        "fyear": 28.9,
        "nowyear": 7.3,
        "now": 31.2
      },
      {
        "thscode": "158001.SZ",
        "ticker": "158001",
        "week": 0,
        "month": 0.75
      }
    ]
  }
}
```

<a id="performance-drawdowns--返回字段"></a>
### 返回字段

`data.timestamp` 为接口响应时间戳；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 完整同花顺代码。 |
| `ticker` | string | 纯代码，用于展示。 |
| `week` | number | 近一周最大回撤。 |
| `month` | number | 近一月最大回撤。 |
| `tmonth` | number | 近三月最大回撤。 |
| `hyear` | number | 近半年最大回撤。 |
| `year` | number | 近一年最大回撤。 |
| `twoyear` | number | 近两年最大回撤。 |
| `tyear` | number | 近三年最大回撤。 |
| `fyear` | number | 近五年最大回撤。 |
| `nowyear` | number | 今年以来最大回撤。 |
| `now` | number | 成立以来最大回撤。 |

通用参数与错误码参见[基金 API 总览](README.md)。
