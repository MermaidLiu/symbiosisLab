const { api } = require("../../utils/api");
const { requireLogin } = require("../../utils/auth");

const STATUS_TEXT = {
  available: "可用",
  maintenance: "维护中",
  retired: "已退役",
};

Page({
  data: {
    id: "",
    instrument: null,
    statusText: "",
    date: "",
    startTime: "09:00",
    endTime: "11:00",
    purpose: "",
    submitting: false,
  },

  onLoad(query) {
    this.setData({ id: decodeURIComponent(query.id || "") });
  },

  onShow() {
    if (!requireLogin()) return;
    this.load();
  },

  async load() {
    try {
      const { instruments } = await api.instruments();
      const instrument = (instruments || []).find((i) => i.id === this.data.id);
      if (!instrument) {
        wx.showToast({ title: "仪器不存在", icon: "none" });
        return;
      }
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      this.setData({
        instrument,
        statusText: STATUS_TEXT[instrument.status] || instrument.status,
        date: this.data.date || date,
      });
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  onDate(e) {
    this.setData({ date: e.detail.value });
  },
  onStart(e) {
    this.setData({ startTime: e.detail.value });
  },
  onEnd(e) {
    this.setData({ endTime: e.detail.value });
  },
  onPurpose(e) {
    this.setData({ purpose: e.detail.value });
  },

  async onBook() {
    const { instrument, date, startTime, endTime, purpose } = this.data;
    if (!instrument) return;
    if (!date || !startTime || !endTime || !(purpose || "").trim()) {
      wx.showToast({ title: "请填写完整预约信息", icon: "none" });
      return;
    }
    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);
    if (!(end > start)) {
      wx.showToast({ title: "结束时间须晚于开始时间", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.createBooking({
        resourceType: "instrument",
        resourceId: instrument.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        purpose: purpose.trim(),
      });
      wx.showToast({ title: "预约成功", icon: "success" });
      setTimeout(() => wx.navigateTo({ url: "/pages/bookings/bookings" }), 400);
    } catch (err) {
      const map = {
        not_trained: "需先完成培训",
        slot_taken: "时段已被占用",
        resource_unavailable: "仪器暂不可用",
        invalid_duration: "预约时长不符合要求",
      };
      wx.showToast({ title: map[err.code] || "预约失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
