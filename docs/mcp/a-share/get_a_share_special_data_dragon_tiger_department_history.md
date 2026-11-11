# 营业部历史上榜记录

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_special_data_dragon_tiger_department_history`
>
> 对应 REST 端点：[`GET /api/a-share/special-data/dragon-tiger-department-history`](../../api/a-share/dragon-tiger-department.md#special-data-dragon-tiger-department-history)


## 工具描述

分页查询营业部上榜股票，支持净买入金额档位和排序；同股不同上榜记录分别保留。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `department_id` | string | 是 | — | 营业部业务标识 |
| `page` | integer | 否 | `1` | 从1开始的页码 |
| `size` | integer | 否 | `30` | 每页1至30条，默认30 |
| `min_net_buy_amount` | integer | 否 | — | 净买入金额档位：5000000/30000000/50000000/100000000，单位元 |
| `sort_field` | string | 否 | `trade_date` | 排序字段：trade_date/change_ratio/net_buy_amount |
| `sort_dir` | string | 否 | `desc` | asc或desc |

## 调用示例

```text
工具：get_a_share_special_data_dragon_tiger_department_history
参数：
  - department_id: "Q1218139C1"
  - page: 1
  - size: 30
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [营业部数据](../../api/a-share/dragon-tiger-department.md#special-data-dragon-tiger-department-history)。

代码与名称可能为null或空字符串，按源值返回；缺失值为null，整页记录与顺序保留。
