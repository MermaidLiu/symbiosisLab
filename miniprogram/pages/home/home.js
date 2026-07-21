const { api } = require("../../utils/api");
const { requireLogin, getUser, clearSession } = require("../../utils/auth");
const { displayName } = require("../../utils/format");

Page({
  data: {
    ready: false,
    name: "",
    rolesText: "",
    instrumentCount: 0,
    animalCount: 0,
    bookingCount: 0,
    unreadCount: 0,
  },

  onShow() {
    if (!requireLogin()) return;
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    const user = getUser();
    try {
      const [inst, animals, bookings, notices] = await Promise.all([
        api.instruments(),
        api.managedAnimals(),
        api.bookings(),
        api.notifications(),
      ]);
      const myAnimals = (animals.managedAnimals || []).filter(
        (a) => a.claimantUserId === user.id || a.technicianUserId === user.id
      );
      const myBookings = (bookings.bookings || []).filter((b) => b.userId === user.id);
      const unread = (notices.notifications || []).filter((n) => !n.read).length;
      this.setData({
        ready: true,
        name: displayName(user),
        rolesText: (user.roles || []).join(" · "),
        instrumentCount: (inst.instruments || []).length,
        animalCount: myAnimals.length,
        bookingCount: myBookings.length,
        unreadCount: unread,
      });
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
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
