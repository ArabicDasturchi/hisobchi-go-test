/**
 * Demo uchun kengaytirilgan jadvallar (PANEL-2 S8): ta'minotchilar (Rahim aka, Abbosxon), kirimlar, katalog, mijozlar, savdolar.
 * Ma'lumot `scripts/demo-seed/extra.ts` dan; barcha yig'indilar `@hisobchi/core` bilan hisoblanadi (bu fayl o'zi hisoblamaydi).
 * Qatorlar bazadagi (PostgREST) shaklda: pul va miqdor matn.
 */
import { calculateDocument, calculatePurchase, type StockMovement } from '@hisobchi/core';
import { EXTRA_CUSTOMERS, EXTRA_PRODUCTS, EXTRA_PURCHASES, EXTRA_SALES, EXTRA_SUPPLIERS } from '../../../../../scripts/demo-seed/extra';

type Row = Record<string, unknown>;
const milli = (qty: number) => BigInt(Math.round(qty * 1000));

export interface ExtraTables {
  customers: Row[];
  products: Row[];
  suppliers: Row[];
  purchase_documents: Row[];
  purchase_lines: Row[];
  supplier_payments: Row[];
  documents: Row[];
  document_lines: Row[];
  payments: Row[];
  movements: StockMovement[];
  /** Mahsulot id'lari (kalit bo'yicha), seed'ning mavjud tovarlari bilan to'qnashmaydi */
  productIds: Map<string, string>;
}

export function buildExtraTables(ctx: { shopId: string; userId: string; iso: (offsetHours: number) => string; day: (offsetHours: number) => string; newId: () => string }): ExtraTables {
  const { shopId, userId, iso, day, newId } = ctx;
  const created = iso(-24 * 30);

  const prod = EXTRA_PRODUCTS.map((p) => ({ ...p, id: newId() }));
  const pByKey = (k: string) => {
    const p = prod.find((x) => x.key === k);
    if (!p) throw new Error(`demo: tovar topilmadi: ${k}`);
    return p;
  };
  const customers = EXTRA_CUSTOMERS.map((c) => ({ ...c, id: newId() }));
  const cByKey = (k: string) => {
    const c = customers.find((x) => x.key === k);
    if (!c) throw new Error(`demo: mijoz topilmadi: ${k}`);
    return c;
  };
  const suppliers = EXTRA_SUPPLIERS.map((s) => ({ ...s, id: newId() }));
  const sByKey = (k: string) => {
    const s = suppliers.find((x) => x.key === k);
    if (!s) throw new Error(`demo: ta'minotchi topilmadi: ${k}`);
    return s;
  };

  // Tan narx: oxirgi kirim narxi (kirim sanasi bo'yicha oxirgisi), kirimsiz tovarlarda katalogdagi qiymat
  const cost = new Map<string, bigint | null>(prod.map((p) => [p.key, p.costPrice === null ? null : BigInt(p.costPrice)]));
  const purchasedKeys = new Set(EXTRA_PURCHASES.flatMap((p) => p.lines.map((l) => l.product)));
  for (const k of purchasedKeys) cost.set(k, null);
  for (const pu of [...EXTRA_PURCHASES].sort((a, b) => b.daysAgo - a.daysAgo)) for (const l of pu.lines) cost.set(l.product, BigInt(l.unitCost));

  const movements: StockMovement[] = [];
  for (const p of prod) if (p.openingStock) movements.push({ productId: p.id, kind: 'adjustment', qtyMilli: milli(p.openingStock) });

  // --- Kirimlar ---
  const purchase_documents: Row[] = [];
  const purchase_lines: Row[] = [];
  const supplier_payments: Row[] = [];
  for (const s of suppliers) {
    if (s.opening > 0) {
      // Boshlang'ich qarz: alohida "ochilish qoldig'i" yozuvi (qatorsiz kirim hujjati)
      purchase_documents.push({
        id: newId(), shop_id: shopId, supplier_id: s.id, doc_date: day(-24 * 40), status: 'posted', kind: 'opening',
        subtotal: String(s.opening), created_at: iso(-24 * 40),
      });
    }
  }
  for (const pu of EXTRA_PURCHASES) {
    const sup = sByKey(pu.supplier);
    const calc = calculatePurchase(pu.lines.map((l) => ({ qtyMilli: milli(l.qty), unitCost: BigInt(l.unitCost) })));
    const docId = newId();
    const at = -24 * pu.daysAgo;
    purchase_documents.push({ id: docId, shop_id: shopId, supplier_id: sup.id, doc_date: day(at), status: 'posted', kind: 'purchase', subtotal: calc.subtotal.toString(), created_at: iso(at) });
    pu.lines.forEach((l, i) => {
      const p = pByKey(l.product);
      purchase_lines.push({
        id: newId(), shop_id: shopId, document_id: docId, line_index: i, product_id: p.id, product_name: p.name, qty_milli: milli(l.qty).toString(),
        unit: p.unit, unit_cost: String(l.unitCost), line_total: calc.lines[i]!.lineTotal.toString(),
      });
      movements.push({ productId: p.id, kind: 'purchase', qtyMilli: milli(l.qty) });
    });
    if (pu.paid > 0) {
      supplier_payments.push({ id: newId(), shop_id: shopId, supplier_id: sup.id, amount: String(pu.paid), method: pu.method, note: 'kirim bilan', created_at: iso(at) });
    }
  }

  // --- Savdolar ---
  const documents: Row[] = [];
  const document_lines: Row[] = [];
  const payments: Row[] = [];
  for (const s of EXTRA_SALES) {
    const at = -s.hoursAgo;
    const calc = calculateDocument(
      s.lines.map(([k, qty]) => {
        const price = pByKey(k).salePrice;
        if (price === null) throw new Error(`demo: ${k} narxi yo'q, savdoga qo'yib bo'lmaydi`);
        return { qtyMilli: milli(qty), unitPrice: BigInt(price) };
      }),
    );
    const docId = newId();
    const customer = s.customer ? cByKey(s.customer) : null;
    documents.push({
      id: docId, shop_id: shopId, customer_id: customer?.id ?? null, status: 'posted', subtotal: calc.subtotal.toString(),
      created_at: iso(at), posted_at: iso(at), created_by: userId,
    });
    s.lines.forEach(([k, qty], i) => {
      const p = pByKey(k);
      const c = cost.get(k) ?? null;
      document_lines.push({
        id: newId(), shop_id: shopId, document_id: docId, line_index: i, product_name: p.name, product_id: p.id, qty_milli: milli(qty).toString(),
        unit: p.unit, unit_price: String(p.salePrice), unit_cost: c === null ? null : c.toString(), line_total: calc.lines[i]!.lineTotal.toString(), raw_text: null,
      });
      movements.push({ productId: p.id, kind: 'sale', qtyMilli: -milli(qty) });
    });
    // To'lov: mijozli savdoda to'langan qismi (mijozsiz naqd savdoda to'lov yozuvi yo'q: u butunlay to'langan)
    if (customer) {
      const paid = s.pay === 'cash' ? calc.subtotal : s.pay === 'debt' ? 0n : BigInt(s.pay);
      if (paid > 0n) {
        payments.push({ id: newId(), shop_id: shopId, customer_id: customer.id, amount: paid.toString(), method: s.method ?? 'naqd', note: 'Savdo bilan', created_by: userId, created_at: iso(at) });
      }
    }
  }

  return {
    customers: customers.map((c) => ({ id: c.id, shop_id: shopId, name: c.name, phone: null, notes: null, is_active: true, source: 'app', kind: 'regular', created_at: created, updated_at: created })),
    products: prod.map((p) => ({
      id: p.id, shop_id: shopId, name: p.name, unit: p.unit, last_price: p.salePrice === null ? null : String(p.salePrice), sale_price: p.salePrice === null ? null : String(p.salePrice),
      cost_price: cost.get(p.key) === null || cost.get(p.key) === undefined ? null : cost.get(p.key)!.toString(), is_active: true, source: 'app', created_at: created, updated_at: created,
    })),
    suppliers: suppliers.map((s) => ({ id: s.id, shop_id: shopId, name: s.name, phone: null, notes: null, is_active: true, created_at: created })),
    purchase_documents,
    purchase_lines,
    supplier_payments,
    documents,
    document_lines,
    payments,
    movements,
    productIds: new Map(prod.map((p) => [p.key, p.id])),
  };
}
