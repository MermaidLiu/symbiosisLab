const { api } = require("../../utils/api");
const { isLoggedIn, goLogin } = require("../../utils/auth");
const { formatDateTime } = require("../../utils/format");
const { monthLabel, buildMonthRows, pad } = require("../../utils/calendar");

const TYPE_LABEL = {
  notification: "通知",
  booking: "预约",
  activity: "动态",
};

Page({
  data: {
    guestMode: true,
    year: 0,
    month: 0,
    monthText: "",
    weeks: ["一", "二", "三", "四", "五", "六", "日"],
    rows: [],
    selected: "",
    byDate: {},
    dayEvents: [],
  },

  onLoad(query) {
    const now = new Date();
    let year = Number(query.year) || now.getFullYear();
    let month = Number(query.month) || now.getMonth() + 1;
    let selected =
      query.date ||
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
      year = Number(query.date.slice(0, 4));
      month = Number(query.date.slice(5, 7));
      selected = query.date;
    }
    this.setData({ year, month, selected });
  },

  onShow() {
    const loggedIn = isLoggedIn();
    this.setData({ guestMode: !loggedIn });
    if (!loggedIn) return;
    this.load();
  },

  goLogin() {
    goLogin();
  },

  onPullDownRefresh() {
    if (!isLoggedIn()) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    const { year, month, selected } = this.data;
    try {
      const res = await api.dailyLog(year, month);
      const byDate = res.byDate || {};
      const marked = new Set(res.markedDates || Object.keys(byDate));
      this.setData({
        guestMode: false,
        monthText: monthLabel(year, month),
        rows: buildMonthRows(year, month, marked, selected),
        byDate,
        dayEvents: this.mapEvents(byDate[selected] || []),
      });
    } catch (e) {
      if (e && e.status === 401) {
        this.setData({ guestMode: true });
        return;
      }
      wx.showToast({ title: "加载日志失败", icon: "none" });
    }
  },

  mapEvents(list) {
    return (list || []).map((e) => ({
      ...e,
      typeLabel: TYPE_LABEL[e.type] || e.type,
      timeText: formatDateTime(e.time).slice(11) || formatDateTime(e.time),
    }));
  },

  prevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    this.setData({ year, month, selected: `${year}-${pad(month)}-01` });
    this.load();
  },

  nextMonth() {
    let { year, month } = this.data;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this.setData({ year, month, selected: `${year}-${pad(month)}-01` });
    this.load();
  },

  onPickDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    const { byDate, year, month } = this.data;
    const marked = new Set(Object.keys(byDate || {}));
    this.setData({
      selected: date,
      rows: buildMonthRows(year, month, marked, date),
      dayEvents: this.mapEvents((byDate || {})[date] || []),
    });
  },
});
