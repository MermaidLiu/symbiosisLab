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

function requireLogin() {
  if (!getToken()) {
    wx.reLaunch({ url: "/pages/login/login" });
    return false;
  }
  return true;
}

module.exports = {
  getToken,
  setSession,
  clearSession,
  getUser,
  requireLogin,
};
