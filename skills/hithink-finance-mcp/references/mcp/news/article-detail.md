# 资讯详情

[业务导航](README.md)

- [资讯详情 · `get_news_article_detail`](#get_news_article_detail)

<a id="get_news_article_detail"></a>
## 资讯详情


工具名：`get_news_article_detail`

<a id="get_news_article_detail--工具描述"></a>
### 工具描述

> 仅返回可对外提供的资讯。正文保留 HTML；展示时按内容安全策略处理。不存在或不可提供时返回业务错误。

<a id="get_news_article_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `client_type` | string | 是 | — | 客户端类型：WEB、WEB_ENCRYPTED、PC、PC_LIST，不区分大小写。 |
| `encoded_seq` | string | 是 | — | 密文资讯标识。 |

<a id="get_news_article_detail--调用示例"></a>
### 调用示例

```text
工具：get_news_article_detail
参数：
  - client_type: "WEB"
  - encoded_seq: "example-encoded-id"
```

<a id="get_news_article_detail--返回"></a>
### 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [资讯详情](#get_news_article_detail--返回字段)。

<a id="get_news_article_detail--返回字段"></a>
### 返回字段

<a id="get_news_article_detail--资讯详情--返回字段"></a>
#### 资讯详情 · 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `encoded_seq` | string | 请求中的密文资讯序列号；不返回明文 seq。 |
| `title` | string | 资讯标题。 |
| `author` | string 或 null | 作者；缺失时显式返回 null。 |
| `summary` | string 或 null | 摘要；缺失时显式返回 null。 |
| `content` | string | HTML 正文。 |
| `source` | string 或 null | 来源名称；缺失时显式返回 null。 |
| `publish_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `is_kuaixun` | boolean 或 null | 是否为快讯；缺失时显式返回 null。 |
