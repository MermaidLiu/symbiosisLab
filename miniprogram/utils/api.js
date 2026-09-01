const { API_BASE } = require("./config");
const { getToken, clearSession } = require("./auth");

const SESSION_COOKIE = "symbiosis_session";

function parseBody(data) {
  if (data == null || data === "") return {};
  if (typeof data === "object") return data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (_) {
      return { raw: data.slice(0, 200) };
    }
  }
  return {};
}

/** From JSON token, Set-Cookie header, or res.cookies[] */
function extractToken(res, body) {
  if (body && typeof body.token === "string" && body.token.trim()) {
    return body.token.trim();
  }
  const cookies = res.cookies;
  if (Array.isArray(cookies)) {
    for (const c of cookies) {
      const m = String(c).match(new RegExp(`${SESSION_COOKIE}=([^;\\s]+)`));
      if (m) return m[1];
    }
  }
  const header = res.header || res.headers || {};
  const setCookie =
    header["Set-Cookie"] ||
    header["set-cookie"] ||
    header["Set-cookie"] ||
    "";
  const raw = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
  const m = raw.match(new RegExp(`${SESSION_COOKIE}=([^;\\s]+)`));
  return m ? m[1] : "";
}

function request(path, options = {}) {
  const { method = "GET", data, silent } = options;
  const token = getToken();
  const url = `${API_BASE}${path}`;

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
              Cookie: `${SESSION_COOKIE}=${token}`,
              "X-Symbiosis-Token": token,
            }
          : {}),
      },
      success(res) {
        const body = parseBody(res.data);
        if (body.raw && !body.user && !body.token && !body.error) {
          reject(
            Object.assign(new Error("bad_response"), {
              status: res.statusCode,
              code: "bad_response",
              detail: `非 JSON 响应 (${res.statusCode}) ${String(body.raw).slice(0, 80)}`,
              url,
            })
          );
          return;
        }
        if (res.statusCode === 401) {
          clearSession();
          if (!silent) {
            wx.showToast({ title: "登录已失效，可继续浏览", icon: "none" });
            // 不强制跳登录页（审核要求：先浏览再自愿登录）
          }
          reject(
            Object.assign(new Error("unauthorized"), {
              status: 401,
              code: "unauthorized",
              url,
            })
          );
          return;
        }
        if (res.statusCode >= 400) {
          const code = body.error || `http_${res.statusCode}`;
          reject(
            Object.assign(new Error(code), {
              status: res.statusCode,
              code,
              detail: JSON.stringify(body).slice(0, 120),
              url,
            })
          );
          return;
        }
        // 登录等场景：补齐 token 字段
        const tok = extractToken(res, body);
        if (tok && !body.token) body.token = tok;
        resolve(body);
      },
      fail(err) {
        const msg = (err && (err.errMsg || err.message)) || "network_error";
        reject(
          Object.assign(new Error("network_error"), {
            code: "network_error",
            cause: err,
            errMsg: msg,
            detail: msg,
            url,
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
  sendSms(phone) {
    return request("/api/auth", {
      method: "POST",
      data: { action: "send_sms", phone },
      silent: true,
    });
  },
  phoneLogin(phone, code) {
    return request("/api/auth", {
      method: "POST",
      data: { action: "phone_login", phone, code },
      silent: true,
    });
  },
  submitRealname(payload) {
    return request("/api/auth", {
      method: "POST",
      data: { action: "submit_realname", ...payload },
    });
  },
  updateProfile(payload) {
    return request("/api/auth", {
      method: "POST",
      data: { action: "update_profile", ...payload },
    });
  },
  me() {
    return request("/api/auth");
  },
  users() {
    return request("/api/users");
  },
  createAnimalOpTask(payload) {
    return request("/api/animal-op-tasks", { method: "POST", data: payload });
  },
  deleteManagedAnimal(id) {
    return request(`/api/managed-animals?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
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
  dailyLog(year, month) {
    return request(`/api/daily-log?year=${year}&month=${month}`);
  },
  lifecycleLookup(animalId) {
    return request(`/api/animal-lifecycle?animalId=${encodeURIComponent(animalId)}`);
  },
  lifecycleAction(action, payload) {
    return request("/api/animal-lifecycle", {
      method: "POST",
      data: { action, ...payload },
    });
  },
  createExperimentOperation(payload) {
    return request("/api/experiment-operations", { method: "POST", data: payload });
  },
  patchExperimentOperation(id, action, extra) {
    return request("/api/experiment-operations", {
      method: "PATCH",
      data: { id, action, ...extra },
    });
  },
};

module.exports = { api, request, extractToken };
