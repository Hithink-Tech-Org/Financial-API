# 龙虎榜数据

[业务导航](README.md)

- [A股龙虎榜 · `get_a_share_special_data_dragon_tiger_list`](#get_a_share_special_data_dragon_tiger_list)

<a id="get_a_share_special_data_dragon_tiger_list"></a>
## A股龙虎榜


工具名：`get_a_share_special_data_dragon_tiger_list`

<a id="get_a_share_special_data_dragon_tiger_list--工具描述"></a>
### 工具描述

> 查询龙虎榜榜单。`board_type` 缺省为 `all`；`all` 为全部榜，`org` 为机构榜，
> `hot_money` 为游资榜。`date` 可选，格式 `YYYY-MM-DD`；缺省由服务端取最新可用日期。

<a id="get_a_share_special_data_dragon_tiger_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `board_type` | string | 否 | `all` | 榜单类型：`all` 全部 / `org` 机构榜 / `hot_money` 游资榜。 |
| `date` | string | 否 | 最新可用交易日 | 目标交易日，格式 `YYYY-MM-DD`。 |

<a id="get_a_share_special_data_dragon_tiger_list--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_dragon_tiger_list
参数：
  - board_type: "hot_money"
  - date: "2026-07-01"
```

<a id="get_a_share_special_data_dragon_tiger_list--返回"></a>
### 返回

返回 `{ timestamp, board_type, trade_date, count, stock_count, stock_items, hot_money_items }`。
字段含义见 返回字段说明 [龙虎榜榜单](#get_a_share_special_data_dragon_tiger_list--返回字段)。

```json
{
  "timestamp": 1782921600000,
  "board_type": "all",
  "trade_date": "2026-07-01",
  "count": 80,
  "stock_count": 75,
  "stock_items": [
    {
      "thscode": "002407.SZ",
      "ticker": "002407",
      "name": "多氟多",
      "net_value": 1786253128.23,
      "hot_rank": 2,
      "range_days": 3
    }
  ],
  "hot_money_items": []
}
```

<a id="get_a_share_special_data_dragon_tiger_list--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_dragon_tiger_list--龙虎榜数据--响应字段"></a>
#### 龙虎榜数据 · 响应字段

`data` 为龙虎榜榜单容器：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 目标交易日 `Asia/Shanghai` 00:00 毫秒时间戳。 |
| `board_type` | string | 实际榜单类型：`all` / `org` / `hot_money`。 |
| `trade_date` | string | 实际查询交易日，格式 `yyyy-MM-dd`。 |
| `count` | integer | 上游记录数；同一股票可能同时出现当日榜和 3 日榜。 |
| `stock_count` | integer | 股票去重数量。 |
| `stock_items` | array | 股票维度榜单；`board_type=all/org` 时填充，`hot_money` 时为空数组。 |
| `hot_money_items` | array | 游资维度聚合榜单；`board_type=hot_money` 时填充，普通榜单时为空数组。 |

`stock_items[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string | 带交易所后缀的标准代码，例如 `002407.SZ`。 |
| `ticker` | string | 6 位股票代码。 |
| `name` | string | 股票简称。 |
| `concept_list` | array | 所属概念列表，元素包含 `name`。 |
| `change` | number | 当日涨跌幅，小数形式。 |
| `net_value` | number | 龙虎榜净买入金额，单位元。 |
| `net_rate` | number | 龙虎榜净买入占比，小数形式。 |
| `hot_rank` | integer | 同花顺人气排名，数值越小越靠前。 |
| `buy_value` | number | 买方金额，单位元。 |
| `sell_value` | number | 卖方金额，单位元。 |
| `limit_reason` | string | 涨跌停原因。 |
| `range_days` | integer | 上榜区间天数，`1` 为当日榜，`3` 为 3 日榜。 |
| `org_net_value` | number | 机构净买入金额，单位元。 |
| `org_net_rate` | number | 机构净买入占比，小数形式。 |
| `org_buy_num` | integer | 买入机构数。 |
| `org_sell_num` | integer | 卖出机构数。 |
| `amount` | number | 成交金额，单位元。 |
| `hot_money_net_value` | number | 股票维度游资合计净买入金额，单位元。 |
| `hot_money_net_rate` | number | 股票维度游资合计净买入占比，小数形式。 |
| `hot_money_item_net_value` | number | 该游资在该股上的净买入金额，单位元。 |
| `hot_money_item_net_rate` | number | 该游资在该股上的净买入占比，小数形式。 |

`hot_money_items[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 游资名称。 |
| `buying` | number | 聚合净买入金额，单位元。 |
| `rows` | array | 该游资关联股票列表，字段同 `stock_items[]`。 |

<a id="get_a_share_special_data_dragon_tiger_list--龙虎榜数据--约束与错误"></a>
#### 龙虎榜数据 · 约束与错误

- `board_type` 仅接受 `all` / `org` / `hot_money`，否则返回 `code=1002`。
- `date` 必须为 `yyyy-MM-dd`，否则返回 `code=1002`。
- 显式传入的 `date` 必须是 A 股交易日，否则返回 `code=1002`。
- `date` 不在一年内，或日期晚于今天时返回 `code=1003`。
