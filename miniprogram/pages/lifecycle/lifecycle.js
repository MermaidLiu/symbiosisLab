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
    kinds: [
      { v: "ephys", l: "电生理/采集" },
      { v: "behavior", l: "行为学" },
      { v: "optotagging", l: "Optotagging" },
      { v: "imaging", l: "成像" },
      { v: "other", l: "其他" },
    ],
  },

  onLoad(query) {
    if (query && query.animalId) {
      this.setData({ scanId: query.animalId });
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
    if (this.data.scanId && !this.data.animal) {
      this.lookup(this.data.scanId);
    }
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
    // 若扫的是笼码而非 M ID，尝试按 enroll 已有逻辑查询
    this.setData({ busy: true, error: "" });
    try {
      let data;
      try {
        data = await api.lifecycleLookup(animalId);
      } catch (_) {
        // 尝试用笼码匹配：先 enroll（本人已有则返回）
        if (this.data.isStudent) {
          const enrolled = await api.lifecycleAction("enroll_from_cage", { cageCode: animalId });
          data = await api.lifecycleLookup(enrolled.animal.id);
        } else {
          throw _;
        }
      }
      const ops = (data.operations || []).map((o) => ({
        ...o,
        statusText: OP_STATUS[o.status] || o.status,
      }));
      animalId = data.animal.id;
      this.setData({
        animal: data.animal,
        operations: ops,
        traces: data.traces || [],
        statusLabel: STATUS[data.animal.registrationStatus] || data.animal.registrationStatus || "",
        pendingOp: ops.find((o) => o.status === "tech_submitted") || null,
        openOp: ops.find((o) => o.status === "open") || null,
        scanId: animalId,
        photoUrls: [],
      });
    } catch (e) {
      this.setData({ animal: null, error: "未找到该小鼠，学生请先扫码录入" });
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
        this.setData({ busy: true });
        const urls = [...this.data.photoUrls];
        try {
          for (const f of files) {
            const url = await this.uploadFile(f.tempFilePath);
            if (url) urls.push(url);
          }
          this.setData({ photoUrls: urls });
          wx.showToast({ title: `已上传 ${urls.length} 张`, icon: "none" });
        } catch (e) {
          wx.showToast({ title: "上传失败", icon: "none" });
        } finally {
          this.setData({ busy: false });
        }
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
    if (!this.data.photoUrls.length && !this.data.resultNote.trim()) {
      wx.showToast({ title: "请先拍照上传或填写说明", icon: "none" });
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
