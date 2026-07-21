const { api } = require("../../utils/api");
const { requireLogin } = require("../../utils/auth");

const STATUS_TEXT = {
  available: "可用",
  maintenance: "维护中",
  retired: "已退役",
};

Page({
  data: {
    list: [],
    filtered: [],
    keyword: "",
  },

  onShow() {
    if (!requireLogin()) return;
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const { instruments } = await api.instruments();
      const list = (instruments || []).map((i) => ({
        ...i,
        statusText: STATUS_TEXT[i.status] || i.status,
      }));
      this.setData({ list });
      this.applyFilter(this.data.keyword, list);
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  onSearch(e) {
    const keyword = e.detail.value || "";
    this.setData({ keyword });
    this.applyFilter(keyword, this.data.list);
  },

  applyFilter(keyword, list) {
    const q = keyword.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter(
          (i) =>
            (i.name || "").toLowerCase().includes(q) ||
            (i.nameEn || "").toLowerCase().includes(q) ||
            (i.model || "").toLowerCase().includes(q)
        );
    this.setData({ filtered });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/instrument-detail/instrument-detail?id=${encodeURIComponent(id)}`,
    });
  },
});
