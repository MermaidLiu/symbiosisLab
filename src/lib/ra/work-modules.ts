import { RaWorkChecklistItem, RaWorkKind } from "@/types";

export interface RaWorkModuleConfig {
  kind: RaWorkKind;
  /** Route segment under /ra/ */
  path: string;
  navKey:
    | "raProposals"
    | "raProcess"
    | "raClosure"
    | "raFunding"
    | "raSysInfo"
    | "raLiaison"
    | "raPolicies";
  statuses: string[];
  defaultStatus: string;
  checklistLabels: string[];
}

export const RA_WORK_MODULES: RaWorkModuleConfig[] = [
  {
    kind: "proposal",
    path: "proposals",
    navKey: "raProposals",
    statuses: ["organizing", "form_review", "submitted", "tracking", "done"],
    defaultStatus: "organizing",
    checklistLabels: [
      "组织申报材料清单",
      "形式审查（格式/签章/附件）",
      "材料报送至主管部门",
      "跟踪申报进度与补正",
    ],
  },
  {
    kind: "process",
    path: "process",
    navKey: "raProcess",
    statuses: ["setup", "monitoring", "tracking", "resolving", "done"],
    defaultStatus: "setup",
    checklistLabels: [
      "完成立项手续",
      "建立过程监控节点",
      "进展跟踪与里程碑确认",
      "协调解决问题并闭环",
    ],
  },
  {
    kind: "closure",
    path: "closure",
    navKey: "raClosure",
    statuses: ["preparing", "acceptance", "archiving", "done"],
    defaultStatus: "preparing",
    checklistLabels: [
      "指导结题材料准备",
      "组织验收/结题会",
      "成果登记",
      "材料归档入库",
    ],
  },
  {
    kind: "funding",
    path: "funding",
    navKey: "raFunding",
    statuses: ["budget", "monitoring", "compliance", "settlement", "done"],
    defaultStatus: "budget",
    checklistLabels: [
      "指导预算编制",
      "监控经费使用进度",
      "初审支出合规性",
      "协助决算与审计对接",
    ],
  },
  {
    kind: "sysinfo",
    path: "sys-info",
    navKey: "raSysInfo",
    statuses: ["pending_entry", "updated", "verified", "done"],
    defaultStatus: "pending_entry",
    checklistLabels: [
      "录入项目基础信息",
      "更新进度/人员/附件",
      "核对系统字段一致性",
      "维护账号与权限可用性",
    ],
  },
  {
    kind: "liaison",
    path: "liaison",
    navKey: "raLiaison",
    statuses: ["internal", "external", "follow_up", "done"],
    defaultStatus: "internal",
    checklistLabels: [
      "对接校内院系/实验室",
      "对接校内职能部门",
      "对接校外项目主管部门",
      "确认事项闭环并反馈项目组",
    ],
  },
  {
    kind: "policy",
    path: "policies",
    navKey: "raPolicies",
    statuses: ["drafting", "reviewing", "published", "done"],
    defaultStatus: "drafting",
    checklistLabels: [
      "梳理现行制度/流程痛点",
      "起草或协助修订文本",
      "征求意见与修订",
      "发布宣贯并归档",
    ],
  },
];

export function getRaWorkModule(kind: RaWorkKind): RaWorkModuleConfig {
  const found = RA_WORK_MODULES.find((m) => m.kind === kind);
  if (!found) throw new Error(`unknown_ra_work_kind:${kind}`);
  return found;
}

export function buildChecklist(
  labels: string[],
  makeId: () => string = () => `chk-${Math.random().toString(36).slice(2, 10)}`
): RaWorkChecklistItem[] {
  return labels.map((label) => ({
    id: makeId(),
    label,
    done: false,
  }));
}
