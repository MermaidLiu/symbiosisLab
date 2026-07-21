const { api } = require("../../utils/api");
const { requireLogin } = require("../../utils/auth");
const { formatDateTime } = require("../../utils/format");

Page({
  data: { list: [] },

  onShow() {
    if (!requireLogin()) return;
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const { notifications } = await api.notifications();
      const list = (notifications || []).map((n) => ({
        ...n,
        timeText: formatDateTime(n.createdAt),
      }));
      this.setData({ list });
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  async openNotice(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find((n) => n.id === id);
    try {
      if (item && !item.read) {
        await api.markNotification(id, "read");
      }
    } catch (_) {}
    if (item && item.link) {
      if (item.link.includes("bookings")) {
        wx.navigateTo({ url: "/pages/bookings/bookings" });
        return;
      }
      if (item.link.includes("instruments")) {
        wx.switchTab({ url: "/pages/instruments/instruments" });
        return;
      }
      if (item.link.includes("animals") || item.link.includes("managed")) {
        wx.switchTab({ url: "/pages/animals/animals" });
        return;
      }
    }
    this.load();
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
