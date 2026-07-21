const { API_BASE } = require("./config");
const { getToken, clearSession } = require("./auth");

function request(path, options = {}) {
  const { method = "GET", data, silent } = options;
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${path}`,
      method,
      data,
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(res) {
        const body = res.data || {};
        // 部分网关返回 HTML 字符串
        if (typeof body === "string") {
          reject(
            Object.assign(new Error("bad_response"), {
              status: res.statusCode,
              code: "bad_response",
            })
          );
          return;
        }
        if (res.statusCode === 401) {
          clearSession();
          if (!silent) {
            wx.showToast({ title: "请重新登录", icon: "none" });
            setTimeout(() => wx.reLaunch({ url: "/pages/login/login" }), 400);
          }
          reject(Object.assign(new Error("unauthorized"), { status: 401, code: "unauthorized" }));
          return;
        }
        if (res.statusCode >= 400) {
          const code = body.error || `http_${res.statusCode}`;
          reject(Object.assign(new Error(code), { status: res.statusCode, code }));
          return;
        }
        resolve(body);
      },
      fail(err) {
        const msg = (err && (err.errMsg || err.message)) || "network_error";
        reject(
          Object.assign(new Error("network_error"), {
            code: "network_error",
            cause: err,
            errMsg: msg,
          })
        );
      },
    });
  });
}

const api = {
  login(email, password) {
    return request("/api/auth", {
      method: "POST",
      data: { action: "login", email, password },
      silent: true,
    });
  },
  me() {
    return request("/api/auth");
  },
  logout() {
    return request("/api/auth", { method: "POST", data: { action: "logout" }, silent: true });
  },
  instruments() {
    return request("/api/instruments");
  },
  instrument(id) {
    return request(`/api/instruments/${encodeURIComponent(id)}`);
  },
  bookings() {
    return request("/api/bookings");
  },
  createBooking(payload) {
    return request("/api/bookings", { method: "POST", data: payload });
  },
  updateBooking(id, status) {
    return request("/api/bookings", { method: "PATCH", data: { id, status } });
  },
  managedAnimals() {
    return request("/api/managed-animals");
  },
  updateManagedAnimal(id, data) {
    return request(`/api/managed-animals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      data,
    });
  },
  notifications() {
    return request("/api/notifications");
  },
  markNotification(id, action = "read") {
    return request("/api/notifications", { method: "PATCH", data: { id, action } });
  },
  markAllNotificationsRead() {
    return request("/api/notifications", {
      method: "PATCH",
      data: { action: "mark_all_read" },
    });
  },
};

module.exports = { api, request };
