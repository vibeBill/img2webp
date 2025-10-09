import { defineRouting } from "next-intl/routing";

export const locales = ["zh", "en"] as const;
export const defaultLocale = "zh";

export const routing = defineRouting({
  locales: locales,
  defaultLocale: defaultLocale,
  localePrefix: "as-needed",
  localeDetection: false,
});
