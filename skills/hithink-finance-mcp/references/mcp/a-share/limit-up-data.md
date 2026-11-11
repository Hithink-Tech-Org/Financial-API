# 涨跌停与炸板数据

[业务导航](README.md)

- [A股炸板池 · `get_a_share_special_data_limit_break_pool`](#get_a_share_special_data_limit_break_pool)
- [A股跌停池 · `get_a_share_special_data_limit_down_pool`](#get_a_share_special_data_limit_down_pool)
- [A股涨停天梯 · `get_a_share_special_data_limit_up_ladder`](#get_a_share_special_data_limit_up_ladder)
- [A股涨停池 · `get_a_share_special_data_limit_up_pool`](#get_a_share_special_data_limit_up_pool)

<a id="get_a_share_special_data_limit_break_pool"></a>
## A股炸板池


工具名：`get_a_share_special_data_limit_break_pool`

<a id="get_a_share_special_data_limit_break_pool--工具描述"></a>
### 工具描述

> 按交易日分页查询 A 股涨停炸板股票池。

<a id="get_a_share_special_data_limit_break_pool--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date_ms` | integer | 否 | 当前自然日 | 上海时区零点毫秒时间戳。 |
| `page` | integer | 否 | `1` | 页码，从 `1` 开始。 |
| `size` | integer | 否 | `50` | 每页条数，范围 `1..200`。 |
| `sort_field` | enum | 否 | `price_change_ratio_pct` | `price_change_ratio_pct` / `open_times` / `last_price` / `turnover_ratio_pct` / `turnover`。 |
| `sort_dir` | enum | 否 | `desc` | `asc` / `desc`。 |

<a id="get_a_share_special_data_limit_break_pool--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_limit_break_pool
参数：
  - page: 1
  - size: 50
  - sort_field: "open_times"
  - sort_dir: "desc"
```

<a id="get_a_share_special_data_limit_break_pool--返回"></a>
### 返回

返回 `{ timestamp, pagination, item[] }`；字段见 [炸板股票池](#get_a_share_special_data_limit_break_pool--返回字段)。

<a id="get_a_share_special_data_limit_break_pool--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_limit_break_pool--炸板股票池--响应字段"></a>
#### 炸板股票池 · 响应字段

`data.timestamp` 与 `data.pagination` 的定义同涨停股票池；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` / `ticker` / `name` | string | 标准代码、纯代码与股票简称。 |
| `last_price` | decimal | 最新价。 |
| `price_change_ratio_pct` | decimal | 涨跌幅，百分数原值。 |
| `open_times` | integer | 开板次数。 |
| `turnover_ratio_pct` | decimal | 换手率，百分数原值。 |
| `turnover` | decimal | 成交额。 |

<a id="get_a_share_special_data_limit_break_pool--炸板股票池--约束与错误"></a>
#### 炸板股票池 · 约束与错误

- `sort_field` 仅接受本接口列出的白名单值，否则返回 `code=1002`。
- `sort_dir` 仅接受 `asc` / `desc`。
- `page < 1` 或 `size` 不在 `1..200` 时返回 `code=1003`。

<a id="get_a_share_special_data_limit_down_pool"></a>
## A股跌停池


工具名：`get_a_share_special_data_limit_down_pool`

<a id="get_a_share_special_data_limit_down_pool--工具描述"></a>
### 工具描述

> 按交易日分页查询 A 股跌停股票池。

<a id="get_a_share_special_data_limit_down_pool--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date_ms` | integer | 否 | 当前自然日 | 上海时区零点毫秒时间戳。 |
| `page` | integer | 否 | `1` | 页码，从 `1` 开始。 |
| `size` | integer | 否 | `50` | 每页条数，范围 `1..200`。 |
| `sort_field` | enum | 否 | `last_limit_time` | `last_limit_time` / `first_limit_time` / `last_price` / `price_change_ratio_pct` / `turnover_ratio_pct`。 |
| `sort_dir` | enum | 否 | `desc` | `asc` / `desc`。 |

<a id="get_a_share_special_data_limit_down_pool--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_limit_down_pool
参数：
  - page: 1
  - size: 50
  - sort_field: "last_limit_time"
  - sort_dir: "desc"
```

<a id="get_a_share_special_data_limit_down_pool--返回"></a>
### 返回

返回 `{ timestamp, pagination, item[] }`；字段见 [跌停股票池](#get_a_share_special_data_limit_down_pool--返回字段)。

<a id="get_a_share_special_data_limit_down_pool--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_limit_down_pool--跌停股票池--响应字段"></a>
#### 跌停股票池 · 响应字段

`data.timestamp` 与 `data.pagination` 的定义同涨停股票池；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` / `ticker` / `name` | string | 标准代码、纯代码与股票简称。 |
| `last_price` | decimal | 最新价。 |
| `price_change_ratio_pct` | decimal | 涨跌幅，百分数原值。 |
| `first_limit_time` / `last_limit_time` | string | 首次与最后跌停时间，上海时区 `HH:mm`。 |
| `turnover_ratio_pct` | decimal | 换手率，百分数原值。 |

<a id="get_a_share_special_data_limit_down_pool--跌停股票池--约束与错误"></a>
#### 跌停股票池 · 约束与错误

- `sort_field` 仅接受本接口列出的白名单值，否则返回 `code=1002`。
- `sort_dir` 仅接受 `asc` / `desc`。
- `page < 1` 或 `size` 不在 `1..200` 时返回 `code=1003`。

<a id="get_a_share_special_data_limit_up_ladder"></a>
## A股涨停天梯


工具名：`get_a_share_special_data_limit_up_ladder`

<a id="get_a_share_special_data_limit_up_ladder--工具描述"></a>
### 工具描述

> 返回 A 股近 30 个交易日的连板梯队矩阵（按日期 -> 6 个板 -> 股票列表），
> 用于近期连板分布、次日晋级追踪等分析。无入参；上游当前固定返回 30 日，每个板位最多 4 只。

<a id="get_a_share_special_data_limit_up_ladder--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无入参。 |

<a id="get_a_share_special_data_limit_up_ladder--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_limit_up_ladder
参数：（无）
```

<a id="get_a_share_special_data_limit_up_ladder--返回"></a>
### 返回

返回 `{ timestamp, window, item: [LimitUpLadderItem, ...] }`。
字段含义见 返回字段说明 [连板天梯](#get_a_share_special_data_limit_up_ladder--返回字段)。

```json
{
  "timestamp": 1748102400000,
  "window": {
    "length": 30,
    "date_list": ["20250620", "20250619"],
    "board_caps": {
      "two_board": 4,
      "three_board": 4,
      "four_board": 4,
      "five_board": 4,
      "six_board": 4,
      "seven_over": 4
    }
  },
  "item": [
    {
      "date": "20250620",
      "boards": {
        "two_board": [
          {
            "thscode": "603986.SH",
            "ticker": "603986",
            "name": "兆易创新",
            "board_num": 2,
            "seal_nextday": null,
            "sign_level": 1
          }
        ],
        "three_board": [],
        "four_board": [],
        "five_board": [],
        "six_board": [],
        "seven_over": []
      }
    }
  ]
}
```

<a id="get_a_share_special_data_limit_up_ladder--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_limit_up_ladder--连板天梯--响应字段"></a>
#### 连板天梯 · 响应字段

`data` 为 `LimitUpLadderData`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间（毫秒）。 |
| `window` | object | 窗口元信息。 |
| `item` | array | 按交易日组织的连板矩阵。 |

`window` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `length` | integer | 交易日窗口长度。 |
| `date_list` | string[] | 窗口内交易日列表，按后端返回顺序排列。 |
| `board_caps` | object | 每个板位的最大列表长度。 |

`item[].boards` 固定包含 `two_board`、`three_board`、`four_board`、`five_board`、`six_board`、`seven_over` 六个数组；上游缺失的板位会补为 `[]`。

`boards.*[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的标准代码。 |
| `ticker` | string | 6 位股票代码。 |
| `name` | string | 股票简称。 |
| `board_num` | integer | 连板数。 |
| `seal_nextday` | boolean \| null | 次一交易日是否继续封板；最近交易日没有次日参考，固定为 `null`。 |
| `sign_level` | integer | 上游标记等级。 |

<a id="get_a_share_special_data_limit_up_ladder--跌停股票池--响应字段"></a>
#### 跌停股票池 · 响应字段

`data.timestamp` 与 `data.pagination` 的定义同涨停股票池；`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` / `ticker` / `name` | string | 标准代码、纯代码与股票简称。 |
| `last_price` | decimal | 最新价。 |
| `price_change_ratio_pct` | decimal | 涨跌幅，百分数原值。 |
| `first_limit_time` / `last_limit_time` | string | 首次与最后跌停时间，上海时区 `HH:mm`。 |
| `turnover_ratio_pct` | decimal | 换手率，百分数原值。 |

<a id="get_a_share_special_data_limit_up_ladder--跌停股票池--约束与错误"></a>
#### 跌停股票池 · 约束与错误

- `sort_field` 仅接受本接口列出的白名单值，否则返回 `code=1002`。
- `sort_dir` 仅接受 `asc` / `desc`。
- `page < 1` 或 `size` 不在 `1..200` 时返回 `code=1003`。

<a id="get_a_share_special_data_limit_up_pool"></a>
## A股涨停池


工具名：`get_a_share_special_data_limit_up_pool`

<a id="get_a_share_special_data_limit_up_pool--工具描述"></a>
### 工具描述

> 按交易日返回 A 股涨停 / 连板股票池，后端固定取全部连板与 `main,chinext,ssestar,north` 四类板块。
> 返回字段聚焦涨停语义，包括涨停时间、涨停原因、连板天数和封单额。

<a id="get_a_share_special_data_limit_up_pool--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `date_ms` | integer | 否 | — | 查询交易日 Unix 毫秒戳（Asia/Shanghai 00:00:00）；省略时回退到服务端当前自然日。 |
| `page` | integer | 否 | `1` | 页码，必须 `>= 1`。 |
| `size` | integer | 否 | `50` | 分页大小，上限 `200`。 |
| `sort_field` | enum | 否 | `last_price` | 排序字段：`last_price` / `continue_day_cnt` / `seal_money` / `limit_up_time`。 |
| `sort_dir` | enum | 否 | `desc` | 排序方向：`asc` / `desc`。 |

<a id="get_a_share_special_data_limit_up_pool--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_limit_up_pool
参数：
  - page: 1
  - size: 50
  - sort_field: "limit_up_time"
  - sort_dir: "desc"
```

<a id="get_a_share_special_data_limit_up_pool--返回"></a>
### 返回

返回 `{ timestamp, pagination, item: [LimitUpPoolItem, ...] }`。
字段含义见 返回字段说明 [涨停股票池](#get_a_share_special_data_limit_up_pool--返回字段)。

```json
{
  "timestamp": 1748102400000,
  "pagination": {
    "total": 126,
    "pages": 3,
    "size": 50,
    "page": 1
  },
  "item": [
    {
      "thscode": "603986.SH",
      "ticker": "603986",
      "name": "兆易创新",
      "is_st": false,
      "is_new": false,
      "last_price": 118.23,
      "price_change_ratio_pct": 10.0008,
      "limit_up_time": "09:34",
      "limit_up_reason": "存储芯片",
      "continue_day_text": "2连板",
      "continue_day_cnt": 2,
      "seal_money": 123456789.12,
      "max_seal_money": 234567890.12
    }
  ]
}
```

<a id="get_a_share_special_data_limit_up_pool--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_limit_up_pool--涨停股票池--响应字段"></a>
#### 涨停股票池 · 响应字段

`data` 为 `LimitUpPoolData`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据就绪时间（毫秒）。 |
| `pagination` | object | 分页信息。 |
| `item` | array | 涨停股票列表。 |

`pagination` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `total` | integer | 总条数。 |
| `pages` | integer | 总页数。 |
| `size` | integer | 当前分页大小，回显请求参数。 |
| `page` | integer | 当前页码，回显请求参数。 |

`item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的标准代码，例如 `603986.SH`。 |
| `ticker` | string | 6 位股票代码。 |
| `name` | string | 股票简称。 |
| `is_st` | boolean | 是否 ST，仅展示，不作为筛选入参。 |
| `is_new` | boolean | 是否未开板新股，仅展示。 |
| `last_price` | decimal | 当前价格，单位元。 |
| `price_change_ratio_pct` | decimal | 涨跌幅百分比，已乘以 100。 |
| `limit_up_time` | string | 涨停时间，格式 `HH:MM`。 |
| `limit_up_reason` | string \| null | 涨停原因；上游空字符串会标准化为 `null`。 |
| `continue_day_text` | string | 连板文本，例如 `首板`、`5天4板`。 |
| `continue_day_cnt` | integer | 连板计数。 |
| `seal_money` | decimal | 当前封单额，单位元。 |
| `max_seal_money` | decimal | 峰值封单额，单位元。 |

<a id="get_a_share_special_data_limit_up_pool--涨停股票池--约束与错误"></a>
#### 涨停股票池 · 约束与错误

- `sort_field` 仅接受白名单值，否则返回 `code=1002`。
- `sort_dir` 仅接受 `asc` / `desc`。
- `page < 1` 或 `size` 不在 `1..200` 时返回 `code=1003`。
