"use client";
import { useId } from "react";

/** Editable combobox: suggestions never restrict a student's own strain name. */
export function StrainField({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const id=useId();
  return <label className="block text-sm">品系
    <input required list={id} value={value} onChange={e=>onChange(e.target.value)} placeholder="选择转基因、C57，或自行输入" className="mt-1 block w-full rounded-lg border border-purple-100 bg-white p-2.5"/>
    <datalist id={id}><option value="转基因"/><option value="C57"/></datalist>
  </label>;
}
