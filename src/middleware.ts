import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const nextIntlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const country = request.headers.get("CF-IPCountry");
  const targetLocale = country === "CN" ? "zh" : "en";

  const { pathname } = request.nextUrl;
  const defaultLocale = routing.defaultLocale; // "zh"

  // Determine the current locale from the URL if present
  let currentLocaleInPath: string | undefined;
  for (const locale of routing.locales) {
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      currentLocaleInPath = locale;
      break;
    }
  }

  // If the target locale is the default and it's currently in the path, redirect to remove it
  if (targetLocale === defaultLocale && currentLocaleInPath === defaultLocale) {
    const newPathname = pathname.replace(`/${defaultLocale}`, "");
    const url = request.nextUrl.clone();
    url.pathname = newPathname === "" ? "/" : newPathname;
    return NextResponse.redirect(url);
  }

  // If the target locale is not the default and it's not in the path, redirect to add it
  if (targetLocale !== defaultLocale && currentLocaleInPath !== targetLocale) {
    const url = request.nextUrl.clone();
    url.pathname = `/${targetLocale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  // If no redirect is needed, or after redirect, pass to next-intl middleware
  // This is where next-intl will pick up the locale from the URL
  return nextIntlMiddleware(request);
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
