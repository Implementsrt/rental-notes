import { STAGES, CHECKS, LABELS, COSTS, checkDescription } from './checklist.js';
import { newHome, normalizeHome, getCheck, hardSummary, monthlyCost, propertyMonthlyCost, validateBackup, homeLabel, floorLabel, communityNames, noteHistory, escapeHTML as esc, uuid, isCommonPositive } from './model.js';
import { reconcile, acknowledge } from './store.js';
import { backendHash, resolveConnection, viewFromHash } from './connection.js';

const $ = selector => document.querySelector(selector);
const connection = resolveConnection(location.href, window.RENT_CONFIG?.apiBase ?? null);
let connectionNotice = '';
const ENDPOINT = await chooseEndpoint(connection);
const LINK_ENDPOINT = connection.fromLink && ENDPOINT ? ENDPOINT : null;
const STORAGE_KEY = `rental-notes:v1:${ENDPOINT || 'local'}`;
const TOKEN_KEY = `${STORAGE_KEY}:session`;

function clearBackendLink() {
  history.replaceState(null, '', `${location.pathname}${location.search}${backendHash(viewFromHash(location.hash))}`);
}

async function chooseEndpoint(candidate) {
  if (candidate.error) {
    connectionNotice = `${candidate.error}。已保持本地模式，没有连接服务器。`;
    clearBackendLink();
    return null;
  }
  if (!candidate.fromLink) return candidate.endpoint;
  const approvalKey = `rental-notes:v1:${candidate.endpoint}:approved`;
  let approved = false;
  try { approved = sessionStorage.getItem(approvalKey) === '1'; } catch {}
  if (!approved) {
    approved = await askConfirm('启用服务器同步？', `将连接到：\n${candidate.endpoint}\n请核对这是你自己的服务器。确认后才会向该地址发送登录信息和同步请求。\n服务器草稿与纯本地记录分开保存；已有记录请通过 JSON 导出、导入迁移。`, '确认此服务器', {cancelLabel:'继续本地使用', danger:false});
    if (approved) { try { sessionStorage.setItem(approvalKey, '1'); } catch {} }
  }
  if (!approved) { clearBackendLink(); return null; }
  return candidate.endpoint;
}

for (const link of document.querySelectorAll('a[href^="#"]')) {
  link.setAttribute('href', backendHash(viewFromHash(link.hash), LINK_ENDPOINT));
}
const money = value => value === null || value === undefined ? '待确认' : `¥${Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 2})}`;
const DECISIONS = {pending:'待考虑', shortlist:'意向房源', eliminated:'已排除', chosen:'已选定'};
let items = {}, token = '', loadError = null, persistenceError = false, busy = false, lastSync = '', syncError = '';
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const stored = JSON.parse(raw);
    if (stored.version !== 1 || !stored.items || Array.isArray(stored.items)) throw new Error('本机记录格式异常');
    for (const [id, item] of Object.entries(stored.items)) {
      if (typeof item.deleted !== 'boolean' || !Number.isInteger(item.revision) || item.revision < 0) throw new Error('本机记录格式异常');
      const data = item.deleted ? null : normalizeHome(item.data);
      if (data && data.id !== id) throw new Error('本机房源 ID 异常');
      items[id] = {...item, data};
    }
  }
  token = sessionStorage.getItem(TOKEN_KEY) || '';
} catch (error) { loadError = error; }

const state = {view:'guide', stage:1, filter:'all', search:'', sort:'updated', selected:new Set(), differencesOnly:false, demo:false, editing:null, editorTab:0};
const app = $('#app');
const editor = $('#editor');
const settings = $('#settings');
let syncTimer;

function toast(message, error=false) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 6500);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({version:1, items}));
    persistenceError = false;
  } catch {
    if (!persistenceError) toast('本机保存失败，请立即导出备份。当前内容仍保留在页面内。', true);
    persistenceError = true;
  }
  updateStatus();
}

const actualHomes = () => Object.values(items).filter(item => !item.deleted && item.data).map(item => item.data);
const visibleHomes = () => state.demo ? samples : actualHomes();
function updateStatus() {
  const pending = Object.values(items).some(i => i.dirty);
  const label = persistenceError ? '保存失败 · 请导出' : !ENDPOINT ? '保存在此设备' : busy ? '正在同步' : !token ? '登录后同步' : syncError ? '本机已存 · 待同步' : pending ? '本机已存 · 待同步' : lastSync ? '已同步' : '本机已保存';
  $('#storage-label').textContent = label;
  $('#storage-button').classList.toggle('pending', persistenceError || !!syncError || (!!ENDPOINT && pending));
  $('#home-count').textContent = actualHomes().length;
  $('#compare-count').textContent = state.selected.size;
  const saved = $('#editor-saved');
  if (saved) saved.textContent = persistenceError ? '保存失败，请导出备份' : label;
}

function changed(home) {
  home.updatedAt = new Date().toISOString();
  items[home.id].data = home;
  items[home.id].modifiedAt = Date.now();
  items[home.id].dirty = !!ENDPOINT;
  persist();
  if (ENDPOINT && token) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 750);
  }
}

async function request(path, options={}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${ENDPOINT}${path}`, {...options, signal:controller.signal, headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}), ...options.headers}});
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error || '服务器暂时不可用');
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally { clearTimeout(timeout); }
}

async function sync() {
  if (!ENDPOINT || !token || busy || loadError || editor.open) return;
  busy = true; syncError = ''; updateStatus();
  let rerender = false;
  try {
    const remote = await request('/api/homes');
    if (editor.open) return;
    const before = JSON.stringify(items);
    const conflicts = reconcile(items, remote.items);
    if (conflicts) toast(`发现 ${conflicts} 处其他设备的更新；你的修改已保留为副本，冲突删除已取消。`);
    rerender = before !== JSON.stringify(items);
    persist();
    for (const [id, item] of Object.entries(items)) {
      if (!item.dirty) continue;
      const sent = structuredClone(item);
      const result = await request(`/api/homes/${id}`, {method:'PUT', body:JSON.stringify({data:sent.data, revision:sent.revision, deleted:sent.deleted})});
      acknowledge(items, id, sent, result.revision);
      persist();
    }
    lastSync = new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'});
  } catch (error) {
    syncError = error.message;
    if (error.status === 401) {
      token = ''; sessionStorage.removeItem(TOKEN_KEY);
      toast('登录已失效。本机草稿已保留，请重新登录同步。');
    } else if (error.status === 409) {
      syncTimer = setTimeout(sync, 1000);
    }
  } finally {
    busy = false; updateStatus();
    if (rerender && !editor.open && !settings.open) render();
    if (!syncError && Object.values(items).some(item => item.dirty)) syncTimer = setTimeout(sync, 1000);
  }
}

function heading(eyebrow, title, subtitle, action='') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>${action}</div>`;
}

function stageReminders(stage) {
  const reminder = stage.reminder;
  return reminder ? `<aside class="editor-step-intro stage-reminders" aria-label="${esc(reminder.title)}"><strong>${esc(reminder.title)}</strong>${reminder.paragraphs.map(text => `<p>${esc(text)}</p>`).join('')}</aside>` : '';
}

function render() {
  if (loadError) {
    app.innerHTML = `<div class="empty-state"><h2>本机记录暂时无法读取</h2><p>为保护原有内容，已暂停写入。先下载原始记录，再进行恢复。</p><div class="empty-actions"><button class="button primary" id="recover-raw">下载原始记录</button></div></div>`;
    $('#recover-raw').onclick = () => download(localStorage.getItem(STORAGE_KEY) || '', '看房手记-原始记录.json');
    return;
  }
  for (const id of state.selected) if (!visibleHomes().some(h => h.id === id)) state.selected.delete(id);
  document.querySelectorAll('.main-nav a').forEach(a => {a.classList.toggle('active', a.dataset.view === state.view); a.setAttribute('aria-current', a.dataset.view === state.view ? 'page' : 'false');});
  if (state.view === 'guide') renderGuide();
  else if (state.view === 'homes') renderHomes();
  else renderCompare();
  updateStatus();
}

function renderGuide() {
  const stage = STAGES[state.stage - 1];
  const checks = CHECKS.filter(c => c.stages.includes(state.stage));
  const groups = [...new Set(checks.map(c => c.group))];
  const homes = actualHomes();
  app.innerHTML = `${heading('A LITTLE PREPARATION, A BETTER HOME', '把每套房，看明白。', '从第一次筛选，到落笔签约。带着标准看房，留下自己的判断。')}
    <div class="steps" aria-label="看房的三个阶段">${STAGES.map(s => `<button class="step ${s.id === state.stage ? 'active' : ''}" data-stage="${s.id}" aria-pressed="${s.id === state.stage}"><span class="number">0${s.id}</span><span><strong>${s.name}</strong><small>${['浏览提示 · 无需填写','到场逐项核实并记录','把责任写进合同'][s.id-1]}</small></span><span class="arrow">↗</span></button>`).join('')}</div>
    <div class="guide-layout"><section class="guide-main"><div class="section-intro"><span class="section-number">0${stage.id}</span><div><h2>${stage.title}</h2><p>${stage.intro}</p></div></div>
    <div class="legend"><span><i class="kind-dot"></i>硬性条件</span><span><i class="kind-dot soft"></i>软性评估</span><span><i class="kind-dot contract"></i>责任确认</span></div>
    ${stageReminders(stage)}
    ${groups.map(group => `<div class="group-label">${group === '到场先查' && state.stage === 1 ? '先询问，到场再核实' : group === '网上先问' && state.stage === 2 ? '朝向、配套与费用复核' : group}</div><div class="guide-grid">${checks.filter(c => c.group === group).map(c => `<article class="guide-item"><h3><i class="kind-dot ${c.kind}"></i>${esc(c.label)}</h3><p>${esc(checkDescription(c, state.stage))}</p></article>`).join('')}</div>`).join('')}
    <div class="guide-bottom"><p>${state.stage === 1 ? '这一步仅供网上浏览筛选，不填写房源检查结果。' : '按说明现场逐项确认，记录实际情况。'}</p><button class="button quiet" data-next-stage>${state.stage === 3 ? '回到网上筛房' : '下一步：' + STAGES[state.stage].name} →</button></div>
    ${state.stage === 3 ? `<p class="sources">约定提示：维修影响使用，应相应减少租金或延长租期；具体减免及退出条件请写入合同。<br><a href="https://www.court.gov.cn/zixun/xiangqing/233181.html" target="_blank" rel="noopener noreferrer">民法典第713条 ↗</a><a href="https://xzfg.moj.gov.cn/front/law/detail?LawID=1774" target="_blank" rel="noopener noreferrer">住房租赁条例第9条 ↗</a><a href="https://htsfwb.samr.gov.cn/View?id=2340996b-882d-47a4-b74d-c30784628737" target="_blank" rel="noopener noreferrer">租赁合同示范文本 ↗</a></p>` : ''}</section>
    <aside class="guide-side"><div class="side-panel"><h3>一步一步，心里有数。</h3><p>${stage.tip}</p><div class="mini-route">${STAGES.map(s => `<div class="${s.id === stage.id ? 'current' : ''}"><b>${s.id}</b><span>${s.short} · ${s.name}</span></div>`).join('')}</div>
    ${state.stage === 1 ? '<p class="small-note">这里只作筛房提示，不填写记录。到现场后，再按仔细验房核实。</p>' : `${homes.length ? `<label class="sr-only" for="guide-home">选择要记录的房源</label><select id="guide-home">${homes.map(h => `<option value="${h.id}">${esc(homeLabel(h))}</option>`).join('')}</select><button class="button primary" id="guide-record">按这一步记录 ↗</button>` : '<button class="button primary" id="guide-create">＋ 记录第一套房</button>'}<p class="small-note">未确认的项目保持空白，留到下一次核实。</p>`}</div></aside></div>`;
  app.querySelectorAll('[data-stage]').forEach(button => button.onclick = () => {state.stage = Number(button.dataset.stage); renderGuide();});
  $('[data-next-stage]').onclick = () => {state.stage = state.stage % 3 + 1; renderGuide(); window.scrollTo({top:0,behavior:'instant'});};
  if ($('#guide-create')) $('#guide-create').onclick = () => createHome(state.stage);
  if ($('#guide-record')) $('#guide-record').onclick = () => openEditor($('#guide-home').value, state.stage);
}

function sampleBanner() {
  return state.demo ? '<div class="demo-banner"><span>示例模式 · 以下房源仅用于体验，不会保存或同步</span><button class="text-button" id="exit-demo">退出示例 ×</button></div>' : '';
}
function bindDemoExit() {
  if ($('#exit-demo')) $('#exit-demo').onclick = () => {state.demo = false; state.selected.clear(); render();};
}
const HOUSE = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 30 32 12l21 18v23H39V37H25v16H11Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M28 25h8" stroke="currentColor" stroke-width="2"/></svg>';
function renderHomes() {
  app.innerHTML = `${heading('A PLACE FOR EVERY POSSIBILITY', '我的房源', '把看过的房留下来，让下一次比较更有依据。', '<button class="button primary" id="new-home">＋ 新增房源</button>')}${sampleBanner()}
  <div class="toolbar"><div class="filters" role="group" aria-label="筛选房源">${[['all','全部'],...Object.entries(DECISIONS)].map(([id,label]) => `<button class="${state.filter === id ? 'active' : ''}" data-filter="${id}">${label}</button>`).join('')}</div><div class="search-sort"><label class="sr-only" for="search">搜索房源</label><input id="search" class="search-input" placeholder="搜索名称或位置…" value="${esc(state.search)}"><label class="sr-only" for="sort">排序方式</label><select id="sort" class="sort-select"><option value="updated">最近更新</option><option value="rent">房租从低到高</option><option value="hard">硬性符合项优先</option></select></div></div><div id="home-results"></div><div id="compare-tray-slot"></div>`;
  $('#sort').value = state.sort;
  $('#new-home').onclick = () => createHome(0);
  $('#search').oninput = event => {state.search = event.target.value; renderHomeResults();};
  $('#sort').onchange = event => {state.sort = event.target.value; renderHomeResults();};
  app.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {state.filter = button.dataset.filter; app.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active',b === button)); renderHomeResults();});
  bindDemoExit(); renderHomeResults();
}

function renderHomeResults() {
  const homes = visibleHomes().filter(h => (state.filter === 'all' || h.decision === state.filter) && `${h.community} ${h.name} ${h.address} ${h.layout} ${h.floor} ${h.bathrooms}`.toLowerCase().includes(state.search.toLowerCase()));
  homes.sort((a,b) => state.sort === 'rent' ? (a.costs.rent ?? Infinity) - (b.costs.rent ?? Infinity) : state.sort === 'hard' ? hardSummary(b).pass - hardSummary(a).pass : b.updatedAt.localeCompare(a.updatedAt));
  const hasAny = visibleHomes().length;
  $('#home-results').innerHTML = homes.length ? `<div class="home-grid">${homes.map(homeCard).join('')}</div>` : `<div class="empty-state"><div class="empty-illustration">${HOUSE}</div><h2>${hasAny ? '没有找到匹配的房源' : '下一套好房，从这里记起。'}</h2><p>${hasAny ? '换一个关键词，或切换筛选条件。' : '房租、采光、噪音和那些容易忘的小细节，<br>都可以为每套房单独记录。'}</p>${hasAny ? '' : '<div class="empty-actions"><button class="button primary" id="empty-create">＋ 记录第一套房</button><button class="text-button" id="try-demo">先用示例体验 ↗</button></div>'}</div>`;
  if ($('#empty-create')) $('#empty-create').onclick = () => createHome(0);
  if ($('#try-demo')) $('#try-demo').onclick = enableDemo;
  app.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openEditor(b.dataset.edit,0));
  app.querySelectorAll('[data-select-home]').forEach(input => input.onchange = () => {selectHome(input.dataset.selectHome,input.checked); renderHomeResults();});
  renderTray();
}
function homeCard(home) {
  const hard = hardSummary(home), monthly = monthlyCost(home), selected = state.selected.has(home.id);
  return `<article class="home-card ${selected ? 'selected' : ''}"><div class="card-top"><span class="home-symbol" aria-hidden="true">⌂</span><span class="badge ${home.decision}">${DECISIONS[home.decision]}</span></div><h2 class="home-title">${esc(homeLabel(home))}</h2><p class="home-meta">${esc([home.layout, floorLabel(home), home.bathrooms, home.area ? home.area+'㎡' : ''].filter(Boolean).join(' · ') || '房型、楼层待补充')}</p><p class="rent">${home.costs.rent === null ? '待填房租' : `<span class="currency">¥</span>${Number(home.costs.rent).toLocaleString('zh-CN')}<small>/ 月</small>`}</p><p class="monthly-caption">${monthly.known ? `固定月支出${monthly.complete ? ' ' : '至少 '}${money(monthly.total)}${monthly.complete ? '' : ' · 部分费用待填'}` : '固定月支出待确认'}</p><div class="hard-progress"><div class="progress-label"><span>硬性条件 <strong>${hard.pass}/${hard.total} 符合</strong></span><strong class="${hard.fail ? 'failed' : ''}">${hard.fail ? hard.fail + '项不符合' : '暂无不符合项'}</strong></div><div class="progress-track"><span class="pass" style="width:${hard.pass / hard.total * 100}%"></span><span class="fail" style="width:${hard.fail / hard.total * 100}%"></span></div><p class="pending-caption">${hard.unknown} 项待确认${hard.other ? ` · ${hard.other} 项其他` : ''}</p></div><div class="card-bottom"><label class="compare-check"><input type="checkbox" data-select-home="${home.id}" ${selected ? 'checked' : ''}>加入对比</label><button class="button" data-edit="${home.id}" ${state.demo ? 'disabled' : ''}>查看与记录 ↗</button></div></article>`;
}
function selectHome(id, selected) {
  if (selected && state.selected.size >= 4) {toast('一次最多对比4套房。先取消一套再添加。');return;}
  selected ? state.selected.add(id) : state.selected.delete(id); updateStatus();
}
function renderTray() {
  const slot = $('#compare-tray-slot');
  if (!slot) return;
  slot.innerHTML = state.selected.size ? `<div class="compare-tray"><span>已选 ${state.selected.size} 套房源</span><div><button class="text-button" id="clear-selected">清空</button><a class="button" href="${backendHash('compare', LINK_ENDPOINT)}">并排对比 →</a></div></div>` : '';
  if ($('#clear-selected')) $('#clear-selected').onclick = () => {state.selected.clear(); renderHomeResults(); updateStatus();};
}
function renderCompare() {
  const homes = visibleHomes();
  const selected = homes.filter(h => state.selected.has(h.id));
  const checks = CHECKS.filter(c => !state.differencesOnly || !isCommonPositive(selected, c));
  const checksRows = kind => checks.filter(c => c.kind === kind).map(c => `<tr data-compare-check="${c.id}"><th scope="row">${esc(c.label)}</th>${selected.map(h => {const v=getCheck(h,c.id);return `<td><span class="answer ${v.status}">${LABELS[c.kind][v.status]}</span>${v.note ? `<div class="cell-note">${esc(v.note)}</div>` : ''}</td>`;}).join('')}</tr>`).join('');
  const row = (label, value) => `<tr><th scope="row">${label}</th>${selected.map(h => `<td>${value(h)}</td>`).join('')}</tr>`;
  const category = title => `<tr class="category-row"><th scope="row">${title}</th><td colspan="${selected.length}" aria-hidden="true"></td></tr>`;
  const checkSection = (kind, title) => checks.some(c => c.kind === kind) ? category(title) + checksRows(kind) : '';
  app.innerHTML = `${heading('SIDE BY SIDE, CLEARER CHOICES', '放在一起，差别更清楚。', '硬性看是否符合，软性看实际感受。未确认项不会当作不符合。')}${sampleBanner()}
  ${homes.length ? `<div class="compare-picker" aria-label="选择对比房源">${homes.map(h => `<label class="pick-pill ${state.selected.has(h.id) ? 'selected' : ''}"><input type="checkbox" data-pick="${h.id}" ${state.selected.has(h.id) ? 'checked' : ''}>${esc(homeLabel(h))}</label>`).join('')}</div>` : ''}
  ${selected.length < 2 ? `<div class="empty-state"><div class="empty-illustration">${HOUSE}</div><h2>${homes.length ? '选两套房，开始比较。' : '有了记录，才有比较。'}</h2><p>选择2至4套房源，并排查看费用、硬性条件、<br>居住体验与签约待确认事项。</p><div class="empty-actions"><a class="button primary" href="${backendHash('homes', LINK_ENDPOINT)}">${homes.length ? '去房源列表选择' : '去记录房源'} →</a>${!homes.length ? '<button class="text-button" id="compare-demo">查看示例对比 ↗</button>' : ''}</div></div>` : `<div class="compare-controls"><div class="filters" role="group" aria-label="对比显示方式"><button data-compare-filter="all" aria-pressed="${!state.differencesOnly}" class="${!state.differencesOnly?'active':''}">全部项目</button><button data-compare-filter="differences" aria-pressed="${state.differencesOnly}" class="${state.differencesOnly?'active':''}">差异项</button></div><p class="form-hint">${state.differencesOnly ? `已隐藏 ${CHECKS.length-checks.length} 项全部为“符合 / 满意 / 已明确”的核对项。` : '差异项仅隐藏全部房源都为“符合 / 满意 / 已明确”的核对项。'}未确认、未评估及不符合等结果保留。</p></div><p class="form-hint">左右滑动查看其他房源，纵向滚动查看更多指标。</p><div class="comparison-scroll" tabindex="0" aria-label="房源对比表，可横向滚动"><table class="comparison-table" style="min-width:${170 + selected.length * 245}px"><thead><tr><th scope="col">对比项目</th>${selected.map(h => `<th scope="col">${esc(homeLabel(h))}<div class="cell-note">${DECISIONS[h.decision]}</div></th>`).join('')}</tr></thead><tbody>
  ${category('基本情况与费用')}${row('小区',h=>esc(h.community || '待填写'))}${row('房型',h=>esc(h.layout || '待填写'))}${row('楼层',h=>esc(floorLabel(h) || '待填写'))}${row('卫生间',h=>esc(h.bathrooms || '待填写'))}${row('面积',h=>esc(h.area ? h.area+'㎡' : '未填写'))}${COSTS.filter(c=>!c.hidden).map(c=>row(c.label+(c.monthly&&c.id!=='property'?' / 月':''),h=>money(h.costs[c.id])+(c.id==='property'&&h.costs.property!==null?` / ${h.propertyFeeBasis==='area'?'m²·月':'月（旧记录）'}`:''))).join('')}${row('固定月支出',h=>{const c=monthlyCost(h);return c.known ? `${c.complete?'':'至少 '}${money(c.total)}${c.complete?'':'<div class="cell-note">部分费用或物业计费面积待填；不含水电气等用量费用</div>'}`:'待确认';})}${checkSection('hard','硬性条件')}${checkSection('soft','软性评估')}${checkSection('contract','签约责任')}${category('其他记录')}${row('综合备注',h=>`<div class="cell-note">${esc(h.notes || '暂无备注')}</div>`)}</tbody></table></div><p class="compare-note">手机可左右滑动表格。物业月费按单价×面积计算；旧记录按原每月金额计算。空白费用或缺少计费面积均保持待确认，押金不计入月支出。</p>`}`;
  app.querySelectorAll('[data-pick]').forEach(input => input.onchange = () => {selectHome(input.dataset.pick,input.checked);renderCompare();});
  app.querySelectorAll('[data-compare-filter]').forEach(button => button.onclick = () => {state.differencesOnly=button.dataset.compareFilter==='differences';renderCompare();});
  if ($('#compare-demo')) $('#compare-demo').onclick = () => {enableDemo(); state.selected = new Set(samples.slice(0,2).map(h=>h.id));renderCompare();updateStatus();};
  bindDemoExit();
}

function createHome(tab) {
  state.demo = false; state.selected.clear();
  const home = newHome(); items[home.id] = {data:home,revision:0,deleted:false,dirty:!!ENDPOINT,modifiedAt:Date.now()};
  persist(); render(); openEditor(home.id,tab);
}
function openEditor(id, tab) {
  if (state.demo || !items[id] || items[id].deleted) return;
  if (![0, 2, 3].includes(tab)) tab = 2;
  state.editing = id; state.editorTab = tab;
  editor.innerHTML = `<div class="dialog-header"><div><h2 id="editor-title">记录房源</h2><p>每次修改自动保存，按现场核实的实际情况填写。</p></div><button class="icon-button" id="close-editor" aria-label="关闭记录">×</button></div><div class="editor-tabs" role="tablist" aria-label="房源记录分类">${[[0,'基本信息'],[2,'仔细验房'],[3,'签约确认']].map(([i,name])=>`<button role="tab" id="editor-tab-${i}" data-editor-tab="${i}" aria-controls="editor-panel" aria-selected="${i===tab}" class="${i===tab?'active':''}">${name}</button>`).join('')}</div><div id="editor-panel" class="editor-content" role="tabpanel"></div><div class="editor-footer"><span class="saved-note" id="editor-saved"></span><div class="editor-footer-actions"><button class="text-button" id="delete-home">删除</button><button class="button primary" id="done-editor">完成</button></div></div>`;
  $('#close-editor').onclick = $('#done-editor').onclick = () => {if (editorInputsValid()) editor.close();};
  $('#delete-home').onclick = () => deleteHome(id);
  editor.querySelectorAll('[data-editor-tab]').forEach(button => button.onclick = () => switchEditorTab(Number(button.dataset.editorTab)));
  renderEditorPanel(); updateStatus();
  if (!editor.open) editor.showModal();
}
function switchEditorTab(tab) {
  if (!editorInputsValid()) return;
  state.editorTab = tab;
  editor.querySelectorAll('[data-editor-tab]').forEach(button => {const active=Number(button.dataset.editorTab)===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',active);});
  renderEditorPanel(); $('#editor-panel').scrollTop = 0;
}
function editorInputsValid() {
  const invalid = editor.querySelector('input:invalid');
  if (invalid) {invalid.reportValidity();invalid.focus();return false;}
  return true;
}
function bindCommunityPicker(home, communities) {
  const wrapper = $('#community-combobox'), input = $('#community-input'), toggle = $('#community-toggle'), list = $('#community-options');
  let candidates = [], active = -1;
  const close = () => {
    list.hidden = true; active = -1;
    input.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const choose = name => {input.value = name; home.community = name; changed(home); input.focus(); close();};
  const show = (all = false) => {
    const query = input.value.trim().toLocaleLowerCase('zh-CN');
    candidates = communities.filter(name => all || name.toLocaleLowerCase('zh-CN').includes(query)); active = -1;
    list.innerHTML = candidates.length ? candidates.map((name, index) => `<button type="button" role="option" id="community-option-${index}" aria-selected="false" tabindex="-1" data-community-index="${index}">${esc(name)}</button>`).join('') : '<div class="community-empty" role="option" aria-disabled="true">没有匹配的小区，可直接输入新名称</div>';
    list.hidden = false; input.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-expanded', 'true'); input.removeAttribute('aria-activedescendant');
    list.querySelectorAll('[data-community-index]').forEach(option => {
      option.onmousedown = event => event.preventDefault();
      option.onclick = () => choose(candidates[Number(option.dataset.communityIndex)]);
    });
  };
  input.oninput = () => {home.community = input.value.trim(); changed(home); show();};
  input.onfocus = () => show();
  toggle.onclick = () => {if (list.hidden) {input.focus(); show(true);} else close();};
  wrapper.addEventListener('focusout', event => {if (!wrapper.contains(event.relatedTarget)) close();});
  input.onkeydown = event => {
    if (event.key === 'Escape' && !list.hidden) {event.preventDefault(); event.stopPropagation(); close();}
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (list.hidden) show(); if (!candidates.length) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + candidates.length) % candidates.length;
      list.querySelectorAll('[role=option]').forEach((option, index) => option.setAttribute('aria-selected', index === active));
      const option = $(`#community-option-${active}`); input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView({block:'nearest'});
    } else if (event.key === 'Enter' && !list.hidden && active >= 0) {event.preventDefault(); choose(candidates[active]);}
  };
}
function renderEditorPanel() {
  const home = items[state.editing]?.data;
  if (!home) return;
  const panel = $('#editor-panel');
  const histories = new Map();
  const historyPicker = (key, label) => {
    const notes = noteHistory(actualHomes(), key === 'general' ? null : key);
    histories.set(key, notes);
    return notes.length ? `<select class="note-history" data-note-history="${key}" aria-label="${esc(label)}的历史备注"><option value="">选择历史备注填充…</option>${notes.map((note,index)=>`<option value="${index}">${esc(note.replace(/\s+/g, ' '))}</option>`).join('')}</select>` : '';
  };
  panel.setAttribute('aria-labelledby',`editor-tab-${state.editorTab}`);
  if (state.editorTab === 0) {
    const communities = communityNames(actualHomes());
    const field = (id,label,type='text',placeholder='',full=false) => `<label class="form-field ${full?'full':''}"><span>${label}</span><input data-field="${id}" type="${type}" value="${esc(home[id])}" placeholder="${placeholder}" maxlength="2000"></label>`;
    const choice = (id, label, values) => `<label class="form-field"><span>${label}</span><select data-field="${id}"><option value="">待确认</option>${[...new Set([...values, home[id]].filter(Boolean))].map(value => `<option value="${esc(value)}" ${home[id]===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>`;
    panel.innerHTML = `<p class="form-hint">记录小区、房型、楼层和卫生间，面积可不填。费用不知道就留空，确认免费再填0。</p><div class="form-grid">
    <div class="form-field full"><label class="note-field-label" for="community-input">小区名称</label><div class="community-combobox" id="community-combobox"><div class="community-input-row"><input id="community-input" type="text" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="community-options" aria-expanded="false" maxlength="2000" value="${esc(home.community)}" placeholder="输入名称，或点右侧选择" autocomplete="off"><button type="button" id="community-toggle" aria-label="下拉选择已有小区" aria-controls="community-options" aria-expanded="false">⌄</button></div><div id="community-options" class="community-options" role="listbox" aria-label="小区候选" hidden></div></div></div>
    ${choice('layout','房型',['三房','四房'])}${field('floor','楼层','text','如：12 / 26')}${choice('bathrooms','卫生间',['一卫','两卫'])}${field('area','面积（㎡，选填）','text','如：100')}
    <div class="form-caption">费用明细</div>${COSTS.filter(c=>!c.hidden).map(c=>`<label class="form-field"><span>${c.label}</span><input data-cost="${c.id}" type="number" inputmode="decimal" min="0" max="100000000" step="0.01" value="${home.costs[c.id]??''}" placeholder="待确认"><small>${c.id==='property'&&home.propertyFeeBasis==='monthly'?'元/月（旧记录，保留原单位）':c.unit}</small></label>`).join('')}<p class="form-hint full" id="property-calculation"></p><div class="form-caption">补充记录</div><label class="form-field"><span>当前考虑状态</span><select data-field="decision">${Object.entries(DECISIONS).map(([id,label])=>`<option value="${id}" ${home.decision===id?'selected':''}>${label}</option>`).join('')}</select></label><div class="form-field full"><label class="note-field-label" for="home-notes">综合印象 / 待追问事项</label>${historyPicker('general','综合备注')}<textarea id="home-notes" data-field="notes" maxlength="10000" placeholder="记下你最在意的优点、顾虑和房东的口头承诺…">${esc(home.notes)}</textarea></div></div>`;
    panel.querySelector('[data-field=area]').inputMode = 'decimal';
    const updatePropertyHint = () => {
      const monthly = propertyMonthlyCost(home);
      $('#property-calculation').textContent = home.propertyFeeBasis === 'monthly' ? '旧记录的物业费按每月金额保留，计入月支出。新建房源按元/m²填写。' : `物业费按每平方米每月填写，月费＝单价×计费面积。${monthly === null ? '未填单价或面积时，物业月费保持待确认。' : `当前物业月费 ${money(monthly)}。`}如实际计费面积与房源面积不同，请在综合备注注明。`;
    };
    panel.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('input',()=>{home[input.dataset.field]=input.value;changed(home);if(input.dataset.field==='area')updatePropertyHint();}));
    bindCommunityPicker(home, communities);
    updatePropertyHint();
    panel.querySelectorAll('[data-cost]').forEach(input=>input.addEventListener('input',()=>{
      if (!input.validity.valid) {input.setAttribute('aria-invalid','true');return;}
      input.removeAttribute('aria-invalid');home.costs[input.dataset.cost]=input.value===''?null:Number(input.value);changed(home);if(input.dataset.cost==='property')updatePropertyHint();
    }));
  } else {
    const stage=STAGES[state.editorTab-1], checks=CHECKS.filter(c=>c.stages.includes(stage.id));
    panel.innerHTML = `<div class="editor-step-intro">${esc(stage.intro)}<br>点选实际核实结果；选择“其他”后，可复用历史备注或直接填写。</div>${stageReminders(stage)}${checks.map(c=>{const value=getCheck(home,c.id);return `<section class="check-row" data-check-row="${c.id}"><div class="check-row-heading"><strong>${esc(c.label)}</strong><span class="kind-label ${c.kind}">${{hard:'硬性',soft:'软性',contract:'责任'}[c.kind]}</span></div><p class="check-how" id="how-${c.id}">${esc(c.how)}</p><div class="status-options" role="group" aria-label="${esc(c.label)}" aria-describedby="how-${c.id}">${Object.entries(LABELS[c.kind]).map(([status,label])=>`<button data-check="${c.id}" data-value="${status}" aria-pressed="${value.status===status}" ${status==='other'?`aria-controls="details-${c.id}" aria-expanded="${value.status==='other'}"`:''}>${label}</button>`).join('')}</div><div class="check-details" id="details-${c.id}" ${value.status==='other'?'':'hidden'}>${historyPicker(c.id,c.label)}<label class="sr-only" for="note-${c.id}">${esc(c.label)}的具体情况</label><textarea id="note-${c.id}" class="check-note" data-note="${c.id}" maxlength="3000" rows="2" placeholder="写下具体情况、金额或约定…">${esc(value.note)}</textarea></div></section>`;}).join('')}`;
    panel.querySelectorAll('[data-check]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.check, status=button.dataset.value;
      home.checks[id]={...getCheck(home,id),status};changed(home);
      button.parentElement.querySelectorAll('button').forEach(b=>{
        b.setAttribute('aria-pressed',b===button);
        if(b.dataset.value==='other')b.setAttribute('aria-expanded',status==='other');
      });
      $(`#details-${id}`).hidden=status!=='other';
      if(status==='other')$(`#note-${id}`).focus();
    });
    panel.querySelectorAll('[data-note]').forEach(input=>input.oninput=()=>{home.checks[input.dataset.note]={...getCheck(home,input.dataset.note),note:input.value};changed(home);});
  }
  panel.querySelectorAll('[data-note-history]').forEach(select => select.onchange = () => {
    if (select.value === '') return;
    const key = select.dataset.noteHistory;
    const note = histories.get(key)?.[Number(select.value)];
    if (note === undefined) return;
    const textarea = key === 'general' ? $('#home-notes') : $(`#note-${key}`);
    textarea.value = note;
    if (key === 'general') home.notes = note;
    else home.checks[key] = {...getCheck(home,key), note};
    changed(home);
    select.value = '';
    textarea.focus();
    textarea.setSelectionRange(note.length, note.length);
  });
}
editor.addEventListener('cancel',event=>{if(!editorInputsValid())event.preventDefault();});
editor.addEventListener('close',()=>{state.editing=null;render();if(token)sync();});

function askConfirm(title, text, action, {cancelLabel='取消', danger=true}={}) {
  return new Promise(resolve=>{
    const dialog=$('#confirm-dialog');
    dialog.innerHTML=`<div class="confirm-body"><h2 id="confirm-title">${esc(title)}</h2><p style="margin-top:14px">${esc(text)}</p><div class="confirm-actions"><button class="button" id="confirm-cancel">${esc(cancelLabel)}</button><button class="button ${danger?'danger':'primary'}" id="confirm-yes">${esc(action)}</button></div></div>`;
    let accepted=false;
    $('#confirm-cancel').onclick=()=>dialog.close();
    $('#confirm-yes').onclick=()=>{accepted=true;dialog.close();};
    dialog.addEventListener('close',()=>resolve(accepted),{once:true});dialog.showModal();
  });
}
async function deleteHome(id) {
  const home=items[id].data;
  if (!await askConfirm('删除这套房源？',`“${homeLabel(home)}”的记录将被删除，并在连接服务器后同步。建议先导出需要保留的记录。`,'删除房源')) return;
  items[id].deleted=true;items[id].data=null;items[id].dirty=!!ENDPOINT;items[id].modifiedAt=Date.now();state.selected.delete(id);persist();editor.close();if(token)sync();toast('房源已删除');
}
function download(content, filename) {
  const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportHomes() {
  const data={format:'rental-notes',version:1,exportedAt:new Date().toISOString(),homes:actualHomes()};
  download(JSON.stringify(data,null,2),`看房手记-${new Date().toLocaleDateString('sv-SE')}.json`);
  toast(`已导出 ${data.homes.length} 套房源`);
}
function renderSettings() {
  settings.innerHTML=`<div class="dialog-header"><div><h2 id="settings-title">数据与同步</h2><p>保留自己的记录，也留一份备份。</p></div><button class="icon-button" id="close-settings" aria-label="关闭数据设置">×</button></div><div class="settings-body"><section class="settings-section"><h3>当前记录</h3><div class="sync-detail">${actualHomes().length} 套房源 · ${ENDPOINT?'本机草稿＋服务器同步':'保存在当前设备的浏览器'}${lastSync?`<br>最近同步 ${lastSync}`:''}</div><p class="small-note">${ENDPOINT?'离线修改会先保存在本机，重新联网并登录后再同步。':'清除网站数据或更换浏览器不会保留本机记录，请定期导出备份。'}</p></section>
  ${ENDPOINT?`<section class="settings-section"><h3>连接的服务器</h3><p class="connection-address">${esc(ENDPOINT)}</p>${LINK_ENDPOINT?'<p class="small-note">返回本地模式后，这里的草稿仍会保留；再次使用同一服务器链接即可继续。</p><button class="button" id="use-local">返回本地模式</button>':''}</section>`:''}
  ${ENDPOINT?`<section class="settings-section"><h3>跨设备同步</h3>${token?`<p>${syncError?esc(syncError):'已登录。其他设备登录同一服务器后，可查看和修改这些房源。'}</p><div class="settings-actions"><button class="button primary" id="sync-now">立即同步</button><button class="button" id="logout">退出登录</button></div>`:`<p>输入部署时设置的个人密码。未登录期间的记录会先保存在本机。</p><form id="login-form"><label class="form-field"><span>个人登录密码</span><input id="login-password" type="password" autocomplete="current-password" required maxlength="1024"></label><div class="settings-actions"><button class="button primary" type="submit" id="login-submit">登录并同步</button></div><p id="login-error" class="inline-error" role="alert"></p></form>`}</section>`:''}
  <section class="settings-section"><h3>导出与恢复</h3><p>导出文件包含房源指标、费用和备注，不包含登录凭据。导入时保留已有记录；相同ID内容不同的房源会作为副本添加。</p><div class="settings-actions"><button class="button" id="export">↓ 导出备份</button><button class="button" id="import">↑ 导入备份</button></div></section></div>`;
  $('#close-settings').onclick=()=>settings.close();$('#export').onclick=exportHomes;$('#import').onclick=()=>$('#import-file').click();
  if($('#use-local')) $('#use-local').onclick=async()=>{if(await askConfirm('返回本地模式？','当前服务器草稿会保留。返回后将显示此前的纯本地记录；需要迁移请先导出 JSON 备份。','返回本地模式',{danger:false})){clearBackendLink();location.reload();}};
  if($('#login-form')) $('#login-form').onsubmit=async event=>{
    event.preventDefault();const password=$('#login-password').value;$('#login-submit').disabled=true;$('#login-error').textContent='';
    try {const result=await request('/api/login',{method:'POST',body:JSON.stringify({password})});token=result.token;sessionStorage.setItem(TOKEN_KEY,token);await sync();renderSettings();toast(syncError?'已登录，记录等待同步':'已登录并完成同步');}
    catch(error){$('#login-error').textContent=error.message;$('#login-submit').disabled=false;}
  };
  if($('#sync-now')) $('#sync-now').onclick=async()=>{const b=$('#sync-now');b.disabled=true;await sync();renderSettings();toast(syncError?'同步未完成，本机草稿已保留':'同步完成',!!syncError);};
  if($('#logout')) $('#logout').onclick=async()=>{try{await request('/api/logout',{method:'POST'});}catch{}token='';sessionStorage.removeItem(TOKEN_KEY);updateStatus();renderSettings();};
}
$('#storage-button').onclick=()=>{renderSettings();settings.showModal();};
settings.addEventListener('close',render);
$('#import-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try {
    if(file.size>10*1024*1024)throw new Error('备份文件过大，请选择10MB以内的JSON文件');
    const homes=validateBackup(JSON.parse(await file.text()));
    if(!await askConfirm('导入房源备份？',`将检查并添加 ${homes.length} 套房源。已有记录不会被覆盖。`,'导入记录'))return;
    let added=0;
    for(const home of homes){
      const existing=items[home.id];
      if(existing&&!existing.deleted&&JSON.stringify(existing.data)===JSON.stringify(home))continue;
      if(existing){home.id=uuid();home.name=`${homeLabel(home)}（导入副本）`;}
      items[home.id]={data:home,revision:0,deleted:false,dirty:!!ENDPOINT,modifiedAt:Date.now()};added++;
    }
    state.demo=false;persist();renderSettings();render();if(token)sync();toast(`已添加 ${added} 套房源`);
  }catch(error){toast(error.message||'无法读取备份文件',true);}
};

const samples=[0,1,2].map(index=>{
  const home=newHome();home.community=['示例 · 花园小区','示例 · 近地铁小区','示例 · 花园小区'][index];home.layout=['三房','四房','三房'][index];home.bathrooms=['两卫','两卫','一卫'][index];home.floor=['12 / 26','8 / 18','21 / 32'][index];home.area=['100','120','95'][index];home.decision=['shortlist','eliminated','pending'][index];
  home.costs={rent:[2600,2400,2800][index],property:[1.2,1.5,null][index],parking:[250,300,200][index],agency:[1300,0,null][index],cleanIn:0,cleanOut:null,deposit:[2600,2400,2800][index]};
  for(const c of CHECKS){home.checks[c.id]={status:c.kind==='hard'?'pass':c.kind==='soft'?['good','average','good'][index]:'unknown',note:''};}
  home.checks.signal.status='unknown';home.checks.working.status='unknown';
  if(index===1){home.checks.closed_kitchen={status:'fail',note:'实际是开放式厨房'};home.checks.street_noise={status:'poor',note:'晚高峰临街车流声较明显'};}
  if(index===2){home.checks.agency.status='unknown';home.checks.balcony_clear={status:'good',note:'阳台前方开阔，下午采光好'};}
  return home;
});
function enableDemo(){state.demo=true;state.filter='all';state.search='';state.selected=new Set(samples.slice(0,2).map(h=>h.id));render();toast('已进入示例模式，示例不会保存到你的记录');}
function route(){
  const next = resolveConnection(location.href);
  if (next.error || next.endpoint !== LINK_ENDPOINT) { location.reload(); return; }
  state.view=viewFromHash(location.hash);render();window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',route);
window.addEventListener('online',sync);
window.addEventListener('focus',()=>{if(!editor.open)sync();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!editor.open)sync();});
window.addEventListener('storage',event=>{
  if(event.key===STORAGE_KEY&&event.newValue){
    try{
      const next=JSON.parse(event.newValue);
      if(next.version!==1||!next.items)return;
      let mustPersist=false;
      if(editor.open){
        const current=items[state.editing],incoming=next.items[state.editing];
        if(current&&!current.deleted&&JSON.stringify(current.data)!==JSON.stringify(incoming?.data)){
          const copy=structuredClone(current.data);copy.id=uuid();copy.name=`${copy.name||'未命名房源'}（标签页副本）`;
          next.items[copy.id]={data:copy,revision:0,deleted:false,dirty:!!ENDPOINT,modifiedAt:Date.now()};
          mustPersist=true;toast('另一标签页更新了记录。当前编辑已保留为副本，请重新打开继续记录。');
        }
        editor.close();
      }
      for(const [id,current] of Object.entries(items)){
        const incoming=next.items[id];
        if(!incoming||(current.modifiedAt||0)>(incoming.modifiedAt||0)){
          next.items[id]=current;mustPersist=true;
        }
      }
      items=next.items;
      if(mustPersist)persist();else updateStatus();
      if(!settings.open)render();
    }catch{}
  }
});
setInterval(()=>{if(!editor.open&&!settings.open)sync();},30000);
route();if(connectionNotice)toast(connectionNotice,true);if(token)sync();
