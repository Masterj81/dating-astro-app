/**
 * Image Generator Extension
 *
 * Generates social media images using Pollinations.ai (free, no API key).
 * Simply constructs a URL with the prompt and downloads the result.
 *
 * Workflow:
 * 1. Takes a post text and generates a matching visual prompt
 * 2. Downloads the image from Pollinations
 * 3. Saves locally for Blotato upload
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const IMAGES_DIR = "generated-images";

export interface ImageResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

const BRAND_STYLE = `dark cosmic gradient background from deep indigo to black, subtle constellation line patterns connecting small glowing dots, soft pink and purple ambient light, modern minimalist style, luxury aesthetic, no text no words no letters no watermark`;

/**
 * Generate a social media image based on post content.
 */
export async function generateImage(
  postText: string,
  options?: {
    style?: "post" | "story";
    signContext?: string;
  },
): Promise<ImageResult> {
  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const width = options?.style === "story" ? 1080 : 1080;
  const height = options?.style === "story" ? 1920 : 1080;
  const signColor = getSignColor(options?.signContext);
  const themes = extractThemes(postText);

  const prompt = [
    themes.join(", "),
    signColor ? `accent color ${signColor}` : "",
    BRAND_STYLE,
  ].filter(Boolean).join(", ");

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;

  try {
    console.log(`   🌐 Downloading from Pollinations...`);

    const response = await fetch(url);

    if (!response.ok) {
      return { success: false, error: `Pollinations ${response.status}: ${response.statusText}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length < 1000) {
      return { success: false, error: "Image too small, generation may have failed" };
    }

    const fileName = `post-${Date.now()}.png`;
    const filePath = join(IMAGES_DIR, fileName);
    writeFileSync(filePath, buffer);

    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

function extractThemes(text: string): string[] {
  const themes: string[] = [];
  const lower = text.toLowerCase();

  const signs = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
  for (const sign of signs) {
    if (lower.includes(sign)) {
      themes.push(`${sign} zodiac symbol glyph glowing elegantly`);
    }
  }

  if (lower.includes("moon")) themes.push("crescent moon glowing softly");
  if (lower.includes("venus")) themes.push("Venus planet symbol with romantic glow");
  if (lower.includes("mars")) themes.push("Mars planet symbol with warm energy");
  if (lower.includes("mercury")) themes.push("Mercury symbol");
  if (lower.includes("sun")) themes.push("sun rays with warm golden light");
  if (lower.includes("compatibility") || lower.includes("match")) themes.push("two celestial bodies orbiting each other");
  if (lower.includes("love") || lower.includes("heart")) themes.push("subtle heart shape formed by stars");
  if (lower.includes("chemistry") || lower.includes("attraction")) themes.push("magnetic pull between two glowing orbs");
  if (lower.includes("tarot")) themes.push("mystical tarot card silhouette");

  if (themes.length === 0) {
    themes.push("constellation pattern connecting stars", "cosmic nebula wisps in pink and purple");
  }

  return themes;
}

function getSignColor(sign?: string): string {
  if (!sign) return "";
  const colors: Record<string, string> = {
    aries: "fiery orange-gold", taurus: "earthy emerald green", gemini: "electric sky blue",
    cancer: "silver moonlight", leo: "royal gold", virgo: "sage green",
    libra: "rose pink", scorpio: "deep crimson", sagittarius: "warm amber",
    capricorn: "dark forest green", aquarius: "electric blue", pisces: "ocean lavender",
  };
  return colors[sign.toLowerCase()] || "";
}

/**
 * Generate multiple variations.
 */
export async function generateVariations(
  postText: string,
  count: number = 2,
): Promise<ImageResult[]> {
  const results: ImageResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await generateImage(postText, { style: i === 0 ? "post" : "story" });
    results.push(result);
    if (i < count - 1) await new Promise((r) => setTimeout(r, 2000));
  }
  return results;
}
