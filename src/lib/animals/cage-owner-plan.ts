import plan from "./cage-owner-plan.json";

export function cageOwnerPlan(location: string) {
  let number=location.trim().toUpperCase();
  const old=number.match(/RACK\s*([A-Z])\s*\/\s*([A-Z]+)0*(\d+)/);
  if(old)number=`${old[1].charCodeAt(0)-64}${old[2]}${Number(old[3])}`;
  return plan.find(cell=>cell.number===number);
}
