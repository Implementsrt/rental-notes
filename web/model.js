import { CHECKS, LABELS, COSTS } from './checklist.js';
export const uuid = () => crypto.randomUUID();
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function newHome() {
  return {id: uuid(), community: '', layout: '', bathrooms: '', name: '', address: '', link: '', contact: '', area: '', floor: '', visitDate: '', decision: 'pending', notes: '', propertyFeeBasis: 'area', costs: Object.fromEntries(COSTS.map(c => [c.id, null])), checks: {}, updatedAt: new Date().toISOString()};
}
export function normalizeHome(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('房源格式不正确');
  const home = newHome();
  if (typeof raw.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw.id)) home.id = raw.id;
  for (const key of ['community','layout','bathrooms','name','address','link','contact','area','floor','visitDate','notes']) home[key] = String(raw[key] ?? '').slice(0, key === 'notes' ? 10000 : 2000);
  // Older records contain a monthly amount, never reinterpret it as a rate.
  home.propertyFeeBasis = raw.propertyFeeBasis ?? 'monthly';
  if (!['area', 'monthly'].includes(home.propertyFeeBasis)) throw new Error('物业费单位不正确');
  if (['pending','shortlist','eliminated','chosen'].includes(raw.decision)) home.decision = raw.decision;
  for (const c of COSTS) {
    const v = raw.costs?.[c.id];
    if (typeof v === 'boolean' || (v !== null && typeof v === 'object')) throw new Error(`${c.label}金额不正确`);
    home.costs[c.id] = v === null || v === undefined || v === '' ? null : Number(v);
    if (home.costs[c.id] !== null && (!Number.isFinite(home.costs[c.id]) || home.costs[c.id] < 0 || home.costs[c.id] > 1e8)) throw new Error(`${c.label}金额不正确`);
  }
  for (const c of CHECKS) {
    const v = raw.checks?.[c.id];
    if (v && Object.hasOwn(LABELS[c.kind], v.status)) home.checks[c.id] = {status: v.status, note: String(v.note ?? '').slice(0, 3000)};
  }
  if (typeof raw.updatedAt === 'string' && !isNaN(Date.parse(raw.updatedAt))) home.updatedAt = raw.updatedAt;
  return home;
}
export const getCheck = (home, id) => home.checks[id] || {status: 'unknown', note: ''};
export function isCommonPositive(homes, check) {
  const positive = {hard: 'pass', soft: 'good', contract: 'pass'}[check.kind];
  return homes.length >= 2 && !!positive && homes.every(home => getCheck(home, check.id).status === positive);
}
export const floorLabel = home => home.floor ? (/层/.test(home.floor) ? home.floor : `${home.floor}层`) : '';
export const homeLabel = home => [...new Set([home.community, ...(home.name ? [home.name] : [home.layout, floorLabel(home), home.bathrooms])].map(v => String(v || '').trim()).filter(Boolean))].join(' · ') || '未命名房源';
export const communityNames = homes => [...new Set(homes.map(home => String(home.community || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN'));
export function noteHistory(homes, checkId = null) {
  const recent = [...homes].sort((a,b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  return [...new Set(recent.map(home => String((checkId === null ? home.notes : getCheck(home, checkId).note) ?? '').trim()).filter(Boolean))];
}
export function hardSummary(home) {
  const checks = CHECKS.filter(c => c.kind === 'hard');
  return {total: checks.length, pass: checks.filter(c => getCheck(home, c.id).status === 'pass').length, fail: checks.filter(c => getCheck(home, c.id).status === 'fail').length, unknown: checks.filter(c => getCheck(home, c.id).status === 'unknown').length, other: checks.filter(c => getCheck(home, c.id).status === 'other').length};
}
export function propertyMonthlyCost(home) {
  const fee = home.costs.property;
  if (fee === null || fee === undefined) return null;
  if (home.propertyFeeBasis !== 'area' || fee === 0) return fee;
  const area = String(home.area).trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(area) || !Number.isFinite(Number(area)) || Number(area) <= 0) return null;
  const monthly = Math.round((fee * Number(area) + Number.EPSILON) * 100) / 100;
  return Number.isFinite(monthly) ? monthly : null;
}
export function monthlyCost(home) {
  const values = COSTS.filter(c => c.monthly && !c.hidden).map(c => c.id === 'property' ? propertyMonthlyCost(home) : home.costs[c.id] ?? null);
  return {total: values.reduce((sum,v) => sum + (v ?? 0), 0), complete: values.every(v => v !== null), known: values.filter(v => v !== null).length};
}
export function validateBackup(raw) {
  if (!raw || raw.format !== 'rental-notes' || raw.version !== 1 || !Array.isArray(raw.homes) || raw.homes.length > 1000) throw new Error('请选择本工具导出的房源备份文件（最多1000套）');
  return raw.homes.map(normalizeHome);
}
