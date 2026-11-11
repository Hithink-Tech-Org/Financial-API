# 严重异动与重点监控记录

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_special_data_abnormal_monitor_list`
>
> 对应 REST 端点：[`GET /api/a-share/special-data/abnormal-monitor-list`](../../api/a-share/special-data-abnormal-monitor-list.md)


## 工具描述

查询当前或历史异动监控记录。开始和结束日期保留原监控区间，结束日期可为空；类型码 `1`、`2` 对应严重异动，其余为重点监控。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `state` | string | 否 | `current` | current或history |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `30` | 每页1至30条，默认30 |

## 调用示例

```text
工具：get_a_share_special_data_abnormal_monitor_list
参数：
  - state: "current"
  - page: 1
  - size: 30
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [异动监控](../../api/a-share/special-data-abnormal-monitor-list.md)。

代码与名称可能为null或空字符串，按源值返回；缺失值为null，整页记录与顺序保留。
