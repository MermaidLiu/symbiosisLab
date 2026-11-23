const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
let user, store, notifications, animal;
const load = (file, mocks) => {
  const output = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText,
    { exports: output.exports, module: output, require: name => mocks[name] || (name.startsWith('@/') ? {} : require(name)), console, process, Buffer });
  return output.exports;
};
const route = load('src/app/api/experiment-operations/route.ts', {
  '@/server/auth': { requireActiveUser: async () => ({ user }), jsonError: (error,status) => ({ error,status }), jsonOk: body => body },
  '@/server/store': { mutateStore: async f => f(store) },
  '@/server/audit': { appendAuditLog: async () => {} },
  '@/server/notify': { pushNotificationToUsers: (_s,ids,message) => notifications.push({ ids,message }) },
  '@/server/animal-lifecycle': { findAnimal: () => animal, appendLifecycleTrace: () => {}, finalizeRegistrationAfterClose: () => {}, completeScheduledTasksAfterExperimentClose: () => {} },
  '@/lib/roles': { canSuperviseAnimalFacility: () => false },
  '@/lib/animals/experiment-lock': { isBackfillProcessing: () => false },
});
function reset() { animal={surgeryLocation:"旧手术位置",surgeryImageUrls:["old-surgery.jpg"]}; user={id:'tech',roles:[]}; notifications=[]; store={experimentOperations:[{id:'op',animalId:'mouse',technicianUserId:'tech',studentUserId:'student',status:'open'}]}; }
const patch = body => route.PATCH({ json: async () => ({id:'op',...body}) });
(async () => {
  reset(); assert.equal((await patch({action:'tech_submit',dataTransferred:true,resultImageUrls:[]})).error,'transfer_photo_required'); assert.equal(store.experimentOperations[0].status,'open');
  reset(); await patch({action:'tech_submit',dataTransferred:false,resultImageUrls:['discard.jpg']}); assert.equal(store.experimentOperations[0].resultImageUrls.length,1); assert.equal(store.experimentOperations[0].status,'tech_submitted');
  reset(); await patch({action:'tech_submit',dataTransferred:true,resultImageUrls:['photo.jpg']}); user={id:'student',roles:[]};
  assert.equal((await patch({action:'student_close',nasDataPath:'folder'})).error,'file_confirmation_required');
  await patch({action:'student_close',nasDataPath:'folder',studentFileSeen:false}); assert.equal(store.experimentOperations[0].status,'tech_submitted'); assert.equal(store.experimentOperations[0].studentFileSeen,false); assert.equal(notifications.at(-1).ids[0],'tech');
  await patch({action:'student_close',nasDataPath:'folder',studentFileSeen:true}); assert.equal(store.experimentOperations[0].status,'closed');
  for(const kind of ["ephys","behavior"]){reset();store.experimentOperations[0].kind=kind;store.animalOpTasks=[{opType:"surgery",status:"scheduled",animalIds:["mouse"]}];await patch({action:"tech_submit",dataTransferred:false,resultImageUrls:[],assistantNames:"协助人"});assert.equal(store.experimentOperations[0].status,"tech_submitted");assert.equal(store.experimentOperations[0].assistantNames,"协助人");assert.equal(animal.surgeryLocation,"旧手术位置");assert.equal(animal.surgeryImageUrls[0],"old-surgery.jpg");}
  let saved;
  const uploads = load('src/app/api/experiment-uploads/route.ts', {
    '@/server/auth': { requireActiveUser: async () => ({user}), jsonError: error => ({error}), jsonOk: body => body },
    '@/server/store': { uid: () => 'expimg-123-abc' },
    'fs/promises': { mkdir: async () => {}, writeFile: async (file,bytes) => { saved={file,bytes}; } },
  });
  const png=Buffer.from('89504e470d0a1a0a','hex');
  const uploaded=await uploads.POST({ headers:{get:()=> 'application/json'}, json:async()=>({imageBase64:png.toString('base64'),filename:'photo.jpg'}) });
  assert.equal(uploaded.url,'/uploads/experiments/expimg-123-abc.png'); assert.ok(saved.file.includes('data')); assert.deepEqual(saved.bytes,png);
  assert.equal((await uploads.POST({headers:{get:()=> 'application/json'},json:async()=>({imageBase64:Buffer.from('not an image').toString('base64')})})).error,'invalid_type');
  class TestResponse { constructor(body,options){this.body=body;this.options=options;} }
  const photos=load('src/app/uploads/experiments/[filename]/route.ts',{
    'next/server': {NextResponse:TestResponse},
    'fs/promises': {readFile:async file=>{assert.ok(file.includes('experiments'));return png;}},
  });
  const read=await photos.GET({}, {params:Promise.resolve({filename:'expimg-123-abc.png'})}); assert.equal(read.options.headers['Content-Type'],'image/png'); assert.deepEqual(read.body,png);
  assert.equal((await photos.GET({}, {params:Promise.resolve({filename:'../../db.json'})})).options.status,404);
  console.log('PASS: transfer/photo requirement, no-transfer submission, missing-file feedback and confirmed closure');
  console.log('PASS: image signature detection, image readback and path traversal protection');
})().catch(error=>{console.error(error);process.exitCode=1;});
