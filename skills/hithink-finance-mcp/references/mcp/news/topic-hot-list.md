# 热门深度专题

[业务导航](README.md)

- [热门深度专题 · `get_news_topic_hot_list`](#get_news_topic_hot_list)

<a id="get_news_topic_hot_list"></a>
## 热门深度专题


工具名：`get_news_topic_hot_list`

<a id="get_news_topic_hot_list--工具描述"></a>
### 工具描述

> 按热门栏目查询专题，tab_id 由调用方提供。默认且最多 10 条，next_cursor 用于继续查询，has_more 表示是否还有下一页。时间字符串保持原格式。

<a id="get_news_topic_hot_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tab_id` | integer | 是 | — | 热门专题栏目ID。 |
| `cursor` | string | 否 | — | 分页游标，后续查询原样回传。 |
| `limit` | integer | 否 | `10` | 每页条数，范围1至10。 |
| `important_only` | boolean | 否 | `false` | 是否只查询重要内容。 |

<a id="get_news_topic_hot_list--调用示例"></a>
### 调用示例

```text
工具：get_news_topic_hot_list
参数：
  - tab_id: 1
```

<a id="get_news_topic_hot_list--返回"></a>
### 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [热门深度专题](#get_news_topic_hot_list--返回字段)。

<a id="get_news_topic_hot_list--返回字段"></a>
### 返回字段

<a id="get_news_topic_hot_list--热门深度专题--返回字段"></a>
#### 热门深度专题 · 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 专题内容列表。 |
| `items[].id` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].title` | string | 标题。 |
| `items[].cover` | string 或 null | 封面地址。 |
| `items[].url` | string | 专题内容最终跳转地址，非空。 |
| `items[].type` | string 或 null | 内容类型。 |
| `items[].seo_key` | string 或 null | SEO 标识，仅配置开启时返回。 |
| `items[].propagation_chain` | string 或 null | 传播链路字段。 |
| `items[].important_flag` | integer 或 null | 重要标识。 |
| `items[].pinned_flag` | integer 或 null | 置顶标识。 |
| `items[].pin_label` | string 或 null | 置顶标签。 |
| `items[].source_created_at` | string 或 null | 来源创建时间。 |
| `items[].source_updated_at` | string 或 null | 来源更新时间。 |
| `next_cursor` | string 或 null | 下一页游标。 |
| `has_more` | boolean | 是否还有下一页。 |
