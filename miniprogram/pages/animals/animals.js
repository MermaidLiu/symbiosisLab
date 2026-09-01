const { api } = require("../../utils/api");
const { isLoggedIn, getUser, goLogin, promptLogin } = require("../../utils/auth");
const {
  formatDate,
  trackingDays,
  trackingStageFromDays,
  resolveStatusColor,
  statusLabel,
  JELLY,
  JELLY_KEYS,
} = require("../../utils/format");

Page({
  data: {
    guestMode: true,
    list: [],
    filtered: [],
    keyword: "",
    editing: false,
    editId: "",
    editText: "",
    editColor: "sky",
    saving: false,
    jellyKeys: JELLY_KEYS,
    jellyMap: JELLY,
    jellyList: JELLY_KEYS.map((key) => ({ key, bg: JELLY[key].bg })),
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

  async goLifecycle() {
    wx.navigateTo({ url: "/pages/lifecycle/lifecycle" });
  },

  onPullDownRefresh() {
    if (!isLoggedIn()) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  mapRow(row) {
    const color = resolveStatusColor(row.statusColor, row.recordingStatus);
    const deceased = row.recordingStatus === "dead" || row.status === "deceased";
    const days = trackingDays(row.collectionAt, row.lastCollectionAt, row.implantAt, {
      deceased,
    });
    const locked = Boolean(row.animalLock) || row.registrationStatus === "in_experiment";
    return {
      ...row,
      locked,
      label: statusLabel(row),
      tipBg: JELLY[color].bg,
      tipFg: JELLY[color].fg,
      implantText: formatDate(row.implantAt),
      nextText: formatDate(row.nextCollectionAt),
      trackingText: days === null ? "—" : `${days} 天`,
      stage: trackingStageFromDays(days),
    };
  },

  async load() {
    const user = getUser();
    if (!user) {
      this.setData({ guestMode: true, list: [], filtered: [] });
      return;
    }
    try {
      const { managedAnimals } = await api.managedAnimals();
      const list = (managedAnimals || [])
        .filter((a) => a.claimantUserId === user.id || a.technicianUserId === user.id)
        .map((a) => this.mapRow(a));
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
    const filtered = !q ? list : list.filter((a) => String(a.id).toLowerCase().includes(q));
    this.setData({ filtered });
  },

  async openEdit(e) {
    if (!(await promptLogin("登录后可编辑动物状态。"))) return;
    const id = e.currentTarget.dataset.id;
    const row = this.data.list.find((a) => a.id === id);
    if (!row) return;
    if (row.locked) {
      wx.showModal({
        title: "实验锁定中",
        content: "该小鼠实验未闭环，不可改状态或派发，以保护一生记录。请先在实验追溯完成 NAS 闭环。",
        showCancel: false,
      });
      return;
    }
    this.setData({
      editing: true,
      editId: id,
      editText: row.label === "—" ? "" : row.label,
      editColor: resolveStatusColor(row.statusColor, row.recordingStatus),
    });
  },

  closeEdit() {
    this.setData({ editing: false, editId: "" });
  },

  noop() {},

  onEditText(e) {
    this.setData({ editText: e.detail.value });
  },

  pickColor(e) {
    this.setData({ editColor: e.currentTarget.dataset.color });
  },

  async saveEdit() {
    const { editId, editText, editColor } = this.data;
    if (!editId) return;
    this.setData({ saving: true });
    try {
      const { managedAnimals } = await api.updateManagedAnimal(editId, {
        statusLabel: (editText || "").trim() || undefined,
        statusColor: editColor,
      });
      const user = getUser();
      const list = (managedAnimals || [])
        .filter((a) => a.claimantUserId === user.id || a.technicianUserId === user.id)
        .map((a) => this.mapRow(a));
      this.setData({ list, editing: false, editId: "" });
      this.applyFilter(this.data.keyword, list);
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (e) {
      wx.showToast({ title: "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
