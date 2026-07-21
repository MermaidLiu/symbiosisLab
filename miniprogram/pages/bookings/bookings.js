const { api } = require("../../utils/api");
const { requireLogin, getUser } = require("../../utils/auth");
const { formatDateTime } = require("../../utils/format");

const STATUS_TEXT = {
  pending: "待审批",
  approved: "已确认",
  rejected: "已拒绝",
  cancelled: "已取消",
  completed: "已完成",
};

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
    const user = getUser();
    try {
      const [{ bookings }, { instruments }] = await Promise.all([
        api.bookings(),
        api.instruments(),
      ]);
      const nameMap = {};
      (instruments || []).forEach((i) => {
        nameMap[i.id] = i.name;
      });
      const list = (bookings || [])
        .filter((b) => b.userId === user.id)
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
        .map((b) => ({
          ...b,
          resourceName: nameMap[b.resourceId] || b.resourceId,
          statusText: STATUS_TEXT[b.status] || b.status,
          timeRange: `${formatDateTime(b.startTime)} ~ ${formatDateTime(b.endTime)}`,
        }));
      this.setData({ list });
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  async onCancel(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.updateBooking(id, "cancelled");
      wx.showToast({ title: "已取消", icon: "success" });
      this.load();
    } catch (err) {
      wx.showToast({ title: "取消失败", icon: "none" });
    }
  },
});
