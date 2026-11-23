"use client";
import { PhotoPreview } from "./PhotoPreview";
import { useState } from "react";

export function OperationPhotoUpload({photos,onChange,onBusyChange,disabled=false}:{photos:string[];onChange:(photos:string[])=>void;onBusyChange?:(busy:boolean)=>void;disabled?:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function upload(files:FileList|null){if(!files?.length)return;setBusy(true);onBusyChange?.(true);setError("");const next=[...photos];try{for(const file of Array.from(files)){const f=new FormData();f.append("file",file);const r=await fetch("/api/experiment-uploads",{method:"POST",body:f});const d=await r.json();if(!r.ok)throw Error(d.error);next.push(d.url);}onChange(next);}catch(e){onChange(next);setError(e instanceof Error?e.message:"上传失败");}finally{setBusy(false);onBusyChange?.(false);}}
  return <div className="space-y-2"><label className="block text-sm font-medium">本次操作照片<input type="file" accept="image/*" capture="environment" multiple disabled={disabled||busy} onChange={e=>void upload(e.target.files)} className="my-2 block text-xs"/></label>{busy&&<p className="text-xs">正在上传…</p>}{error&&<p role="alert" className="text-xs text-red-600">{error}</p>}<div className="flex flex-wrap gap-2">{photos.map(url=><div key={url}><PhotoPreview src={url} alt="操作记录照片"/><button type="button" disabled={busy||disabled} className="block text-xs text-red-600" onClick={()=>onChange(photos.filter(p=>p!==url))}>移除</button></div>)}</div><p className="text-xs text-slate-500">照片随本次操作保存，点击缩略图可查看大图。</p></div>;
}
