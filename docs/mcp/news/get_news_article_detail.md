# 资讯详情

[业务导航](README.md)

> **info**
> 工具名：`get_news_article_detail`
>
> 对应 REST 端点：[`GET /api/news/article/detail`](../../api/news/article-detail.md)


## 工具描述

> 仅返回可对外提供的资讯。正文保留 HTML；展示时按内容安全策略处理。不存在或不可提供时返回业务错误。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `client_type` | string | 是 | — | 客户端类型：WEB、WEB_ENCRYPTED、PC、PC_LIST，不区分大小写。 |
| `encoded_seq` | string | 是 | — | 密文资讯标识。 |

## 调用示例

```text
工具：get_news_article_detail
参数：
  - client_type: "WEB"
  - encoded_seq: "example-encoded-id"
```

## 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [资讯详情](../../api/news/article-detail.md#返回字段)。
