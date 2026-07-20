# 数据导入模板说明

本目录提供可直接填写的 CSV 模板。

| 模板文件 | 用途 | 谁可以导入 | 平台入口 |
|----------|------|------------|----------|
| [小鼠批量导入模板.csv](./小鼠批量导入模板.csv) | 代管小鼠（Surgery & Recording） | **全体登录用户** | 代管动物 → 批量上传 |
| [仪器批量导入模板.csv](./仪器批量导入模板.csv) | 仪器台账 | **全体登录用户** | 仪器管理 → 导入 CSV |

---

## 通用格式要求

1. **文件类型**：`.csv`（UTF-8）  
2. **首行必须是表头**  
3. 不要合并单元格；一行动物 / 一台仪器  

---

## 一、小鼠批量导入（标准：Surgery & Recording）

全员统一使用下列列（与吴淑颖同学表格一致）：

```text
Status,Name,Implantation Day,Tracking Days,Stages,Previous date,Repeat,Next date
```

| 列名 | 说明 |
|------|------|
| `Status` | `Living` / `Dead` / `Waiting` / `Optotaging`（也支持 Optotagging） |
| `Name` | 小鼠编号，全局唯一（如 `WSY117`） |
| `Implantation Day` | 植入日期。支持 `2025年5月21日` 或 `2025-05-21` |
| `Tracking Days` | 追踪天数（可填；系统也会按「上次日期−植入日期」计算） |
| `Stages` | 阶段，如 `1M` / `2M` / `3M` / `6M` / `1Y` / `2Y`；可空 |
| `Previous date` | 上次日期 |
| `Repeat` | 重复间隔（天），如 `7`；可空 |
| `Next date` | 下次日期；可空 |

### 注意

- 学生上传后，小鼠自动归到**本人名下**。  
- `Dead` → 记为死亡；`Waiting` → 预留；`Living` / `Optotaging` → 在养信号鼠。  
- 旧版中文列名仍尽量兼容，但新数据请一律用上表。

---

## 二、仪器批量导入

见 [仪器批量导入模板.csv](./仪器批量导入模板.csv) 与手册第八章。
