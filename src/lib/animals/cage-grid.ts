export const CAGE_COLUMNS = "ABCDEFGH".split("");
export const CAGE_ROWS = [1, 2, 3, 4];
export const CAGE_RACKS = [1, 2, 3, 4];
export function isCageNumber(value: string) { return /^[1-9]\d*[A-Z]+[1-9]\d*$/.test(value); }
export interface CageGridRack { rack: string; prefix: number; columns: string[]; rows: {row:number; cells:{number:string;cageId?:string}[]}[] }
/** Preserve all existing racks and coordinates. Four rows are a fallback, never a limit. */
export function buildCageLayout(cages: {id:string;number:string;rack:string}[]): CageGridRack[] {
  const groups=new Map<string, typeof cages>();
  for(const c of cages) {const list=groups.get(c.rack)||[];list.push(c);groups.set(c.rack,list);}
  if(!groups.size)for(const r of CAGE_RACKS)groups.set("笼架 "+r,[]);
  else if([...groups.keys()].every(r=>/^笼架 [1-4]$/.test(r)))for(const r of CAGE_RACKS)if(!groups.has("笼架 "+r))groups.set("笼架 "+r,[]);
  const entries=[...groups].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  const used=new Set(entries.flatMap(([,list])=>list.map(c=>Number(c.number.match(/^(\d+)[A-Z]+\d+$/)?.[1])).filter(Boolean)));
  let next=1;
  return entries.map(([rack,list])=>{
    let prefix=Number(list.find(c=>/^\d+[A-Z]+\d+$/.test(c.number))?.number.match(/^(\d+)/)?.[1]);
    if(!prefix){while(used.has(next))next++;prefix=next++;used.add(prefix);}
    const positions=list.map(c=>({c,m:c.number.toUpperCase().match(/^(?:\d+)?([A-Z]+)0*(\d+)$/)}));
    const columns=[...new Set([...CAGE_COLUMNS,...positions.flatMap(p=>p.m?[p.m[1]]:[])])];
    const maxRow=Math.max(4,...positions.map(p=>Number(p.m?.[2]||0)));
    return {rack,prefix,columns,rows:Array.from({length:maxRow},(_,i)=>({row:i+1,cells:columns.map(col=>({number:`${prefix}${col}${i+1}`,cageId:positions.find(p=>p.m?.[1]===col&&Number(p.m[2])===i+1)?.c.id}))}))};
  });
}
