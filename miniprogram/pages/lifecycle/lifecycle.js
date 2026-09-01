const { api } = require("../../utils/api");
const { isLoggedIn, getUser, goLogin, promptLogin } = require("../../utils/auth");
const { API_BASE } = require("../../utils/config");
const { getToken } = require("../../utils/auth");

const STATUS = {
  blank_available: "空白鼠待认领",
  blank_claimed: "已认领待手术",
  awaiting_register: "待扫码建档",
  awaiting_experiment: "待实验",
  in_experiment: "实验中",
  deceased: "已结束",
};

const OP_STATUS = {
  open: "进行中",
  tech_submitted: "待学生填 NAS",
  closed: "已闭环",
  force_closed: "已强制关闭",
};

Page({
  data: {
    guestMode: true,
    mode: "student", // student | tech
    expectedAnimalId: "",
    expectedHint: "",
    pendingTasks: [],
    scanId: "",
    animal: null,
    operations: [],
    traces: [],
    statusLabel: "",
    busy: false,
    error: "",
    tip: "",
    expKind: "ephys",
    expTitle: "数据采集",
    resultNote: "",
    photoUrls: [],
    nasPath: "",
    isStudent: false,
    isTech: false,
    pendingOp: null,
    openOp: null,
    canReportDeath: false,
    deathDate: "",
    deathTime: "12:00",
    deathReason: "",
    deathMethodIndex: 2,
    deathMethods: [
      { v: "cervical", l: "断颈" },
      { v: "perfusion", l: "灌流" },
      { v: "found_dead", l: "发现死亡" },
    ],
    kinds: [
      { v: "ephys", l: "电生理/采集" },
      { v: "behavior", l: "行为学" },
      { v: "optotagging", l: "Optotagging" },
      { v: "imaging", l: "成像" },
      { v: "other", l: "其他" },
    ],
  },

  onLoad(query) {
    const expected =
      (query && (query.animalId || query.expectedId || query.expectedAnimalId)) || "";
    if (expected) {
      this.setData({
        expectedAnimalId: String(expected).trim().toUpperCase(),
        expectedHint: `本任务要求核验：${String(expected).trim().toUpperCase()}`,
        scanId: String(expected).trim(),
      });
      try {
        wx.setStorageSync("symbiosis_expected_animal", String(expected).trim().toUpperCase());
      } catch (_) {}
    } else {
      try {
        const cached = wx.getStorageSync("symbiosis_expected_animal") || "";
        if (cached) {
          this.setData({
            expectedAnimalId: cached,
            expectedHint: `待核验派发 ID：${cached}`,
          });
        }
      } catch (_) {}
    }
  },

  onShow() {
    const loggedIn = isLoggedIn();
    this.setData({ guestMode: !loggedIn });
    if (!loggedIn) return;
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
    this.setData({
      isStudent,
      isTech,
      guestMode: false,
      mode: isTech && !isStudent ? "tech" : "student",
    });
    if (isTech) void this.loadPendingTasks();
    if (this.data.scanId && !this.data.animal) {
      if (isStudent) return;
      this.lookup(this.data.scanId);
    }
  },

  async loadPendingTasks() {
    try {
      const { request } = require("../../utils/api");
      const res = await request("/api/experiment-operations");
      const ops = (res.operations || []).filter((o) => o.status === "open");
      this.setData({
        pendingTasks: ops.map((o) => ({
          id: o.id,
          animalId: o.animalId,
          title: o.title,
          studentName: o.studentName || "",
        })),
      });
      if (!this.data.expectedAnimalId && ops[0]) {
        this.setData({
          expectedAnimalId: ops[0].animalId,
          expectedHint: `待处理：${ops[0].animalId}（${ops[0].title}）`,
        });
      }
    } catch (_) {
      this.setData({ pendingTasks: [] });
    }
  },

  pickPending(e) {
    const animalId = e.currentTarget.dataset.animalid;
    this.setData({
      expectedAnimalId: animalId,
      expectedHint: `待核验派发 ID：${animalId}`,
      scanId: animalId,
    });
    try {
      wx.setStorageSync("symbiosis_expected_animal", animalId);
    } catch (_) {}
    this.lookup(animalId);
  },

  goLogin() {
    goLogin();
  },

  onScanId(e) {
    this.setData({ scanId: e.detail.value });
  },

  parseCageCode(raw) {
    const text = String(raw || "").trim();
    const permanent = text.match(/\b(M\d{12})\b/i);
    if (permanent) return permanent[1].toUpperCase();
    const m =
      text.match(/animalId=([^&]+)/i) ||
      text.match(/cageId=([^&\s]+)/i);
    if (m) return decodeURIComponent(m[1]).trim().toUpperCase();
    return text.toUpperCase();
  },

  async onScanEnroll() {
    if (!(await promptLogin("登录后可扫码录入小鼠。"))) return;
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = this.parseCageCode(res.result);
        this.setData({ scanId: code });
        this.enroll(code);
      },
      fail: () => wx.showToast({ title: "扫码取消", icon: "none" }),
    });
  },

  async onEnroll() {
    if (!(await promptLogin("登录后可录入小鼠。"))) return;
    this.enroll(this.data.scanId);
  },

  // 兼容 input bindconfirm
  onConfirmInput() {
    if (this.data.isStudent) void this.onEnroll();
    else void this.onLookup();
  },

  async enroll(code) {
    const cageCode = String(code || this.data.scanId).trim();
    if (!cageCode) {
      wx.showToast({ title: "请先扫码或输入笼码", icon: "none" });
      return;
    }
    this.setData({ busy: true, error: "", tip: "" });
    try {
      const data = await api.lifecycleAction("enroll_from_cage", { cageCode });
      const animal = data.animal;
      if (!animal || !animal.id) {
        this.setData({ error: "服务器未返回小鼠信息，请确认后台已更新 enroll 接口" });
        return;
      }
      this.setData({
        animal,
        scanId: animal.id,
        statusLabel: STATUS[animal.registrationStatus] || animal.registrationStatus || "",
        tip: data.created
          ? `已分配唯一 ID：${animal.id}，可在网页代管动物列表中派发`
          : `已确认小鼠 ${animal.id}`,
        operations: [],
        openOp: null,
        pendingOp: null,
        error: "",
      });
      wx.showToast({ title: "录入成功", icon: "success" });
      // 录入已成功；后续查询失败不应覆盖为「录入失败」
      try {
        await this.lookup(animal.id);
      } catch (_) {}
    } catch (e) {
      const code = (e && e.code) || "";
      const map = {
        unauthorized: "登录已失效，请重新登录后再录入",
        account_not_active: "账号未通过实名审核，暂无法录入（请先完成实名/等待主管通过）",
        forbidden: "当前账号无权限录入小鼠",
        cage_occupied_or_invalid: "该笼号无法录入（可能已被他人占用）",
        invalid_action: "服务器尚未支持录入接口，请先部署最新后台",
        invalid_body: "笼号无效，请输入如 ML0001",
        bad_response: "接口返回异常，请检查合法域名与 HTTPS",
      };
      const msg = map[code] || `录入失败${code ? `（${code}）` : ""}`;
      this.setData({ error: msg, animal: null });
      wx.showToast({ title: msg.slice(0, 20), icon: "none" });
    } finally {
      this.setData({ busy: false });
    }
  },

  async onScanLookup() {
    if (!(await promptLogin("登录后可扫码查询。"))) return;
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = this.parseCageCode(res.result);
        this.setData({ scanId: code });
        if (this.data.isStudent && !this.data.isTech) {
          this.enroll(code);
        } else {
          this.lookup(code);
        }
      },
      fail: () => wx.showToast({ title: "扫码取消", icon: "none" }),
    });
  },

  async onLookup() {
    if (!(await promptLogin("登录后可查询。"))) return;
    if (this.data.isStudent && !this.data.isTech) {
      this.enroll(this.data.scanId);
      return;
    }
    this.lookup(this.data.scanId);
  },

  async lookup(id) {
    let animalId = String(id || this.data.scanId).trim();
    if (!animalId) return;
    this.setData({ busy: true, error: "" });
    try {
      let data;
      try {
        data = await api.lifecycleLookup(animalId);
      } catch (_) {
        if (this.data.isStudent) {
          const enrolled = await api.lifecycleAction("enroll_from_cage", { cageCode: animalId });
          data = await api.lifecycleLookup(enrolled.animal.id);
        } else {
          // 技术员：按笼号查找
          data = await api.lifecycleAction("lookup_cage", { cageCode: animalId });
        }
      }
      const foundId = data.animal.id;
      const expected = (this.data.expectedAnimalId || "").toUpperCase();
      if (this.data.isTech && expected && foundId.toUpperCase() !== expected) {
        this.setData({
          animal: null,
          error: `笼码与派发不一致：扫到 ${foundId}，要求 ${expected}`,
          tip: "",
        });
        wx.showModal({
          title: "核验失败",
          content: `请扫描学生派发的那只鼠。要求 ${expected}，当前扫到 ${foundId}`,
          showCancel: false,
        });
        return;
      }
      const ops = (data.operations || []).map((o) => ({
        ...o,
        statusText: OP_STATUS[o.status] || o.status,
      }));
      const animal = this.enrichAnimal(data.animal);
      const openOp = ops.find((o) => o.status === "open") || null;
      const pendingOp = ops.find((o) => o.status === "tech_submitted") || null;
      const canReportDeath =
        Boolean(animal) &&
        !animal.deathAt &&
        animal.registrationStatus !== "deceased";
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      this.setData({
        animal,
        operations: ops,
        traces: data.traces || [],
        statusLabel: STATUS[animal.registrationStatus] || animal.registrationStatus || "",
        pendingOp,
        openOp,
        canReportDeath,
        deathDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        deathTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
        scanId: foundId,
        photoUrls: [],
        tip: expected ? `已核验通过：${foundId}` : "",
        error: "",
      });
      if (expected) {
        try {
          wx.removeStorageSync("symbiosis_expected_animal");
        } catch (_) {}
      }
    } catch (e) {
      this.setData({
        animal: null,
        error: this.data.isTech ? "未找到该笼号小鼠" : "未找到该小鼠，学生请先扫码录入",
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  onExpTitle(e) {
    this.setData({ expTitle: e.detail.value });
  },
  onResultNote(e) {
    this.setData({ resultNote: e.detail.value });
  },
  onNasPath(e) {
    this.setData({ nasPath: e.detail.value });
  },
  onKindChange(e) {
    const k = this.data.kinds[e.detail.value];
    this.setData({ expKind: k.v, expTitle: k.l });
  },

  async choosePhotos() {
    if (!(await promptLogin("登录后可上传照片。"))) return;
    wx.chooseMedia({
      count: 6,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: async (res) => {
        const files = res.tempFiles || [];
        this.setData({ busy: true, error: "" });
        const urls = [...this.data.photoUrls];
        try {
          for (const f of files) {
            const url = await this.uploadFile(f.tempFilePath);
            if (url) urls.push(url);
          }
          this.setData({ photoUrls: urls });
          wx.showToast({ title: `已上传 ${urls.length} 张结果图`, icon: "success" });
        } catch (e) {
          const msg = (e && e.message) || "上传失败";
          this.setData({ error: `照片上传失败：${msg}` });
          wx.showToast({ title: "上传失败", icon: "none" });
        } finally {
          this.setData({ busy: false });
        }
      },
    });
  },

  previewPhoto(e) {
    const url = e.currentTarget.dataset.url;
    const urls = this.data.photoUrls || [];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  removePhoto(e) {
    const url = e.currentTarget.dataset.url;
    wx.showModal({
      title: "删除照片",
      content: "确定删除这张结果图？",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({
          photoUrls: (this.data.photoUrls || []).filter((u) => u !== url),
        });
      },
    });
  },

  uploadFile(filePath) {
    return new Promise((resolve, reject) => {
      const token = getToken();
      wx.uploadFile({
        url: `${API_BASE}/api/experiment-uploads`,
        filePath,
        name: "file",
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (res) => {
          try {
            const body = JSON.parse(res.data || "{}");
            if (res.statusCode >= 400 || !body.url) {
              reject(new Error(body.error || "upload_fail"));
              return;
            }
            const path = body.url.startsWith("http") ? body.url : `${API_BASE}${body.url}`;
            resolve(path);
          } catch (e) {
            reject(e);
          }
        },
        fail: reject,
      });
    });
  },

  enrichAnimal(animal) {
    if (!animal) return null;
    const methodMap = { cervical: "断颈", perfusion: "灌流", found_dead: "发现死亡" };
    return {
      ...animal,
      deathAtText: animal.deathAt
        ? String(animal.deathAt).slice(0, 16).replace("T", " ")
        : "",
      deathMethodLabel: methodMap[animal.deathMethod] || animal.deathMethod || "—",
    };
  },

  onDeathDate(e) {
    this.setData({ deathDate: e.detail.value });
  },
  onDeathTime(e) {
    this.setData({ deathTime: e.detail.value });
  },
  onDeathMethod(e) {
    this.setData({ deathMethodIndex: Number(e.detail.value) || 0 });
  },
  onDeathReason(e) {
    this.setData({ deathReason: e.detail.value });
  },

  async reportDeath() {
    if (!(await promptLogin("登录后可登记死亡。"))) return;
    const animal = this.data.animal;
    if (!animal) return;
    const reason = (this.data.deathReason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请填写死亡原因", icon: "none" });
      return;
    }
    const deathAt = new Date(`${this.data.deathDate}T${this.data.deathTime}:00`).toISOString();
    const method = this.data.deathMethods[this.data.deathMethodIndex] || this.data.deathMethods[2];
    this.setData({ busy: true });
    try {
      await api.lifecycleAction("report_death", {
        animalId: animal.id,
        deathAt,
        deathMethod: method.v,
        deathReason: reason,
      });
      this.setData({ deathReason: "" });
      await this.lookup(animal.id);
      wx.showToast({ title: "已登记死亡", icon: "success" });
    } catch (e) {
      wx.showToast({ title: (e && e.code) || "登记失败", icon: "none" });
    } finally {
      this.setData({ busy: false });
    }
  },

  async createOp() {
    if (!(await promptLogin("登录后可创建实验。"))) return;
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
      wx.showToast({ title: "已开始处理", icon: "success" });
    } catch (e) {
      wx.showModal({
        title: "无法创建",
        content: (e && e.code) || "animal_locked",
        showCancel: false,
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  async techSubmit() {
    if (!(await promptLogin("登录后可提交。"))) return;
    const op = this.data.openOp;
    if (!op) return;
    if (!this.data.photoUrls.length) {
      wx.showToast({ title: "请先上传至少一张结果照片", icon: "none" });
      return;
    }
    this.setData({ busy: true });
    try {
      await api.patchExperimentOperation(op.id, "tech_submit", {
        resultNote: this.data.resultNote,
        resultImageUrls: this.data.photoUrls,
      });
      await this.lookup(this.data.animal.id);
      wx.showToast({ title: "已完成，已通知学生", icon: "success" });
    } catch (e) {
      wx.showToast({ title: "提交失败", icon: "none" });
    } finally {
      this.setData({ busy: false });
    }
  },

  async studentClose() {
    if (!(await promptLogin("登录后可完成闭环。"))) return;
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
