import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { canSuperviseAnimalFacility, canManageAnimals, hasRole } from "@/lib/roles";
import {
  AnimalPurpose,
  ANIMAL_PURPOSES,
  DeathMethod,
  DEATH_METHODS,
  EphysRecordStatus,
  EPHYS_STATUSES,
  EuthanasiaMethod,
  EUTHANASIA_METHODS,
  ManagedAnimal,
  MouseLifecycleStatus,
  PURPOSE_LIFECYCLE,
  STATUS_JELLY_COLORS,
} from "@/types/animal-management";
import { buildFacilityCageCells } from "@/lib/animals/facility-board";
import { displayName, findUserByKey } from "@/lib/users";

function canFullEdit(user: { roles: import("@/types").Role[] }) {
  return hasRole(user.roles, "super_admin") || canManageAnimals(user.roles);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const store = getStore();
  const existing = store.managedAnimals.find((a) => a.id === id);
  if (!existing) return jsonError("not_found", 404);

  const isClaimant = existing.claimantUserId === user.id;
  const fullEdit = canFullEdit(user);
  if (!fullEdit && !isClaimant) return jsonError("forbidden", 403);

  // Claimants may only edit status tip fields
  const claimantOnlyKeys = new Set(["statusLabel", "statusColor", "recordingStatus"]);
  if (!fullEdit && isClaimant) {
    const keys = Object.keys(body).filter((k) => body[k] !== undefined);
    if (keys.length === 0 || keys.some((k) => !claimantOnlyKeys.has(k))) {
      return jsonError("forbidden", 403);
    }
  }

  const prevClaimant = existing.claimantUserId;
  const prevClaimantName = existing.claimantName;
  const prevTech = existing.technicianUserId;
  const prevTechName = existing.technicianName;

  let updated: ManagedAnimal | null = null;

  await mutateStore((s) => {
    const idx = s.managedAnimals.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const cur = s.managedAnimals[idx];
    const next: ManagedAnimal = { ...cur };
    const prevLife = cur.lifecycleStatus;
    const prevCollection = cur.collectionAt;

    if (body.statusLabel !== undefined) {
      next.statusLabel = String(body.statusLabel ?? "").trim() || undefined;
    }
    if (body.statusColor !== undefined) {
      const c = String(body.statusColor || "");
      if (!c) next.statusColor = undefined;
      else if (STATUS_JELLY_COLORS.includes(c as (typeof STATUS_JELLY_COLORS)[number])) {
        next.statusColor = c as ManagedAnimal["statusColor"];
      }
    }
    if (body.recordingStatus !== undefined) {
      const rs = String(body.recordingStatus || "");
      if (!rs) next.recordingStatus = undefined;
      else if (["living", "dead", "waiting", "optotagging"].includes(rs)) {
        next.recordingStatus = rs as ManagedAnimal["recordingStatus"];
      }
    }

    if (body.purpose !== undefined) {
      const p = String(body.purpose) as AnimalPurpose;
      if (ANIMAL_PURPOSES.includes(p)) next.purpose = p;
    }
    if (body.lifecycleStatus !== undefined) {
      const life = String(body.lifecycleStatus) as MouseLifecycleStatus;
      const allowed = PURPOSE_LIFECYCLE[next.purpose ?? "blank"] ?? [];
      if (allowed.includes(life) || life === "entered" || life === "euthanasia" || life === "signal_recording") {
        next.lifecycleStatus = life;
      }
    }
    if (body.euthanasiaMethod !== undefined) {
      const v = String(body.euthanasiaMethod);
      if (!v || v === "unassigned") next.euthanasiaMethod = undefined;
      else if (EUTHANASIA_METHODS.includes(v as EuthanasiaMethod)) {
        next.euthanasiaMethod = v as EuthanasiaMethod;
      }
    }
    if (body.euthanasiaNote !== undefined) {
      next.euthanasiaNote = String(body.euthanasiaNote || "").trim() || undefined;
    }
    if (body.status !== undefined) {
      const st = String(body.status);
      if (["active", "breeding", "quarantine", "reserved", "deceased"].includes(st)) {
        next.status = st as ManagedAnimal["status"];
      }
    }
    if (body.implantAt !== undefined) next.implantAt = String(body.implantAt || "") || undefined;
    if (body.specialExperiment !== undefined) {
      next.specialExperiment = String(body.specialExperiment || "").trim() || undefined;
    }
    if (body.ephysStatus !== undefined) {
      const v = String(body.ephysStatus);
      if (!v || v === "unassigned") next.ephysStatus = undefined;
      else if (EPHYS_STATUSES.includes(v as EphysRecordStatus)) {
        next.ephysStatus = v as EphysRecordStatus;
      }
    }
    if (body.deathMethod !== undefined) {
      const v = String(body.deathMethod);
      if (!v || v === "unassigned") next.deathMethod = undefined;
      else if (DEATH_METHODS.includes(v as DeathMethod)) {
        next.deathMethod = v as DeathMethod;
      }
    }
    if (body.cageId !== undefined) {
      const cageId = String(body.cageId || "");
      if (!cageId || cageId === "unassigned") {
        next.cageId = undefined;
        next.cageLocation = "未分配";
      } else {
        const cage = s.cages.find((c) => c.id === cageId);
        next.cageId = cageId;
        next.cageLocation = cage ? `${cage.rack} / ${cage.number}` : cageId;
      }
    }
    if (body.cageLocation !== undefined) next.cageLocation = String(body.cageLocation);
    if (body.strain !== undefined) next.strain = String(body.strain);
    if (body.gender !== undefined && (body.gender === "male" || body.gender === "female")) {
      next.gender = body.gender;
    }
    if (body.cageEntryAt !== undefined) next.cageEntryAt = String(body.cageEntryAt || "") || undefined;
    if (body.collectionAt !== undefined) next.collectionAt = String(body.collectionAt || "") || undefined;
    if (body.lastCollectionAt !== undefined) {
      next.lastCollectionAt = String(body.lastCollectionAt || "") || undefined;
    }

    // Claimant
    if (body.claimantUserId !== undefined) {
      const cid = String(body.claimantUserId || "");
      if (!cid || cid === "unassigned") {
        next.claimantUserId = undefined;
        next.claimantName = undefined;
      } else {
        const u = s.users.find((x) => x.id === cid);
        next.claimantUserId = cid;
        next.claimantName = u ? displayName(u) : String(body.claimantName ?? cid);
      }
    } else if (body.claimantName !== undefined) {
      const name = String(body.claimantName || "").trim();
      if (!name || name === "未分配") {
        next.claimantUserId = undefined;
        next.claimantName = undefined;
      } else {
        const u = findUserByKey(s.users, name);
        if (u) {
          next.claimantUserId = u.id;
          next.claimantName = displayName(u);
        } else {
          next.claimantName = name;
        }
      }
    }

    // Technician
    if (body.technicianUserId !== undefined) {
      const tid = String(body.technicianUserId || "");
      if (!tid || tid === "unassigned") {
        next.technicianUserId = undefined;
        next.technicianName = undefined;
      } else {
        const u = s.users.find((x) => x.id === tid);
        next.technicianUserId = tid;
        next.technicianName = u ? displayName(u) : String(body.technicianName ?? tid);
      }
    } else if (body.technicianName !== undefined) {
      const name = String(body.technicianName || "").trim();
      if (!name || name === "未分配") {
        next.technicianUserId = undefined;
        next.technicianName = undefined;
      } else {
        const u = findUserByKey(s.users, name);
        if (u) {
          next.technicianUserId = u.id;
          next.technicianName = displayName(u);
        } else {
          next.technicianName = name;
        }
      }
    }

    s.managedAnimals[idx] = next;
    updated = next;

    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    const pushAct = (action: string, details: string) => {
      s.animalDayActivities = [
        {
          id: uid("act"),
          date,
          timestamp: now,
          animalId: id,
          cageId: next.cageId,
          action,
          details,
          userId: user.id,
          userName: user.name,
        },
        ...(s.animalDayActivities ?? []),
      ].slice(0, 500);
    };

    if (prevClaimant !== next.claimantUserId) {
      pushAct(
        "claimant_change",
        `${id} 申领人：${prevClaimantName || "未分配"} → ${next.claimantName || "未分配"}`
      );
      // Notify previous & new claimants
      for (const [uidTarget, title, msg] of [
        [
          prevClaimant,
          "小鼠申领已移交",
          `您不再负责小鼠 ${id}（已移交至 ${next.claimantName || "未分配"}）`,
        ],
        [
          next.claimantUserId,
          "小鼠申领已分配给您",
          `您已成为小鼠 ${id} 的申领人（原：${prevClaimantName || "未分配"}）`,
        ],
      ] as const) {
        if (!uidTarget) continue;
        s.notifications.unshift({
          id: uid("ntf"),
          userId: uidTarget,
          title,
          titleEn: title,
          message: msg,
          messageEn: msg,
          read: false,
          link: "/animals/managed",
          kind: "info",
          handled: false,
          createdAt: now,
        });
      }
    }
    if (prevTech !== next.technicianUserId) {
      pushAct(
        "technician_change",
        `${id} 技术员：${prevTechName || "未分配"} → ${next.technicianName || "未分配"}`
      );
      for (const [uidTarget, title, msg] of [
        [
          prevTech,
          "小鼠技术员职责已移交",
          `您不再负责小鼠 ${id}（已移交至 ${next.technicianName || "未分配"}）`,
        ],
        [
          next.technicianUserId,
          "小鼠已分配给您（技术员）",
          `您已成为小鼠 ${id} 的技术员（原：${prevTechName || "未分配"}）`,
        ],
      ] as const) {
        if (!uidTarget) continue;
        s.notifications.unshift({
          id: uid("ntf"),
          userId: uidTarget,
          title,
          titleEn: title,
          message: msg,
          messageEn: msg,
          read: false,
          link: "/animals/facility-board",
          kind: "info",
          handled: false,
          createdAt: now,
        });
      }
    }

    if (prevCollection !== next.collectionAt && next.collectionAt) {
      pushAct("record_signal", `${id} 记录信号采集（上次：${prevCollection || "无"}）`);
    }
    if (prevLife !== next.lifecycleStatus && next.lifecycleStatus === "euthanasia") {
      const method = next.euthanasiaMethod ?? "unset";
      const note = next.euthanasiaNote ? `：${next.euthanasiaNote}` : "";
      pushAct("euthanasia", `${id} 强制处死（${method}${note}）`);
    }
  });

  if (!updated) return jsonError("not_found", 404);

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "update",
    entityType: "managed_animal",
    entityId: id,
    details: `更新小鼠 ${id}`,
  });

  const cells = buildFacilityCageCells(getStore().cages, getStore().managedAnimals);
  return jsonOk({
    animal: updated,
    managedAnimals: getStore().managedAnimals,
    cells,
    activities: getStore().animalDayActivities,
  });
}
