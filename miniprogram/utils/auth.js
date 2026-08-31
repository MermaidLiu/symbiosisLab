const TOKEN_KEY = "symbiosis_token";
const USER_KEY = "symbiosis_user";

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function setSession(token, user) {
  if (token) wx.setStorageSync(TOKEN_KEY, token);
  if (user) wx.setStorageSync(USER_KEY, user);
}

function clearSession() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
}

function getUser() {
  return wx.getStorageSync(USER_KEY) || null;
}

function isLoggedIn() {
  return Boolean(getToken());
}

/** 跳转登录页（用户主动触发，不在首页强制） */
function goLogin(opts) {
  const redirect = (opts && opts.redirect) || "";
  const q = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  wx.navigateTo({ url: `/pages/login/login${q}` });
}

/**
 * 检查登录。默认不自动跳转（满足审核：先浏览再登录）。
 * 传 { redirect: true } 时才跳转登录页。
 */
function requireLogin(opts) {
  if (isLoggedIn()) return true;
  if (opts && opts.redirect) {
    goLogin({ redirect: opts.redirectPath || "" });
  }
  return false;
}

/** 业务操作前：提示用户自行选择是否登录 */
function promptLogin(message) {
  return new Promise((resolve) => {
    if (isLoggedIn()) {
      resolve(true);
      return;
    }
    wx.showModal({
      title: "需要登录",
      content: message || "登录后可使用该功能，是否前往登录？",
      confirmText: "去登录",
      cancelText: "继续浏览",
      success(res) {
        if (res.confirm) goLogin();
        resolve(false);
      },
      fail() {
        resolve(false);
      },
    });
  });
}

module.exports = {
  getToken,
  setSession,
  clearSession,
  getUser,
  isLoggedIn,
  goLogin,
  requireLogin,
  promptLogin,
};
