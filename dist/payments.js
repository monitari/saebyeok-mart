// Payment changes presentation and receipts, never the price or stock transaction.
export const PAYMENT_LABELS={cash:'현금',card:'카드'};
export function paymentMethod(person,day=1){
  const age=person.genes.appearance.age;
  const cashChance=age==='child'?100:age==='elder'?65:age==='teen'?35:18;
  return (person.genes.seed+day*17+person.visits*29)%100<cashChance?'cash':'card';
}
export function paymentReceipt(method,total,contribution=0,budget=Infinity){
  const due=Math.max(0,total-contribution);
  const tendered=method==='cash'?Math.min(Math.ceil(due/1000)*1000,Math.max(due,budget)):due;
  return {method,total,contribution,due,tendered,change:method==='cash'?tendered-due:0};
}
export function validReceipt(r){
  return !!r&&['cash','card'].includes(r.method)&&['total','contribution','due','tendered','change'].every(k=>Number.isFinite(r[k])&&r[k]>=0)&&r.contribution<=r.total&&r.due===r.total-r.contribution&&r.tendered-r.change===r.due&&(r.method!=='card'||r.change===0);
}
