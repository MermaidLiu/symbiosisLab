const { api } = require("../../utils/api");
const { requireLogin, getUser, setSession, getToken, clearSession } = require("../../utils/auth");

function needsProfile(user) {
  if (!user) return true;
  if (Array.isArray(user.roles) && user.roles.indexOf("super_admin") >= 0) return false;
  const st = user.accountStatus || "active";
  if (st === "pending_profile" || st === "rejected") return true;
  if (st === "pending_review" || st === "disabled") return true;
  if (!user.phone) return false;
  if (!(user.name || "").trim()) return true;
  const emp = (user.employeeId || "").trim();
  if (!emp || emp.startsWith("LEGACY-")) return true;
  if (!(user.school || "").trim()) return true;
  if (!(user.department || "").trim()) return true;
  if ((user.email || "").endsWith("@phone.symbiosis.local")) return true;
  return false;
}

Page({
  data: {
    phone: "",
    status: "",
    statusText: "",
    name: "",
    email: "",
    school: "",
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
    alreadyActive: false,
    busy: false,
    rejectReason: "",
  },

  onShow() {
    if (!requireLogin()) {
      wx.switchTab({ url: "/pages/home/home" });
      return;
    }
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
    const incomplete = needsProfile(user);
    if (
      (Array.isArray(user.roles) && user.roles.indexOf("super_admin") >= 0) ||
      (st === "active" && !incomplete)
    ) {
      wx.switchTab({ url: "/pages/home/home" });
      return;
    }
    const email = (user.email || "").endsWith("@phone.symbiosis.local") ? "" : user.email || "";
    this.setData({
      phone: user.phone || "",
      status: st,
      statusText: map[st] || st,
      name: user.name || "",
      email,
      school: user.school || "",
      department: user.department || "",
      employeeId: (user.employeeId || "").startsWith("LEGACY-") ? "" : user.employeeId || "",
      personType: user.personType || "学生",
      contactExtra: user.contactExtra || "",
      appliedRole: user.appliedRole || "student",
      canSubmit: st === "pending_profile" || st === "rejected" || (st === "active" && incomplete),
      alreadyActive: st === "active",
      rejectReason: user.rejectReason || "",
    });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },
  onEmail(e) {
    this.setData({ email: e.detail.value });
  },
  onSchool(e) {
    this.setData({ school: e.detail.value });
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
        email: this.data.email,
        school: this.data.school,
        department: this.data.department,
        employeeId: this.data.employeeId,
        personType: this.data.personType,
        contactExtra: this.data.contactExtra,
        appliedRole: this.data.appliedRole,
      });
      const token = getToken();
      setSession(token, res.user);
      getApp().globalData.user = res.user;
      wx.showToast({ title: this.data.alreadyActive ? "已保存" : "已提交审核", icon: "success" });
      if (this.data.alreadyActive || (res.user.accountStatus || "") === "active") {
        setTimeout(() => wx.switchTab({ url: "/pages/home/home" }), 400);
        return;
      }
      this.onShow();
    } catch (e) {
      const code = e.code || "";
      const map = {
        roster_mismatch: "姓名与手机号不在课题组名单中，无法使用系统。请联系系统管理员录入后再认证。",
        employee_id_exists: "该工号/学号已被占用",
        email_exists: "该邮箱已被占用",
        invalid_email: "请填写有效邮箱",
        invalid_body: "请完整填写必填项",
      };
      wx.showModal({
        title: "提交失败",
        content: map[code] || code || "请检查必填项",
        showCancel: false,
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  onLogout() {
    clearSession();
    getApp().globalData.user = null;
    wx.switchTab({ url: "/pages/home/home" });
  },
});
