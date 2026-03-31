/**
 * Image Generator Extension
 *
 * Generates social media images using Google Gemini Imagen API.
 * Uses gemini-2.0-flash-preview-image-generation for cheap, fast images.
 * ~4-8 cents per image.
 *
 * Workflow:
 * 1. Takes a post text and generates a matching visual
 * 2. Saves the image locally
 * 3. Returns the path for Blotato upload
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const IMAGES_DIR = "generated-images";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent";

export interface ImageResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

const BRAND_STYLE = `Dark cosmic gradient background from deep indigo (#1a0a3e) to black (#090b13).
Subtle constellation line patterns connecting small glowing dots.
Soft pink (#e94560) and purple (#7681ff) ambient light.
Modern minimalist style, luxury aesthetic.
No text, no words, no letters, no watermarks.`;

/**
 * Generate a social media image based on post content.
 */
export async function generateImage(
  postText: string,
  options?: {
    style?: "post" | "story" | "carousel";
    signContext?: string; // e.g. "scorpio", "venus"
  },
): Promise<ImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY not set" };
  }

  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const aspectRatio = options?.style === "story" ? "9:16 vertical" : "1:1 square";
  const signColor = getSignColor(options?.signContext);

  const prompt = buildImagePrompt(postText, aspectRatio, signColor);

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageSizes: options?.style === "story" ? "1080x1920" : "1080x1080",
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Gemini API ${response.status}: ${errorText.slice(0, 200)}` };
    }

    const data = await response.json();

    // Extract image from response
    const imagePart = data.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"),
    );

    if (!imagePart?.inlineData?.data) {
      return { success: false, error: "No image in Gemini response" };
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const ext = imagePart.inlineData.mimeType === "image/png" ? "png" : "jpg";
    const fileName = `post-${Date.now()}.${ext}`;
    const filePath = join(IMAGES_DIR, fileName);

    writeFileSync(filePath, imageBuffer);

    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

function buildImagePrompt(postText: string, aspectRatio: string, signColor: string): string {
  // Extract key themes from post text
  const themes = extractThemes(postText);

  return `Create a ${aspectRatio} social media graphic for a dating app called AstroDating.

Theme from the post: "${postText}"

Visual elements to include:
${themes.map((t) => `- ${t}`).join("\n")}

Style requirements:
${BRAND_STYLE}
${signColor ? `Accent color: ${signColor}` : ""}

Important:
- NO text, words, or letters anywhere in the image
- NO watermarks or logos
- Clean, premium, editorial quality
- The image should evoke the feeling of the post without being literal`;
}

function extractThemes(text: string): string[] {
  const themes: string[] = [];
  const lower = text.toLowerCase();

  // Zodiac signs
  const signs = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
  for (const sign of signs) {
    if (lower.includes(sign)) {
      themes.push(`${sign} zodiac symbol glyph, subtle and elegant`);
    }
  }

  // Planets
  if (lower.includes("moon")) themes.push("crescent moon glowing softly");
  if (lower.includes("venus")) themes.push("Venus planet symbol with romantic glow");
  if (lower.includes("mars")) themes.push("Mars planet symbol with warm energy");
  if (lower.includes("mercury")) themes.push("Mercury symbol with communication vibes");
  if (lower.includes("sun")) themes.push("sun rays with warm golden light");

  // Concepts
  if (lower.includes("compatibility") || lower.includes("match")) themes.push("two celestial bodies orbiting each other");
  if (lower.includes("love") || lower.includes("heart")) themes.push("subtle heart shape formed by stars or light");
  if (lower.includes("chemistry") || lower.includes("attraction")) themes.push("magnetic pull between two glowing orbs");
  if (lower.includes("tarot")) themes.push("mystical tarot card silhouette");

  // Default if no specific themes found
  if (themes.length === 0) {
    themes.push("constellation pattern connecting stars");
    themes.push("cosmic nebula wisps in pink and purple");
  }

  return themes;
}

function getSignColor(sign?: string): string {
  if (!sign) return "";

  const colors: Record<string, string> = {
    aries: "fiery orange-gold (#FF8C42)",
    taurus: "earthy emerald green (#4A7C59)",
    gemini: "electric sky blue (#64B5F6)",
    cancer: "silver moonlight (#C0C0C0)",
    leo: "royal gold (#FFD700)",
    virgo: "sage green (#8BC34A)",
    libra: "rose pink (#FF6B8A)",
    scorpio: "deep crimson (#8B0000)",
    sagittarius: "warm amber (#FF9800)",
    capricorn: "dark forest green (#2E7D32)",
    aquarius: "electric blue (#00BCD4)",
    pisces: "ocean lavender (#7E57C2)",
  };

  return colors[sign.toLowerCase()] || "";
}

/**
 * Generate multiple image variations for A/B testing.
 */
export async function generateVariations(
  postText: string,
  count: number = 3,
): Promise<ImageResult[]> {
  const results: ImageResult[] = [];

  for (let i = 0; i < count; i++) {
    const result = await generateImage(postText, {
      style: i === 0 ? "post" : "story",
    });
    results.push(result);

    // Small delay between API calls
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}
