'use client';
/**
 * Ombor sozlamalari (Ombor sahifasining tepasida, do'kon darajasida): Optom/dona, Baza (qoldiq hisobi), Umumiy ustama %.
 * Saqlash `shops.settings` ga (faqat do'kon egasi; boshqalar ko'radi). O'zgarish darhol ko'rinadi (ShopDataProvider qayta o'qiydi).
 * Hamma tugma >= 44px; ustama maydoni raqamli klaviatura (`inputMode="numeric"`), "Saqlash" tugmasi bilan.
 */
import { useState } from 'react';
import { useShop } from '@/components/ShopDataProvider';
import { Button, Card, cn } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { saveShopSettings } from '@/lib/data/api';
import { can } from '@/lib/permissions';
import { parseMarkupInput, withPricingSettings, type PricingSettings } from '@/lib/shopPricing';
import { getSupabase } from '@/lib/supabase/client';

export interface WarehouseSettingsViewProps {
  value: PricingSettings;
  canEdit: boolean;
  /** Saqlaydi; xato bo'lsa throw qiladi (xabar ko'rsatiladi, qiymat qaytariladi) */
  onChange: (patch: Partial<PricingSettings>) => Promise<void>;
}

function Switch({ checked, onToggle, disabled, label, hint }: { checked: boolean; onToggle: () => void; disabled?: boolean; label: string; hint: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-fg">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          'relative h-8 w-14 shrink-0 rounded-full border transition-colors disabled:opacity-60',
          checked ? 'border-emerald-600 bg-emerald-600' : 'border-line bg-subtle',
        )}
      >
        <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', checked ? 'left-7' : 'left-0.5')} />
        <span className="sr-only">{checked ? 'Yoqilgan' : "O'chirilgan"}</span>
      </button>
    </div>
  );
}

export function WarehouseSettingsView({ value, canEdit, onChange }: WarehouseSettingsViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markup, setMarkup] = useState<string | null>(null); // null — tahrir yo'q (saqlangan qiymat ko'rsatiladi)
  const shownMarkup = markup ?? (value.markupPercent === null ? '' : String(value.markupPercent));

  async function save(patch: Partial<PricingSettings>) {
    setBusy(true);
    setError(null);
    try {
      await onChange(patch);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sozlama saqlanmadi. Qayta urinib ko'ring.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveMarkup() {
    const r = parseMarkupInput(shownMarkup);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    if (await save({ markupPercent: r.value })) setMarkup(null);
  }

  const dirty = markup !== null && markup.trim() !== (value.markupPercent === null ? '' : String(value.markupPercent));

  return (
    <Card className="mb-3 p-4" aria-label="Ombor sozlamalari">
      <h2 className="mb-2 text-base font-semibold text-fg">Ombor sozlamalari</h2>
      <div className="space-y-2">
        <Switch
          checked={value.wholesaleEnabled}
          disabled={!canEdit || busy}
          onToggle={() => void save({ wholesaleEnabled: !value.wholesaleEnabled })}
          label="Optom/dona"
          hint="Yoqilsa: tovarda optom narx va optom boshlanadigan miqdor chiqadi; savdoda shu miqdordan narx optomga o'tadi."
        />
        <Switch
          checked={value.stockEnabled}
          disabled={!canEdit || busy}
          onToggle={() => void save({ stockEnabled: !value.stockEnabled })}
          label="Baza (qoldiq hisobi)"
          hint="Yoqilsa: tovarda soni ko'rinadi va savdoda kamayadi. O'chiq bo'lsa: soni, «Kam qoldi» va «Omborda N bor» ko'rinmaydi."
        />
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
            Umumiy ustama, % (ixtiyoriy)
            <input
              inputMode="numeric"
              aria-label="Umumiy ustama foizi"
              value={shownMarkup}
              disabled={!canEdit || busy}
              placeholder="Masalan: 20"
              onChange={(e) => setMarkup(e.target.value.replace(/[^\d%\s]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveMarkup();
                }
              }}
              className="h-11 w-40 rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold tabular-nums text-fg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-60"
            />
          </label>
          {dirty && (
            <Button size="lg" className="h-11" loading={busy} onClick={() => void saveMarkup()} aria-label="Ustamani saqlash">
              Saqlash
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">Ustama tan narxdan sotuv narxini TAKLIF qiladi; qo&apos;lda kiritilgan narx o&apos;zgarmaydi.</p>
        {!canEdit && <p className="text-xs text-muted">Sozlamalarni faqat do&apos;kon egasi o&apos;zgartira oladi.</p>}
        {error && (
          <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}

/** Ulangan variant: `shops.settings` ga yozadi va a'zolik holatini yangilaydi */
export function WarehouseSettings() {
  const { membership, pricing, shopId, setMembership } = useShop();
  const toast = useToast();
  return (
    <WarehouseSettingsView
      value={pricing}
      canEdit={can(membership.role, 'settings.manage')}
      onChange={async (patch) => {
        const settings = withPricingSettings(membership.shop.settings, patch);
        await saveShopSettings(getSupabase(), shopId, settings);
        setMembership({ ...membership, shop: { ...membership.shop, settings } });
        toast.success('Sozlama saqlandi.');
      }}
    />
  );
}
