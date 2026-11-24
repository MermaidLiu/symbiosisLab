import { NextRequest } from "next/server";
import { requireActiveUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore } from "@/server/store";
import { canManageAnimals } from "@/lib/roles";
import { isCageNumber, buildCageLayout } from "@/lib/animals/cage-grid";
import { appendLifecycleTrace, openOperationForAnimal } from "@/server/animal-lifecycle";
import { pushNotificationToUsers } from "@/server/notify";
import { ManagedAnimal } from "@/types/animal-management";

export async function GET() {
  const auth = await requireActiveUser();
  if ("error" in auth) return auth.error;
  const s = getStore();
  const manager = canManageAnimals(auth.user.roles);
  return jsonOk({ pendingExitAnimalIds:(s.animalOpTasks||[]).filter(t=>t.opType==="euthanasia"&&t.status==="scheduled").flatMap(t=>t.animalIds), cages: s.cages, layout: buildCageLayout(s.cages), animals: s.managedAnimals.filter(a => manager || a.claimantUserId === auth.user.id || a.technicianUserId === auth.user.id || s.animalOpTasks?.some(t => (t.assigneeUserId === auth.user.id || t.remainingSteps?.some(step=>step.assigneeUserId===auth.user.id)) && t.animalIds.includes(a.id))), owners: s.users.map(u => ({ id: u.id, name: u.name, email: u.email })) });
}

export async function POST(req: NextRequest) {
  const auth = await requireActiveUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;
  const manager = canManageAnimals(user.roles);
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");
  const id = String(b.id || "").trim();
  const number = String(b.cageNumber || "").trim().toUpperCase();
  if (!["enroll", "transfer", "exit", "notes", "surgery"].includes(action) || !id) return jsonError("invalid_body", 400);
  if ((action === "enroll" || action === "transfer") && !isCageNumber(number)) return jsonError("invalid_cage", 400);
  let error = "";
  let result: ManagedAnimal | undefined;
  await mutateStore(s => {
    const now = new Date().toISOString();
    let animal = s.managedAnimals.find(a => a.id === id);
    if (action === "enroll") {
      const qrCode = String(b.qrCode || "").trim();
      if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(id) || !qrCode || qrCode.length > 2048 || !b.strain || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.entryDate)) || Number.isNaN(Date.parse(b.entryDate))) { error = "invalid_body"; return; }
      if (s.managedAnimals.some(a => a.id.toLowerCase() === id.toLowerCase() || a.qrCode === qrCode) || (s.retiredAnimalIds || []).some(x => x.toLowerCase() === id.toLowerCase())) { error = "id_or_qr_exists"; return; }
      const owner = s.users.find(u => u.id === (manager ? b.ownerUserId : user.id));
      if (!owner) { error = "invalid_owner"; return; }
      animal = { id, qrCode, gender: "male", strain: String(b.strain).trim(), genotype: "未知", sireId: "—", sireGenotype: "—", damId: "—", damGenotype: "—", birthDate: "", ageWeeks: 0, cageLocation: number, status: "active", strainType: "public", generation: 1, weaningStatus: "weaned", genotypeStatus: "unidentified", purpose: "blank", lifecycleStatus: "entered", registrationStatus: "awaiting_experiment", registeredAt: now, cageEntryAt: String(b.entryDate), claimantUserId: owner.id, claimantName: owner.name, cageLabelNote: String(b.note || "") };
    } else {
      if (!animal) { error = "not_found"; return; }
      const assigned = animal.technicianUserId === user.id || s.animalOpTasks?.some(t => t.assigneeUserId === user.id && t.status === "scheduled" && t.animalIds.includes(id));
      if (!manager && animal.claimantUserId !== user.id && !(action === "surgery" && assigned)) { error = "forbidden"; return; }
      if (animal.exitedAt || animal.deathAt) { error = "animal_exited"; return; }
      if ((action === "exit" || action === "transfer") && (animal.animalLock || openOperationForAnimal(s, id))) { error = "animal_locked"; return; }
    }
    const from = animal!.cageLocation;
    if (action === "enroll" || action === "transfer") {
      const targetRack=buildCageLayout(s.cages).find(r=>r.rows.some(row=>row.cells.some(c=>c.number===number)));
      const target=targetRack?.rows.flatMap(r=>r.cells).find(c=>c.number===number);
      if(!targetRack || !target){error="invalid_cage";return;}
      let cage = s.cages.find(c => c.id === target.cageId);
      const count = s.managedAnimals.filter(a => a.id !== id && !a.exitedAt && !a.deathAt && a.status !== "deceased" && a.cageId === cage?.id).length;
      if (cage && count >= cage.capacity) { error = "cage_full"; return; }
      if (!cage) { cage = { id: "c-" + number.toLowerCase(), number, rack: targetRack.rack, strain: animal!.strain, cageType: "standard", capacity: 5, occupied: 0, status: "vacant" }; s.cages.push(cage); }
      animal!.cageId = cage.id; animal!.cageLocation = number;
      if (action === "enroll") s.managedAnimals.unshift(animal!);
    }
    if (action === "exit") { animal!.exitedAt = now; animal!.exitReason = String(b.reason || "退出"); animal!.cageId = undefined; animal!.cageLocation = "已退出"; }
    if (action === "notes") animal!.cageLabelNote = String(b.note || "").slice(0, 4000);
    if (action === "surgery") {
      const images = Array.isArray(b.imageUrls) ? b.imageUrls.filter((x: unknown) => typeof x === "string" && x.startsWith("/uploads/experiments/")) : [];
      if (!String(b.location || "").trim() || !images.length) { error = "surgery_location_and_photo_required"; return; }
      animal!.surgeryLocation = String(b.location).trim(); animal!.surgeryImageUrls = images; animal!.surgeryCompletedAt = now; animal!.implantAt = animal!.implantAt || now;
    }
    for (const cage of s.cages) { cage.occupied = s.managedAnimals.filter(a => a.cageId === cage.id && !a.exitedAt && !a.deathAt && a.status !== "deceased").length; }
    appendLifecycleTrace(s, {animalId: id, timestamp: now, action: "cage_" + action, userId: user.id, userName: user.name, details: `${action}：${id}，${from} → ${animal!.cageLocation}`});
    if (["enroll", "exit", "transfer"].includes(action)) {
      const recipients = s.users.filter(u => canManageAnimals(u.roles) || u.id === animal!.claimantUserId || u.id === animal!.technicianUserId).map(u => u.id);
      pushNotificationToUsers(s, [...new Set(recipients)], {title: "笼位变动", titleEn: "Cage change", message: `${user.name}：${id} ${action === "exit" ? "退出" : action === "transfer" ? "转移" : "进入"}，${from} → ${animal!.cageLocation}`, messageEn: `${id}: ${action}`, link: "/animals/managed", animalId: id});
    }
    result = { ...animal! };
  });
  if (error) return jsonError(error, error === "forbidden" ? 403 : 409);
  return jsonOk({animal: result, created: action === "enroll"});
}
