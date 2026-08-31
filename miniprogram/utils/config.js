/** 部署环境 API 根路径（不要末尾斜杠） */
const API_BASE = "https://daigroup.org/lab";

/** 体验版/正式版不能用 HTTP 或纯 IP，需换成 https://你的域名/... */
function isInsecureApiBase(base = API_BASE) {
  const b = String(base || "");
  if (!b) return true;
  if (/^http:\/\//i.test(b)) return true;
  try {
    const withoutProto = b.replace(/^https?:\/\//i, "");
    const host = withoutProto.split("/")[0].split(":")[0];
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  } catch (_) {}
  return false;
}

module.exports = {
  API_BASE: String(API_BASE || "").replace(/\/+$/, ""),
  APP_NAME: "Symbiosis Lab",
  isInsecureApiBase,
};
