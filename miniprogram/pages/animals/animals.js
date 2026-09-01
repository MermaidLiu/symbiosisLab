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

const ACTION_W = 76;
const EXPERIMENT_TYPES = new Set(["signal_collection", "surgery", "perfusion", "other"]);

function isStudentUser(user) {
  if (!user) return false;
  const roles = user.roles || [];
  const techish = roles.some((r) =>
    ["animal_manager", "animal_caretaker", "animal_facility_supervisor", "super_admin"].includes(r)
  );
  if (techish) return false;
  return (user.appliedRole || "student") === "student" || roles.includes("user");
}

Page({
  data: {
    guestMode: true,
    isStudent: false,
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
    assigning: false,
    assignAnimalId: "",
    assignNote: "",
    assignSaving: false,
    opTypeIndex: 2,
    staffIndex: 0,
    staff: [],
    opTypes: [
      { v: "fasting", l: "禁食" },
      { v: "water_deprivation", l: "禁水" },
      { v: "signal_collection", l: "信号采集（将锁定）" },
      { v: "surgery", l: "手术（将锁定）" },
      { v: "perfusion", l: "灌流取材（将锁定）" },
      { v: "euthanasia", l: "处死" },
      { v: "other", l: "其他（将锁定）" },
    ],
  },

  _touch: null,

  onShow() {
    const loggedIn = isLoggedIn();
    const user = getUser();
    this.setData({ guestMode: !loggedIn, isStudent: isStudentUser(user) });
    if (!loggedIn) return;
    this.load();
    if (isStudentUser(user)) this.loadStaff();
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

  async loadStaff() {
    try {
      const { users } = await api.users();
      const staff = (users || [])
        .filter((u) =>
          (u.roles || []).some((r) =>
            ["animal_manager", "animal_caretaker", "animal_facility_supervisor"].includes(r)
          )
        )
        .map((u) => ({
          v: u.id,
          l: u.nickname || u.name || u.email || u.id,
        }));
      this.setData({ staff, staffIndex: 0 });
    } catch (_) {
      this.setData({ staff: [] });
    }
  },

  mapRow(row, user) {
    const color = resolveStatusColor(row.statusColor, row.recordingStatus);
    const deceased = row.recordingStatus === "dead" || row.status === "deceased";
    const days = trackingDays(row.collectionAt, row.lastCollectionAt, row.implantAt, {
      deceased,
    });
    const locked = Boolean(row.animalLock) || row.registrationStatus === "in_experiment";
    const mine = user && row.claimantUserId === user.id;
    return {
      ...row,
      locked,
      canAssign: Boolean(mine && !locked),
      canDelete: Boolean(mine && !locked),
      offsetX: 0,
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
        .map((a) => this.mapRow(a, user));
      this.setData({ list, guestMode: false, isStudent: isStudentUser(user) });
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

  setOffset(id, offsetX) {
    const patch = (arr) => arr.map((a) => (a.id === id ? { ...a, offsetX } : { ...a, offsetX: 0 }));
    this.setData({
      list: patch(this.data.list),
      filtered: patch(this.data.filtered),
    });
  },

  onTouchStart(e) {
    const id = e.currentTarget.dataset.id;
    const t = e.touches[0];
    this._touch = { id, x: t.clientX, y: t.clientY, moved: false };
  },

  onTouchMove(e) {
    if (!this._touch) return;
    const row = this.data.list.find((a) => a.id === this._touch.id);
    if (!row || !row.canDelete || !this.data.isStudent) return;
    const t = e.touches[0];
    const dx = t.clientX - this._touch.x;
    const dy = t.clientY - this._touch.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      this._touch = null;
      return;
    }
    this._touch.moved = true;
    const offsetX = Math.max(-ACTION_W, Math.min(0, dx));
    this.setOffset(this._touch.id, offsetX);
  },

  onTouchEnd() {
    if (!this._touch) return;
    const { id, moved } = this._touch;
    const row = this.data.filtered.find((a) => a.id === id) || this.data.list.find((a) => a.id === id);
    const cur = row && row.offsetX ? row.offsetX : 0;
    this._touch = null;
    if (!moved) return;
    this.setOffset(id, cur < -ACTION_W / 2 ? -ACTION_W : 0);
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    const row = this.data.list.find((a) => a.id === id);
    if (!row) return;
    if (row.offsetX) {
      this.setOffset(id, 0);
      return;
    }
    if (this.data.isStudent && row.canAssign) {
      this.openAssign({ currentTarget: { dataset: { id } } });
    }
  },

  async openAssign(e) {
    if (!(await promptLogin("登录后可派发。"))) return;
    const id = e.currentTarget.dataset.id;
    const row = this.data.list.find((a) => a.id === id);
    if (!row || !row.canAssign) {
      if (row && row.locked) {
        wx.showModal({
          title: "实验锁定中",
          content: "该小鼠已派发且未闭环，不可再次派发。",
          showCancel: false,
        });
      }
      return;
    }
    if (!this.data.staff.length) await this.loadStaff();
    this.setData({
      assigning: true,
      assignAnimalId: id,
      assignNote: "",
      opTypeIndex: 2,
      staffIndex: 0,
    });
  },

  closeAssign() {
    this.setData({ assigning: false, assignAnimalId: "" });
  },

  onOpType(e) {
    this.setData({ opTypeIndex: Number(e.detail.value) || 0 });
  },
  onStaff(e) {
    this.setData({ staffIndex: Number(e.detail.value) || 0 });
  },
  onAssignNote(e) {
    this.setData({ assignNote: e.detail.value });
  },

  async submitAssign() {
    const animalId = this.data.assignAnimalId;
    const staff = this.data.staff[this.data.staffIndex];
    const op = this.data.opTypes[this.data.opTypeIndex];
    if (!animalId || !staff || !op) {
      wx.showToast({ title: "请选择技术员", icon: "none" });
      return;
    }
    const start = new Date();
    const end = new Date(start.getTime() + 3600 * 1000);
    this.setData({ assignSaving: true });
    try {
      await api.createAnimalOpTask({
        animalIds: [animalId],
        opType: op.v,
        note: this.data.assignNote || "",
        assigneeUserId: staff.v,
        necessary: true,
        urgent: false,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      this.setData({ assigning: false, assignAnimalId: "" });
      await this.load();
      wx.showToast({
        title: EXPERIMENT_TYPES.has(op.v) ? "已派发并锁定" : "已派发",
        icon: "success",
      });
    } catch (e) {
      const code = (e && e.code) || "";
      wx.showModal({
        title: "派发失败",
        content: code === "animal_locked" ? "该小鼠已锁定" : code || "请重试",
        showCancel: false,
      });
    } finally {
      this.setData({ assignSaving: false });
    }
  },

  confirmDelete(e) {
    const id = e.currentTarget.dataset.id;
    const row = this.data.list.find((a) => a.id === id);
    if (!row || !row.canDelete) return;
    wx.showModal({
      title: "删除小鼠",
      content: `确认删除 ${id}？锁定中的小鼠不可删。`,
      success: (res) => {
        if (res.confirm) void this.doDelete(id);
      },
    });
  },

  async doDelete(id) {
    try {
      await api.deleteManagedAnimal(id);
      await this.load();
      wx.showToast({ title: "已删除", icon: "success" });
    } catch (e) {
      wx.showToast({
        title: (e && e.code) === "animal_locked" ? "已锁定不可删" : "删除失败",
        icon: "none",
      });
    }
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
        .map((a) => this.mapRow(a, user));
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
