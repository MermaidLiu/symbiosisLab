const { api } = require("../../utils/api");
const { isLoggedIn, getUser, clearSession, goLogin, promptLogin } = require("../../utils/auth");
const { isInsecureApiBase } = require("../../utils/config");
const { displayName } = require("../../utils/format");
const { monthLabel, buildMonthRows, pad } = require("../../utils/calendar");

Page({
  data: {
    loggedIn: false,
    ready: true,
    guestMode: true,
    insecureApi: false,
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
    if (isInsecureApiBase()) {
      clearSession();
      getApp().globalData.user = null;
      this.setData({
        insecureApi: true,
        guestMode: true,
        loggedIn: false,
        ready: true,
      });
      return;
    }

    const loggedIn = isLoggedIn();
    this.setData({ loggedIn, guestMode: !loggedIn, insecureApi: false, ready: true });

    if (!loggedIn) return;

    const user = getUser();
    const isSuperAdmin =
      user && Array.isArray(user.roles) && user.roles.indexOf("super_admin") >= 0;
    if (user && user.phone && !isSuperAdmin) {
      const st = user.accountStatus || "active";
      const emp = (user.employeeId || "").trim();
      const incomplete =
        st === "pending_profile" ||
        st === "rejected" ||
        st === "pending_review" ||
        !(user.name || "").trim() ||
        !emp ||
        emp.startsWith("LEGACY-") ||
        !(user.school || "").trim() ||
        !(user.department || "").trim() ||
        (user.email || "").endsWith("@phone.symbiosis.local");
      if (incomplete && st !== "disabled") {
        wx.redirectTo({ url: "/pages/realname/realname" });
        return;
      }
    }

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
    if (!isLoggedIn()) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  goLogin() {
    goLogin();
  },

  goProfile() {
    wx.navigateTo({ url: "/pages/profile/profile" });
  },

  async ensureLogin() {
    return promptLogin("登录后可查看个人数据与进行预约、实验操作。");
  },

  async load() {
    const user = getUser();
    if (!user) {
      this.setData({ guestMode: true, loggedIn: false });
      return;
    }
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
      this.setData({
        guestMode: false,
        loggedIn: true,
        name: displayName(user),
        rolesText: (user.roles || []).join(" · "),
        instrumentCount: (inst.instruments || []).length,
        animalCount: myAnimals.length,
        bookingCount: myBookings.length,
        unreadCount: unread,
        monthText: monthLabel(year, month),
        rows: buildMonthRows(year, month, marked, nowKey()),
      });
    } catch (e) {
      const detail = (e && (e.detail || e.errMsg || e.code)) || "";
      const isDomain =
        String(detail).includes("domain list") || String(detail).includes("url not in");
      if (e && e.status === 401) {
        clearSession();
        getApp().globalData.user = null;
        this.setData({ guestMode: true, loggedIn: false });
        return;
      }
      wx.showModal({
        title: "加载失败",
        content: isDomain
          ? `无法访问接口，请检查合法域名。\n${detail}`
          : `数据请求失败。\n${detail}`,
        showCancel: false,
      });
    }
  },

  async reloadCalendar() {
    if (!isLoggedIn()) return;
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
    if (!isLoggedIn()) {
      void this.ensureLogin();
      return;
    }
    const next = !this.data.calExpanded;
    this.setData({ calExpanded: next });
    if (next && (!this.data.rows || this.data.rows.length === 0)) {
      this.reloadCalendar();
    }
  },

  async goCalendar() {
    if (!(await this.ensureLogin())) return;
    const { year, month } = this.data;
    wx.navigateTo({
      url: `/pages/calendar/calendar?year=${year}&month=${month}`,
    });
  },

  async onPickDay(e) {
    if (!(await this.ensureLogin())) return;
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
  async goBookings() {
    if (!(await this.ensureLogin())) return;
    wx.navigateTo({ url: "/pages/bookings/bookings" });
  },

  async onLogout() {
    if (!isLoggedIn()) {
      this.goLogin();
      return;
    }
    try {
      await api.logout();
    } catch (_) {}
    clearSession();
    getApp().globalData.user = null;
    this.setData({
      guestMode: true,
      loggedIn: false,
      name: "",
      rolesText: "",
      instrumentCount: 0,
      animalCount: 0,
      bookingCount: 0,
      unreadCount: 0,
      rows: [],
      calExpanded: false,
    });
    wx.showToast({ title: "已退出", icon: "none" });
  },
});

function nowKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
