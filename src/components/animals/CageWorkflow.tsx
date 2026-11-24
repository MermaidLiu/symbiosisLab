"use client";
/* eslint-disable @next/next/no-img-element -- uploaded photos use the dynamic file endpoint */
import { ENTRY_TYPES, HOUSING_TYPES, HOUSING_LABELS, HousingType } from "@/lib/animals/housing";
import styles from "./CageWorkflow.module.css";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canManageAnimals } from "@/lib/roles";
import { buildCageLayout, CageGridRack } from "@/lib/animals/cage-grid";
import { ManagedAnimal, Cage } from "@/types/animal-management";
import { PhotoPreview } from "./PhotoPreview";
import { AssignAnimalOpModal } from "./AssignAnimalOpModal";
import { FluentModal } from "@/components/fluent/FluentModal";
import { StrainField } from "./StrainField";

const errors: Record<string,string> = {invalid_body:"请填写编号、二维码、日期和品系", invalid_cage:"请选择有效笼位", id_or_qr_exists:"编号或二维码已被使用", invalid_owner:"请选择所属人", entry_type_other_required:"请填写其他类型",cage_full:"目标笼位已满",adult_cage_full:"成年鼠每笼最多5只",litter_cage_full:"育幼笼最多6只幼鼠和1只鼠妈",litter_cage_only:"育幼笼仅允许幼鼠和哺乳鼠妈，请选择其他笼位",headpiece_single_cage:"带头件信号鼠必须单笼单只", animal_locked:"实验未闭环，暂不能退出或转移", forbidden:"无操作权限", surgery_location_and_photo_required:"请填写手术位置并上传照片"};
export function CageWorkflow({onUpdated,searchQuery=""}:{onUpdated?:()=>void;searchQuery?:string}={}) {
  const {user} = useAuth();
  const manager = !!user && canManageAnimals(user.roles);
  const [animals,setAnimals] = useState<ManagedAnimal[]>([]);
  const [layout,setLayout] = useState<CageGridRack[]>(buildCageLayout([]));
  const [cages,setCages] = useState<Cage[]>([]);
  const [owners,setOwners] = useState<{id:string;name:string;email:string}[]>([]);
  const [cageNumber,setCageNumber] = useState("1A1");
  const [selected,setSelected] = useState<string[]>([]);
  const [visibleRack,setVisibleRack] = useState("");
  const dragSource = useRef<string|null>(null);
  const transferPending = useRef(false);
  const [draggedId,setDraggedId] = useState<string|null>(null);
  const [dropTarget,setDropTarget] = useState<string|null>(null);
  const [moveMessage,setMoveMessage] = useState("");
  const [assign,setAssign] = useState(false);
  const [openCage,setOpenCage] = useState<string|null>(null);
  const query=searchQuery;
  const [entryOpen,setEntryOpen]=useState(false);
  const [pendingExitIds,setPendingExitIds] = useState<string[]>([]);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [id,setId] = useState("");
  const [qrCode,setQrCode] = useState("");
  const [entryDate,setEntryDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [note,setNote] = useState("");
  const [entryNote,setEntryNote] = useState("");
  const [entryType,setEntryType]=useState("blank");
  const [entryTypeOther,setEntryTypeOther]=useState("");
  const [housingType,setHousingType]=useState<HousingType>("adult_blank");
  const [ageWeeks,setAgeWeeks]=useState("6");
  const [strain,setStrain] = useState("");
  const [owner,setOwner] = useState("");
  const [current,setCurrent] = useState<ManagedAnimal|null>(null);
  const [location,setLocation] = useState("");
  const [cellEdit,setCellEdit]=useState<{id:string;field:string;label:string;value:string}|null>(null);
  const [photos,setPhotos] = useState<string[]>([]);
  async function load() {
    const r=await fetch("/api/cage-workflow"); const d=await r.json(); if(!r.ok) throw Error(d.error);
    setLayout(d.layout);setPendingExitIds(d.pendingExitAnimalIds||[]);
    setAnimals(d.animals);setCages(d.cages);setOwners(d.owners);
    setSelected(prev=>prev.filter(id=>d.animals.some((a:ManagedAnimal)=>a.id===id&&!a.exitedAt&&!a.deathAt&&a.status!=="deceased")));
    setCurrent(prev=>prev ? d.animals.find((a:ManagedAnimal)=>a.id===prev.id) || null : null);
  }
  useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
  async function save(body:Record<string,unknown>) {
    setBusy(true);setError("");
    try {const r=await fetch("/api/cage-workflow",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(errors[d.error] || d.error);await load();onUpdated?.();return true;}catch(e){setError(e instanceof Error?e.message:"操作失败");return false;}finally{setBusy(false);}
  }
  async function upload(files:FileList|null) {
    if(!files?.length)return;setBusy(true);setError("");
    try {const next=[...photos];for(const file of Array.from(files)){const f=new FormData();f.append("file",file);const r=await fetch("/api/experiment-uploads",{method:"POST",body:f});const d=await r.json();if(!r.ok)throw Error(d.error);next.push(d.url);}setPhotos(next);}catch(e){setError(e instanceof Error?e.message:"图片上传失败");}finally{setBusy(false);}
  }
  const active=animals.filter(a=>!a.exitedAt&&!a.deathAt&&a.status!=="deceased");
  const numbers=layout.flatMap(r=>r.rows.flatMap(row=>row.cells.map(c=>c.number)));
  function at(number:string) {const position=layout.flatMap(r=>r.rows.flatMap(row=>row.cells)).find(c=>c.number===number);const cage=cages.find(c=>c.id===position?.cageId);return active.filter(a=>a.cageId===cage?.id && !!cage || a.cageLocation===number);}
  function tone(mice:ManagedAnimal[]){
    if(!mice.length)return "empty";
    if(mice.some(a=>a.lifecycleStatus==="euthanasia" || pendingExitIds.includes(a.id)))return "exiting";
    if(mice.some(a=>a.purpose==="signal_processing"))return "signal";
    if(mice.every(a=>!a.purpose||a.purpose==="blank"))return "blank";
    return "other";
  }
  function canDrag(animal:ManagedAnimal) {return !busy && !animal.animalLock && !animal.exitedAt && !animal.deathAt && (manager || animal.claimantUserId===user?.id);}
  function endDrag(){dragSource.current=null;setDraggedId(null);setDropTarget(null);}
  async function dropAnimal(e:React.DragEvent,number:string){
    e.preventDefault();e.stopPropagation();const animalId=dragSource.current;
    endDrag();if(!animalId||busy||transferPending.current||at(number).some(a=>a.id===animalId))return;
    transferPending.current=true;setMoveMessage("");
    try{if(await save({action:"transfer",id:animalId,cageNumber:number})){setCageNumber(number);setVisibleRack(layout.find(r=>r.rows.some(row=>row.cells.some(c=>c.number===number)))?.rack||"");setMoveMessage(animalId+" 已转移至 "+number);}}
    finally{transferPending.current=false;}
  }
  const entryForm=(<form className={styles.entry} onSubmit={async e=>{e.preventDefault();if(await save({action:"enroll",entryType,entryTypeOther,housingType,ageWeeks:Number(ageWeeks),id,qrCode,cageNumber,entryDate,note:entryNote,strain,ownerUserId:owner||user?.id})){setId("");setQrCode("");setEntryNote("");setEntryOpen(false);}}}>
      <h3 className="font-semibold sm:col-span-2">录入小鼠 · {cageNumber}</h3>
      <div className="flex items-center gap-4 rounded-xl bg-purple-50 p-3 sm:col-span-2"><img src="/miniprogram-qrcode.png" alt="微信扫码进入小程序" width={100} height={100} className="h-[100px] w-[100px] rounded-lg bg-white object-contain" /><div><strong>微信扫码进入小程序</strong><p className="mt-1 text-xs text-slate-500">进入小程序后扫描小鼠二维码，或输入二维码下方编号完成录入。</p></div></div>
      <label>小鼠二维码下方编号<input required className="block w-full rounded border p-2" value={qrCode} onChange={e=>setQrCode(e.target.value)} placeholder="输入小鼠二维码下方编号，或粘贴扫码结果" /></label>
      <label>小鼠名<input required className="block w-full rounded border p-2" value={id} onChange={e=>setId(e.target.value)} placeholder="例如 TJ001" /></label>
      <label>进入日期<input required type="date" className="block w-full rounded border p-2" value={entryDate} onChange={e=>setEntryDate(e.target.value)}/></label>
      <label>所属人<select className="block w-full rounded border p-2" value={manager?owner||user?.id:user?.id} disabled={!manager} onChange={e=>setOwner(e.target.value)}>{owners.map(o=><option key={o.id} value={o.id}>{o.name} · {o.email}</option>)}</select></label>
      <label>进入类型<select className="block rounded border p-2" value={entryType} onChange={e=>setEntryType(e.target.value)}>{ENTRY_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></label>{entryType==="other"&&<label>其他类型<input required className="block rounded border p-2" value={entryTypeOther} onChange={e=>setEntryTypeOther(e.target.value)} placeholder="请填写具体类型"/></label>}<label>同笼饲养情况<select value={housingType} onChange={e=>setHousingType(e.target.value as HousingType)}>{HOUSING_TYPES.map(type=><option key={type} value={type}>{HOUSING_LABELS[type]}</option>)}</select></label>
      <label>周龄<input type="number" min="0" max="200" step="0.5" list="mouse-ages" value={ageWeeks} onChange={e=>setAgeWeeks(e.target.value)}/><datalist id="mouse-ages"><option value="6"/><option value="8"/></datalist></label>
      <StrainField value={strain} onChange={setStrain}/>
      <label>备注<input className="block w-full rounded border p-2" value={entryNote} onChange={e=>setEntryNote(e.target.value)}/></label>
      <button disabled={busy} className="rounded bg-purple-800 p-2 text-white">录入并关联二维码与笼位</button>
    </form>);
  return <section className={styles.root}>
    <header className={styles.header}><div><div className={styles.eyebrow}>ANIMAL FACILITY</div><h2>让每一个笼位，清晰有序</h2><p>按笼架查看在笼状态，选择小鼠即可派发任务。</p></div></header>
    <div className={styles.stats}><div className={styles.stat}><span>笼架总数</span><strong>{layout.length}<small>架</small></strong></div><div className={styles.stat}><span>在笼小鼠</span><strong>{active.length}<small>只</small></strong></div><div className={styles.stat}><span>使用中的笼位</span><strong>{numbers.filter(n=>at(n).length>0).length}<small>/ {numbers.length}</small></strong></div></div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {moveMessage&&<p role="status" className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{moveMessage}</p>}
    <div className={styles.toolbar}><div><strong>批量任务派发</strong><p>勾选小鼠派发任务；拖动小鼠编号到目标笼位即可换笼</p></div><button disabled={!selected.length||busy} onClick={()=>setAssign(true)}>派发任务 · 已选 {selected.length} 只</button></div>
    <div role="tablist" aria-label="笼架" className={styles.tabs}>{layout.map(r=><button key={r.rack} role="tab" aria-selected={r.rack===(visibleRack||layout[0]?.rack)} onDragEnter={()=>{if(dragSource.current&&!busy)setVisibleRack(r.rack);}} onClick={()=>setVisibleRack(r.rack)}>{r.prefix} 号笼架</button>)}</div>
    {layout.map(r=><div key={r.rack} hidden={!draggedId && r.rack!==(visibleRack||layout[0]?.rack)} className={styles.rack}><div className={styles.rackHead}><h3>{r.prefix} 号笼架 · 笼位分布</h3><div className={styles.legend}><span>灰：空闲</span><span>绿：空白鼠</span><span>黄：测信号</span><span>红：待退出</span><span>白：不测信号</span></div></div><div className={styles.machine}>主机侧</div><div className={styles.tableWrap}><table className={styles.grid}><thead><tr><th className="w-8" />{r.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{r.rows.map(row=><tr key={row.row}><th>{row.row}</th>{row.cells.map(cell=>{const number=cell.number;const mice=at(number);return <td key={number} onDoubleClick={()=>{setCageNumber(number);setOpenCage(number);}} data-tone={tone(mice)} data-dimmed={!!query&&!mice.some(a=>(a.id+" "+(a.qrCode||"")).toLowerCase().includes(query.toLowerCase()))} onDragOver={e=>{if(dragSource.current&&!busy){e.preventDefault();e.dataTransfer.dropEffect="move";setDropTarget(number);}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDropTarget(null);}} onDrop={e=>void dropAnimal(e,number)} data-drop-target={dropTarget===number} data-occupied={mice.length>0} data-selected={cageNumber===number}><button className={styles.cageButton} onClick={()=>setCageNumber(number)}><strong>{number}</strong><span className="block text-xs">{mice.length} 只</span></button>{!mice.length&&<p className={styles.empty}>空闲 · 双击查看</p>}{mice.map(a=><label key={a.id} className={styles.animal}><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,a.id]:prev.filter(x=>x!==a.id))}/><button draggable={canDrag(a)} title={canDrag(a)?"拖动到其他笼位可换笼，点击查看详情":"点击查看详情；无权限或实验锁定时不能拖动"} data-dragging={draggedId===a.id} onDragStart={e=>{if(!canDrag(a)){e.preventDefault();return;}dragSource.current=a.id;setDraggedId(a.id);setMoveMessage("");e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",a.id);}} onDragEnd={endDrag} onClick={()=>{setCurrent(a);setNote(a.cageLabelNote||"");setLocation(a.surgeryLocation||"");setPhotos(a.surgeryImageUrls||[]);}}>{a.displayName||a.id}</button></label>)}</td>;})}</tr>)}</tbody></table></div></div>)}
    <details className={styles.archive}><summary>其他位置与历史笼位</summary>{active.filter(a=>!numbers.some(n=>at(n).some(m=>m.id===a.id))).map(a=><label key={a.id} className="m-2 inline-flex gap-1"><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(p=>e.target.checked?[...p,a.id]:p.filter(x=>x!==a.id))}/><button onClick={()=>{setCurrent(a);setNote(a.cageLabelNote||"");setLocation(a.surgeryLocation||"");setPhotos(a.surgeryImageUrls||[]);}}>{a.id} · {a.cageLocation}</button></label>)}</details>
    {!entryOpen&&entryForm}

    {current&&<div className={styles.detail}><h3 className="font-bold">{current.id} · {current.cageLocation}</h3><p>进入日期：{current.cageEntryAt?.slice(0,10)||"未记录"} · 所属人：{current.claimantName} · 品系：{current.strain}</p>
      <label>术后备注（所属学生可编辑）<textarea className="block w-full rounded border p-2" value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={busy} onClick={()=>void save({action:"notes",id:current.id,note})}>保存备注</button>
      <div><label>目标笼位<select className="rounded border p-2" value={cageNumber} onChange={e=>setCageNumber(e.target.value)}>{numbers.map(n=><option key={n}>{n}</option>)}</select></label><button disabled={busy||!!current.exitedAt} className="m-2 rounded border p-2" onClick={()=>void save({action:"transfer",id:current.id,cageNumber})}>转移并通知</button><button disabled={busy||!!current.exitedAt} className="rounded border p-2 text-red-700" onClick={()=>{if(window.confirm(`确认 ${current.id} 退出笼位？历史记录将保留。`))void save({action:"exit",id:current.id});}}>退出并通知</button></div>
      <label>手术位置<input className="block w-full rounded border p-2" value={location} onChange={e=>setLocation(e.target.value)} placeholder="位置、侧别或坐标"/></label><label>手术照片<input type="file" accept="image/*" multiple capture="environment" disabled={busy} onChange={e=>void upload(e.target.files)}/></label><div className="flex flex-wrap gap-2">{photos.map(url=><div key={url}>{/* eslint-disable-next-line @next/next/no-img-element */}<PhotoPreview src={url} alt="手术照片" className="h-24 w-24 object-cover"/><button onClick={()=>setPhotos(p=>p.filter(x=>x!==url))}>移除</button></div>)}</div><button disabled={busy||!location.trim()||!photos.length} className="rounded bg-purple-800 p-2 text-white" onClick={()=>void save({action:"surgery",id:current.id,location,imageUrls:photos})}>保存手术位置与照片</button>
    </div>}
    <FluentModal open={!!openCage} title={`${openCage} · 笼内小鼠`} size="xl" onClose={()=>setOpenCage(null)}>
      <div className="mb-4 flex flex-wrap items-center gap-3"><button className="rounded-lg bg-purple-800 px-4 py-2 text-white disabled:opacity-40" disabled={!selected.some(id=>at(openCage||"").some(a=>a.id===id))} onClick={()=>{setSelected(selected.filter(id=>at(openCage||"").some(a=>a.id===id)));setAssign(true);}}>处理 / 派发</button><button className="rounded-lg border border-purple-200 px-4 py-2 text-purple-800" onClick={()=>{setCageNumber(openCage||"1A1");setEntryOpen(true);}}>新增小鼠</button><button className="rounded-lg border p-2" onClick={()=>setSelected(at(openCage||"").map(a=>a.id))}>全选本笼</button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th>选择</th><th>小鼠 ID（二维码编号）</th><th>小鼠名</th><th>所属人</th><th>品系</th><th>进入日期</th><th>备注</th></tr></thead><tbody>{at(openCage||"").map(a=><tr key={a.id} className="border-b"><td className="py-3"><input type="checkbox" checked={selected.includes(a.id)} onChange={e=>setSelected(p=>e.target.checked?[...new Set([...p,a.id])]:p.filter(id=>id!==a.id))}/></td>{[{field:"qrCode",label:"小鼠 ID（二维码编号）",value:a.qrCode||""},{field:"displayName",label:"小鼠名",value:a.displayName||a.id},{field:"ownerUserId",label:"所属人",value:a.claimantUserId||""},{field:"strain",label:"品系",value:a.strain},{field:"cageEntryAt",label:"进入日期",value:a.cageEntryAt?.slice(0,10)||""},{field:"cageLabelNote",label:"备注",value:a.cageLabelNote||""}].map(cell=><td key={cell.field} className="cursor-text py-3" title="双击修改" onDoubleClick={()=>{if(manager||a.claimantUserId===user?.id)setCellEdit({id:a.id,...cell});}}>{cell.field==="ownerUserId"?a.claimantName||"未分配":cell.value||"—"}</td>)} </tr>)}</tbody></table>{!at(openCage||"").length&&<p className="p-8 text-center text-slate-400">当前笼位暂无小鼠</p>}</div>
    </FluentModal>
    <FluentModal open={entryOpen} title={`新增小鼠 · ${cageNumber}`} size="lg" onClose={()=>setEntryOpen(false)} footer={<button className="rounded-lg border px-4 py-2" onClick={()=>setEntryOpen(false)}>取消</button>}>{error&&<p role="alert" className={styles.error}>{error}</p>}{entryOpen&&entryForm}</FluentModal>
    <FluentModal open={!!cellEdit} title={"修改"+(cellEdit?.label||"")} onClose={()=>setCellEdit(null)} footer={<div className="mt-4 flex justify-end gap-2"><button className="rounded border px-4 py-2" onClick={()=>setCellEdit(null)}>取消</button><button disabled={busy} className="rounded bg-purple-800 px-4 py-2 text-white" onClick={async()=>{if(cellEdit&&await save({action:"edit",...cellEdit}))setCellEdit(null);}}>保存</button></div>}>{error&&<p role="alert" className={styles.error}>{error}</p>}{cellEdit?.field==="ownerUserId"?<select className="w-full rounded border p-2" disabled={!manager} value={cellEdit.value} onChange={e=>setCellEdit({...cellEdit,value:e.target.value})}><option value="">请选择所属人</option>{owners.map(o=><option key={o.id} value={o.id}>{o.name} · {o.email}</option>)}</select>:<input autoFocus className="w-full rounded border p-2" type={cellEdit?.field==="cageEntryAt"?"date":"text"} value={cellEdit?.value||""} onChange={e=>setCellEdit(prev=>prev?{...prev,value:e.target.value}:null)}/>}</FluentModal>
    <AssignAnimalOpModal open={assign} animalIds={selected} onClose={()=>setAssign(false)} onCreated={()=>{setAssign(false);setSelected([]);void load();}}/>
  </section>;
}
