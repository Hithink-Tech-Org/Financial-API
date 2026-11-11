# 热门深度专题

[业务导航](README.md)

> **info**
> 工具名：`get_news_topic_hot_list`
>
> 对应 REST 端点：[`GET /api/news/topic/hot-list`](../../api/news/topic-hot-list.md)


## 工具描述

> 按热门栏目查询专题，tab_id 由调用方提供。默认且最多 10 条，next_cursor 用于继续查询，has_more 表示是否还有下一页。时间字符串保持原格式。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tab_id` | integer | 是 | — | 热门专题栏目ID。 |
| `cursor` | string | 否 | — | 分页游标，后续查询原样回传。 |
| `limit` | integer | 否 | `10` | 每页条数，范围1至10。 |
| `important_only` | boolean | 否 | `false` | 是否只查询重要内容。 |

## 调用示例

```text
工具：get_news_topic_hot_list
参数：
  - tab_id: 1
```

## 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [热门深度专题](../../api/news/topic-hot-list.md#返回字段)。
