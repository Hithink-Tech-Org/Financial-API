# 营业部经典战绩

[业务导航](README.md)

> **info**
> 工具名：`get_a_share_special_data_dragon_tiger_department_classic_record`
>
> 对应 REST 端点：[`GET /api/a-share/special-data/dragon-tiger-department-classic-record`](../../api/a-share/dragon-tiger-department.md#special-data-dragon-tiger-department-classic-record)


## 工具描述

查询营业部身份及一条代表战绩。无代表战绩时，`classic_record` 为 `null`。

## 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `department_id` | string | 是 | — | 营业部业务标识 |

## 调用示例

```text
工具：get_a_share_special_data_dragon_tiger_department_classic_record
参数：
  - department_id: "Q1218139C1"
```

## 返回

返回统一响应信封中的数据对象。详细字段见 [营业部数据](../../api/a-share/dragon-tiger-department.md#special-data-dragon-tiger-department-classic-record)。
