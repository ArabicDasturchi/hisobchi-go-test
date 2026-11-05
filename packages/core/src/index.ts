/**
 * @module @hisobchi/core
 * Hisobchi Go — asosiy hisob-kitob, validatsiya va parsing moduli.
 *
 * Bu paket UI yoki serverdan mustaqil ishlaydi.
 * Barcha pul hisob-kitoblari BigInt orqali amalga oshiriladi.
 */

// Tiplar
export type {
  CalculationLineInput,
  CalculationLineResult,
  CalculationDocumentResult,
  ParsedNumber,
  ParseNumberError,
  ParseNumberResult,
  IssueSeverity,
  ValidationIssue,
  LineValidationResult,
  DocumentLineInput,
  DocumentValidationResult,
  AllowedUnit,
} from './types.js';

// Konstantalar
export {
  MAX_UNIT_PRICE,
  MAX_QTY_MILLI,
  ALLOWED_UNITS,
} from './types.js';

// Hisob-kitob
export { calculateLineTotal, calculateDocument } from './calculation.js';

// Son parseri
export { parseUzNumber } from './parse-uz-number.js';

// Validatsiya
export { validateLine, validateDocument } from './validation.js';

// Normalizatsiya
export { normalizeProductName } from './normalize.js';

// Ro'yxat tahlili
export type { ParsedListRow, ParsedList, ParseQtyResult, ParsePriceResult } from './parse-list.js';
export { parseProductList, parseQtyMilli, parseUnitPriceText } from './parse-list.js';

// Kirim, oldi-berdi, ombor, foyda, to'lov qoidalari (Vazifa 3, S3)
export type { PurchaseLineInput, PurchaseLineResult, PurchaseResult, Settlement, PurchasePaymentCheck } from './purchase.js';
export { calculatePurchase, settle, settlePurchase, sumAmounts } from './purchase.js';
export type { StatementEntry } from './statement.js';
export { partnerStatement, partnerBalance, tashkentDate } from './statement.js';
export type { StockMovement, StockMovementKind, StockLevel, SaleStockLine } from './stock.js';
export { movementError, stockBalances, stockLevel, stockWarning, saleMovements, reversalMovements } from './stock.js';
export type { ProfitLineInput, SaleProfit } from './profit.js';
export { lineProfit, saleProfit } from './profit.js';
export type { CustomerKind, SalePaymentCheck } from './payment-rules.js';
export { checkSalePayment } from './payment-rules.js';
export { TotalsMismatchError, assertTotalsMatch } from './cross-check.js';

// Bosh sahifa agregatlari: kunlik savdo/foyda/kassa, qarz xulosasi, tugayotgan tovarlar (PANEL-1)
export type { DaySale, DaySaleLine, DayPayment, DaySupplierPayment, DayTotalsInput, DayTotals, DebtEntry, DebtSummary, StockItemInput, LowStockLevel, LowStockItem } from './dashboard.js';
export { dayTotals, debtSummary, lowStock, saleLineTotal, DEFAULT_LOW_STOCK_MILLI } from './dashboard.js';
// Savdo paytidagi ogohlantirishlar va ko'p sotilgan tovarlar (PANEL-1, S2-S3)
export type { StockCheck, TopSellingLine, TopSelling } from './sale-checks.js';
export { LOW_STOCK_MILLI, stockCheck, soldBelowCost, topSellingProducts } from './sale-checks.js';
