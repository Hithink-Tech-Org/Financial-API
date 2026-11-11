# 期货品种板块

[业务导航](README.md)

- [期货品种板块 · `get_futures_variety_plates_list`](#get_futures_variety_plates_list)

<a id="get_futures_variety_plates_list"></a>
## 期货品种板块


工具名：`get_futures_variety_plates_list`

<a id="get_futures_variety_plates_list--工具描述"></a>
### 工具描述

> 查询期货品种板块资料。

<a id="get_futures_variety_plates_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| — | — | — | — | 无业务参数。 |

<a id="get_futures_variety_plates_list--调用示例"></a>
### 调用示例

```text
工具：get_futures_variety_plates_list
参数：
  {}
```

<a id="get_futures_variety_plates_list--返回"></a>
### 返回

返回期货品种板块列表，字段详见 [期货品种板块](#get_futures_variety_plates_list--返回字段)。

<a id="get_futures_variety_plates_list--返回字段"></a>
### 返回字段

<a id="get_futures_variety_plates_list--期货品种板块--返回字段"></a>
#### 期货品种板块 · 返回字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `timestamp` | long | 数据时间。 |
| `item[]` | array | 品种板块列表；每项含可空的 `variety_code`、`name`、`plate_level`、`plate_name`。 |
