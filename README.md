# Symbiosis Lab

实验室资源管理平台 — 仪器预约 & 小动物管理

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)

## 功能概览

| 模块 | 能力 |
|------|------|
| **仪器管理** | 列表 / 详情、配件与培训要求、Teamup 风格周日历拖拽预约、15/30/60 分钟粒度、预约历史导出 |
| **小动物管理** | 代管动物（列表/网格、列设置）、笼位可视化、操作申请工作流、暂存车 |
| **预约审批** | 待审批通知、批准 / 拒绝、原子时段冲突检测 |
| **权限与审计** | 多角色、按负责人范围的审批日志、全量操作日志 |
| **工作台** | 按角色展示（学生资源概览 / 负责人审批面板 / 管理员全局） |
| **国际化** | 中文 / English 切换 |

## 角色

| 角色 | 说明 |
|------|------|
| `super_admin` | 总管理员，用户角色配置、全局数据 |
| `instrument_manager` | 仪器负责人，管理仪器与相关预约审批 |
| `animal_manager` | 动物负责人，管理动物资源与相关审批 |
| `user` | 普通用户，预约与代管申请 |

支持同一账号多角色。

## 演示账号

| 邮箱 | 密码 | 角色 |
|------|------|------|
| `admin@lab.edu.cn` | `admin123` | 总管理员 |
| `instrument@lab.edu.cn` | `demo123` | 仪器负责人 |
| `animal@lab.edu.cn` | `demo123` | 动物负责人 |
| `student@lab.edu.cn` | `demo123` | 普通用户 |

## 快速开始

```bash
# 克隆
git clone https://github.com/MermaidLiu/symbiosisLab.git
cd symbiosisLab

# 安装依赖
npm install

# 开发模式
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。首次访问会自动创建 `data/db.json` 并写入种子数据。

```bash
# 生产构建
npm run build
npm start
```

## 技术栈

- **前端**：Next.js 15 (App Router)、React 19、Tailwind CSS、TypeScript
- **后端**：Next.js Route Handlers（`src/app/api/*`）
- **存储**：服务端 JSON 文件库 `data/db.json`（写操作串行队列 + 预约原子冲突检查）
- **鉴权**：HttpOnly Cookie Session、密码 SHA-256 + salt
- **UI**：Fluent 毛玻璃风格，主题色清华紫 `#660874` + 清华黄 `#FFC72C`

## 项目结构

```
src/
├── app/
│   ├── api/              # REST API（auth / instruments / bookings / …）
│   ├── (main)/           # 登录后业务页面
│   ├── login/            # 登录
│   └── register/         # 注册
├── components/           # UI 组件（日历、仪表盘、动物管理等）
├── context/              # Auth / Data / AnimalCart
├── lib/
│   ├── api/client.ts     # 前端 API 客户端
│   └── storage/db.ts     # 客户端缓存（由 bootstrap 填充）
├── server/               # 服务端 store / auth / booking 原子逻辑
├── types/                # TypeScript 类型
└── i18n/                 # 中英文字典
data/
└── db.json               # 运行时数据库（gitignore，本地自动生成）
```

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth` | `login` / `register` / `logout` |
| `GET` | `/api/auth` | 当前登录用户 |
| `GET` | `/api/bootstrap` | 登录后一次性拉取业务数据 |
| `GET/POST/PATCH/DELETE` | `/api/instruments`、`/api/animals` | 仪器 / 动物资源 |
| `GET/POST/PATCH` | `/api/bookings` | 预约（含原子冲突检查） |
| `GET/PATCH` | `/api/notifications`、`/api/logs`、`/api/users` | 通知、日志、用户角色 |
| `GET/POST/DELETE` | `/api/applications` | 操作申请 |
| `GET` | `/api/managed-animals`、`/api/cages` | 代管动物、笼位 |

## 部署说明

- 默认 **单机单进程**：JSON 文件存储适合约百人规模的演示 / 实验室内网使用。
- 部署时请持久化挂载 `data/` 目录，并保证进程可写。
- `data/db.json` 不入库；删除该文件并重启即可重置为种子数据。
- 多副本负载均衡前，建议迁移至 PostgreSQL / MySQL 等正式数据库。

## 许可证

MIT
