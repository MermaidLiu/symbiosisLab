"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { experimentPhotoUrl } from "@/lib/experiment-photos";

export function PhotoPreview({src,alt="照片",className="h-20 w-20 rounded-lg object-cover"}:{src:string;alt?:string;className?:string}) {
  const [open,setOpen]=useState(false);
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;close.current?.focus();const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);if(e.key==="Tab"){e.preventDefault();close.current?.focus();}};document.addEventListener("keydown",onKey);return()=>{document.removeEventListener("keydown",onKey);previous?.focus();};},[open]);
  return <><button type="button" onClick={()=>setOpen(true)} aria-label={`查看${alt}大图`} title="点击查看大图" className="cursor-zoom-in">
    {/* eslint-disable-next-line @next/next/no-img-element */}<img src={experimentPhotoUrl(src)} alt={alt} className={className}/>
  </button>{open&&createPortal(<div role="dialog" aria-modal="true" aria-label={alt+"大图"} className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 p-4" onClick={()=>setOpen(false)}><button ref={close} type="button" onClick={()=>setOpen(false)} className="absolute right-5 top-5 rounded-lg bg-white px-4 py-2 text-gray-900">关闭大图</button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={experimentPhotoUrl(src)} alt={alt} onClick={e=>e.stopPropagation()} className="max-h-[88vh] max-w-[96vw] object-contain"/></div>,document.body)}</>;
}
