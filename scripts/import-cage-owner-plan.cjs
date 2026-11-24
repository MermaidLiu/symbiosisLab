/** Import the supplied cage allocation into an explicitly named preview database. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const rows={
  1:[['测试笼','李晓','李晓','李晓','李晓','李晓'],['李晓','李晓','方天怡','方天怡','方天怡','方天怡'],...Array.from({length:5},()=>Array(6).fill('方天怡')),['方天怡','方天怡','方天怡','方天怡','陈思思','陈思思'],Array(6).fill('吴淑颖'),Array(6).fill('吴淑颖')],
  2:[Array(6).fill('赵炎'),['赵炎','赵炎','赵炎','赵炎','付华钰','付华钰'],['赵炎','赵炎','赵炎','赵炎','王昕玥','王昕玥'],...Array.from({length:3},()=>Array(6).fill('王昕玥')),['王昕玥','王昕玥','王昕玥','王昕玥','吴淑颖','吴淑颖'],...Array.from({length:3},()=>Array(6).fill('吴淑颖'))],
  3:[['测试笼','何易','何易','','','陈弘桢','陈弘桢','陈弘桢'],['方天怡','方天怡','','方天怡','ROXY','谭娟','',''],['陈思思','陈思思','方天怡','谭娟','谭娟','谭娟','谭娟','谭娟'],['陈思思','陈思思','谭娟','','谭娟','谭娟','谭娟','谭娟'],...Array.from({length:3},()=>Array(8).fill('谭娟')),['王昕玥','王昕玥','王昕玥','谭娟','谭娟','谭娟','谭娟','谭娟'],Array(8).fill('王昕玥'),Array(8).fill('王昕玥')],
};
const blank=new Set(['1F5','1F7','1B8','1D9','2B9','3D2','3F2','3A8','3B8','3C8','3E9']);
const plan=Object.entries(rows).flatMap(([rack,lines])=>lines.flatMap((line,index)=>line.map((name,col)=>({number:`${rack}${'ABCDEFGH'[col]}${index+1}`,rack:Number(rack),name,purpose:name==='测试笼'?'test':!name?'other':blank.has(`${rack}${'ABCDEFGH'[col]}${index+1}`)?'blank':'signal_processing'}))));
assert.equal(plan.length,200);assert.equal(new Set(plan.map(p=>p.number)).size,200);
const target=process.argv[2];
if(!target){console.log(JSON.stringify({plan,ownerNames:[...new Set(plan.map(p=>p.name).filter(n=>n&&n!=='测试笼'))]},null,2));process.exit(0);}
const dbPath=path.resolve(target);
if(!dbPath.includes(`${path.sep}.preview${path.sep}`))throw Error('This import is restricted to the preview database.');
const s=JSON.parse(fs.readFileSync(dbPath,'utf8'));const before=JSON.stringify(s);const matched=[],pending=[],testAnimals=[];
for(const p of plan){
  const legacyRack='Rack '+String.fromCharCode(64+p.rack);const legacyPosition=p.number.slice(1).replace(/([A-Z])(\d+)$/,(_,col,row)=>col+String(row).padStart(2,'0'));
  let cage=s.cages.find(c=>c.number===p.number||(c.rack===legacyRack&&c.number===legacyPosition));
  if(!cage){cage={id:'c-'+p.number.toLowerCase(),number:p.number,rack:legacyRack,strain:'',cageType:'standard',capacity:5,occupied:0,status:'vacant'};s.cages.push(cage);}
  cage.number=p.number;cage.allocationOwnerName=p.name;cage.allocationPurpose=p.purpose;
  const canonical=p.name==='陈弘桢'?'陈泓桢':p.name;
  const roster=(s.researchGroupRoster||[]).filter(r=>r.name===canonical||r.name===p.name);
  const candidates=s.users.filter(u=>u.name===canonical||u.nickname===canonical||roster.some(r=>(r.email&&r.email.toLowerCase()===String(u.email||'').toLowerCase())||(r.phone&&r.phone===u.phone)));
  const owner=candidates.length===1?candidates[0]:undefined;
  cage.allocationOwnerUserId=owner?.id;
  for(const a of s.managedAnimals.filter(a=>a.cageId===cage.id&&!a.exitedAt&&!a.deathAt&&a.status!=='deceased')){
    a.cageLocation=p.number;
    if(!p.name||p.name==='测试笼'){testAnimals.push(a.id);continue;}
    a.claimantUserId=owner?.id;a.claimantName=owner?p.name:p.name+'（待匹配账号）';
    a.purpose=p.purpose==='blank'?'blank':'signal_processing';
    (owner?matched:pending).push({animalId:a.id,cageNumber:p.number,name:p.name,userId:owner?.id});
  }
}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');fs.writeFileSync(dbPath+'.before-owner-plan-'+stamp+'.json',before);
fs.writeFileSync(dbPath,JSON.stringify(s,null,2));
const summary={cages:plan.length,matched,pending,testAnimals,unmatchedNames:[...new Set(plan.filter(p=>p.name&&p.name!=='测试笼'&&!s.cages.some(c=>c.allocationOwnerName===p.name&&c.allocationOwnerUserId)).map(p=>p.name))]};
fs.writeFileSync(path.join(path.dirname(dbPath),'cage-owner-import-report.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
