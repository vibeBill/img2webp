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
          "zh-cn": "https://convert.bearbug.dpdns.org",
          "en-us": "https://convert.bearbug.dpdns.org/us",
          "x-default": "https://convert.bearbug.dpdns.org",
        },
      },
    },
  ];
}
