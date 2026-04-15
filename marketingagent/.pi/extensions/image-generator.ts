/**
 * Image Generator Extension
 *
 * Generates social media images using Google Gemini API (primary)
 * with Pollinations.ai as fallback (free, no API key).
 *
 * Workflow:
 * 1. Takes a post text and generates a matching visual prompt
 * 2. If a Gemini key is set, uses Gemini image generation
 * 3. Otherwise, falls back to Pollinations.ai URL-based generation
 * 4. Saves locally for Blotato upload
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const IMAGES_DIR = "generated-images";

export interface ImageResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

const BRAND_STYLE = "dark cosmic gradient background from deep indigo to black, subtle constellation line patterns connecting small glowing dots, soft pink and purple ambient light, modern minimalist style, luxury aesthetic, no text no words no letters no watermark";

export type PostType = "short" | "viral";

const TYPE_DIRECTIVES: Record<PostType, string> = {
  short:
    "Single bold focal subject, high contrast, scroll-stopping, punchy color pop, like a Twitter/X attention grabber.",
  viral:
    "Editorial cinematic composition, deeper storytelling visual, soft depth-of-field, premium magazine-cover feel, suitable for a long-form Facebook post.",
};

// Auto-detect zodiac sign from post text
export function detectSignFromText(text: string): string | undefined {
  const signs = [
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
  ];
  const lower = text.toLowerCase();
  // First explicit match wins
  for (const sign of signs) {
    const pattern = new RegExp(`\\b${sign}\\b`, "i");
    if (pattern.test(lower)) return sign;
  }
  // Planet-based hints map to sign rulers
  if (/\bvenus\b/i.test(lower)) return "libra";
  if (/\bmars\b/i.test(lower)) return "aries";
  if (/\bmercury\b/i.test(lower)) return "gemini";
  if (/\bsaturn\b/i.test(lower)) return "capricorn";
  if (/\bmoon\b/i.test(lower)) return "cancer";
  if (/\bsun\b/i.test(lower)) return "leo";
  return undefined;
}

async function buildImagePrompt(
  postText: string,
  signContext?: string,
  postType: PostType = "short",
  variantIndex = 0,
): Promise<string> {
  const detectedSign = signContext || detectSignFromText(postText);
  const signColor = getSignColor(detectedSign);
  const fallbackThemes = extractThemes(postText);
  const fallbackPrompt = [
    fallbackThemes.join(", "),
    signColor ? `accent color ${signColor}` : "",
    TYPE_DIRECTIVES[postType],
    BRAND_STYLE,
  ].filter(Boolean).join(", ");

  const geminiApiKey = resolveGeminiApiKey();
  if (!geminiApiKey) {
    return fallbackPrompt;
  }

  // Variant directives let us request distinct compositions per call
  const variantDirectives = [
    "Composition: centered hero subject, symmetrical, frontal angle.",
    "Composition: dynamic off-center subject, diagonal motion lines, dramatic angle.",
    "Composition: macro close-up, shallow depth of field, abstract feel.",
  ];
  const variantHint = variantDirectives[variantIndex % variantDirectives.length];

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        "Turn this social media post into one concise image-generation prompt.",
        "Goal: create a striking astrology-themed social visual for a dating brand.",
        "Requirements:",
        "- describe only visuals, no copywriting analysis",
        "- no text, letters, logos, UI, or watermark in the image",
        "- keep it under 90 words",
        "- modern, elegant, cinematic, social-media friendly",
        `- format intent: ${TYPE_DIRECTIVES[postType]}`,
        `- ${variantHint}`,
        signColor ? `- use this accent color direction: ${signColor}` : "",
        detectedSign ? `- subtly incorporate the energy of the ${detectedSign} sign` : "",
        `Post: ${postText}`,
        `Brand style: ${BRAND_STYLE}`,
        "Return only the prompt.",
      ].filter(Boolean).join("\n"),
    });

    const prompt = response.text?.trim().replace(/^["']|["']$/g, "") || "";

    return prompt || fallbackPrompt;
  } catch (err) {
    console.log(`   Prompt writer fallback: ${(err as Error).message}`);
    return fallbackPrompt;
  }
}

function resolveGeminiApiKey(): string | undefined {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const googleKey = process.env.GOOGLE_API_KEY?.trim();

  if (geminiKey) {
    if (googleKey) {
      console.log("   Gemini: both GOOGLE_API_KEY and GEMINI_API_KEY are set; preferring GEMINI_API_KEY.");
      process.env.GOOGLE_API_KEY = "";
    }
    return geminiKey;
  }

  return googleKey || undefined;
}

function formatGeminiError(err: unknown): string {
  const fallback = err instanceof Error ? err.message : String(err);

  try {
    const parsed = JSON.parse(fallback) as {
      error?: { code?: number; status?: string; message?: string };
    };
    if (parsed.error?.message) {
      const code = parsed.error.code ? `HTTP ${parsed.error.code}` : "Gemini";
      const status = parsed.error.status ? ` (${parsed.error.status})` : "";
      return `${code}${status}: ${parsed.error.message}`;
    }
  } catch {
    // Keep the original string if it is not JSON.
  }

  return fallback;
}

function isQuotaError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("resource_exhausted")
    || lower.includes("quota exceeded")
    || lower.includes("http 429")
    || lower.includes("\"code\":429");
}

async function generateWithGemini(
  prompt: string,
  width: number,
  height: number,
): Promise<ImageResult> {
  const { GoogleGenAI } = await import("@google/genai");
  const apiKey = resolveGeminiApiKey();

  if (!apiKey) {
    return { success: false, error: "Neither GEMINI_API_KEY nor GOOGLE_API_KEY is set" };
  }

  const ai = new GoogleGenAI({ apiKey });
  const aspectRatio = width === height ? "1:1" : "9:16";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: `Generate an image: ${prompt}`,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio },
    },
  });

  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    return { success: false, error: "Gemini returned no candidates" };
  }

  const parts = candidates[0].content?.parts;
  if (!parts) {
    return { success: false, error: "Gemini returned no content parts" };
  }

  for (const part of parts) {
    if (part.inlineData?.data) {
      const imageBuffer = Buffer.from(part.inlineData.data, "base64");

      if (imageBuffer.length < 1000) {
        return { success: false, error: "Gemini image too small, generation may have failed" };
      }

      const fileName = `post-${Date.now()}.png`;
      const filePath = join(IMAGES_DIR, fileName);
      writeFileSync(filePath, imageBuffer);

      return { success: true, filePath };
    }
  }

  return { success: false, error: "Gemini response contained no image data" };
}

async function generateWithPollinations(
  prompt: string,
  width: number,
  height: number,
): Promise<ImageResult> {
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;

  console.log("   Downloading from Pollinations (fallback)...");

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
}

export async function generateImage(
  postText: string,
  options?: {
    style?: "post" | "story";
    signContext?: string;
    postType?: PostType;
    variantIndex?: number;
  },
): Promise<ImageResult> {
  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const width = 1080;
  const height = options?.style === "story" ? 1920 : 1080;
  const prompt = await buildImagePrompt(
    postText,
    options?.signContext,
    options?.postType ?? "short",
    options?.variantIndex ?? 0,
  );

  const hasGeminiKey = !!resolveGeminiApiKey();

  try {
    if (hasGeminiKey) {
      console.log("   Generating with Gemini...");
      return await generateWithGemini(prompt, width, height);
    }

    console.log("   No Gemini API key found, using Pollinations fallback");
    return await generateWithPollinations(prompt, width, height);
  } catch (err) {
    if (hasGeminiKey) {
      const message = formatGeminiError(err);
      const label = isQuotaError(message) ? "Gemini quota hit" : "Gemini failed";
      console.log(`   ${label}: ${message}`);
      console.log("   Falling back to Pollinations...");
      try {
        return await generateWithPollinations(prompt, width, height);
      } catch (fallbackErr) {
        return {
          success: false,
          error: `Both Gemini and Pollinations failed. Gemini: ${message}, Pollinations: ${(fallbackErr as Error).message}`,
        };
      }
    }

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
    aries: "fiery orange-gold",
    taurus: "earthy emerald green",
    gemini: "electric sky blue",
    cancer: "silver moonlight",
    leo: "royal gold",
    virgo: "sage green",
    libra: "rose pink",
    scorpio: "deep crimson",
    sagittarius: "warm amber",
    capricorn: "dark forest green",
    aquarius: "electric blue",
    pisces: "ocean lavender",
  };
  return colors[sign.toLowerCase()] || "";
}

export async function generateVariations(
  postText: string,
  count: number = 2,
): Promise<ImageResult[]> {
  const results: ImageResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await generateImage(postText, { style: i === 0 ? "post" : "story" });
    results.push(result);
    if (i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return results;
}

// Generate N variants of the same post (different compositions) and pick the best
// via Gemini Vision scoring. Failed/non-best variants are deleted.
export async function generateBestVariant(
  postText: string,
  options?: {
    count?: number;
    postType?: PostType;
    signContext?: string;
    style?: "post" | "story";
  },
): Promise<ImageResult & { allCandidates?: string[]; selectedIndex?: number; scores?: number[] }> {
  const count = Math.max(1, Math.min(options?.count ?? 3, 4));
  const postType = options?.postType ?? "short";
  const signContext = options?.signContext;

  const candidates: ImageResult[] = [];
  for (let i = 0; i < count; i++) {
    console.log(`   🎨 Generating variant ${i + 1}/${count}...`);
    const result = await generateImage(postText, {
      style: options?.style ?? "post",
      postType,
      signContext,
      variantIndex: i,
    });
    candidates.push(result);
    if (i < count - 1) await new Promise((r) => setTimeout(r, 1500));
  }

  const successful = candidates.filter((c) => c.success && c.filePath);
  if (successful.length === 0) {
    return { success: false, error: "All variants failed" };
  }
  if (successful.length === 1) {
    return { ...successful[0], allCandidates: [successful[0].filePath!], selectedIndex: 0 };
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    // No Gemini Vision available — pick first successful variant
    const allFiles = successful.map((c) => c.filePath!);
    return { ...successful[0], allCandidates: allFiles, selectedIndex: 0 };
  }

  // Score each variant with Gemini Vision
  console.log(`   🔍 Scoring ${successful.length} variants with Gemini Vision...`);
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  const { readFileSync } = await import("fs");

  const scores: number[] = [];
  for (let i = 0; i < successful.length; i++) {
    const variant = successful[i];
    try {
      const imageBuffer = readFileSync(variant.filePath!);
      const base64 = imageBuffer.toString("base64");

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: base64,
                },
              },
              {
                text: [
                  "Rate this image as a social media visual for an astrology dating brand on a 0-100 scale.",
                  "Criteria:",
                  "- Visual impact / scroll-stopping power (40 pts)",
                  "- Brand fit (cosmic, elegant, premium, romantic) (30 pts)",
                  "- Composition quality / professional look (20 pts)",
                  "- Absence of unwanted text/letters/watermarks (10 pts)",
                  postType === "viral"
                    ? "Bonus: editorial cinematic feel for long-form Facebook"
                    : "Bonus: bold focal subject for short-form scroll",
                  "",
                  "Return ONLY a single integer from 0 to 100. No text, no explanation.",
                ].join("\n"),
              },
            ],
          },
        ],
      });

      const raw = response.text?.trim() || "0";
      const score = parseInt(raw.match(/\d+/)?.[0] || "0", 10);
      scores.push(Math.min(Math.max(score, 0), 100));
      console.log(`     Variant ${i + 1}: ${score}/100`);
    } catch (err) {
      console.log(`     Variant ${i + 1}: scoring failed (${(err as Error).message.slice(0, 60)})`);
      scores.push(0);
    }
  }

  const bestIdx = scores.indexOf(Math.max(...scores));
  const best = successful[bestIdx];
  const allFiles = successful.map((c) => c.filePath!);

  console.log(`   🏆 Selected variant ${bestIdx + 1} (score ${scores[bestIdx]}/100)`);

  // Delete losing variants to keep disk clean
  try {
    const { unlinkSync } = await import("fs");
    for (let i = 0; i < successful.length; i++) {
      if (i !== bestIdx && successful[i].filePath) {
        try { unlinkSync(successful[i].filePath!); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  return {
    ...best,
    allCandidates: allFiles,
    selectedIndex: bestIdx,
    scores,
  };
}
