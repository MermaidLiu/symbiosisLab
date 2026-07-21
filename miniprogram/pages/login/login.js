const { api } = require("../../utils/api");
const { setSession, getToken } = require("../../utils/auth");

Page({
  data: {
    email: "student@lab.edu.cn",
    password: "demo123",
    loading: false,
  },

  onShow() {
    if (getToken()) {
      wx.switchTab({ url: "/pages/home/home" });
    }
  },

  onEmail(e) {
    this.setData({ email: e.detail.value });
  },

  onPassword(e) {
    this.setData({ password: e.detail.value });
  },

  async onLogin() {
    const email = (this.data.email || "").trim();
    const password = this.data.password || "";
    if (!email || !password) {
      wx.showToast({ title: "请输入邮箱和密码", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await api.login(email, password);
      if (!res.token) {
        wx.showModal({
          title: "服务器未就绪",
          content:
            "当前线上后端未返回登录 token（小程序无法使用网页 Cookie）。请将最新代码部署到服务器后再试。",
          showCancel: false,
        });
        return;
      }
      setSession(res.token, res.user);
      getApp().globalData.user = res.user;
      wx.showToast({ title: "登录成功", icon: "success" });
      setTimeout(() => wx.switchTab({ url: "/pages/home/home" }), 300);
    } catch (err) {
      const msg =
        err.code === "invalid_credentials"
          ? "邮箱或密码错误"
          : err.code === "network_error"
            ? "无法连接服务器：请在开发者工具勾选「不校验合法域名」，并确认 API 地址正确"
            : err.code === "bad_response"
              ? "接口返回异常，请检查 API_BASE 是否含 /symbiosis/lab"
              : "登录失败";
      wx.showToast({ title: msg, icon: "none", duration: 3000 });
    } finally {
      this.setData({ loading: false });
    }
  },
});
