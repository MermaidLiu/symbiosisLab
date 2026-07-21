App({
  globalData: {
    user: null,
  },
  onLaunch() {
    const { getUser, getToken } = require("./utils/auth");
    if (getToken()) {
      this.globalData.user = getUser();
    }
  },
});
