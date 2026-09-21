import type { MetadataRoute } from "next";

const BASE_URL = "https://convert.bearbug.dpdns.org";

const languageAlternates = (path: string) => ({
  languages: {
    "zh-CN": `${BASE_URL}${path}`,
    "en-US": `${BASE_URL}/en${path}`,
    "x-default": `${BASE_URL}${path}`,
  },
});

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${BASE_URL}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
      alternates: languageAlternates(""),
    },
    {
      url: `${BASE_URL}/crop`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: languageAlternates("/crop"),
    },
  ];
}
