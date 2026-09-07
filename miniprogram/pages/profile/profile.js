const { api } = require("../../utils/api");
const { requireLogin, getUser, setSession, getToken, clearSession } = require("../../utils/auth");

Page({
  data: {
    phone: "",
    phoneLocked: true,
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
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    pwdBusy: false,
    pwdMsg: "",
  },

  onShow() {
    if (!requireLogin()) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }
    const user = getUser();
    if (!user) return;
    const email = (user.email || "").endsWith("@phone.symbiosis.local") ? "" : user.email || "";
    const phoneLocked =
      user.phoneLocked === true ||
      (user.phoneLocked !== false && (user.email || "").endsWith("@phone.symbiosis.local"));
    this.setData({
      phone: user.phone || "",
      phoneLocked,
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

  onPhone(e) {
    this.setData({ phone: e.detail.value });
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
  onCurrentPwd(e) {
    this.setData({ currentPassword: e.detail.value });
  },
  onNewPwd(e) {
    this.setData({ newPassword: e.detail.value });
  },
  onConfirmPwd(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  async onSave() {
    this.setData({ busy: true, msg: "" });
    try {
      const payload = {
        name: this.data.name,
        email: this.data.email,
        school: this.data.school,
        department: this.data.department,
        employeeId: this.data.employeeId,
        personType: this.data.personType,
        contactExtra: this.data.contactExtra,
        nickname: this.data.nickname,
      };
      if (!this.data.phoneLocked) {
        payload.phone = this.data.phone;
      }
      const res = await api.updateProfile(payload);
      const token = getToken();
      setSession(token, res.user);
      getApp().globalData.user = res.user;
      this.setData({ msg: "已保存（必填项不可清空）" });
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (e) {
      const map = {
        required_fields_cannot_clear: "必填项不可清空",
        invalid_email: "邮箱无效",
        invalid_phone: "请填写有效手机号",
        phone_exists: "手机号已被占用",
        phone_locked: "手机号登录账号不可改手机号",
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

  async onChangePassword() {
    const currentPassword = this.data.currentPassword || "";
    const newPassword = (this.data.newPassword || "").trim();
    const confirmPassword = (this.data.confirmPassword || "").trim();
    if (newPassword.length < 6) {
      wx.showModal({ title: "修改失败", content: "新密码至少 6 位", showCancel: false });
      return;
    }
    if (newPassword !== confirmPassword) {
      wx.showModal({ title: "修改失败", content: "两次输入的新密码不一致", showCancel: false });
      return;
    }
    this.setData({ pwdBusy: true, pwdMsg: "" });
    try {
      await api.changePassword(currentPassword, newPassword);
      this.setData({
        pwdMsg: "密码已修改",
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      wx.showToast({ title: "密码已修改", icon: "success" });
    } catch (e) {
      const map = {
        wrong_password: "当前密码不正确",
        password_too_short: "新密码至少 6 位",
        password_unchanged: "新密码不能与当前密码相同",
        invalid_body: "请填写当前密码与新密码",
      };
      wx.showModal({
        title: "修改失败",
        content: map[e.code] || e.code || "请重试",
        showCancel: false,
      });
    } finally {
      this.setData({ pwdBusy: false });
    }
  },

  onLogout() {
    clearSession();
    getApp().globalData.user = null;
    wx.switchTab({ url: "/pages/home/home" });
  },
});
