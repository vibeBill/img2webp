// src/app/api/convert-to-webp/route.ts
import { NextResponse } from "next/server";
import sharp from "sharp";

// 配置 Edge Runtime
export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const quality = parseInt(formData.get("quality") as string, 10) || 90;

    if (!file || !file.type.startsWith("image/")) {
      return NextResponse.json(
        { message: "Invalid file type. Only images are allowed." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const outputBuffer = await sharp(buffer).webp({ quality }).toBuffer();

    return new NextResponse(outputBuffer, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": `attachment; filename="converted.webp"`,
      },
    });
  } catch (error) {
    console.error("Error converting image:", error);
    return NextResponse.json(
      { message: "Error converting image to WebP" },
      { status: 500 }
    );
  }
}
