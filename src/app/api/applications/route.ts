import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
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
  if (!description) return jsonError("invalid_body", 400);

  const item: OperationApplication = {
    id: `APP-${new Date().getFullYear()}-${uid("app").slice(-4)}`,
    applicationTime: new Date().toISOString(),
    applicant: user.name,
    pi: String(body.pi ?? "—"),
    type,
    description,
    status: "pending_receipt",
    waitingHours: 0,
  };

  await mutateStore((s) => {
    s.applications = [item, ...s.applications];
  });
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "create",
    entityType: "application",
    entityId: item.id,
    details: `新建操作申请: ${item.id}`,
  });

  return jsonOk({ application: item, applications: getStore().applications }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError("invalid_body", 400);

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
