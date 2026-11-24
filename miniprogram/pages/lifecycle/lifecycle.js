const TASK_TITLES={fasting:"禁食",water_deprivation:"禁水",signal_collection:"信号采集",ephys:"电生理",behavior:"行为学",surgery:"手术",perfusion:"灌流取材",euthanasia:"处死",other:"其他"};
const { isAnimalClaimantStudent, isAnimalTechnician } = require("../../utils/account-status");
const { api } = require("../../utils/api");
const { isLoggedIn, getUser, goLogin, promptLogin } = require("../../utils/auth");
const { API_BASE } = require("../../utils/config");

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
    surgeryLocation:"", surgeryPhotos:[], surgeryPreviews:[], surgeryMessage:"",
    strainOptions:["转基因","C57"],
    entryTypes:["植入电极手术鼠","植入电极幼鼠","免疫手术鼠","空白鼠","其他"],entryIndex:3,entryTypeOther:"",housingTypes:[{value:'adult_blank',label:'成年空白鼠'},{value:'pup',label:'幼鼠（未离乳）'},{value:'dam',label:'哺乳鼠妈'},{value:'signal_headpiece',label:'带头件信号鼠（单笼）'},{value:'immunity',label:'免疫鼠'}],housingIndex:0,ageWeeks:'6',
    customId: "", cageNumber: "1A1", enrollStrain: "", assistantNames: "",
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
    dataTransferred: null,
    studentFileSeen: null,
    photoUrls: [],
    photoPreviews: [],
    uploadProgress: 0,
    uploading: false,
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
    const isStudent = isAnimalClaimantStudent(user);
    const isTech = isAnimalTechnician(user);
    this.setData({
      currentUserId:user.id,
      isStudent,
      isTech,
      guestMode: false,
      mode: isTech && !isStudent ? "tech" : "student",
    });
    if (isTech) { void this.loadPendingTasks(); if(this.pendingRefresh)clearInterval(this.pendingRefresh); this.pendingRefresh=setInterval(()=>this.loadPendingTasks(),4000); }
    if (this.data.scanId && !this.data.animal) {
      if (isStudent) return;
      this.lookup(this.data.scanId);
    }
  },

  onHide() {if(this.pendingRefresh)clearInterval(this.pendingRefresh);},
  onUnload() {if(this.pendingRefresh)clearInterval(this.pendingRefresh);},
  async loadPendingTasks() {
    try {
      const { request } = require("../../utils/api");
      const [res, taskRes] = await Promise.all([request("/api/experiment-operations"),request("/api/animal-op-tasks?mine=1")]);
      const ops = (res.operations || []).filter((o) => o.status === "open" && o.technicianUserId === getUser().id);
      this.setData({
        activeAnimalTasks:(taskRes.tasks || []).filter(t=>!t.isWaiting && t.status==="scheduled" && ["fasting","water_deprivation","euthanasia"].includes(t.opType)).map(t=>({...t,taskPhotoPreviews:this.previewPhotoUrls((this.taskPhotoSets||{})[t.id]||t.resultImageUrls||[]),taskTitle:TASK_TITLES[t.opType]||t.opType,mouseLabels:t.animalIds.join("、")})),
        waitingTasks: (taskRes.tasks || []).filter(t=>t.isWaiting).map(t=>({...t,taskTitle:TASK_TITLES[t.opType]||t.opType,mouseLabels:t.animalIds.join("、")})),
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

  chooseTaskPhotos(e) {
    const id=e.currentTarget.dataset.id;
    wx.chooseMedia({count:9,mediaType:["image"],success:async res=>{this.setData({busy:true});try{this.taskPhotoSets=this.taskPhotoSets||{};const photos=[...(this.taskPhotoSets[id]||[])];for(const f of res.tempFiles)photos.push(await api.uploadExperimentPhoto(f.tempFilePath));this.taskPhotoSets[id]=photos;await this.loadPendingTasks();}catch(e){wx.showToast({title:e.code||"上传失败",icon:"none"});}finally{this.setData({busy:false});}}});
  },
  previewTaskRecord(e){const t=(this.data.taskRecords||[]).find(t=>t.id===e.currentTarget.dataset.id);if(t)wx.previewImage({urls:t.photoPreviews,current:e.currentTarget.dataset.url});},
  previewTaskPhoto(e) {const task=(this.data.activeAnimalTasks||[]).find(t=>t.id===e.currentTarget.dataset.id);if(task)wx.previewImage({urls:task.taskPhotoPreviews,current:e.currentTarget.dataset.url});},
  async completeSimpleTask(e) {
    if(this.data.busy)return;
    const id=e.currentTarget.dataset.id;
    wx.showModal({title:"确认操作已完成",content:"完成后将通知下一步负责人，请确认实际操作已结束。",success:async r=>{if(!r.confirm)return;try{const {request}=require("../../utils/api");await request("/api/animal-op-tasks",{method:"PATCH",data:{id,status:"done",assistantNames:this.data.assistantNames,resultImageUrls:(this.taskPhotoSets||{})[id]||[]}});await this.loadPendingTasks();wx.showToast({title:"已完成"});}catch(e){wx.showToast({title:e.code||"提交失败",icon:"none"});}}});
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
        this.setData({tip:"已读取二维码，请填写小鼠编号、笼位和品系后确认录入。"});
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

  onSurgeryLocation(e) {this.setData({surgeryLocation:e.detail.value});},
  onCustomId(e) {this.setData({customId:e.detail.value});},
  onCageNumber(e) {this.setData({cageNumber:e.detail.value});},
  pickStrain(e){this.setData({enrollStrain:this.data.strainOptions[Number(e.detail.value)]});},
  onEntryType(e){this.setData({entryIndex:Number(e.detail.value)});},
  onEntryOther(e){this.setData({entryTypeOther:e.detail.value});},
  onHousing(e){this.setData({housingIndex:Number(e.detail.value)});},
  onAgeWeeks(e){this.setData({ageWeeks:e.detail.value});},
  onEnrollStrain(e) {this.setData({enrollStrain:e.detail.value});},
  onAssistantNames(e) {this.setData({assistantNames:e.detail.value});},
  async enroll(code) {
    const cageCode = String(code || this.data.scanId).trim();
    if (!cageCode) {
      wx.showToast({ title: "请先扫码或输入笼码", icon: "none" });
      return;
    }
    this.setData({ busy: true, error: "", tip: "" });
    try {
      const data = await api.lifecycleAction("enroll_from_cage", { cageCode,entryType:["electrode","electrode_young","immune_surgery","blank","other"][this.data.entryIndex],entryTypeOther:this.data.entryTypeOther,housingType:this.data.housingTypes[this.data.housingIndex].value,ageWeeks:Number(this.data.ageWeeks),customId:this.data.customId, cageNumber:this.data.cageNumber, strain:this.data.enrollStrain, entryDate:new Date().toISOString().slice(0,10) });
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
        photoPreviews: this.previewPhotoUrls(o.resultImageUrls || []),
        statusText: OP_STATUS[o.status] || o.status,
      }));
      const animal = this.enrichAnimal(data.animal);
      const openOp = ops.find((o) => o.status === "open") || null;
      const pendingOp = ops.find((o) => o.status === "tech_submitted") || null;
      this.setData({
        animal,
        surgeryLocation:animal.surgeryLocation||"",
        surgeryPhotos:animal.surgeryImageUrls||[],
        surgeryPreviews:this.previewPhotoUrls(animal.surgeryImageUrls||[]),
        operations: ops,
        taskRecords:(data.tasks||[]).filter(t=>(t.resultImageUrls||[]).length).map(t=>({...t,title:TASK_TITLES[t.opType]||t.opType,photoPreviews:this.previewPhotoUrls(t.resultImageUrls)})),
        traces: data.traces || [],
        statusLabel: STATUS[animal.registrationStatus] || animal.registrationStatus || "",
        pendingOp,
        openOp,
        scanId: foundId,
        dataTransferred: null,
        studentFileSeen: null,
        photoUrls: [],
        photoPreviews: [],
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
  onTransfer(e) { this.setData({ dataTransferred: e.detail.value === "true" }); },
  onFileSeen(e) { this.setData({ studentFileSeen: e.detail.value === "true" }); },
  onNasPath(e) {
    this.setData({ nasPath: e.detail.value });
  },
  onKindChange(e) {
    const k = this.data.kinds[e.detail.value];
    this.setData({ expKind: k.v, expTitle: k.l });
  },

  previewPhotoUrls(urls) {
    return (urls || []).map((u) =>
      String(u).startsWith("http") ? u : `${API_BASE}${u}`
    );
  },
  previewRecordPhoto(e) {
    const operation = this.data.operations.find((o) => o.id === e.currentTarget.dataset.operation);
    if (operation && operation.photoPreviews.length) wx.previewImage({ urls: operation.photoPreviews, current: e.currentTarget.dataset.url });
  },

  uploadErrorText(code) {
    const map = {
      account_not_active: "账号未审核通过，无法上传（请联系主管）",
      unauthorized: "登录已失效，请重新登录",
      invalid_type: "图片格式不支持，请换 JPG/PNG",
      file_too_large: "图片过大（最大 12MB）",
      read_fail: "读取照片失败，请重试",
      network_error: "网络异常，请检查网络后重试",
      upload_fail: "上传失败，请重试",
    };
    return map[code] || code || "上传失败";
  },

  async choosePhotos() {
    if (!(await promptLogin("登录后可上传照片。"))) return;
    wx.chooseMedia({
      count: 6,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      fail: (err) => {
        const msg = (err && err.errMsg) || "";
        if (msg.includes("cancel")) return;
        wx.showToast({ title: "无法选择照片", icon: "none" });
      },
      success: async (res) => {
        const files = res.tempFiles || [];
        if (!files.length) {
          wx.showToast({ title: "未选择照片", icon: "none" });
          return;
        }
        this.setData({ uploading: true, uploadProgress: 0, busy: true, error: "" });
        const urls = [...this.data.photoUrls];
        let added = 0;
        try {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const rel = await api.uploadExperimentPhoto(f.tempFilePath, (pct) => {
              this.setData({ uploadProgress: pct });
            });
            if (rel) {
              urls.push(rel);
              added += 1;
            }
          }
          this.setData({
            photoUrls: urls,
            photoPreviews: this.previewPhotoUrls(urls),
          });
          if (added > 0) {
            wx.showToast({ title: `已上传 ${added} 张`, icon: "success" });
          } else {
            wx.showToast({ title: "上传失败，请重试", icon: "none" });
          }
        } catch (e) {
          const code = (e && e.code) || "";
          const msg = this.uploadErrorText(code);
          this.setData({ error: `照片上传失败：${msg}` });
          wx.showToast({ title: msg, icon: "none" });
        } finally {
          this.setData({ busy: false, uploading: false, uploadProgress: 0 });
        }
      },
    });
  },

  previewPhoto(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const urls = this.data.photoPreviews || [];
    const url = urls[idx];
    if (!url || !urls.length) return;
    wx.previewImage({ current: url, urls });
  },

  removePhoto(e) {
    const idx = Number(e.currentTarget.dataset.index);
    wx.showModal({
      title: "删除照片",
      content: "确定删除这张结果图？",
      success: (res) => {
        if (!res.confirm || Number.isNaN(idx)) return;
        const urls = [...(this.data.photoUrls || [])];
        urls.splice(idx, 1);
        this.setData({
          photoUrls: urls,
          photoPreviews: this.previewPhotoUrls(urls),
        });
      },
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

  chooseSurgeryPhotos() {
    wx.chooseMedia({count:9,mediaType:["image"],success:async res=>{this.setData({busy:true});try{const photos=[...this.data.surgeryPhotos];for(const f of res.tempFiles)photos.push(await api.uploadExperimentPhoto(f.tempFilePath));this.setData({surgeryPhotos:photos,surgeryPreviews:this.previewPhotoUrls(photos)});}catch(e){wx.showToast({title:e.code||"图片上传失败",icon:"none"});}finally{this.setData({busy:false});}}});
  },
  previewSurgeryPhoto(e) {wx.previewImage({urls:this.data.surgeryPreviews,current:this.data.surgeryPreviews[Number(e.currentTarget.dataset.index)]});},
  async saveSurgeryRecord() {
    if(!this.data.animal||!this.data.surgeryLocation.trim()||!this.data.surgeryPhotos.length){wx.showToast({title:"请填写位置并上传手术照片",icon:"none"});return;}
    this.setData({busy:true});try{const {request}=require("../../utils/api");await request("/api/cage-workflow",{method:"POST",data:{action:"surgery",id:this.data.animal.id,location:this.data.surgeryLocation,imageUrls:this.data.surgeryPhotos}});wx.showToast({title:"手术记录已保存"});}catch(e){wx.showToast({title:e.code||"保存失败",icon:"none"});}finally{this.setData({busy:false});}
  },
  async techSubmit() {
    if (!(await promptLogin("登录后可提交。"))) return;
    const op = this.data.openOp;
    if (!op) return;
    if (this.data.dataTransferred === null) { wx.showToast({ title: "请选择是否传输", icon: "none" }); return; }
    if (this.data.dataTransferred && !this.data.photoUrls.length) {
      wx.showToast({ title: "请先上传至少一张结果照片", icon: "none" });
      return;
    }
    this.setData({ busy: true });
    try {
      await api.patchExperimentOperation(op.id, "tech_submit", {
        resultNote: this.data.resultNote,
        assistantNames:this.data.assistantNames,
        dataTransferred: this.data.dataTransferred,
        resultImageUrls: this.data.photoUrls,
      });
      await this.lookup(this.data.animal.id);
      wx.showToast({ title: "已完成，已通知学生", icon: "success" });
    } catch (e) {
      const code = (e && e.code) || "";
      const map = {
        account_not_active: "账号未审核通过",
        forbidden: "无权提交此任务",
        invalid_state: "任务状态已变化，请刷新",
      };
      wx.showModal({
        title: "提交失败",
        content: map[code] || code || "请重试",
        showCancel: false,
      });
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
    if (op.dataTransferred === true && this.data.studentFileSeen === null) { wx.showToast({ title: "请反馈是否看到文件", icon: "none" }); return; }
    this.setData({ busy: true });
    try {
      await api.patchExperimentOperation(op.id, "student_close", {
        nasDataPath: this.data.nasPath.trim(),
        studentFileSeen: this.data.studentFileSeen,
      });
      await this.lookup(this.data.animal.id);
      wx.showToast({ title: this.data.studentFileSeen === false ? "已反馈技术员核查" : "实验已闭环", icon: "success" });
    } catch (e) {
      wx.showToast({ title: "闭环失败", icon: "none" });
    } finally {
      this.setData({ busy: false });
    }
  },
});
