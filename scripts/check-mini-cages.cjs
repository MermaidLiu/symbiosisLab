const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let page,posted,refreshes=0;
const mouse={id:'TJ001',cageId:'old-cage',cageLocation:'Rack A / A01',strain:'C57',claimantUserId:'student'};
const response={animals:[mouse],owners:[{id:'student',name:'学生'}],cages:[{id:'old-cage',number:'A01'}],layout:[{prefix:1,rack:'Rack A',columns:['A'],rows:[{row:1,cells:[{number:'1A1',cageId:'old-cage'}]}]}]};
const api={request:async(url,options)=>{if(options){posted=options.data;return {};}refreshes++;return response;},api:{users:async()=>({users:[{id:'tech',roles:['animal_manager'],accountStatus:'active'},{id:'inactive',roles:['animal_manager'],accountStatus:'pending_review'}]})}};
const controller={exports:{}};vm.runInNewContext(fs.readFileSync('miniprogram/pages/cages/controller.js','utf8'),{module:controller,require:n=>n.endsWith('/api')?api:n.endsWith('/auth')?{getUser:()=>({id:'student',roles:['user']}),promptLogin:async()=>true}:{API_BASE:''},wx:{showToast:()=>{}},console});
page=controller.exports();
page.data=JSON.parse(JSON.stringify(page.data));page.setData=patch=>Object.assign(page.data,patch);
(async()=>{
  await page.load();assert.equal(page.data.staff.length,1);assert.equal(page.data.racks[0].name,'笼架1');
  page.goList();assert.equal(page.data.viewMode,'list');page.goCages();assert.equal(page.data.viewMode,'cages');
  page.openCell('1A1');assert.equal(page.data.cageMice[0].id,'TJ001');assert.equal(page.data.cageMice[0].checked,true);assert.equal(page.data.selectedCount,1);
  page.pickStrain({detail:{value:'1'}});assert.equal(page.data.strain,'C57');page.field({currentTarget:{dataset:{field:'strain'}},detail:{value:'自定义品系'}});assert.equal(page.data.strain,'自定义品系');
  page.setData({enrollOpen:true,id:'TJ002',qrCode:'QR002'});await page.enroll();assert.equal(posted.id,'TJ002');assert.equal(posted.qrCode,'QR002');assert.equal(posted.strain,'自定义品系');assert.equal(page.data.enrollOpen,false);assert.ok(refreshes>=2);
  page.openCell('1A1');await page.dispatch();assert.equal(posted.animalIds[0],'TJ001');assert.equal(page.data.openCage,'');assert.equal(page.data.selectedCount,0);
  console.log('PASS: mini-program legacy cage detail selection, active staff filtering, preset/custom strain, enrollment closes and refreshes, batch dispatch closes detail');
})().catch(e=>{console.error(e);process.exitCode=1;});
