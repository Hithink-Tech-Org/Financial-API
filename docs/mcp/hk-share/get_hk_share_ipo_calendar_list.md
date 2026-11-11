# 港股认购与待上市日历

[业务导航](README.md)

> **info**
> 工具名：`get_hk_share_ipo_calendar_list`
>
> 对应 REST 端点：[`GET /api/hk-share/ipo/calendar-list`](../../api/hk-share/hk-share-ipo.md#ipo-calendar-list)


## 工具描述

查询港股可认购或待上市列表。`issue_code` 是发行记录标识，正式证券代码未确定时为 `null`；价格区间、每手股数与入场费详情由发行详情接口查询。截止日期为公共招股日期。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `status` | string | 是 | — | 发行阶段：subscribable/awaiting_listing |

## 调用示例

```text
工具：get_hk_share_ipo_calendar_list
参数：
  - status: "subscribable"
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [港股打新](../../api/hk-share/hk-share-ipo.md#ipo-calendar-list)。
