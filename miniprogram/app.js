App({
  globalData: {
    user: null,
  },
  onLaunch() {
    const { getUser, getToken, clearSession } = require("./utils/auth");
    const { isInsecureApiBase } = require("./utils/config");

    // HTTP/IP 在体验版真机不可用：清掉旧登录，避免闪一下登录页又跳进工作台
    if (isInsecureApiBase()) {
      clearSession();
      this.globalData.user = null;
      return;
    }

    if (getToken()) {
      this.globalData.user = getUser();
    }
  },
});
