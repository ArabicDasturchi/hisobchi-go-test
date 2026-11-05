/**
 * Chek matni (mijozga ulashish uchun). Faqat formatlash: summalar chaqiruvchi bergan, core hisoblagan BigInt'lar.
 */
import { formatQty, formatSom, groupDigits, lineTotal } from './money';

export interface ReceiptLine {
  name: string;
  qtyMilli: bigint;
  unit: string;
  unitPrice: bigint;
}

export interface ReceiptInput {
  shopName: string;
  /** "#A1B2C3D4" */
  number: string;
  /** Ko'rsatiladigan sana matni */
  dateText: string;
  customerName: string | null;
  lines: readonly ReceiptLine[];
  total: bigint;
  paid: bigint;
  debt: bigint;
  /** Savdodan keyingi umumiy qarz (mijoz bor bo'lsa) */
  totalDebtAfter: bigint | null;
}

export function buildReceiptText(r: ReceiptInput): string {
  const out: string[] = [r.shopName, `Chek ${r.number} · ${r.dateText}`];
  if (r.customerName) out.push(`Mijoz: ${r.customerName}`);
  out.push('');
  for (const l of r.lines) {
    out.push(`${l.name} ${formatQty(l.qtyMilli)} ${l.unit} × ${groupDigits(l.unitPrice)} = ${formatSom(lineTotal(l))}`);
  }
  out.push('', `Jami: ${formatSom(r.total)}`);
  if (r.paid > 0n) out.push(`To'landi: ${formatSom(r.paid)}`);
  if (r.debt > 0n) out.push(`Qarzga yozildi: ${formatSom(r.debt)}`);
  if (r.totalDebtAfter !== null && r.totalDebtAfter > 0n) out.push(`Umumiy qarz: ${formatSom(r.totalDebtAfter)}`);
  return out.join('\n');
}
