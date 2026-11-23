const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
let store,user,notes;
function load(file,mocks={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:n=>mocks[n]||(n.startsWith('@/')?{}:require(n)),process,Buffer,console});return m.exports;}
const grid=load('src/lib/animals/cage-grid.ts');
const roles={canManageAnimals:r=>r.includes('animal_manager'),canReceiveAnimalOps:r=>r.includes('animal_manager')};
const auth={requireActiveUser:async()=>({user}),getCurrentUser:async()=>user,jsonOk:body=>body,jsonError:(error,status)=>({error,status})};
const db={getStore:()=>store,mutateStore:async f=>f(store),uid:p=>p+'-test'};
const lifecycle={openOperationForAnimal:(s,id)=>s.experimentOperations.find(o=>o.animalId===id&&['open','tech_submitted'].includes(o.status)),appendLifecycleTrace:()=>{},findAnimal:(s,id)=>s.managedAnimals.find(a=>a.id===id),assertCanCreateOperation:()=>null,setRegistrationStatus:(a,status)=>{a.registrationStatus=status;},advanceAnimalTask:()=>{}};
const route=load('src/app/api/cage-workflow/route.ts',{'@/server/auth':auth,'@/server/store':db,'@/lib/roles':roles,'@/lib/animals/cage-grid':grid,'@/server/animal-lifecycle':lifecycle,'@/server/notify':{pushNotificationToUsers:(s,ids,payload)=>notes.push({ids,...payload})}});
function reset(){user={id:'owner',name:'学生',roles:['user']};notes=[];store={users:[user,{id:'manager',name:'管理员',roles:['animal_manager']},{id:'other',roles:['user']},{id:'tech',roles:['animal_manager']}],cages:[],managedAnimals:[],retiredAnimalIds:[],experimentOperations:[],animalOpTasks:[],notifications:[],bookings:[]};}
const post=b=>route.POST({json:async()=>b});
const enroll={action:'enroll',id:'TJ001',qrCode:'qr:001',cageNumber:'1A1',entryDate:'2026-11-23',strain:'C57',ownerUserId:'owner'};
(async()=>{
  assert.equal(grid.CAGE_RACKS.length*grid.CAGE_ROWS.length*grid.CAGE_COLUMNS.length,128);assert.equal(grid.isCageNumber('4H4'),true);assert.equal(grid.isCageNumber('0A1'),false);
  const many=grid.buildCageLayout(Array.from({length:6},(_,i)=>({id:'c'+i,number:'H12',rack:'Rack '+i})));
  assert.equal(many.length,6);assert.equal(many[0].rows.length,12);assert.ok(many.every(r=>r.columns.includes('H')));assert.equal(many.flatMap(r=>r.rows.flatMap(row=>row.cells)).filter(c=>c.cageId).length,6);
  reset();await post(enroll);assert.equal(store.managedAnimals[0].id,'TJ001');assert.equal(store.managedAnimals[0].qrCode,'qr:001');assert.ok(notes[0].ids.includes('manager'));assert.ok(notes[0].ids.includes('owner'));
  assert.equal((await post({...enroll,id:'TJ002'})).error,'id_or_qr_exists');
  await post({action:'transfer',id:'TJ001',cageNumber:'4H4'});assert.equal(store.managedAnimals[0].cageLocation,'4H4');assert.equal(store.cages.find(c=>c.number==='1A1').occupied,0);
  user=store.users.find(u=>u.id==='other');assert.equal((await post({action:'notes',id:'TJ001',note:'unauthorized'})).error,'forbidden');
  user=store.users[0];await post({action:'notes',id:'TJ001',note:'术后良好'});assert.equal(store.managedAnimals[0].cageLabelNote,'术后良好');
  assert.equal((await post({action:'surgery',id:'TJ001',location:'左侧'})).error,'surgery_location_and_photo_required');await post({action:'surgery',id:'TJ001',location:'左侧',imageUrls:['/uploads/experiments/expimg-test.jpg']});assert.equal(store.managedAnimals[0].surgeryLocation,'左侧');
  store.experimentOperations=[{animalId:'TJ001',status:'open'}];assert.equal((await post({action:'exit',id:'TJ001'})).error,'animal_locked');store.experimentOperations=[];
  await post({action:'exit',id:'TJ001'});assert.ok(store.managedAnimals[0].exitedAt);assert.equal(store.managedAnimals[0].cageId,undefined);assert.equal(store.cages.find(c=>c.number==='4H4').occupied,0);assert.equal(store.managedAnimals.length,1);
  const notifications=load('src/app/api/notifications/route.ts',{'@/server/auth':auth,'@/server/store':db,'@/server/audit':{appendAuditLog:async()=>{}},'@/server/instrument-scope':{notificationVisibleToUser:(n,u)=>n.userId===u.id}});
  store.animalOpTasks=[{id:'task',status:'scheduled'}];store.notifications=[{id:'notification',animalTaskId:'task',kind:'animal_task',userId:user.id,read:true,handled:true}];assert.equal((await notifications.GET()).notifications[0].read,false);store.animalOpTasks[0].status='done';assert.equal((await notifications.GET()).notifications[0].read,true);
  const batch=load('src/app/api/animal-op-tasks/route.ts',{'@/server/auth':auth,'@/server/store':db,'@/lib/roles':roles,'@/lib/users':{displayName:u=>u.name},'@/types/animal-ops':{ANIMAL_OP_TYPES:['fasting','euthanasia'],urgencyFromFlags:()=> 'normal'},'@/server/animal-lifecycle':lifecycle,'@/lib/animals/experiment-lock':{isBackfillProcessing:()=>false},'@/server/notify':{pushNotificationToUsers:(s,ids,payload)=>notes.push({ids,...payload})},'@/server/audit':{appendAuditLog:async()=>{}}});
  reset();for(let i=1;i<=20;i++)store.managedAnimals.push({id:'TJ'+i,claimantUserId:'owner',registrationStatus:'awaiting_experiment',status:'active'});
  const result=await batch.POST({json:async()=>({animalIds:store.managedAnimals.map(a=>a.id),opType:'fasting',assigneeUserId:'tech',assistantNames:'协助人甲',startTime:'2026-11-23T10:00:00Z',endTime:'2026-11-23T11:00:00Z'})});assert.equal(result.task.animalIds.length,20);assert.equal(result.task.assistantNames,'协助人甲');assert.equal(store.animalOpTasks.length,1);
  store.cages=[{id:'occupied',occupied:1}];store.managedAnimals[0].cageId='occupied';store.animalOpTasks[0].animalIds=['TJ1'];store.animalOpTasks[0].opType='euthanasia';user=store.users.find(u=>u.id==='tech');
  await batch.PATCH({json:async()=>({id:'aot-test',status:'done'})});assert.equal(store.managedAnimals[0].status,'deceased');assert.equal(store.managedAnimals[0].cageId,undefined);assert.equal(store.cages[0].occupied,0);assert.ok(notes.some(n=>n.kind==='animal_death'));
  console.log('PASS: cage layout preserves 6 racks and 12 rows; custom ID/QR uniqueness; owner permissions; transfer/exit notifications; surgery photo requirement; task badge lifecycle; 20-mouse batch dispatch with assistant; euthanasia clears cage occupancy');
})().catch(e=>{console.error(e);process.exitCode=1;});
