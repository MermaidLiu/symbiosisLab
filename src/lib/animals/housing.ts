import type { ManagedAnimal } from "@/types/animal-management";
export const HOUSING_TYPES = ["adult_blank", "pup", "dam", "signal_headpiece", "immunity"] as const;
export type HousingType = typeof HOUSING_TYPES[number];
export const HOUSING_LABELS: Record<HousingType,string> = {adult_blank:"成年空白鼠",pup:"幼鼠（未离乳）",dam:"哺乳鼠妈",signal_headpiece:"术后信号鼠（带头件，单笼）",immunity:"免疫鼠"};
export function housingError(mice: Pick<ManagedAnimal,"housingType">[]): string|null {
  if(mice.some(a=>a.housingType==="signal_headpiece"))return mice.length>1?"headpiece_single_cage":null;
  const pups=mice.filter(a=>a.housingType==="pup").length;
  const dams=mice.filter(a=>a.housingType==="dam").length;
  if(pups||dams){
    if(mice.some(a=>a.housingType!=="pup"&&a.housingType!=="dam"))return "litter_cage_only";
    return pups>6||dams>1||mice.length>7?"litter_cage_full":null;
  }
  return mice.length>5?"adult_cage_full":null;
}

export const ENTRY_TYPES=[{value:"electrode",label:"植入电极手术鼠"},{value:"electrode_young",label:"植入电极幼鼠"},{value:"immune_surgery",label:"免疫手术鼠"},{value:"blank",label:"空白鼠"},{value:"other",label:"其他"}];
