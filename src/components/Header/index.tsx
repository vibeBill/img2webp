"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import styles from "./style.module.css";

interface NavItem {
  href: string;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "convert" },
  { href: "/crop", labelKey: "crop" },
];

export default function Header() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();

  // Strip the locale segment so "/en/crop" and "/crop" compare identically.
  const pathWithoutLocale = pathname.replace(/^\/(zh|en)(?=\/|$)/, "") || "/";

  const localeHref = (nextLocale: string) => {
    const suffix = pathWithoutLocale === "/" ? "" : pathWithoutLocale;
    return nextLocale === "zh" ? suffix || "/" : `/${nextLocale}${suffix}`;
  };

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathWithoutLocale === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${
                isActive ? styles.navLinkActive : ""
              }`}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className={styles.localeSwitch}>
        <Link
          href={localeHref("zh")}
          className={`${styles.localeLink} ${
            locale === "zh" ? styles.localeLinkActive : ""
          }`}
        >
          中文
        </Link>
        <span className={styles.localeDivider}>/</span>
        <Link
          href={localeHref("en")}
          className={`${styles.localeLink} ${
            locale === "en" ? styles.localeLinkActive : ""
          }`}
        >
          EN
        </Link>
      </div>
    </header>
  );
}
