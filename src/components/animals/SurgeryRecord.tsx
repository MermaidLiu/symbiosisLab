"use client";
import { useState } from "react";
import { PhotoPreview } from "./PhotoPreview";

export function SurgeryRecord({animalId,initialLocation="",initialPhotos=[]}:{animalId:string;initialLocation?:string;initialPhotos?:string[]}) {
  const [location,setLocation]=useState(initialLocation);
  const [photos,setPhotos]=useState(initialPhotos);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function upload(files:FileList|null){if(!files?.length)return;setBusy(true);setMessage("");try{const next=[...photos];for(const file of Array.from(files)){const form=new FormData();form.append("file",file);const r=await fetch("/api/experiment-uploads",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw Error(d.error);next.push(d.url);}setPhotos(next);}catch(e){setMessage(e instanceof Error?e.message:"上传失败");}finally{setBusy(false);}}
  async function save(){setBusy(true);setMessage("");try{const r=await fetch("/api/cage-workflow",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"surgery",id:animalId,location,imageUrls:photos})});const d=await r.json();if(!r.ok)throw Error(d.error);setMessage("手术位置与照片已保存");}catch(e){setMessage(e instanceof Error?e.message:"保存失败");}finally{setBusy(false);}}
  return <details className="my-4 rounded-xl border border-purple-100 bg-white/80 p-4"><summary className="cursor-pointer text-sm font-semibold text-purple-900">手术位置与照片 · 独立记录</summary><p className="my-2 text-xs text-slate-500">仅在需要记录手术位置时填写，电生理、行为学等实验任务可直接提交，无需填写此记录。</p><label className="text-sm">手术位置<input className="my-2 block w-full rounded-lg border p-2" value={location} onChange={e=>setLocation(e.target.value)} placeholder="位置、侧别或坐标"/></label><label className="text-sm">手术照片（必填）<input className="my-2 block" type="file" accept="image/*" capture="environment" multiple disabled={busy} onChange={e=>void upload(e.target.files)}/></label><div className="my-3 flex flex-wrap gap-2">{photos.map(url=><div key={url}><PhotoPreview src={url} alt="手术位置照片"/><button type="button" disabled={busy} className="block text-xs text-red-600" onClick={()=>setPhotos(p=>p.filter(x=>x!==url))}>移除</button></div>)}</div><button type="button" disabled={busy||!location.trim()||!photos.length} className="rounded-lg bg-purple-800 px-4 py-2 text-white disabled:opacity-40" onClick={()=>void save()}>{busy?"保存中…":"保存手术位置与照片"}</button>{message&&<p role="status" className="mt-2 text-sm text-purple-800">{message}</p>}</details>;
}
