# 公告详情与解读

[业务导航](README.md)

- [公告详情与解读 · `get_news_notice_detail`](#get_news_notice_detail)

<a id="get_news_notice_detail"></a>
## 公告详情与解读


工具名：`get_news_notice_detail`

<a id="get_news_notice_detail--工具描述"></a>
### 工具描述

> 返回公告基本信息及结构化解读。report_period、summary、monthly_report_interpretation 可能为 null。公告序号由调用方提供。

<a id="get_news_notice_detail--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |

<a id="get_news_notice_detail--调用示例"></a>
### 调用示例

```text
工具：get_news_notice_detail
参数：
  - seq: "example-notice-id"
```

<a id="get_news_notice_detail--返回"></a>
### 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [公告详情与解读](#get_news_notice_detail--返回字段)。

<a id="get_news_notice_detail--返回字段"></a>
### 返回字段

<a id="get_news_notice_detail--公告详情与解读--返回字段"></a>
#### 公告详情与解读 · 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `seq` | string | 公告序号。 |
| `guid` | string 或 null | 公告 GUID。 |
| `title` | string | 公告标题。 |
| `report_period` | string 或 null | 报告期，仅财报类公告有值。 |
| `summary` | object 或 null | 公告解读。 |
| `summary.notice_type` | string | 公告类型。 |
| `summary.items` | array | 解读项列表。 |
| `summary.items[].title` | string | 解读项标题。 |
| `summary.items[].content` | string | 解读项内容。 |
| `monthly_report_interpretation` | object 或 null | 月度公告解读。 |
| `monthly_report_interpretation.notice_type` | string | 公告类型。 |
| `monthly_report_interpretation.has_findings` | boolean | 是否有解读发现。 |
| `monthly_report_interpretation.findings` | array | 解读发现列表。 |
| `monthly_report_interpretation.findings[].title` | string | 发现标题。 |
| `monthly_report_interpretation.findings[].blocks` | array | 发现内容块。 |
| `monthly_report_interpretation.findings[].blocks[].sub_title` | string | 内容块小标题。 |
| `monthly_report_interpretation.findings[].blocks[].content_html` | string | 内容块 HTML。 |
| `monthly_report_interpretation.summary_html` | string | 月度解读摘要 HTML。 |
