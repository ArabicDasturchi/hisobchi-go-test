import { ImageResponse } from 'next/og';

export const alt = "Hisobchi Go: qarz, foyda va ombor o'zi hisoblanadi";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: 'linear-gradient(135deg,#065f46,#1d4ed8)',
          color: '#fff',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.9 }}>Hisobchi Go</div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.1, marginTop: 24 }}>Qarz, foyda va ombor o&apos;zi hisoblanadi</div>
        <div style={{ fontSize: 34, marginTop: 28, opacity: 0.85 }}>Daftaringizni telefonga ko&apos;chiring</div>
      </div>
    ),
    size,
  );
}
