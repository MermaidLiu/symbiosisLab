const { api } = require("../../utils/api");
const { requireLogin, getUser, clearSession } = require("../../utils/auth");
const { isInsecureApiBase } = require("../../utils/config");
const { displayName } = require("../../utils/format");
const { monthLabel, buildMonthRows, pad } = require("../../utils/calendar");

Page({
  data: {
    ready: false,
    name: "",
    rolesText: "",
    instrumentCount: 0,
    animalCount: 0,
    bookingCount: 0,
    unreadCount: 0,
    year: 0,
    month: 0,
    monthText: "",
    weeks: ["一", "二", "三", "四", "五", "六", "日"],
    rows: [],
    calExpanded: false,
  },

  onShow() {
    // HTTP/IP 在体验版不可用：直接回登录说明页，避免「加载失败」弹窗循环
    if (isInsecureApiBase()) {
      clearSession();
      getApp().globalData.user = null;
      wx.reLaunch({ url: "/pages/login/login?force=1" });
      return;
    }
    if (!requireLogin()) return;
    const now = new Date();
    if (!this.data.year) {
      this.setData({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      });
    }
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    const user = getUser();
    const { year, month } = this.data;
    try {
      const [inst, animals, bookings, notices, log] = await Promise.all([
        api.instruments(),
        api.managedAnimals(),
        api.bookings(),
        api.notifications(),
        api.dailyLog(year, month).catch(() => ({ markedDates: [] })),
      ]);
      const myAnimals = (animals.managedAnimals || []).filter(
        (a) => a.claimantUserId === user.id || a.technicianUserId === user.id
      );
      const myBookings = (bookings.bookings || []).filter((b) => b.userId === user.id);
      const unread = (notices.notifications || []).filter((n) => !n.read).length;
      const marked = new Set(log.markedDates || []);
      const today = `${nowKey()}`;
      this.setData({
        ready: true,
        name: displayName(user),
        rolesText: (user.roles || []).join(" · "),
        instrumentCount: (inst.instruments || []).length,
        animalCount: myAnimals.length,
        bookingCount: myBookings.length,
        unreadCount: unread,
        monthText: monthLabel(year, month),
        rows: buildMonthRows(year, month, marked, today),
      });
    } catch (e) {
      const detail = (e && (e.detail || e.errMsg || e.code)) || "";
      const isDomain =
        String(detail).includes("domain list") || String(detail).includes("url not in");
      clearSession();
      getApp().globalData.user = null;
      wx.showModal({
        title: "加载失败",
        content: isDomain
          ? `体验版无法访问 HTTP/IP 接口。\n请先配置 HTTPS 域名。\n\n${detail}`
          : `数据请求失败，请重新登录。\n${detail}`,
        showCancel: false,
        success() {
          wx.reLaunch({ url: "/pages/login/login?force=1" });
        },
      });
    }
  },

  async reloadCalendar() {
    const { year, month } = this.data;
    try {
      const log = await api.dailyLog(year, month);
      const marked = new Set(log.markedDates || []);
      this.setData({
        monthText: monthLabel(year, month),
        rows: buildMonthRows(year, month, marked, nowKey()),
      });
    } catch (_) {}
  },

  prevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    this.setData({ year, month });
    this.reloadCalendar();
  },

  nextMonth() {
    let { year, month } = this.data;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this.setData({ year, month });
    this.reloadCalendar();
  },

  toggleCalendar() {
    const next = !this.data.calExpanded;
    this.setData({ calExpanded: next });
    if (next && (!this.data.rows || this.data.rows.length === 0)) {
      this.reloadCalendar();
    }
  },

  goCalendar() {
    const { year, month } = this.data;
    wx.navigateTo({
      url: `/pages/calendar/calendar?year=${year}&month=${month}`,
    });
  },

  onPickDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    wx.navigateTo({
      url: `/pages/calendar/calendar?date=${date}`,
    });
  },

  goInstruments() {
    wx.switchTab({ url: "/pages/instruments/instruments" });
  },
  goAnimals() {
    wx.switchTab({ url: "/pages/animals/animals" });
  },
  goNotices() {
    wx.switchTab({ url: "/pages/notices/notices" });
  },
  goBookings() {
    wx.navigateTo({ url: "/pages/bookings/bookings" });
  },

  async onLogout() {
    try {
      await api.logout();
    } catch (_) {}
    clearSession();
    getApp().globalData.user = null;
    wx.reLaunch({ url: "/pages/login/login" });
  },
});

function nowKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
