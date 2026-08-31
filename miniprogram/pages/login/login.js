const { api } = require("../../utils/api");
const { setSession, getToken, clearSession } = require("../../utils/auth");
const { API_BASE, isInsecureApiBase } = require("../../utils/config");

function afterLogin(user) {
  getApp().globalData.user = user;
  const st = (user && user.accountStatus) || "active";
  if (st === "pending_profile" || st === "rejected") {
    wx.redirectTo({ url: "/pages/realname/realname" });
    return;
  }
  if (st === "pending_review" || st === "disabled") {
    wx.redirectTo({ url: "/pages/realname/realname" });
    return;
  }
  wx.switchTab({ url: "/pages/home/home" });
}

Page({
  data: {
    mode: "phone",
    phone: "",
    code: "",
    email: "student@lab.edu.cn",
    password: "demo123",
    loading: false,
    sending: false,
    checking: false,
    countdown: 0,
    smsHint: "",
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
        afterLogin(res.user);
      }
    } catch (_) {
      clearSession();
      getApp().globalData.user = null;
    } finally {
      this.setData({ checking: false });
    }
  },

  onPhone(e) {
    this.setData({ phone: e.detail.value });
  },
  onCode(e) {
    this.setData({ code: e.detail.value });
  },
  onEmail(e) {
    this.setData({ email: e.detail.value });
  },
  onPassword(e) {
    this.setData({ password: e.detail.value });
  },
  toggleMode() {
    this.setData({ mode: this.data.mode === "phone" ? "password" : "phone" });
  },

  tickCountdown() {
    if (this.data.countdown <= 0) return;
    setTimeout(() => {
      this.setData({ countdown: this.data.countdown - 1 });
      this.tickCountdown();
    }, 1000);
  },

  async onSendSms() {
    if (isInsecureApiBase()) return;
    this.setData({ sending: true, smsHint: "" });
    try {
      const res = await api.sendSms(this.data.phone);
      this.setData({
        countdown: 60,
        smsHint: res.mockCode ? `演示验证码：${res.mockCode}` : "验证码已发送",
        code: res.mockCode || this.data.code,
      });
      this.tickCountdown();
    } catch (e) {
      wx.showToast({ title: e.code || "发送失败", icon: "none" });
    } finally {
      this.setData({ sending: false });
    }
  },

  async onPhoneLogin() {
    if (isInsecureApiBase()) {
      wx.showModal({
        title: "无法登录",
        content: `请使用 HTTPS 域名。\n${API_BASE}`,
        showCancel: false,
      });
      return;
    }
    const phone = (this.data.phone || "").trim();
    const code = (this.data.code || "").trim();
    if (!phone || !code) {
      wx.showToast({ title: "请输入手机号和验证码", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await api.phoneLogin(phone, code);
      const token = (res && res.token) || "";
      if (!token) throw Object.assign(new Error("no_token"), { code: "no_token" });
      setSession(token, res.user);
      wx.showToast({ title: "登录成功", icon: "success" });
      setTimeout(() => afterLogin(res.user), 300);
    } catch (err) {
      wx.showModal({
        title: "登录失败",
        content: String(err.code || err.message || "unknown"),
        showCancel: false,
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onLogin() {
    if (isInsecureApiBase()) return;
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
      if (!token) throw Object.assign(new Error("no_token"), { code: "no_token" });
      setSession(token, res.user);
      setTimeout(() => afterLogin(res.user), 300);
    } catch (err) {
      wx.showModal({
        title: "登录失败",
        content: String(err.code || err.message || "unknown"),
        showCancel: false,
      });
    } finally {
      this.setData({ loading: false });
    }
  },
});
