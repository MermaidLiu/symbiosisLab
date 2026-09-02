const { api } = require("../../utils/api");
const { requireLogin, getUser, setSession, getToken, clearSession } = require("../../utils/auth");

Page({
  data: {
    phone: "",
    name: "",
    email: "",
    school: "",
    department: "",
    employeeId: "",
    personType: "",
    contactExtra: "",
    nickname: "",
    busy: false,
    msg: "",
  },

  onShow() {
    if (!requireLogin()) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }
    const user = getUser();
    if (!user) return;
    const email = (user.email || "").endsWith("@phone.symbiosis.local") ? "" : user.email || "";
    this.setData({
      phone: user.phone || "",
      name: user.name || "",
      email,
      school: user.school || "",
      department: user.department || "",
      employeeId: (user.employeeId || "").startsWith("LEGACY-") ? "" : user.employeeId || "",
      personType: user.personType || "",
      contactExtra: user.contactExtra || "",
      nickname: user.nickname || "",
      msg: "",
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
  onNick(e) {
    this.setData({ nickname: e.detail.value });
  },

  async onSave() {
    this.setData({ busy: true, msg: "" });
    try {
      const res = await api.updateProfile({
        name: this.data.name,
        email: this.data.email,
        school: this.data.school,
        department: this.data.department,
        employeeId: this.data.employeeId,
        personType: this.data.personType,
        contactExtra: this.data.contactExtra,
        nickname: this.data.nickname,
      });
      const token = getToken();
      setSession(token, res.user);
      getApp().globalData.user = res.user;
      this.setData({ msg: "已保存（必填项不可清空）" });
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (e) {
      const map = {
        required_fields_cannot_clear: "必填项不可清空",
        invalid_email: "邮箱无效",
        employee_id_exists: "学号已被占用",
        email_exists: "邮箱已被占用",
        roster_mismatch: "姓名与手机号须与课题组名单一致",
      };
      wx.showModal({
        title: "保存失败",
        content: map[e.code] || e.code || "请检查填写",
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
