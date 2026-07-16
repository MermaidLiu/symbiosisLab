/** Demo / workspace snapshot for Research Assistant PhD cockpit */

export interface RaProject {
  id: string;
  name: string;
  status: "active" | "paused" | "done";
  progress: number;
  due: string;
}

export interface RaSubmission {
  id: string;
  title: string;
  venue: string;
  status: "draft" | "submitted" | "revision" | "accepted" | "rejected";
  updatedAt: string;
}

export interface RaThesisMilestone {
  id: string;
  title: string;
  done: boolean;
  weight: number;
}

export interface RaAchievement {
  id: string;
  title: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface RaHealthCheck {
  date: string;
  sleepHours: number;
  mood: "good" | "ok" | "low";
  exercise: boolean;
  note: string;
}

export interface RaReviewEntry {
  date: string;
  wentWell: string;
  improve: string;
  tomorrow: string;
}

export interface RaAdvisorNote {
  id: string;
  date: string;
  topic: string;
  summary: string;
}

export interface RaWorkspace {
  projects: RaProject[];
  submissions: RaSubmission[];
  thesisProgress: number;
  thesisMilestones: RaThesisMilestone[];
  achievements: RaAchievement[];
  healthToday: RaHealthCheck;
  reviewToday: RaReviewEntry | null;
  advisorNotes: RaAdvisorNote[];
  analytics: {
    papersYtd: number;
    experimentsWeek: number;
    fundingUsedPct: number;
    labMembersActive: number;
  };
  expensesPending: number;
}

export function getRaWorkspace(): RaWorkspace {
  return {
    projects: [
      { id: "p1", name: "共生微生物组课题", status: "active", progress: 62, due: "2026-09-30" },
      { id: "p2", name: "仪器预约智能化", status: "active", progress: 40, due: "2026-08-15" },
      { id: "p3", name: "横向合作—免疫成像", status: "paused", progress: 25, due: "2026-12-01" },
      { id: "p4", name: "开题报告修订", status: "done", progress: 100, due: "2026-03-01" },
    ],
    submissions: [
      { id: "s1", title: "Gut symbiont metabolic crosstalk", venue: "Nature Micro", status: "revision", updatedAt: "2026-07-10" },
      { id: "s2", title: "Lab booking fairness model", venue: "Bioinformatics", status: "submitted", updatedAt: "2026-07-08" },
      { id: "s3", title: "Cage occupancy prediction", venue: "Lab Animal", status: "draft", updatedAt: "2026-07-12" },
    ],
    thesisProgress: 48,
    thesisMilestones: [
      { id: "t1", title: "文献综述", done: true, weight: 15 },
      { id: "t2", title: "开题答辩", done: true, weight: 15 },
      { id: "t3", title: "核心实验章节", done: false, weight: 35 },
      { id: "t4", title: "论文初稿", done: false, weight: 20 },
      { id: "t5", title: "预答辩 / 送审", done: false, weight: 15 },
    ],
    achievements: [
      { id: "a1", title: "连续复盘 7 天", unlocked: true, unlockedAt: "2026-07-07" },
      { id: "a2", title: "首次投稿接收", unlocked: true, unlockedAt: "2026-05-20" },
      { id: "a3", title: "项目看板清零", unlocked: false },
      { id: "a4", title: "论文进度过半", unlocked: false },
      { id: "a5", title: "健康打卡月度达人", unlocked: true, unlockedAt: "2026-06-30" },
    ],
    healthToday: {
      date: new Date().toISOString().slice(0, 10),
      sleepHours: 6.5,
      mood: "ok",
      exercise: false,
      note: "实验较晚，注意补觉",
    },
    reviewToday: null,
    advisorNotes: [
      { id: "m1", date: "2026-07-11", topic: "论文第三章结构调整", summary: "先补对照实验，再重写讨论段。" },
      { id: "m2", date: "2026-07-04", topic: "横向经费使用节点", summary: "8 月前提交中期材料。" },
    ],
    analytics: {
      papersYtd: 2,
      experimentsWeek: 5,
      fundingUsedPct: 37,
      labMembersActive: 8,
    },
    expensesPending: 2,
  };
}

export function activeProjectCount(ws: RaWorkspace): number {
  return ws.projects.filter((p) => p.status === "active").length;
}

export function openSubmissionCount(ws: RaWorkspace): number {
  return ws.submissions.filter((s) => s.status !== "accepted" && s.status !== "rejected").length;
}

export function unlockedAchievementCount(ws: RaWorkspace): number {
  return ws.achievements.filter((a) => a.unlocked).length;
}
