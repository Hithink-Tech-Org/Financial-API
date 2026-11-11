# 个股分时新闻

[业务导航](README.md)

> **info**
> 工具名：`get_news_stock_timeline_list`
>
> 对应 REST 端点：[`GET /api/news/stock/timeline-list`](../../api/news/stock-timeline-list.md)


## 工具描述

> 使用完整同花顺代码 thscode 查询。首屏 offset=first，后续原样回传 offset；size 省略时使用数据提供方行为。jump_url 保留原值，不保证可用于资讯详情查询。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整同花顺代码，例如300033.SZ。 |
| `offset` | string | 是 | — | 分页偏移量，首屏first；后续原样回传。 |
| `size` | integer | 否 | — | 每页条数，范围1至100；省略使用上游行为。 |

## 调用示例

```text
工具：get_news_stock_timeline_list
参数：
  - thscode: "300033.SZ"
  - offset: "first"
```

## 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [个股分时新闻](../../api/news/stock-timeline-list.md#返回字段)。
