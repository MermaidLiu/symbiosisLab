const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let counter=0;
const moduleObj={exports:{}};
const source=ts.transpileModule(fs.readFileSync('src/server/animal-lifecycle.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
vm.runInNewContext(source,{module:moduleObj,exports:moduleObj.exports,require:n=>n==='@/server/store'?{uid:p=>p+'-'+(++counter)}:n==='@/lib/animals/experiment-lock'?{isBackfillProcessing:()=>false}:{},console});
const {animalTasksWithWaiting,advanceAnimalTask}=moduleObj.exports;
const root={id:'first',status:'scheduled',animalIds:['TJ001'],opType:'fasting',assigneeUserId:'one',assigneeName:'甲',createdByUserId:'student',createdByName:'学生',startTime:'2026-11-23T10:00:00Z',endTime:'2026-11-23T11:00:00Z',remainingSteps:[{opType:'signal_collection',assigneeUserId:'two',assigneeName:'乙'},{opType:'euthanasia',assigneeUserId:'three',assigneeName:'丙'}]};
const store={animalOpTasks:[root],managedAnimals:[{id:'TJ001',claimantUserId:'student',registrationStatus:'awaiting_experiment'}],experimentOperations:[],notifications:[]};
let list=animalTasksWithWaiting(store.animalOpTasks);assert.equal(list.length,3);assert.equal(list.find(t=>t.assigneeUserId==='two').isWaiting,true);assert.equal(list.find(t=>t.assigneeUserId==='three').waitingForName,'乙');assert.equal(store.animalOpTasks.length,1);
advanceAnimalTask(store,root,'2026-11-23T11:00:00Z');assert.equal(store.animalOpTasks.length,1);
root.status='done';advanceAnimalTask(store,root,'2026-11-23T11:00:00Z');assert.equal(store.animalOpTasks.length,2);assert.equal(store.experimentOperations.length,1);assert.equal(store.notifications[0].userId,'two');
advanceAnimalTask(store,root,'2026-11-23T11:00:00Z');assert.equal(store.animalOpTasks.length,2);
list=animalTasksWithWaiting(store.animalOpTasks);assert.equal(list.filter(t=>t.assigneeUserId==='two'&&!t.isWaiting&&t.status==='scheduled').length,1);assert.equal(list.filter(t=>t.assigneeUserId==='three'&&t.isWaiting).length,1);
const second=store.animalOpTasks.find(t=>t.assigneeUserId==='two');second.status='done';advanceAnimalTask(store,second,'2026-11-23T12:00:00Z');assert.equal(store.notifications[0].userId,'three');assert.equal(store.notifications[0].link,'/');assert.equal(animalTasksWithWaiting(store.animalOpTasks).filter(t=>t.isWaiting).length,0);
console.log('PASS: later assignees see queued task details; no early activation; automatic handoff and notification; repeated completion creates no duplicate; final simple task opens workbench');

const mouse={id:'blank',entryType:'blank',purpose:'blank',cageId:'cage',cageLocation:'1A1',claimantUserId:'student',status:'active'};const housingStore={managedAnimals:[mouse],cages:[{id:'cage',occupied:1}],users:[{id:'student',roles:['user']}],notifications:[],experimentOperations:[{animalId:'blank',status:'open'}]};
moduleObj.exports.vacateBlankCageAfterSurgery(housingStore,mouse,'2026-11-24T12:00:00Z');assert.equal(mouse.cageId,undefined);assert.equal(mouse.exitedAt,undefined);assert.equal(mouse.status,'active');assert.equal(housingStore.cages[0].occupied,0);assert.equal(housingStore.experimentOperations.length,1);assert.equal(housingStore.notifications.length,1);moduleObj.exports.vacateBlankCageAfterSurgery(housingStore,mouse,'2026-11-24T12:01:00Z');assert.equal(housingStore.notifications.length,1);console.log('PASS: blank surgery automatically vacates cage, preserves live animal and experiment, notifies owner once');
