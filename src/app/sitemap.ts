import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://convert.bearbug.dpdns.org/",
      lastModified: new Date(),
      alternates: {
        languages: {
          en: "https://convert.bearbug.dpdns.org/",
          zh: "https://convert.bearbug.dpdns.org/zh/",
        },
      },
    },
  ];
}
