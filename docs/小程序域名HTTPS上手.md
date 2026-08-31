# 小程序上线：便宜域名 + 免费 HTTPS（实验室）

当前服务器 IP：`122.51.204.136`  
正式 HTTPS 入口：`https://daigroup.org/lab`  
小程序 AppID：`wxb4ad423abf19b61f`

> 域名必须由**你们账号**实名购买与备案，AI 无法代付。按下面做，大约几十元/年 + 免费证书即可提审。

---

## 0. 先知道两件硬条件

1. 微信小程序 **request 合法域名** 必须是 `https://域名`，不能是 IP，不能是 http。
2. 服务器在国内（你们这台是）时，域名一般要做 **ICP 备案** 才能稳定配进微信后台。备案通常 **几天～十几天**，比买域名久。

---

## 1. 买域名（约几十元/年）

任选一个（推荐与云服务器同一家，解析省事）：

| 平台 | 入口 |
|------|------|
| 腾讯云 | https://dnspod.cloud.tencent.com/ |
| 阿里云 | https://wanwang.aliyun.com/ |

建议：

- 买一个短一点的 `.com` 或活动价 `.cn`（注意 `.cn` 备案材料要求可能更严）
- 完成 **个人/企业实名认证**（必做）
- 记下域名，例如：`symbiosis-lab.com`

价格随活动浮动，常见一年大约 **¥30～¥80**。

---

## 2. DNS 解析到现有服务器

在域名解析控制台新增 **A 记录**：

| 主机记录 | 类型 | 记录值 |
|----------|------|--------|
| `@` | A | `122.51.204.136` |
| `www`（可选） | A | `122.51.204.136` |

等 5～30 分钟，本机测试：

```bash
ping 你的域名
# 应解析到 122.51.204.136
```

---

## 3. ICP 备案（国内服务器必做）

- 腾讯云：https://console.cloud.tencent.com/beian  
- 阿里云：https://beian.aliyun.com/

按向导提交（主体信息、网站信息、服务器、域名）。  
备案通过前，有些厂商会阻断 80/443 或微信加不了域名——**先备案再提审**最稳。

---

## 4. 申请免费 SSL 证书

### 方式 A：云厂商免费 DV 证书（推荐，省事）

腾讯云 / 阿里云 → SSL 证书 → 免费型 DV → 绑定域名 → 下载 **Nginx** 格式  
得到例如：

- `your.domain_bundle.crt`（或 `.pem`）
- `your.domain.key`

上传到服务器，例如：

```text
/etc/nginx/ssl/symbiosis.crt
/etc/nginx/ssl/symbiosis.key
```

### 方式 B：Let’s Encrypt（certbot）

服务器上：

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

会自动改 Nginx 并续期。

---

## 5. 配置 Nginx HTTPS（服务器上操作）

仓库里有模板：`deploy/nginx-symbiosis-https.conf.example`  

1. 复制到服务器并改域名、证书路径  
2. 确认原来的 Next 应用仍在本地端口（常见 `3000`）或已有 upstream  
3. 测试并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

浏览器访问：

```text
https://你的域名/symbiosis/lab
```

应能打开与原来 HTTP 相同的网页。

HTTP 可 301 跳到 HTTPS（模板里已写）。

---

## 6. 微信公众平台加合法域名

1. 打开 https://mp.weixin.qq.com → 你的小程序  
2. **开发管理 → 开发设置 → 服务器域名**  
3. **request 合法域名** 添加（不要带路径、不要端口）：

```text
https://你的域名
```

注意：只填协议+主机名，例如 `https://symbiosis-lab.com`。

---

## 7. 改小程序 API 地址并重新上传

编辑 `miniprogram/utils/config.js`：

```js
const API_BASE = "https://你的域名/symbiosis/lab";
```

然后：

1. 微信开发者工具重新编译  
2. 上传代码  
3. 提交审核  

开发阶段可暂时保留「不校验合法域名」；提审/正式版以微信后台配置为准。

---

## 8. 你买好域名后把名字发我

例如发：`https://xxx.com/symbiosis/lab`  

我可以直接帮你改好仓库里的 `config.js` 并整理提交说明。

---

## 常见坑

| 现象 | 原因 |
|------|------|
| 微信后台加不了域名 | 未备案 / 未 ICP / 域名未解析到该账号下服务器 |
| 证书报错 | 证书域名与访问域名不一致，或只配了 www 没配根域 |
| 小程序仍报 domain list | `API_BASE` 还是 http/IP，或合法域名没填对、未重新上传 |
| 网页 HTTPS 通、接口 404 | `location /symbiosis/lab` 与 Next `basePath` 不一致，对照现有 HTTP Nginx 配置改 |
