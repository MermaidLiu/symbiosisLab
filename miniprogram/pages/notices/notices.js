const { api } = require("../../utils/api");
const { isLoggedIn, goLogin } = require("../../utils/auth");
const { formatDateTime } = require("../../utils/format");

Page({
  data: {
    guestMode: true,
    list: [],
  },

  onShow() {
    const loggedIn = isLoggedIn();
    this.setData({ guestMode: !loggedIn });
    if (!loggedIn) return;
    this.load();
  },

  goLogin() {
    goLogin();
  },

  onPullDownRefresh() {
    if (!isLoggedIn()) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const { notifications } = await api.notifications();
      const list = (notifications || []).map((n) => ({
        ...n,
        timeText: formatDateTime(n.createdAt),
      }));
      this.setData({ list, guestMode: false });
    } catch (e) {
      if (e && e.status === 401) {
        this.setData({ guestMode: true, list: [] });
        return;
      }
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  async openNotice(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find((n) => n.id === id);
    if (!item) return;
    if (item.kind === "animal_death") {
      if (!item.handled) {
        await this.acknowledgeDeath({
          currentTarget: { dataset: { id: item.id, animal: item.animalId || "" } },
        });
      } else {
        this.openDeath({ currentTarget: { dataset: { animal: item.animalId || "" } } });
      }
      return;
    }
    try {
      if (!item.read) {
        await api.markNotification(id, "read");
      }
    } catch (_) {}
    if (item.link) {
      if (item.link.includes("bookings")) {
        wx.navigateTo({ url: "/pages/bookings/bookings" });
        return;
      }
      if (item.link.includes("instruments")) {
        wx.switchTab({ url: "/pages/instruments/instruments" });
        return;
      }
      if (item.link.includes("animals") || item.link.includes("managed") || item.link.includes("lifecycle")) {
        wx.switchTab({ url: "/pages/animals/animals" });
        return;
      }
    }
    this.load();
  },

  async acknowledgeDeath(e) {
    const id = e.currentTarget.dataset.id;
    const animalId = e.currentTarget.dataset.animal || "";
    try {
      await api.markNotification(id, "acknowledge");
    } catch (_) {
      try {
        await api.markNotification(id, "read");
      } catch (__) {}
    }
    wx.navigateTo({
      url: `/pages/death/death?animalId=${encodeURIComponent(animalId)}`,
    });
    this.load();
  },

  openDeath(e) {
    const animalId = e.currentTarget.dataset.animal || "";
    wx.navigateTo({
      url: `/pages/death/death?animalId=${encodeURIComponent(animalId)}`,
    });
  },

  async markAll() {
    try {
      await api.markAllNotificationsRead();
      wx.showToast({ title: "已全部标为已读", icon: "success" });
      this.load();
    } catch (e) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },
});
