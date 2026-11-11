# 港股新股递表记录

[业务导航](README.md)

> **info**
> 工具名：`get_hk_share_ipo_application_list`
>
> 对应 REST 端点：[`GET /api/hk-share/ipo/application-list`](../../api/hk-share/hk-share-ipo.md#ipo-application-list)


## 工具描述

分页查询港股公司递表记录，保留同一公司的重复申请。页码从 1 开始，每页 50 条；总数未知时为 `null`，以 `has_next` 判断后续页。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `page` | integer | 否 | `1` | 从1开始的页码 |

## 调用示例

```text
工具：get_hk_share_ipo_application_list
参数：
  - page: 1
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [港股打新](../../api/hk-share/hk-share-ipo.md#ipo-application-list)。
