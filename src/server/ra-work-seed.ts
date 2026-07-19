import { RaWorkItem, RaWorkKind } from "@/types";
import { buildChecklist, getRaWorkModule } from "@/lib/ra/work-modules";
import { uid } from "@/server/crypto";

export function buildSeedRaWorkItems(): RaWorkItem[] {
  const now = new Date().toISOString();
  const mk = (
    kind: RaWorkKind,
    title: string,
    status: string,
    owner: string,
    due: string,
    notes: string,
    doneCount = 0
  ): RaWorkItem => {
    const mod = getRaWorkModule(kind);
    const checklist = buildChecklist(mod.checklistLabels, () => uid("chk")).map((c, i) => ({
      ...c,
      done: i < doneCount,
    }));
    return {
      id: uid("rwi"),
      kind,
      title,
      status,
      owner,
      due,
      notes,
      checklist,
      createdBy: "u-ra",
      createdAt: now,
      updatedAt: now,
    };
  };

  return [
    mk(
      "proposal",
      "国家自然科学基金面上项目申报（2026）",
      "form_review",
      "助理小刘",
      "2026-08-15",
      "形式审查中：核对预算表签章与合作单位公章。",
      2
    ),
    mk(
      "process",
      "横向课题「免疫成像」立项与过程监控",
      "monitoring",
      "助理小刘",
      "2026-09-30",
      "已完成立项手续，按季度跟踪进展。",
      2
    ),
    mk(
      "closure",
      "省重点实验室开放课题结题验收",
      "preparing",
      "助理小刘",
      "2026-10-20",
      "指导项目组准备技术报告与经费决算表。",
      1
    ),
    mk(
      "funding",
      "实验室公共平台运行经费执行监控",
      "monitoring",
      "助理小刘",
      "2026-12-31",
      "Q2 执行率 48%，待初审大额设备费合规性。",
      1
    ),
    mk(
      "sysinfo",
      "校科研系统项目信息同步更新",
      "pending_entry",
      "助理小刘",
      "2026-07-31",
      "待录入新立项 3 项、更新成员名单。",
      0
    ),
    mk(
      "liaison",
      "对接科技处与基金委补正材料",
      "external",
      "助理小刘",
      "2026-07-25",
      "已预约科技处窗口；基金委系统补正截止本周五。",
      1
    ),
    mk(
      "policy",
      "优化实验室横向课题立项流程说明",
      "drafting",
      "助理小刘",
      "2026-08-30",
      "收集近一年卡点问题，起草简化签批节点。",
      1
    ),
  ];
}
