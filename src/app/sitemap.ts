import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://convert.bearbug.dpdns.org/",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
      alternates: {
        languages: {
          "zh-CN": "https://convert.bearbug.dpdns.org",
          "en-US": "https://convert.bearbug.dpdns.org/us",
          "x-default": "https://convert.bearbug.dpdns.org",
        },
      },
    },
  ];
}
