# 快讯刷新

[业务导航](README.md)

> **info**
> 工具名：`get_news_flash_refresh`
>
> 对应 REST 端点：[`GET /api/news/flash/refresh`](../../api/news/news-flash.md#flash-refresh)


## 工具描述

> 传入已知最新 seq 和创建时间。create_time_ms 为毫秒值，须能整除 1000；调用方按业务需要处理重复记录。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tag_id` | integer | 是 | — | 快讯栏目ID。 |
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |
| `create_time_ms` | integer | 是 | — | 客户端已知快讯创建时间，毫秒值须能整除1000。 |

## 调用示例

```text
工具：get_news_flash_refresh
参数：
  - tag_id: 21103
  - seq: "667642844"
  - create_time_ms: 1788868800000
```

## 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [快讯](../../api/news/news-flash.md#flash-refresh--快讯刷新)。
