import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, STAGES, DEFAULT_COMMUNITIES, checkDescription } from '../web/checklist.js';
import { newHome, normalizeHome, getCheck, hardSummary, monthlyCost, propertyMonthlyCost, updateRentCosts, validateBackup, homeLabel, communityNames, noteHistory, escapeHTML, isCommonPositive } from '../web/model.js';
import { reconcile, acknowledge } from '../web/store.js';
import { backendHash, resolveConnection, viewFromHash } from '../web/connection.js';

test('unknown checks do not become failures',()=>{
  const home=newHome();
  assert.deepEqual(hardSummary(home),{total:18,pass:0,fail:0,unknown:18,other:0});
  home.checks.balcony={status:'fail',note:''};
  assert.equal(hardSummary(home).fail,1);
  assert.equal(hardSummary(home).unknown,17);
});
test('other answers retain notes and do not count as passing or failing hard requirements',()=>{
  const home=newHome();home.community='花园小区';
  const ids=['balcony','bedroom_door','entry_notice','natural_gas','balcony_privacy','parking_position','ac_efficiency','door_lock','entrance_gates','traffic_separation','ebike_access'];
  for(const id of ids)home.checks[id]={status:'other',note:'待进一步协商'};
  const restored=validateBackup({format:'rental-notes',version:1,homes:[home]})[0];
  assert.equal(restored.community,'花园小区');
  for(const id of ids)assert.deepEqual(getCheck(restored,id),{status:'other',note:'待进一步协商'});
  assert.deepEqual(hardSummary(restored),{total:18,pass:0,fail:0,unknown:16,other:2});
});
test('community selection deduplicates names while separate units and legacy titles remain identifiable',()=>{
  const first=newHome();first.community=' 花园小区 ';first.name='3栋1203';
  const second=newHome();second.community='花园小区';second.name='5栋602';
  assert.deepEqual(communityNames([first,second,newHome()]),[...DEFAULT_COMMUNITIES,'花园小区']);
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
  const home=newHome();home.costs.rent=2500;home.costs.deposit=5000;home.costs.agency=1250;home.costs.internet=80;home.costs.parking=null;
  assert.deepEqual(monthlyCost(home),{total:2500,known:1,complete:false});
  for(const key of ['property','parking'])home.costs[key]=0;
  assert.deepEqual(monthlyCost(home),{total:2500,known:3,complete:true});
  const restored=validateBackup({format:'rental-notes',version:1,homes:[home]})[0];
  assert.equal(restored.costs.internet,80);
  assert.deepEqual(monthlyCost(restored),{total:2500,known:3,complete:true});
});

test('area-based property fees need area, preserve zero and never reinterpret legacy monthly amounts',()=>{
  const home=newHome();home.community='花园小区';home.layout='三房';home.bathrooms='两卫';home.floor='12 / 26';home.area='100';
  home.costs.rent=2600;home.costs.property=1.2;home.costs.parking=0;
  assert.equal(propertyMonthlyCost(home),120);
  assert.deepEqual(monthlyCost(home),{total:2720,known:3,complete:true});
  const restored=validateBackup({format:'rental-notes',version:1,homes:[home]})[0];
  assert.equal(restored.layout,'三房');assert.equal(restored.bathrooms,'两卫');assert.equal(restored.propertyFeeBasis,'area');
  assert.equal(homeLabel(restored),'花园小区 · 三房 · 12 / 26层 · 两卫');
  home.area='88.8';home.costs.property=1.23;assert.equal(propertyMonthlyCost(home),109);
  for(const area of ['', '约100', '100㎡', '0', '-20', '1e2', 'Infinity', '1'+'0'.repeat(308)]){
    home.area=area;home.costs.property=1.2;
    assert.equal(propertyMonthlyCost(home),null,area);
    assert.deepEqual(monthlyCost(home),{total:2600,known:2,complete:false});
  }
  home.costs.property=0;assert.equal(propertyMonthlyCost(home),0);
  const legacy=structuredClone(restored);delete legacy.propertyFeeBasis;legacy.costs.property=120;
  legacy.name='原房源标识';legacy.address='旧位置';legacy.link='https://example.com/home';legacy.contact='旧联系备注';legacy.visitDate='2026-11-18';
  const imported=normalizeHome(legacy);
  assert.equal(imported.propertyFeeBasis,'monthly');assert.equal(propertyMonthlyCost(imported),120);
  for(const key of ['name','address','link','contact','visitDate'])assert.equal(imported[key],legacy[key]);
  assert.throws(()=>normalizeHome({...home,propertyFeeBasis:'unknown'}));
});

test('on-site inspection covers every online prompt and keeps the same check IDs',()=>{
  assert.equal(STAGES[0].name,'网上筛房');
  const online=CHECKS.filter(c=>c.stages.includes(1)),onsite=CHECKS.filter(c=>c.stages.includes(2));
  assert.ok(online.length>0);
  for(const check of online){assert.ok(onsite.some(c=>c.id===check.id));assert.ok(checkDescription(check,1));assert.equal(checkDescription(check,2),check.how);}
  assert.equal(onsite.length,38);
});

test('difference mode hides only unanimous positive answers for two to four homes',()=>{
  for(const [id,positive,retained] of [
    ['balcony','pass',['unknown','fail','other']],
    ['floor','good',['unknown','average','poor','other']],
    ['entry_notice','pass',['unknown','fail','other']],
  ]){
    const check=CHECKS.find(c=>c.id===id);
    const homes=Array.from({length:4},()=>newHome());
    assert.equal(isCommonPositive([],check),false);
    assert.equal(isCommonPositive(homes.slice(0,1),check),false);
    for(const home of homes)home.checks[id]={status:positive,note:''};
    for(const count of [2,3,4])assert.equal(isCommonPositive(homes.slice(0,count),check),true);
    for(const status of retained){
      homes[3].checks[id]={status,note:'保留核实'};
      assert.equal(isCommonPositive(homes,check),false);
      for(const home of homes)home.checks[id]={status,note:''};
      assert.equal(isCommonPositive(homes,check),false);
      for(const home of homes)home.checks[id]={status:positive,note:''};
    }
    delete homes[3].checks[id];
    assert.equal(isCommonPositive(homes,check),false);
  }
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


test('Pages stays local unless a backend is explicitly supplied in the fragment',()=>{
  const page='https://example.github.io/rental-notes/';
  assert.deepEqual(resolveConnection(page),{endpoint:null,fromLink:false,error:''});
  assert.equal(resolveConnection(`${page}?api=https://backend.example#homes`).endpoint,null);
  const linked=resolveConnection(page+backendHash('homes','https://backend.example:8443'));
  assert.deepEqual(linked,{endpoint:'https://backend.example:8443',fromLink:true,error:''});
  assert.equal(new URL(page+backendHash('homes',linked.endpoint)).search,'');
  assert.equal(resolveConnection(`${page}#homes?api=https%3A%2F%2F203.0.113.10%3A443%2F`).endpoint,'https://203.0.113.10');
});

test('fragment routes and backend addresses survive navigation and reload',()=>{
  for(const view of ['guide','homes','compare']){
    const hash=backendHash(view,'https://backend.example');
    assert.equal(viewFromHash(hash),view);
    assert.equal(resolveConnection('https://example.github.io/'+hash).endpoint,'https://backend.example');
  }
  assert.equal(viewFromHash('#unknown?api=anything'),'guide');
  assert.equal(backendHash('unknown'),'#guide');
  assert.equal(viewFromHash('#homes'),'homes');
});

test('backend links reject insecure or ambiguous targets and embedded credentials',()=>{
  const invalid=['http://203.0.113.10','//backend.example','javascript:alert(1)','file:///tmp/data','ftp://backend.example','https://backend.example/api','https://backend.example/?token=value','https://backend.example/#token','', 'https://', 'https://backend.example?'];
  const withCredentials=new URL('https://backend.example');withCredentials.username='user';withCredentials.password='test';invalid.push(withCredentials.href);
  for(const target of invalid){
    const result=resolveConnection(`https://example.github.io/#homes?api=${encodeURIComponent(target)}`);
    assert.equal(result.endpoint,null,target);
    assert.equal(result.fromLink,true,target);
    assert.ok(result.error,target);
  }
  assert.ok(resolveConnection('https://example.github.io/#homes?api=https://first.example&api=https://second.example').error);
});

test('HTTP is allowed only between loopback origins during local development',()=>{
  assert.equal(resolveConnection('http://127.0.0.1:8766/#homes?api=http://127.0.0.1:8877').endpoint,'http://127.0.0.1:8877');
  assert.ok(resolveConnection('https://example.github.io/#homes?api=http://127.0.0.1:8877').error);
  assert.ok(resolveConnection('http://127.0.0.1:8766/#homes?api=http://203.0.113.10').error);
  assert.equal(resolveConnection('http://127.0.0.1:8765/', '').endpoint,'http://127.0.0.1:8765');
  assert.equal(resolveConnection('https://example.github.io/', 'https://backend.example/').endpoint,'https://backend.example');
});


test('new homes use the requested defaults without applying them to existing records',()=>{
  const home=newHome();
  assert.equal(home.community,'恒大·悦龙台');assert.equal(home.layout,'三房');assert.equal(home.bathrooms,'两卫');
  assert.equal(home.depositMonths,1);assert.equal(home.paymentMonths,1);assert.equal(home.agencyRate,0.5);
  assert.equal(home.costs.parking,300);assert.equal(home.costs.cleanOut,200);assert.equal(home.costs.cleanIn,null);
  assert.equal(home.costs.rent,null);assert.equal(home.costs.deposit,null);assert.equal(home.costs.agency,null);
  assert.deepEqual(communityNames([]),DEFAULT_COMMUNITIES);
  const old=normalizeHome({});
  for(const key of ['community','layout','bathrooms'])assert.equal(old[key],'');
  for(const key of ['depositMonths','paymentMonths','agencyRate'])assert.equal(old[key],null);
  for(const value of Object.values(old.costs))assert.equal(value,null);
});

test('deposit and agency amounts follow monthly rent and selections, with integer yuan rounding',()=>{
  const home=newHome();home.costs.rent=2601;
  updateRentCosts(home);assert.equal(home.costs.deposit,2601);assert.equal(home.costs.agency,1301);
  for(const months of [1,2,3])for(const rate of [0,0.5,1]){
    home.depositMonths=months;home.paymentMonths=months;home.agencyRate=rate;updateRentCosts(home);
    const restored=validateBackup({format:'rental-notes',version:1,homes:[home]})[0];
    assert.equal(restored.depositMonths,months);assert.equal(restored.paymentMonths,months);assert.equal(restored.agencyRate,rate);
    assert.equal(restored.costs.deposit,2601*months);assert.equal(restored.costs.agency,Math.round(2601*rate));
    restored.costs.rent=3000;updateRentCosts(restored);
    assert.equal(restored.costs.deposit,3000*months);assert.equal(restored.costs.agency,3000*rate);
  }
  home.costs.rent=null;home.agencyRate=0;updateRentCosts(home);
  assert.equal(home.costs.deposit,null);assert.equal(home.costs.agency,0);
  home.agencyRate=0.5;updateRentCosts(home);assert.equal(home.costs.agency,null);
  home.costs.rent=0;updateRentCosts(home);assert.equal(home.costs.deposit,0);assert.equal(home.costs.agency,0);
  home.costs.rent=1e8;home.depositMonths=3;updateRentCosts(home);
  assert.equal(normalizeHome(home).costs.deposit,3e8);
});

test('legacy custom amounts, decimals, removed cleaning field and combined appliance answers survive backup',()=>{
  const legacy={name:'原房源',decision:'pending',costs:{rent:2600.5,parking:150.5,property:1.25,deposit:3900,agency:700,cleanIn:88.5,cleanOut:0},checks:{appliances:{status:'pass',note:'旧的整体配套记录'}}};
  const home=normalizeHome(legacy);
  for(const key of ['depositMonths','paymentMonths','agencyRate'])assert.equal(home[key],null);
  home.costs.rent=3000;updateRentCosts(home);
  assert.equal(home.costs.deposit,3900);assert.equal(home.costs.agency,700);assert.equal(home.costs.cleanIn,88.5);assert.equal(home.costs.parking,150.5);
  const restored=validateBackup({format:'rental-notes',version:1,homes:[home]})[0];
  assert.deepEqual(restored.checks.appliances,legacy.checks.appliances);
  for(const id of ['fridge','sterilizer','range_hood','gas_water_heater'])assert.deepEqual(getCheck(restored,id),{status:'unknown',note:''});
  assert.equal(hardSummary(restored).pass,0);assert.equal(hardSummary(restored).unknown,18);
});

test('new appliance answers are independent and survive imports without inferring unknown results',()=>{
  const home=newHome();
  for(const [id,status] of [['fridge','pass'],['sterilizer','other'],['range_hood','fail']])home.checks[id]={status,note:'分别核实'};
  const restored=validateBackup({format:'rental-notes',version:1,homes:[home]})[0];
  assert.equal(hardSummary(restored).pass,1);assert.equal(hardSummary(restored).fail,1);assert.equal(hardSummary(restored).other,1);
  assert.deepEqual(getCheck(restored,'gas_water_heater'),{status:'unknown',note:''});
  for(const [id,value] of Object.entries(home.checks))assert.deepEqual(restored.checks[id],value);
});

test('rental term imports reject unsupported options and do not coerce strings or booleans',()=>{
  const home=newHome();
  for(const key of ['depositMonths','paymentMonths','agencyRate'])for(const value of [true,false,'1','',-1,4,{},[],Number.NaN]){
    assert.throws(()=>normalizeHome({...home,[key]:value}),`${key}: ${String(value)}`);
  }
  assert.throws(()=>normalizeHome({...home,agencyRate:0.25}));
  const stale=normalizeHome({...home,costs:{...home.costs,rent:2800,deposit:1,agency:1}});
  assert.equal(stale.costs.deposit,2800);assert.equal(stale.costs.agency,1400);
});
