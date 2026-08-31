const { api } = require("../../utils/api");
const { isLoggedIn, goLogin, promptLogin } = require("../../utils/auth");

const STATUS_TEXT = {
  available: "可用",
  maintenance: "维护中",
  retired: "已退役",
};

Page({
  data: {
    guestMode: true,
    list: [],
    filtered: [],
    keyword: "",
  },

  onShow() {
    const loggedIn = isLoggedIn();
    this.setData({ guestMode: !loggedIn });
    if (!loggedIn) return;
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

  async load() {
    try {
      const { instruments } = await api.instruments();
      const list = (instruments || []).map((i) => ({
        ...i,
        statusText: STATUS_TEXT[i.status] || i.status,
      }));
      this.setData({ list, guestMode: false });
      this.applyFilter(this.data.keyword, list);
    } catch (e) {
      if (e && e.status === 401) {
        this.setData({ guestMode: true, list: [], filtered: [] });
        return;
      }
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
            String(i.name || "").toLowerCase().includes(q) ||
            String(i.model || "").toLowerCase().includes(q)
        );
    this.setData({ filtered });
  },

  async goDetail(e) {
    if (!(await promptLogin("登录后可查看仪器详情与预约。"))) return;
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/instrument-detail/instrument-detail?id=${encodeURIComponent(id)}`,
    });
  },
});
