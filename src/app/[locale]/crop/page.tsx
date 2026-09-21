import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import CropClient from "./CropClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "CropPage" });
  const title = t("title");

  return {
    title,
    description: t("hint"),
    alternates: {
      canonical: locale === "zh" ? "/crop" : `/${locale}/crop`,
      languages: {
        "zh-CN": "/crop",
        "en-US": "/en/crop",
        "x-default": "/crop",
      },
    },
  };
}

export default function CropPage() {
  return <CropClient />;
}
