const { api } = require("../../utils/api");
const { requireLogin, getUser } = require("../../utils/auth");
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
    if (!requireLogin()) return;
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  mapRow(row) {
    const color = resolveStatusColor(row.statusColor, row.recordingStatus);
    const days = trackingDays(row.collectionAt, row.lastCollectionAt, row.implantAt);
    return {
      ...row,
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
    try {
      const { managedAnimals } = await api.managedAnimals();
      const list = (managedAnimals || [])
        .filter((a) => a.claimantUserId === user.id || a.technicianUserId === user.id)
        .map((a) => this.mapRow(a));
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
    const filtered = !q ? list : list.filter((a) => String(a.id).toLowerCase().includes(q));
    this.setData({ filtered });
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id;
    const row = this.data.list.find((a) => a.id === id);
    if (!row) return;
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
