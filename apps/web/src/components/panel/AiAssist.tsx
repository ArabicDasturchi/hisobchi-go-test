'use client';
/**
 * F5/F4: AI yordamchisi oynasi. Erkin gap (yozib yoki gapirib) yoki kirim surati → server `ai-parse` → qatorlar
 * SAVATGA qoralama sifatida tushadi (har qatori "tekshiring" bilan). AI hisoblamaydi va yozmaydi; daftarga faqat
 * savdogar tasdiqlagach odatdagi yo'l bilan. Ovoz: brauzerning o'z nutqni tanish vositasi (Web Speech API, kalit
 * kerak emas); qo'llab-quvvatlanmasa tugma ko'rinmaydi. Rasm saqlanmaydi.
 */
import { Camera, Mic, MicOff, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Alert, Button, Textarea } from '@/components/ui/primitives';
import { AiError, callAiParse, type AiMode, type AiResult } from '@/lib/aiLines';
import { bytesToBase64, ImagePrepError, prepareImage, type PreparedImage } from '@/lib/imagePrep';
import { getSupabase } from '@/lib/supabase/client';

const MAX_TEXT = 4000;

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}


export interface AiAssistProps {
  open: boolean;
  /** 'text': erkin gap/ovoz; 'photo': kirim surati */
  variant: 'text' | 'photo';
  /** Savdo yoki kirim (matn rejimida) */
  kind: 'sale' | 'purchase';
  shopId: string;
  onClose: () => void;
  onResult: (r: AiResult, mode: AiMode) => void;
  /** Suratni tayyorlash (testda almashtiriladi); standart — brauzer canvas */
  prepare?: (file: File) => Promise<PreparedImage>;
}

export function AiAssist({ open, variant, kind, shopId, onClose, onResult, prepare = (f) => prepareImage(f) }: AiAssistProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const rec = useRef<InstanceType<SpeechCtor> | null>(null);

  useEffect(() => {
    // Brauzer qo'llab-quvvatlashi faqat klientda ma'lum (SSR bilan mos kelsin)
    void Promise.resolve().then(() => setCanSpeak(speechCtor() !== null));
    return () => rec.current?.stop();
  }, []);

  function toggleMic() {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = 'uz-UZ';
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i]![0]!.transcript);
      setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${parts.join(' ')}`.slice(0, MAX_TEXT));
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setError("Ovozni tanib bo'lmadi. Mikrofon ruxsatini tekshiring yoki yozib kiriting.");
    };
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  }

  async function submit() {
    if (busy) return;
    setError(null);
    const mode: AiMode = variant === 'photo' ? 'purchase_image' : kind === 'sale' ? 'sale_text' : 'purchase_text';
    try {
      let body: Parameters<typeof callAiParse>[1];
      if (variant === 'photo') {
        if (!file) return setError('Rasmni tanlang.');
        if (!file.type.startsWith('image/')) return setError('Faqat rasm fayli (JPG, PNG, WEBP yoki telefon surati).');
        setBusy(true);
        // Katta yoki HEIC surat brauzerda JPEG'ga siqiladi (server ≤ 4 MB JPG/PNG/WEBP qabul qiladi)
        let img;
        try {
          img = await prepare(file);
        } catch (e) {
          return setError(e instanceof ImagePrepError ? e.message : "Suratni tayyorlab bo'lmadi.");
        }
        body = { shop_id: shopId, mode, image: { mime: img.mime, base64: bytesToBase64(img.bytes) } };
      } else {
        const t = text.trim();
        if (!t) return setError("Matnni yozing yoki mikrofon bilan ayting.");
        setBusy(true);
        body = { shop_id: shopId, mode, text: t };
      }
      const r = await callAiParse(getSupabase(), body);
      if (r.lines.length === 0) {
        setError("AI qator topmadi. Matnni aniqroq yozing yoki ro'yxatni joylang.");
        return;
      }
      onResult(r, mode);
      setText('');
      setFile(null);
    } catch (e) {
      setError(e instanceof AiError ? e.message : "AI so'rovi bajarilmadi. Ro'yxatni joylab yoki qo'lda kiriting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="md"
      title={variant === 'photo' ? 'Rasmdan kirim' : kind === 'sale' ? 'AI bilan savdo yozish' : 'AI bilan kirim yozish'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Yopish
          </Button>
          <Button onClick={() => void submit()} loading={busy} icon={<Sparkles className="h-4 w-4" />} data-testid="ai-submit">
            Qatorlarga aylantirish
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          AI faqat matnni qatorlarga ajratadi: hisoblamaydi va hech narsa yozmaydi. Qatorlar savatga tushadi, har birini tekshirib «To&apos;g&apos;ri» deysiz, keyin odatdagidek tasdiqlaysiz.
        </p>
        {variant === 'photo' ? (
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted hover:bg-subtle">
            <Camera className="h-6 w-6" aria-hidden />
            {file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "Yuk xati, maklatnoy yoki ro'yxat suratini tanlang"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Rasm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        ) : (
          <>
            <Textarea
              label={kind === 'sale' ? 'Savdo (erkin gap)' : 'Kirim (erkin gap)'}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
              placeholder={kind === 'sale' ? "Masalan: Karim akaga o'nta chirmoq o'n uch mingdan, beshta yurak o'n besh ming" : "Masalan: Rahim akadan yigirmata momiq to'qqiz mingdan keldi"}
              rows={4}
            />
            {canSpeak && (
              <Button variant="outline" onClick={toggleMic} disabled={busy} icon={listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} aria-pressed={listening}>
                {listening ? "To'xtatish" : 'Gapirib aytish'}
              </Button>
            )}
          </>
        )}
        {error && <Alert tone="amber">{error}</Alert>}
      </div>
    </Modal>
  );
}
