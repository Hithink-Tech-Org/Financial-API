# 新股发行与申购

[业务导航](README.md)

- [A股新股发行与申购日历 · `get_a_share_ipo_calendar_list`](#get_a_share_ipo_calendar_list)

<a id="get_a_share_ipo_calendar_list"></a>
## A股新股发行与申购日历


工具名：`get_a_share_ipo_calendar_list`

<a id="get_a_share_ipo_calendar_list--工具描述"></a>
### 工具描述

按沪深或京市及待申购、可申购、待上市阶段查询股票发行记录。股票代码与申购代码分别提供，上市日期和发行价未确定时为 `null`。

<a id="get_a_share_ipo_calendar_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `market` | string | 是 | — | 适用市场：sh_sz/bj |
| `status` | string | 是 | — | 发行阶段：upcoming/subscribable/awaiting_listing |

<a id="get_a_share_ipo_calendar_list--调用示例"></a>
### 调用示例

```text
工具：get_a_share_ipo_calendar_list
参数：
  - market: "bj"
  - status: "subscribable"
```

<a id="get_a_share_ipo_calendar_list--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [A股打新日历](#get_a_share_ipo_calendar_list--返回字段)。

<a id="get_a_share_ipo_calendar_list--返回字段"></a>
### 返回字段

<a id="get_a_share_ipo_calendar_list--新股发行与申购--返回字段"></a>
#### 新股发行与申购 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `market` | enum | 数据市场分组 |
| `status` | enum | 返回返回的发行阶段 |
| `item` | array | 业务记录列表 |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string \| null | 发行股票的标准形式代码 |
| `ticker` | string | 发行股票代码 |
| `name` | string | 股票名称 |
| `subscription_code` | string \| null | 申购代码 |
| `subscription_date` | date \| null | 申购日期 |
| `listing_date` | date \| null | 上市日期 |
| `issue_price` | number \| null | 返回发行价，未确定时null；单位：元 |
