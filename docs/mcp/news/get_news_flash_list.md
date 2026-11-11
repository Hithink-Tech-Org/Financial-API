# 快讯列表

[业务导航](README.md)

> **info**
> 工具名：`get_news_flash_list`
>
> 对应 REST 端点：[`GET /api/news/flash/list`](../../api/news/news-flash.md#flash-list)


## 工具描述

> 首屏 seq 传字符串 `0`。后续传入约定序号；单次数量及翻页边界以数据提供方为准。快讯 id、seq 为字符串，tags.id 为整数。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tag_id` | integer | 是 | — | 快讯栏目ID。 |
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |

## 调用示例

```text
工具：get_news_flash_list
参数：
  - tag_id: 21103
  - seq: "0"
```

## 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [快讯](../../api/news/news-flash.md#flash-list--快讯列表)。
