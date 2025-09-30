import { getRequestConfig } from "next-intl/server";
import { hasLocale, IntlErrorCode } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,

    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        console.warn("Missing translation:", error.message);
      } else {
        console.error("Translation error:", error);
      }
    },

    getMessageFallback({ namespace, key, error }) {
      const path = [namespace, key].filter((part) => part != null).join(".");

      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        return process.env.NODE_ENV === "development"
          ? `[Missing: ${path}]`
          : "";
      } else {
        return process.env.NODE_ENV === "development" ? `[Error: ${path}]` : "";
      }
    },
  };
});
