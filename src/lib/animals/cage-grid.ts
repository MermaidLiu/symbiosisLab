export const CAGE_COLUMNS = "ABCDEFGH".split("");
export const CAGE_ROWS = Array.from({length:10},(_,i)=>i+1);
export const CAGE_RACKS = [1, 2, 3];
export function isCageNumber(value: string) { return /^[1-9]\d*[A-Z]+[1-9]\d*$/.test(value); }
export interface CageGridRack { rack: string; prefix: number; columns: string[]; rows: {row:number; cells:{number:string;cageId?:string}[]}[] }
/** Preserve all existing racks and coordinates. Ten rows are a fallback, never a limit. */
export function buildCageLayout(cages: {id:string;number:string;rack:string}[]): CageGridRack[] {
  const groups=new Map<string, typeof cages>();
  for(const c of cages) {const list=groups.get(c.rack)||[];list.push(c);groups.set(c.rack,list);}
  const entries=[...groups].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  const used=new Set<number>();
  const racks=entries.map(([rack,list])=>{
    const explicit=Number(list.find(c=>/^\d+[A-Z]+\d+$/.test(c.number))?.number.match(/^(\d+)/)?.[1]);
    const named=Number(rack.match(/(?:笼架\s*|Rack\s*)(\d+)/i)?.[1]) || (rack.match(/Rack\s*([A-Z])$/i)?.[1].toUpperCase().charCodeAt(0)||64)-64;
    let prefix=explicit||named;
    if(!prefix||used.has(prefix)){prefix=1;while(used.has(prefix))prefix++;}
    used.add(prefix);return {rack,list,prefix};
  });
  for(const prefix of CAGE_RACKS)if(!used.has(prefix))racks.push({rack:"笼架 "+prefix,list:[],prefix});
  return racks.filter(r=>CAGE_RACKS.includes(r.prefix)).sort((a,b)=>a.prefix-b.prefix).map(({rack,list,prefix})=>{
    const positions=list.map(c=>({c,m:c.number.toUpperCase().match(/^(?:\d+)?([A-Z]+)0*(\d+)$/)}));
    const columns=[...new Set([...(prefix<=2 ? "ABCDEF".split("") : CAGE_COLUMNS),...positions.flatMap(p=>p.m?[p.m[1]]:[])])].sort();
    const maxRow=Math.max(10,...positions.map(p=>Number(p.m?.[2]||0)));
    return {rack,prefix,columns,rows:Array.from({length:maxRow},(_,i)=>({row:i+1,cells:columns.map(col=>({number:`${prefix}${col}${i+1}`,cageId:positions.find(p=>p.m?.[1]===col&&Number(p.m[2])===i+1)?.c.id}))}))};
  });
}
