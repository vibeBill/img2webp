import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale, routing } from "./i18n/routing";

const GEO_LOCALE_MAP: Record<string, (typeof locales)[number]> = {
  CN: "zh",
  HK: "zh",
  TW: "zh",
};

const FALLBACK_LOCALE_FOR_GEO = "en";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const country = request.headers.get("cf-ipcountry")?.toUpperCase();
    if (country) {
      const { pathname } = request.nextUrl;
      const expectedLocale =
        (country && GEO_LOCALE_MAP[country]) || FALLBACK_LOCALE_FOR_GEO;

      const currentLocaleInPath = locales.find(
        (locale) =>
          pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
      );

      const currentLocale = currentLocaleInPath || defaultLocale;

      if (currentLocale !== expectedLocale) {
        let basePath = pathname;
        if (currentLocaleInPath) {
          basePath = pathname.replace(`/${currentLocaleInPath}`, "") || "/";
        }

        let newPath;
        if (expectedLocale === defaultLocale) {
          newPath = basePath;
        } else {
          newPath = `/${expectedLocale}${basePath === "/" ? "" : basePath}`;
        }

        console.log(
          `Redirecting: Geo=${country}, Path=${pathname} (${currentLocale}) -> ${newPath} (${expectedLocale})`
        );
        return NextResponse.redirect(new URL(newPath, request.url));
      }
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
