# Symbiosis Lab 微信小程序（一期）

AppID：`wxb4ad423abf19b61f`

与网页端共用同一套后端 API 与账号数据。

## 一期功能

- 登录 / 退出（Bearer token）
- 工作台概览
- 仪器列表与预约
- 我的预约（查看 / 取消）
- 代管动物（名下列表、状态文案与果冻色）
- 通知（已读 / 全部已读）

## 本地联调

1. 在仓库根目录启动网页后端：

```bash
npm run dev
```

默认 API：见 `utils/config.js`（当前正式地址：`https://daigroup.org/lab`）。

> **重要**：小程序登录依赖接口返回 `token` 字段。请确保服务器已部署包含 Bearer 登录的最新后端；仅更新小程序不够。

2. 打开 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
3. **导入目录请选 `miniprogram/`**（不要只选仓库根目录；若选根目录，需依赖根目录的 `project.config.json` 里 `miniprogramRoot`）
4. 填写 AppID：`wxb4ad423abf19b61f`
5. 详情 → 本地设置 → 勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**
6. 若预览报 `functionalPages`：菜单「工具 → 清除缓存 → 全部清除」，关闭项目后重新导入 `miniprogram/`，再点预览

真机预览时，HTTP IP 地址在部分环境下仍可能被拦截；正式上线请使用 **HTTPS** 域名并在微信后台配置 request 合法域名。

## 上线前（必须 HTTPS 域名）

微信提审不能使用 IP / HTTP。请按仓库文档操作：

→ [docs/小程序域名HTTPS上手.md](../docs/小程序域名HTTPS上手.md)

摘要：

1. 域名 `daigroup.org` 已备案并配置 HTTPS  
2. 微信公众平台 → 开发管理 → 开发设置 → **request 合法域名** 添加：`https://daigroup.org`（不要带路径）  
3. `utils/config.js` 的 `API_BASE` 已为：`https://daigroup.org/lab`  
4. 开发者工具重新编译 → **上传** → 设为体验版 / 提交审核

## 演示账号

与网页端相同，例如：

- `student@lab.edu.cn` / `demo123`
- `student1@lab.edu.cn` / `demo123`
