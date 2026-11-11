# 异动股票

[业务导航](README.md)

- [严重异动与重点监控记录 · `get_a_share_special_data_abnormal_monitor_list`](#get_a_share_special_data_abnormal_monitor_list)

<a id="get_a_share_special_data_abnormal_monitor_list"></a>
## 严重异动与重点监控记录


工具名：`get_a_share_special_data_abnormal_monitor_list`

<a id="get_a_share_special_data_abnormal_monitor_list--工具描述"></a>
### 工具描述

查询当前或历史异动监控记录。开始和结束日期保留原监控区间，结束日期可为空；类型码 `1`、`2` 对应严重异动，其余为重点监控。

<a id="get_a_share_special_data_abnormal_monitor_list--参数"></a>
### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `state` | string | 否 | `current` | current或history |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `30` | 每页1至30条，默认30 |

<a id="get_a_share_special_data_abnormal_monitor_list--调用示例"></a>
### 调用示例

```text
工具：get_a_share_special_data_abnormal_monitor_list
参数：
  - state: "current"
  - page: 1
  - size: 30
```

<a id="get_a_share_special_data_abnormal_monitor_list--返回"></a>
### 返回

返回统一响应信封中的数据对象。详细字段见 [异动监控](#get_a_share_special_data_abnormal_monitor_list--返回字段)。

代码与名称可能为null或空字符串，按源值返回；缺失值为null，整页记录与顺序保留。

<a id="get_a_share_special_data_abnormal_monitor_list--返回字段"></a>
### 返回字段

<a id="get_a_share_special_data_abnormal_monitor_list--异动股票--返回字段"></a>
#### 异动股票 · 返回字段

**`data` 元数据**

| 字段 | 类型 | 说明 |
|---|---|---|
| `item` | array | 业务记录列表 |
| `pagination` | object | 分页对象，包含page、size、total和has_next |

**`data.item[]` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `thscode` | string \| null | 股票标准代码 ；源null或空字符串原样保留，缺失值为null |
| `name` | string \| null | 股票名称 ；源null或空字符串原样保留，缺失值为null |
| `start_date_ms` | integer | 监控开始日期；单位：毫秒 |
| `end_date_ms` | integer \| null | 结束日期；单位：毫秒 |
| `monitor_type` | integer | 原始业务类型码 |
| `monitor_label` | string | 1/2=严重异动，其它=重点监控 |

**`data.pagination` 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 从1开始的页码 |
| `size` | integer | 本页请求大小 |
| `total` | integer \| null | 结果总数；未提供时为null |
| `has_next` | boolean | 是否存在后续页 |
