import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { canManageAnimals } from "@/lib/roles";
import { ApplicationType, OperationApplication } from "@/types/animal-management";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ applications: getStore().applications });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const type = (body.type ?? "other") as ApplicationType;
  const description = String(body.description ?? "").trim();
  const animalIds = Array.isArray(body.animalIds)
    ? (body.animalIds as unknown[]).map((x) => String(x)).filter(Boolean)
    : undefined;

  if (type === "custody") {
    if (!animalIds?.length) return jsonError("invalid_body", 400);
  } else if (!description) {
    return jsonError("invalid_body", 400);
  }

  const desc =
    type === "custody"
      ? description || `申请代管动物: ${animalIds!.join(", ")}`
      : description;

  const item: OperationApplication = {
    id: `APP-${new Date().getFullYear()}-${uid("app").slice(-4)}`,
    applicationTime: new Date().toISOString(),
    applicant: user.name,
    applicantUserId: user.id,
    pi: String(body.pi ?? "—"),
    type,
    description: desc,
    animalIds: type === "custody" ? animalIds : undefined,
    status: "pending_receipt",
    waitingHours: 0,
  };

  await mutateStore((s) => {
    s.applications = [item, ...s.applications];

    // Notify animal/area managers + super admins
    const managers = s.users.filter(
      (u) => u.roles.includes("super_admin") || canManageAnimals(u.roles)
    );
    for (const mgr of managers) {
      if (mgr.id === user.id) continue;
      s.notifications.unshift({
        id: uid("ntf"),
        userId: mgr.id,
        title: type === "custody" ? "新的代管申领待审核" : "新的操作申请待处理",
        titleEn: type === "custody" ? "Custody request pending" : "New application pending",
        message:
          type === "custody"
            ? `${user.name} 申请代管 ${animalIds!.length} 只动物，请审核`
            : `${user.name} 提交了操作申请: ${item.id}`,
        messageEn:
          type === "custody"
            ? `${user.name} requested custody of ${animalIds!.length} animal(s)`
            : `${user.name} submitted application ${item.id}`,
        read: false,
        link: "/animals/applications",
        kind: "info",
        applicationId: item.id,
        handled: false,
        createdAt: new Date().toISOString(),
      });
    }
  });

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "create",
    entityType: "application",
    entityId: item.id,
    details: type === "custody" ? `代管申领: ${animalIds!.join(",")}` : `新建操作申请: ${item.id}`,
  });

  return jsonOk({ application: item, applications: getStore().applications }, { status: 201 });
}

/** PATCH — managers approve / reject / advance workflow */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const canReview =
    user.roles.includes("super_admin") || canManageAnimals(user.roles);
  if (!canReview) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const action = String(body.action ?? "") as "approve" | "reject" | "receive";
  if (!id || !["approve", "reject", "receive"].includes(action)) {
    return jsonError("invalid_body", 400);
  }

  const store = getStore();
  const existing = store.applications.find((a) => a.id === id);
  if (!existing) return jsonError("not_found", 404);

  const now = new Date().toISOString();
  let updated: OperationApplication | null = null;

  await mutateStore((s) => {
    const idx = s.applications.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const app = s.applications[idx];

    if (action === "reject") {
      s.applications[idx] = {
        ...app,
        status: "rejected",
        processor: user.name,
        completionTime: now,
        feedback: String(body.feedback ?? "未通过审核"),
      };
    } else if (action === "approve") {
      // Custody / general: mark completed as approved
      s.applications[idx] = {
        ...app,
        status: "completed",
        processor: user.name,
        receivedTime: app.receivedTime ?? now,
        completionTime: now,
        feedback: String(body.feedback ?? "审核通过"),
      };
    } else {
      s.applications[idx] = {
        ...app,
        status: "received",
        processor: user.name,
        receivedTime: now,
      };
    }

    updated = s.applications[idx];

    const applicantId = app.applicantUserId;
    if (applicantId && (action === "approve" || action === "reject")) {
      const approved = action === "approve";
      s.notifications.unshift({
        id: uid("ntf"),
        userId: applicantId,
        title: approved ? "申领已通过审核" : "申领未通过审核",
        titleEn: approved ? "Request approved" : "Request rejected",
        message: approved
          ? `您的申请 ${app.id} 已通过管理员审核`
          : `您的申请 ${app.id} 未通过审核${body.feedback ? `：${body.feedback}` : ""}`,
        messageEn: approved
          ? `Your application ${app.id} was approved`
          : `Your application ${app.id} was rejected`,
        read: false,
        link: "/animals/applications",
        kind: "application_status",
        applicationId: app.id,
        handled: false,
        createdAt: now,
      });
    }
  });

  if (!updated) return jsonError("not_found", 404);

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: `application_${action}`,
    entityType: "application",
    entityId: id,
    details: `申请 ${id} → ${action}`,
  });

  return jsonOk({ application: updated, applications: getStore().applications });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError("invalid_body", 400);

  const app = getStore().applications.find((a) => a.id === id);
  if (!app) return jsonError("not_found", 404);
  if (app.applicantUserId && app.applicantUserId !== user.id && !user.roles.includes("super_admin")) {
    return jsonError("forbidden", 403);
  }

  await mutateStore((s) => {
    s.applications = s.applications.filter((a) => a.id !== id);
  });
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "cancel",
    entityType: "application",
    entityId: id,
    details: `取消申请: ${id}`,
  });
  return jsonOk({ applications: getStore().applications });
}
