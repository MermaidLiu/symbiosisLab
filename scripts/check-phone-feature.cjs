const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
let store;const feature={PHONE_VERIFICATION_ENABLED:false};
const output={exports:{}};const mocks={
  '@/lib/phone-verification':feature,
  '@/server/store':{getStore:()=>store,mutateStore:async f=>f(store),publicUser:u=>u,uid:()=> 'test-log'},
  '@/lib/account-status':{isPlaceholderEmail:()=>false,isPhoneLocked:()=>false,rolesForAppliedRole:()=>['user']},
  '@/server/sms':{normalizePhone:p=>p.replace(/\D/g,''),isValidCnMobile:p=>/^1\d{10}$/.test(p)},
  '@/lib/research-group-roster':{requiresRosterMatch:()=>false},
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/server/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:output,exports:output.exports,require:n=>mocks[n]||(n.startsWith('@/')?{}:require(n)),console,process});
const input={name:'学生',email:'student@example.test',school:'测试学校',department:'测试实验室',employeeId:'TEST001',personType:'学生',appliedRole:'student'};
const reset=phone=>{store={users:[{id:'student',roles:['user'],email:'student@example.test',name:'学生',accountStatus:'pending_profile',phone}],logs:[],researchGroupRoster:[]};};
(async()=>{
  reset(undefined);const result=await output.exports.submitRealNameProfile('student',input);assert.equal(result.ok,true);assert.equal(result.user.accountStatus,'active');assert.equal(result.user.approvedBy,'profile_completed');
  reset('13800000001');await output.exports.submitRealNameProfile('student',{...input,phone:''});assert.equal(store.users[0].phone,'13800000001');
  feature.PHONE_VERIFICATION_ENABLED=true;reset(undefined);assert.equal((await output.exports.submitRealNameProfile('student',input)).error,'no_phone');
  for(const p of ['miniprogram/pages/realname/realname.wxml','miniprogram/pages/profile/profile.wxml'])assert.match(fs.readFileSync(p,'utf8'),/wx:if="\{\{phoneVerificationEnabled\}\}"/);
  console.log('PASS: phone verification disabled permits profile submission without phone; saved phone data preserved; feature can be re-enabled; mini-program phone fields gated');
})().catch(e=>{console.error(e);process.exitCode=1;});
