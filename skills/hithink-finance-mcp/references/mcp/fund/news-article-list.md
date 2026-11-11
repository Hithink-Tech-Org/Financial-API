# 基金资讯列表

[业务导航](README.md)

- [基金资讯列表 · `get_fund_news_article_list`](#get_fund_news_article_list)

<a id="get_fund_news_article_list"></a>
## 基金资讯列表


工具名：`get_fund_news_article_list`

<a id="get_fund_news_article_list--工具描述"></a>
### 工具描述

> 游标分页查询单只基金的资讯文章。上游不提供可靠的总记录数，因此响应不返回 `total`；是否翻页结束以 `has_more` 为准。

<a id="get_fund_news_article_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整基金 thscode。 |
| `limit` | integer | 否 | — | 返回条数。 |
| `offset` | string | 否 | — | 不透明翻页游标。 |

<a id="get_fund_news_article_list--调用示例"></a>
### 调用示例

```text
工具：get_fund_news_article_list
参数：
  - thscode: "510300.SH"
  - limit: 20
```

<a id="get_fund_news_article_list--返回"></a>
### 返回

返回 `{ timestamp, limit, offset, has_more, item[] }`，不包含 `total`；是否继续翻页以 `has_more` 为准。字段见 [基金资讯列表](#get_fund_news_article_list--返回字段)。

<a id="get_fund_news_article_list--返回字段"></a>
### 返回字段

<a id="get_fund_news_article_list--基金资讯列表--返回字段"></a>
#### 基金资讯列表 · 返回字段

`data` 分页字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 接口响应时间戳。 |
| `limit` | integer | 本页返回条数上限。 |
| `offset` | string \| null | 下一页游标；继续翻页时原样回传。 |
| `has_more` | boolean | 是否还有下一页；分页结束统一以该字段为准。 |
| `item` | array | 资讯明细列表。 |

该接口使用游标/窗口分页，上游不提供可靠的总记录数，因此 `data` 不返回 `total`。

`data.item[]` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 资讯 ID。 |
| `content_type` | string | 内容类型。 |
| `title` / `summary` | string | 标题与摘要。 |
| `source` / `author` | string | 来源与作者。 |
| `url` / `image_url` | string \| null | 正文链接与图片链接。 |
| `publish_time_ms` | long | 发布时间，毫秒 Unix 时间戳。 |
| `top` | boolean | 是否置顶。 |

通用鉴权与错误码参见[基金 API 总览](../../../SKILL.md#调用规则)。
