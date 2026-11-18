import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS } from '../web/checklist.js';
import { newHome, normalizeHome, getCheck, hardSummary, monthlyCost, validateBackup, homeLabel, communityNames, noteHistory, escapeHTML } from '../web/model.js';
import { reconcile, acknowledge } from '../web/store.js';

test('unknown checks do not become failures',()=>{
  const home=newHome();
  assert.deepEqual(hardSummary(home),{total:15,pass:0,fail:0,unknown:15,other:0});
  home.checks.balcony={status:'fail',note:''};
  assert.equal(hardSummary(home).fail,1);
  assert.equal(hardSummary(home).unknown,14);
});
test('other answers retain notes and do not count as passing or failing hard requirements',()=>{
  const home=newHome();home.community='花园小区';
  const ids=['balcony','bedroom_door','entry_notice','natural_gas','balcony_privacy','parking_position','ac_efficiency','door_lock','entrance_gates','traffic_separation','ebike_access'];
  for(const id of ids)home.checks[id]={status:'other',note:'待进一步协商'};
  const restored=validateBackup({format:'rental-notes',version:1,homes:[home]})[0];
  assert.equal(restored.community,'花园小区');
  for(const id of ids)assert.deepEqual(getCheck(restored,id),{status:'other',note:'待进一步协商'});
  assert.deepEqual(hardSummary(restored),{total:15,pass:0,fail:0,unknown:13,other:2});
});
test('community selection deduplicates names while separate units and legacy titles remain identifiable',()=>{
  const first=newHome();first.community=' 花园小区 ';first.name='3栋1203';
  const second=newHome();second.community='花园小区';second.name='5栋602';
  assert.deepEqual(communityNames([first,second,newHome()]),['花园小区']);
  assert.equal(homeLabel(first),'花园小区 · 3栋1203');
  assert.equal(homeLabel(second),'花园小区 · 5栋602');
  const legacy=normalizeHome({name:'原有房源名称'});
  assert.equal(legacy.community,'');assert.equal(homeLabel(legacy),'原有房源名称');
});
test('note history is scoped to the same check, deduplicated and ordered by most recent home',()=>{
  const first=newHome(),second=newHome(),third=newHome();
  first.updatedAt='2026-11-17T00:00:00Z';second.updatedAt='2026-11-18T03:00:00Z';third.updatedAt='2026-11-18T01:00:00Z';
  first.checks.signal={status:'other',note:'网络稳定'};
  second.checks.signal={status:'other',note:' 地下车库掉信号 '};
  third.checks.signal={status:'pass',note:'网络稳定'};
  first.checks.toilet={status:'other',note:'冲水正常'};
  const homes=[first,second,third];
  assert.deepEqual(noteHistory(homes,'signal'),['地下车库掉信号','网络稳定']);
  assert.deepEqual(noteHistory(homes,'toilet'),['冲水正常']);
  assert.deepEqual(homes,[first,second,third]);
});
test('general note history preserves multiline text and ignores blank notes',()=>{
  const first=newHome(),second=newHome(),third=newHome();
  first.notes='采光不错\n晚上再确认噪音';second.notes=' \n ';third.notes='采光不错\n晚上再确认噪音';
  first.checks.signal={status:'other',note:'不应混入综合备注'};
  assert.deepEqual(noteHistory([first,second,third]),['采光不错\n晚上再确认噪音']);
  assert.deepEqual(noteHistory([],'signal'),[]);
});
test('recurring totals exclude deposits and one-off fees, preserve unknown vs zero',()=>{
  const home=newHome();home.costs.rent=2500;home.costs.deposit=5000;home.costs.agency=1250;
  assert.deepEqual(monthlyCost(home),{total:2500,known:1,complete:false});
  for(const key of ['property','parking','internet'])home.costs[key]=0;
  assert.deepEqual(monthlyCost(home),{total:2500,known:4,complete:true});
});
test('all check IDs are unique and maintenance access, downtime and cleaning are covered',()=>{
  assert.equal(new Set(CHECKS.map(c=>c.id)).size,CHECKS.length);
  for(const id of ['entry_notice','unusable','temporary_stay','repeated_repair','repair_clean','all_fees'])assert.ok(CHECKS.find(c=>c.id===id));
});
test('import normalizes unknown keys and rejects malformed amounts and files',()=>{
  const home=newHome();home.costs.rent='2600';home.checks.signal={status:'pass',note:'正常'};home.unexpected='ignore';
  const imported=validateBackup({format:'rental-notes',version:1,homes:[home]})[0];
  assert.equal(imported.costs.rent,2600);assert.equal(imported.unexpected,undefined);
  assert.deepEqual(imported.checks.signal,{status:'pass',note:'正常'});
  for(const id of ['natural_gas','balcony_privacy','parking_position','ac_efficiency','door_lock','entrance_gates','traffic_separation','ebike_access'])assert.deepEqual(getCheck(imported,id),{status:'unknown',note:''});
  home.costs.rent=-1;assert.throws(()=>normalizeHome(home));
  assert.throws(()=>validateBackup({homes:[]}));
});
test('user text is escaped before HTML rendering',()=>{
  assert.equal(escapeHTML('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
});
test('remote concurrent edits preserve both versions as separate homes',()=>{
  const local=newHome();local.name='我的新备注';
  const remote=structuredClone(local);remote.name='另一台设备的备注';
  const items={[local.id]:{data:local,revision:1,dirty:true,deleted:false}};
  assert.equal(reconcile(items,[{id:local.id,data:remote,revision:2,deleted:false}]),1);
  assert.equal(items[local.id].data.name,'另一台设备的备注');
  const copy=Object.values(items).find(i=>i.dirty);assert.match(copy.data.name,/我的新备注/);assert.equal(copy.revision,0);
});
test('offline deletion cannot remove a newer remote edit',()=>{
  const home=newHome(),items={[home.id]:{data:null,revision:1,dirty:true,deleted:true}};
  reconcile(items,[{id:home.id,data:home,revision:2,deleted:false}]);
  assert.equal(items[home.id].deleted,false);assert.equal(items[home.id].revision,2);
});
test('a concurrent deletion preserves an edited local copy',()=>{
  const home=newHome(),items={[home.id]:{data:home,revision:1,dirty:true,deleted:false}};
  reconcile(items,[{id:home.id,data:null,revision:2,deleted:true}]);
  assert.equal(items[home.id].deleted,true);assert.equal(Object.values(items).filter(i=>!i.deleted).length,1);
});
test('edits made during an in-flight save stay dirty after acknowledgement',()=>{
  const home=newHome(),items={[home.id]:{data:home,revision:0,dirty:true,deleted:false}};
  const sent=structuredClone(items[home.id]);home.name='保存期间的新输入';
  acknowledge(items,home.id,sent,1);
  assert.equal(items[home.id].revision,1);assert.equal(items[home.id].dirty,true);
  acknowledge(items,home.id,structuredClone(items[home.id]),2);assert.equal(items[home.id].dirty,false);
});
