# 个股分时新闻

[业务导航](README.md)

- [个股分时新闻 · `get_news_stock_timeline_list`](#get_news_stock_timeline_list)

<a id="get_news_stock_timeline_list"></a>
## 个股分时新闻


工具名：`get_news_stock_timeline_list`

<a id="get_news_stock_timeline_list--工具描述"></a>
### 工具描述

> 使用完整同花顺代码 thscode 查询。首屏 offset=first，后续原样回传 offset；size 省略时使用数据提供方行为。jump_url 保留原值，不保证可用于资讯详情查询。

<a id="get_news_stock_timeline_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `thscode` | string | 是 | — | 完整同花顺代码，例如300033.SZ。 |
| `offset` | string | 是 | — | 分页偏移量，首屏first；后续原样回传。 |
| `size` | integer | 否 | — | 每页条数，范围1至100；省略使用上游行为。 |

<a id="get_news_stock_timeline_list--调用示例"></a>
### 调用示例

```text
工具：get_news_stock_timeline_list
参数：
  - thscode: "300033.SZ"
  - offset: "first"
```

<a id="get_news_stock_timeline_list--返回"></a>
### 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [个股分时新闻](#get_news_stock_timeline_list--返回字段)。

<a id="get_news_stock_timeline_list--返回字段"></a>
### 返回字段

<a id="get_news_stock_timeline_list--个股分时新闻--返回字段"></a>
#### 个股分时新闻 · 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 分时新闻列表；可能为空。 |
| `items[].id` | string | 内容 ID。 |
| `items[].type` | integer 或 null | 内容类型。 |
| `items[].title` | string | 新闻标题。 |
| `items[].author` | string 或 null | 作者。 |
| `items[].source` | string 或 null | 新闻来源。 |
| `items[].summary` | string 或 null | 新闻摘要。 |
| `items[].publish_time_ms` | integer 或 null | Unix毫秒级时间戳；保持上游毫秒数值。 |
| `items[].jump_url` | string | 新闻跳转地址，非空 HTTP/HTTPS URL；不保证为密文 URL。 |
| `items[].pic_url` | string 或 null | 新闻图片地址。 |
| `has_more` | boolean | 是否还有下一页。 |
| `offset` | string | 下一页偏移量，用于后续分页请求。 |
