// Keep account and animal-role decisions aligned with src/lib/account-status.ts and roles.ts.
function isExempt(user) { return !!user && (user.roles || []).includes("super_admin"); }
function needsProfileCompletion(user) {
  if (!user) return true;
  if (isExempt(user)) return false;
  const status = user.accountStatus || "active";
  if (status === "pending_profile" || status === "rejected") return true;
  if (!require("./phone-verification").enabled) return false;
  if (!user.phone) return false;
  const text = (v) => String(v || "").trim();
  const emp = text(user.employeeId);
  return !text(user.name) || !emp || emp.startsWith("LEGACY-") || !text(user.school) || !text(user.department) || /@phone\.symbiosis\.local$/i.test(text(user.email));
}
function canEditRealnameForm(user) {
  if (!user || isExempt(user)) return false;
  const status = user.accountStatus || "active";
  if (status === "pending_profile" || status === "rejected") return true;
  if (status === "pending_review" || status === "disabled") return false;
  return !!user.phone && needsProfileCompletion(user);
}
function isAnimalTechnician(user) {
  return !!user && (user.roles || []).some((r) => ["super_admin", "animal_facility_supervisor", "animal_manager", "animal_caretaker", "animal_collector"].includes(r));
}
function isAnimalClaimantStudent(user) {
  return !!user && (user.roles || []).includes("user") && !isAnimalTechnician(user);
}
module.exports = { needsProfileCompletion, canEditRealnameForm, isAnimalTechnician, isAnimalClaimantStudent };
