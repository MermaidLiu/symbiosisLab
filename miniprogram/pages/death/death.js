const { api } = require("../../utils/api");
const { isLoggedIn, goLogin, promptLogin } = require("../../utils/auth");

const METHOD = { cervical: "断颈", perfusion: "灌流", found_dead: "发现死亡" };

Page({
  data: {
    animalId: "",
    animal: null,
    error: "",
    busy: false,
  },

  onLoad(query) {
    const animalId = (query && query.animalId) || "";
    this.setData({ animalId });
  },

  async onShow() {
    if (!(await promptLogin("登录后可查看死亡详情。"))) {
      if (!isLoggedIn()) goLogin();
      return;
    }
    if (!this.data.animalId) {
      this.setData({ error: "缺少 Animal ID" });
      return;
    }
    this.load();
  },

  async load() {
    this.setData({ busy: true, error: "" });
    try {
      const data = await api.lifecycleLookup(this.data.animalId);
      const animal = data.animal || null;
      if (!animal || !animal.deathAt) {
        this.setData({ animal: null, error: animal ? "尚未登记死亡" : "未找到小鼠" });
        return;
      }
      this.setData({
        animal: {
          ...animal,
          deathAtText: String(animal.deathAt).slice(0, 16).replace("T", " "),
          deathMethodLabel: METHOD[animal.deathMethod] || animal.deathMethod || "—",
        },
        error: "",
      });
    } catch (e) {
      this.setData({ error: (e && e.code) || "加载失败", animal: null });
    } finally {
      this.setData({ busy: false });
    }
  },
});
