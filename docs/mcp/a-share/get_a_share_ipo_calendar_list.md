# A股新股发行与申购日历

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_ipo_calendar_list`
>
> 对应 REST 端点：[`GET /api/a-share/ipo/calendar-list`](../../api/a-share/ipo-calendar-list.md)


## 工具描述

按沪深或京市及待申购、可申购、待上市阶段查询股票发行记录。股票代码与申购代码分别提供，上市日期和发行价未确定时为 `null`。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `market` | string | 是 | — | 适用市场：sh_sz/bj |
| `status` | string | 是 | — | 发行阶段：upcoming/subscribable/awaiting_listing |

## 调用示例

```text
工具：get_a_share_ipo_calendar_list
参数：
  - market: "bj"
  - status: "subscribable"
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [A股打新日历](../../api/a-share/ipo-calendar-list.md)。
