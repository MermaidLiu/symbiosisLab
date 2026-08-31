const { api } = require("../../utils/api");
const { requireLogin, getUser, setSession, getToken, clearSession } = require("../../utils/auth");

Page({
  data: {
    phone: "",
    status: "",
    statusText: "",
    name: "",
    department: "",
    employeeId: "",
    personType: "学生",
    contactExtra: "",
    appliedRole: "student",
    appliedIndex: 0,
    roles: [
      { v: "student", l: "学生（认领员）" },
      { v: "technician", l: "技术员" },
      { v: "supervisor", l: "动物房主管" },
    ],
    canSubmit: false,
    busy: false,
    rejectReason: "",
  },

  onShow() {
    if (!requireLogin()) return;
    const user = getUser();
    if (!user) return;
    const st = user.accountStatus || "active";
    const map = {
      pending_profile: "待完善实名信息",
      pending_review: "您的实名信息正在审核中，请联系动物房主管。",
      rejected: "审核未通过",
      disabled: "账号已停用",
      active: "已激活",
    };
    this.setData({
      phone: user.phone || "",
      status: st,
      statusText: map[st] || st,
      name: user.name || "",
      department: user.department || "",
      employeeId: (user.employeeId || "").startsWith("LEGACY-") ? "" : user.employeeId || "",
      personType: user.personType || "学生",
      contactExtra: user.contactExtra || "",
      appliedRole: user.appliedRole || "student",
      canSubmit: st === "pending_profile" || st === "rejected",
      rejectReason: user.rejectReason || "",
    });
    if (st === "active") {
      wx.switchTab({ url: "/pages/home/home" });
    }
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },
  onDept(e) {
    this.setData({ department: e.detail.value });
  },
  onEmp(e) {
    this.setData({ employeeId: e.detail.value });
  },
  onPerson(e) {
    this.setData({ personType: e.detail.value });
  },
  onContact(e) {
    this.setData({ contactExtra: e.detail.value });
  },
  onRole(e) {
    const i = Number(e.detail.value);
    this.setData({ appliedIndex: i, appliedRole: this.data.roles[i].v });
  },

  async onSubmit() {
    this.setData({ busy: true });
    try {
      const res = await api.submitRealname({
        name: this.data.name,
        department: this.data.department,
        employeeId: this.data.employeeId,
        personType: this.data.personType,
        contactExtra: this.data.contactExtra,
        appliedRole: this.data.appliedRole,
      });
      const token = getToken();
      setSession(token, res.user);
      getApp().globalData.user = res.user;
      wx.showToast({ title: "已提交审核", icon: "success" });
      this.onShow();
    } catch (e) {
      wx.showModal({
        title: "提交失败",
        content: e.code || "请检查必填项",
        showCancel: false,
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  onLogout() {
    clearSession();
    getApp().globalData.user = null;
    wx.reLaunch({ url: "/pages/login/login" });
  },
});
