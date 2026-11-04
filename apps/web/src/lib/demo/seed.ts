/**
 * Veb panel demosi uchun soxta jadvallar (`npm run demo`). Ma'lumot `scripts/demo-seed/data.ts` dan,
 * jami yig'indilar `@hisobchi/core` bilan hisoblanadi (bu fayl o'zi hech narsa qo'shmaydi).
 * Qatorlar bazadagi (PostgREST) shaklda: pul va miqdor matn (bigint "::text" kabi).
 */
import { calculateDocument, calculatePurchase, stockBalances, type StockMovement } from '@hisobchi/core';
import {
  DEMO_CUSTOMERS,
  DEMO_PRODUCTS,
  DEMO_PURCHASE,
  DEMO_SALE,
  DEMO_SHOP_NAME,
  DEMO_SUPPLIER,
  DEMO_WALKIN_SALE,
} from '../../../../../scripts/demo-seed/data';

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export const DEMO_USER_ID = '00000000-0000-4000-8000-00000000d3a0';
export const DEMO_EMAIL = 'demo@hisobchi.local';

const milli = (qty: number) => BigInt(qty) * 1000n;

export function buildDemoTables(now: Date = new Date(), newId: () => string = () => crypto.randomUUID()): Tables {
  const iso = (offsetHours: number) => new Date(now.getTime() + offsetHours * 3_600_000).toISOString();
  const day = (offsetHours: number) => iso(offsetHours).slice(0, 10);

  const shopId = newId();
  const shop = { id: shopId, name: DEMO_SHOP_NAME, created_at: iso(-72) };

  const products = DEMO_PRODUCTS.map((p) => ({ key: p.key, id: newId(), meta: p }));
  const pid = (key: string) => {
    const f = products.find((p) => p.key === key);
    if (!f) throw new Error(`demo: tovar topilmadi: ${key}`);
    return f;
  };
  const supplierId = newId();
  const customers = DEMO_CUSTOMERS.map((c) => ({ key: c.key, id: newId(), name: c.name }));
  const walkinId = newId();

  // --- Kirim (core hisoblaydi) ---
  const purchaseCalc = calculatePurchase(DEMO_PURCHASE.lines.map((l) => ({ qtyMilli: milli(l.qty), unitCost: BigInt(l.unitCost) })));
  const purchaseId = newId();
  const lastCost = new Map<string, string>();
  const purchaseLines = DEMO_PURCHASE.lines.map((l, i) => {
    const p = pid(l.product);
    lastCost.set(p.id, String(l.unitCost));
    return {
      id: newId(), shop_id: shopId, document_id: purchaseId, line_index: i, product_id: p.id, product_name: p.meta.name,
      qty_milli: milli(l.qty).toString(), unit: p.meta.unit, unit_cost: String(l.unitCost), line_total: purchaseCalc.lines[i]!.lineTotal.toString(),
    };
  });

  // --- Savdolar (core hisoblaydi) ---
  const saleCalc = calculateDocument(
    DEMO_SALE.lines.map((l) => ({ qtyMilli: milli(l.qty), unitPrice: BigInt(pid(l.product).meta.salePrice) })),
  );
  const saleId = newId();
  const walkinCalc = calculateDocument(
    DEMO_WALKIN_SALE.lines.map((l) => ({ qtyMilli: milli(l.qty), unitPrice: BigInt(pid(l.product).meta.salePrice) })),
  );
  const walkinSaleId = newId();
  const karim = customers.find((c) => c.key === DEMO_SALE.customer);
  if (!karim) throw new Error('demo: mijoz topilmadi');

  const saleLines = (docId: string, spec: readonly { product: string; qty: number }[], calc: ReturnType<typeof calculateDocument>) =>
    spec.map((l, i) => {
      const p = pid(l.product);
      return {
        id: newId(), shop_id: shopId, document_id: docId, line_index: i, product_name: p.meta.name, product_id: p.id,
        qty_milli: milli(l.qty).toString(), unit: p.meta.unit, unit_price: String(p.meta.salePrice), line_total: calc.lines[i]!.lineTotal.toString(), raw_text: null,
      };
    });

  // --- Ombor: boshlang'ich qoldiq + kirim - savdo (core) ---
  const movements: StockMovement[] = [
    ...DEMO_PRODUCTS.filter((p) => p.openingStock > 0).map((p) => ({ productId: pid(p.key).id, kind: 'adjustment' as const, qtyMilli: milli(p.openingStock) })),
    ...DEMO_PURCHASE.lines.map((l) => ({ productId: pid(l.product).id, kind: 'purchase' as const, qtyMilli: milli(l.qty) })),
    ...DEMO_SALE.lines.map((l) => ({ productId: pid(l.product).id, kind: 'sale' as const, qtyMilli: -milli(l.qty) })),
    ...DEMO_WALKIN_SALE.lines.map((l) => ({ productId: pid(l.product).id, kind: 'sale' as const, qtyMilli: -milli(l.qty) })),
  ];
  const balances = stockBalances(movements);

  // --- AI qoralamasi (MCP): savdogar hali tasdiqlamagan ---
  const draftLines = [{ product: 'kartoshka', qty: 10 }, { product: 'piyoz', qty: 5 }];
  const draftCalc = calculateDocument(draftLines.map((l) => ({ qtyMilli: milli(l.qty), unitPrice: BigInt(pid(l.product).meta.salePrice) })));
  const dilnoza = customers.find((c) => c.key === 'dilnoza');

  return {
    shops: [shop],
    shop_members: [{ shop_id: shopId, user_id: DEMO_USER_ID, role: 'owner', created_at: shop.created_at }],
    customers: [
      ...customers.map((c) => ({
        id: c.id, shop_id: shopId, name: c.name, phone: null, notes: null, is_active: true, source: 'app', kind: 'regular', created_at: iso(-70), updated_at: iso(-70),
      })),
      { id: walkinId, shop_id: shopId, name: 'Bir martalik mijoz', phone: null, notes: null, is_active: true, source: 'app', kind: 'one_time', created_at: iso(-70), updated_at: iso(-70) },
    ],
    products: products.map((p) => ({
      id: p.id, shop_id: shopId, name: p.meta.name, unit: p.meta.unit, last_price: String(p.meta.salePrice), sale_price: String(p.meta.salePrice),
      cost_price: lastCost.get(p.id) ?? null, is_active: true, source: 'app', created_at: iso(-70), updated_at: iso(-70),
    })),
    product_stock: products.map((p) => ({ shop_id: shopId, product_id: p.id, qty_milli: (balances.get(p.id) ?? 0n).toString() })),
    suppliers: [{ id: supplierId, shop_id: shopId, name: DEMO_SUPPLIER.name, phone: null, notes: null, is_active: true, created_at: iso(-70) }],
    purchase_documents: [
      { id: purchaseId, shop_id: shopId, supplier_id: supplierId, doc_date: day(-26), status: 'posted', subtotal: purchaseCalc.subtotal.toString(), created_at: iso(-26) },
    ],
    purchase_lines: purchaseLines,
    supplier_payments: [
      { id: newId(), shop_id: shopId, supplier_id: supplierId, amount: String(DEMO_PURCHASE.paid.amount), method: DEMO_PURCHASE.paid.method, note: null, created_at: iso(-26) },
    ],
    supplier_payment_voids: [],
    documents: [
      { id: saleId, shop_id: shopId, customer_id: karim.id, status: 'posted', subtotal: saleCalc.subtotal.toString(), created_at: iso(-3), posted_at: iso(-3), created_by: DEMO_USER_ID },
      { id: walkinSaleId, shop_id: shopId, customer_id: walkinId, status: 'posted', subtotal: walkinCalc.subtotal.toString(), created_at: iso(-1), posted_at: iso(-1), created_by: DEMO_USER_ID },
    ],
    document_lines: [...saleLines(saleId, DEMO_SALE.lines, saleCalc), ...saleLines(walkinSaleId, DEMO_WALKIN_SALE.lines, walkinCalc)],
    document_reversals: [],
    payments: [
      // bir martalik savdo to'liq naqd to'langan; Karim akaning savdosi qarzga
      { id: newId(), shop_id: shopId, customer_id: walkinId, amount: walkinCalc.subtotal.toString(), method: DEMO_WALKIN_SALE.method, note: null, created_by: DEMO_USER_ID, created_at: iso(-1) },
    ],
    payment_voids: [],
    agent_drafts: [
      {
        id: newId(), shop_id: shopId, kind: 'sale', status: 'draft', customer_id: dilnoza?.id ?? null, target_id: null, total: draftCalc.subtotal.toString(),
        payload: {
          raw_input: 'Dilnoza opaga 10 kg kartoshka, 5 kg piyoz (demo)',
          lines: draftLines.map((l, i) => {
            const p = pid(l.product);
            return { product_name: p.meta.name, qty_milli: milli(l.qty).toString(), unit: p.meta.unit, unit_price: String(p.meta.salePrice), line_total: draftCalc.lines[i]!.lineTotal.toString(), raw_text: null };
          }),
        },
        client_id: 'demo-claude', created_by: DEMO_USER_ID, created_at: iso(-0.5), decided_at: null, reject_reason: null,
      },
    ],
  };
}
