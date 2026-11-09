import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from './lib/env';

/** Sessiyasiz ochiladigan yagona sahifa */
const PUBLIC_PATHS = ['/login'];

/**
 * Kirish himoyasi (birinchi qatlam): sessiya yo'q → /login; sessiya bor, lekin admin emas → /forbidden.
 * Haqiqiy himoya ma'lumot qatlamida: har `admin_*` RPC `is_platform_admin()` ni o'zi tekshiradi.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (DEMO_MODE) {
    // Demo: sessiya doim "admin", Supabase'ga murojaat yo'q
    return NextResponse.next();
  }
  if (!supabaseConfigured) {
    return path === '/login' ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() tokenni Supabase Auth serverida tekshiradi (cookie'ga ko'r-ko'rona ishonilmaydi)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = '';
    const res = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  if (!user) return PUBLIC_PATHS.includes(path) ? response : redirect('/login');

  const { data: isAdmin, error } = await supabase.rpc('is_platform_admin');
  const allowed = !error && isAdmin === true;
  if (!allowed) return path === '/forbidden' ? response : redirect('/forbidden');
  if (path === '/login' || path === '/forbidden') return redirect('/overview');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
