const { api } = require("../../utils/api");
const { requireLogin, getUser } = require("../../utils/auth");

const STATUS = {
  blank_available: "空白鼠待认领",
  blank_claimed: "已认领待手术",
  awaiting_register: "待扫码建档",
  awaiting_experiment: "待实验",
  in_experiment: "实验中",
  deceased: "已结束",
};

Page({
  data: {
    scanId: "",
    animal: null,
    operations: [],
    traces: [],
    statusLabel: "",
    busy: false,
    error: "",
    cageLabel: "",
    expKind: "ephys",
    expTitle: "电生理实验",
    resultNote: "",
    resultUrl: "",
    nasPath: "",
    isStudent: false,
    isTech: false,
    pendingOp: null,
    openOp: null,
    kinds: [
      { v: "ephys", l: "电生理" },
      { v: "behavior", l: "行为学" },
      { v: "optotagging", l: "Optotagging" },
      { v: "imaging", l: "成像" },
      { v: "other", l: "其他" },
    ],
  },

  onLoad(query) {
    if (query && query.animalId) {
      this.setData({ scanId: query.animalId });
      this.lookup(query.animalId);
    }
  },

  onShow() {
    if (!requireLogin()) return;
    const user = getUser();
    const roles = (user && user.roles) || [];
    const isStudent =
      roles.includes("user") &&
      !roles.some((r) =>
        ["animal_manager", "animal_caretaker", "animal_collector", "animal_facility_supervisor"].includes(r)
      );
    const isTech = roles.some((r) =>
      ["animal_manager", "animal_caretaker", "animal_collector", "animal_facility_supervisor"].includes(r)
    );
    this.setData({ isStudent, isTech });
  },

  onScanId(e) {
    this.setData({ scanId: e.detail.value });
  },

  onScan() {
    wx.scanCode({
      onlyFromCamera: true,
      success: (res) => {
        const raw = (res.result || "").trim();
        let id = raw;
        const m = raw.match(/animalId=([^&]+)/i) || raw.match(/(M\d{12})/);
        if (m) id = decodeURIComponent(m[1] || m[0]);
        this.setData({ scanId: id });
        this.lookup(id);
      },
      fail: () => wx.showToast({ title: "扫码取消", icon: "none" }),
    });
  },

  onLookup() {
    this.lookup(this.data.scanId);
  },

  async lookup(id) {
    const animalId = String(id || this.data.scanId).trim();
    if (!animalId) return;
    this.setData({ busy: true, error: "" });
    try {
      const data = await api.lifecycleLookup(animalId);
      const ops = data.operations || [];
      this.setData({
        animal: data.animal,
        operations: ops,
        traces: data.traces || [],
        statusLabel: STATUS[data.animal.registrationStatus] || data.animal.registrationStatus || "",
        pendingOp: ops.find((o) => o.status === "tech_submitted") || null,
        openOp: ops.find((o) => o.status === "open") || null,
        scanId: data.animal.id,
      });
    } catch (e) {
      this.setData({ animal: null, error: "未找到该 Animal ID" });
    } finally {
      this.setData({ busy: false });
    }
  },

  onCageLabel(e) {
    this.setData({ cageLabel: e.detail.value });
  },
  onExpTitle(e) {
    this.setData({ expTitle: e.detail.value });
  },
  onResultNote(e) {
    this.setData({ resultNote: e.detail.value });
  },
  onResultUrl(e) {
    this.setData({ resultUrl: e.detail.value });
  },
  onNasPath(e) {
    this.setData({ nasPath: e.detail.value });
  },
  onKindChange(e) {
    this.setData({ expKind: this.data.kinds[e.detail.value].v });
  },

  async lifecycle(action, extra) {
    const animalId = this.data.animal ? this.data.animal.id : this.data.scanId;
    this.setData({ busy: true, error: "" });
    try {
      const data = await api.lifecycleAction(action, { animalId, ...(extra || {}) });
      if (data.animal) await this.lookup(data.animal.id);
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (e) {
      wx.showModal({
        title: "操作失败",
        content: (e && (e.code || e.message)) || "请检查状态",
        showCancel: false,
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  claimBlank() {
    this.lifecycle("claim_blank");
  },
  completeSurgery() {
    this.lifecycle("complete_surgery", { cageLabelNote: this.data.cageLabel });
  },
  registerAnimal() {
    this.lifecycle("register");
  },

  async createOp() {
    const animal = this.data.animal;
    if (!animal) return;
    this.setData({ busy: true });
    try {
      await api.createExperimentOperation({
        animalId: animal.id,
        kind: this.data.expKind,
        title: this.data.expTitle,
      });
      await this.lookup(animal.id);
      wx.showToast({ title: "已创建 Operation", icon: "success" });
    } catch (e) {
      wx.showModal({ title: "无法创建", content: e.code || "animal_locked", showCancel: false });
    } finally {
      this.setData({ busy: false });
    }
  },

  async techSubmit() {
    const op = this.data.openOp;
    if (!op) return;
    this.setData({ busy: true });
    try {
      await api.patchExperimentOperation(op.id, "tech_submit", {
        resultNote: this.data.resultNote,
        resultImageUrl: this.data.resultUrl,
      });
      await this.lookup(this.data.animal.id);
      wx.showToast({ title: "已提交", icon: "success" });
    } catch (e) {
      wx.showToast({ title: "提交失败", icon: "none" });
    } finally {
      this.setData({ busy: false });
    }
  },

  async studentClose() {
    const op = this.data.pendingOp;
    if (!op || !this.data.nasPath.trim()) {
      wx.showToast({ title: "请填写 NAS 路径", icon: "none" });
      return;
    }
    this.setData({ busy: true });
    try {
      await api.patchExperimentOperation(op.id, "student_close", {
        nasDataPath: this.data.nasPath.trim(),
      });
      await this.lookup(this.data.animal.id);
      wx.showToast({ title: "实验已闭环", icon: "success" });
    } catch (e) {
      wx.showToast({ title: "闭环失败", icon: "none" });
    } finally {
      this.setData({ busy: false });
    }
  },
});
