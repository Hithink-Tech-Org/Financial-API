# 公告详情与解读

[业务导航](README.md)

> **info**
> 工具名：`get_news_notice_detail`
>
> 对应 REST 端点：[`GET /api/news/notice/detail`](../../api/news/notice-detail.md)


## 工具描述

> 返回公告基本信息及结构化解读。report_period、summary、monthly_report_interpretation 可能为 null。公告序号由调用方提供。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |

## 调用示例

```text
工具：get_news_notice_detail
参数：
  - seq: "example-notice-id"
```

## 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [公告详情与解读](../../api/news/notice-detail.md#返回字段)。
