/** 部署环境 API 根路径（不要末尾斜杠） */
const API_BASE = "http://122.51.204.136/symbiosis/lab";

module.exports = {
  API_BASE: String(API_BASE || "").replace(/\/+$/, ""),
  APP_NAME: "Symbiosis Lab",
};
