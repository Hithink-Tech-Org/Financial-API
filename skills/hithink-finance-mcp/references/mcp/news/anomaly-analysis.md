# 日期范围异动解读

[业务导航](README.md)

- [日期范围异动解读 · `get_news_anomaly_analysis`](#get_news_anomaly_analysis)

<a id="get_news_anomaly_analysis"></a>
## 日期范围异动解读


工具名：`get_news_anomaly_analysis`

<a id="get_news_anomaly_analysis--工具描述"></a>
### 工具描述

> 查询日期范围异动解读。指定标的最多返回 365 天范围，全量最多 30 天；超范围由数据提供方向结束日期截取，was_truncated 表示截断。四个时间字段保留原值，单位及标的编码格式待核实。空列表也可能表示服务降级，不能据此断言期间没有异动。

<a id="get_news_anomaly_analysis--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `begin_date` | string | 是 | — | 开始日期，格式yyyy-MM-dd。 |
| `end_date` | string | 是 | — | 结束日期，格式yyyy-MM-dd。 |
| `thscode` | string | 否 | — | 按上游要求提供的同花顺标的编码，格式待核实；省略查询全量。 |

<a id="get_news_anomaly_analysis--调用示例"></a>
### 调用示例

```text
工具：get_news_anomaly_analysis
参数：
  - begin_date: "2026-10-01"
  - end_date: "2026-10-15"
```

<a id="get_news_anomaly_analysis--返回"></a>
### 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [日期范围异动解读](#get_news_anomaly_analysis--返回字段)。

<a id="get_news_anomaly_analysis--返回字段"></a>
### 返回字段

<a id="get_news_anomaly_analysis--日期范围异动解读--返回字段"></a>
#### 日期范围异动解读 · 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 异动解读列表 |
| `items[].analysis_id` | string | 异动解读 ID，可作为业务方幂等键使用 |
| `items[].domain` | string 或 null | 域 |
| `items[].analysis_content` | string 或 null | 解读内容 |
| `items[].key_word_list` | array 或 null | 关键词列表 |
| `items[].anomaly_type` | string 或 null | 异动类型 |
| `items[].tag_code` | string 或 null | 标签编码 |
| `items[].tag_name` | string 或 null | 标签名称 |
| `items[].link_url` | string | 相关内容链接地址（结果页地址） |
| `items[].create_time` | integer 或 null | 异动解读发生时间 |
| `items[].last_anomaly_time` | integer 或 null | 最后一次异动时间 |
| `items[].first_publish_time` | integer 或 null | 第一次进行解读的时间 |
| `items[].tag_code_update_time` | integer 或 null | 标签编码变更时间 |
| `was_truncated` | boolean | 响应数据是否被截断；true 表示结果已截断 |
