const { api } = require("../../utils/api");
const { setSession, getToken, clearSession } = require("../../utils/auth");
const { API_BASE, isInsecureApiBase } = require("../../utils/config");

Page({
  data: {
    email: "student@lab.edu.cn",
    password: "demo123",
    loading: false,
    checking: false,
    apiBase: API_BASE,
    insecureApi: isInsecureApiBase(),
  },

  onLoad(query) {
    if (query && (query.force === "1" || query.force === "true")) {
      clearSession();
      getApp().globalData.user = null;
    }
    if (isInsecureApiBase()) {
      clearSession();
      getApp().globalData.user = null;
    }
  },

  async onShow() {
    // 体验版 + HTTP/IP：绝不过自动跳转，必须停在登录页提示
    if (isInsecureApiBase()) {
      clearSession();
      getApp().globalData.user = null;
      this.setData({ insecureApi: true, checking: false });
      return;
    }

    const token = getToken();
    if (!token) return;

    this.setData({ checking: true });
    try {
      const res = await api.me();
      if (res && res.user) {
        setSession(token, res.user);
        getApp().globalData.user = res.user;
        wx.switchTab({ url: "/pages/home/home" });
      }
    } catch (_) {
      clearSession();
      getApp().globalData.user = null;
    } finally {
      this.setData({ checking: false });
    }
  },

  onEmail(e) {
    this.setData({ email: e.detail.value });
  },

  onPassword(e) {
    this.setData({ password: e.detail.value });
  },

  async onLogin() {
    if (isInsecureApiBase()) {
      wx.showModal({
        title: "无法登录",
        content:
          "当前 API 仍是 HTTP/IP，体验版和正式版都不能访问。\n请先配置 HTTPS 域名，再修改 utils/config.js 后重新上传。\n\n" +
          API_BASE,
        showCancel: false,
      });
      return;
    }

    const email = (this.data.email || "").trim();
    const password = this.data.password || "";
    if (!email || !password) {
      wx.showToast({ title: "请输入邮箱和密码", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await api.login(email, password);
      const token = (res && res.token) || "";
      if (!token) {
        wx.showModal({
          title: "登录异常",
          content: `接口未返回 token。\nAPI: ${API_BASE}\n响应: ${JSON.stringify(res).slice(0, 180)}`,
          showCancel: false,
        });
        return;
      }
      setSession(token, res.user);
      getApp().globalData.user = res.user;
      wx.showToast({ title: "登录成功", icon: "success" });
      setTimeout(() => wx.switchTab({ url: "/pages/home/home" }), 300);
    } catch (err) {
      const detail = err.detail || err.errMsg || err.code || "";
      const isDomain =
        String(detail).includes("domain list") || String(detail).includes("url not in");
      const content =
        err.code === "invalid_credentials"
          ? "邮箱或密码错误"
          : isDomain || err.code === "network_error"
            ? `无法连接服务器（体验版必须用 HTTPS 域名）。\n\n${detail}\n${API_BASE}`
            : `登录失败：${err.code || "unknown"}\n${detail}\n${API_BASE}`;
      wx.showModal({
        title: "登录失败",
        content: content.slice(0, 500),
        showCancel: false,
      });
    } finally {
      this.setData({ loading: false });
    }
  },
});
