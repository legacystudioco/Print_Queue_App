import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublishableKey, getSupabaseUrl } from './lib/supabase/env';

// '/login' is the page; '/api/auth/login' is the route handler the login
// form POSTs to — both must be reachable before a session exists, or
// nobody could ever sign in. '/api/notifications/dispatch' authenticates
// the bridge with its own shared-secret header (see that route), not a
// user session — it must be public here or the redirect would fire before
// the route handler ever sees the request.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/notifications/dispatch'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic && path !== '/') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  if (user && path === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets, PWA files (including the
     * service worker — it's registered from the root layout on every page,
     * including /login, so it must be fetchable with no session at all),
     * brand assets (public/logo/), the App Router's file-convention
     * favicon/apple-touch icon (app/icon.png, app/apple-icon.png — served
     * at the site root, not under an /icons/ prefix), and Next internals.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw\\.js|icons/|logo/|icon\\.png|apple-icon\\.png).*)',
  ],
};
