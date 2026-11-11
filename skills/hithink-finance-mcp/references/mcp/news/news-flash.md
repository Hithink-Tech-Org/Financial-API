# 快讯

[业务导航](README.md)

- [快讯列表 · `get_news_flash_list`](#get_news_flash_list)
- [快讯刷新 · `get_news_flash_refresh`](#get_news_flash_refresh)

<a id="get_news_flash_list"></a>
## 快讯列表


工具名：`get_news_flash_list`

<a id="get_news_flash_list--工具描述"></a>
### 工具描述

> 首屏 seq 传字符串 `0`。后续传入约定序号；单次数量及翻页边界以数据提供方为准。快讯 id、seq 为字符串，tags.id 为整数。

<a id="get_news_flash_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tag_id` | integer | 是 | — | 快讯栏目ID。 |
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |

<a id="get_news_flash_list--调用示例"></a>
### 调用示例

```text
工具：get_news_flash_list
参数：
  - tag_id: 21103
  - seq: "0"
```

<a id="get_news_flash_list--返回"></a>
### 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [快讯](#get_news_flash_list--返回字段)。

<a id="get_news_flash_list--返回字段"></a>
### 返回字段

<a id="get_news_flash_list--快讯列表--返回字段"></a>
#### 快讯列表 · 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 快讯列表。 |
| `items[].id` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].seq` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].title` | string | 快讯标题。 |
| `items[].encoded_url` | string | 密文文章详情跳转地址，非空。 |
| `items[].summary` | string 或 null | 快讯摘要。 |
| `items[].tags` | array | 快讯栏目标签。 |
| `items[].tags[].id` | integer | 栏目标签 ID，保持上游整数类型。 |
| `items[].tags[].name` | string | 栏目名称。 |
| `items[].type` | integer | 快讯类型。 |
| `items[].create_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `items[].update_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `items[].pic_url` | string 或 null | 封面地址，无配图时可能为空。 |

<a id="get_news_flash_refresh"></a>
## 快讯刷新


工具名：`get_news_flash_refresh`

<a id="get_news_flash_refresh--工具描述"></a>
### 工具描述

> 传入已知最新 seq 和创建时间。create_time_ms 为毫秒值，须能整除 1000；调用方按业务需要处理重复记录。

<a id="get_news_flash_refresh--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `tag_id` | integer | 是 | — | 快讯栏目ID。 |
| `seq` | string | 是 | — | 不透明序号；快讯首屏传字符串0。 |
| `create_time_ms` | integer | 是 | — | 客户端已知快讯创建时间，毫秒值须能整除1000。 |

<a id="get_news_flash_refresh--调用示例"></a>
### 调用示例

```text
工具：get_news_flash_refresh
参数：
  - tag_id: 21103
  - seq: "667642844"
  - create_time_ms: 1788868800000
```

<a id="get_news_flash_refresh--返回"></a>
### 返回

返回统一响应信封，data 包含内容及相应游标或截断标记。字段、时间与空值规则见 [快讯](#get_news_flash_refresh--返回字段)。

<a id="get_news_flash_refresh--返回字段"></a>
### 返回字段

<a id="get_news_flash_refresh--快讯刷新--返回字段"></a>
#### 快讯刷新 · 返回字段

`data` 及其嵌套字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `items` | array | 快讯列表。 |
| `items[].id` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].seq` | string | 不透明标识的十进制字符串，精确保留上游整数各位。 |
| `items[].title` | string | 快讯标题。 |
| `items[].encoded_url` | string | 密文文章详情跳转地址，非空。 |
| `items[].summary` | string 或 null | 快讯摘要。 |
| `items[].tags` | array | 快讯栏目标签。 |
| `items[].tags[].id` | integer | 栏目标签 ID，保持上游整数类型。 |
| `items[].tags[].name` | string | 栏目名称。 |
| `items[].type` | integer | 快讯类型。 |
| `items[].create_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `items[].update_time_ms` | integer | Unix毫秒级时间戳；由上游秒级值精确乘1000。 |
| `items[].pic_url` | string 或 null | 封面地址，无配图时可能为空。 |
