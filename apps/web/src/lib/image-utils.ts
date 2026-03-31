const FALLBACK_IMAGE_SRC = "/icon-512.png";

const ALLOWED_IMAGE_DOMAINS = [
  "qtihezzbuubnyvrjdkjd.supabase.co",
  "lh3.googleusercontent.com",
  "randomuser.me",
  "images.unsplash.com",
];

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_IMAGE_DOMAINS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveImageSrc(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") {
      continue;
    }

    if (trimmed.startsWith("/")) {
      return trimmed;
    }

    if ((trimmed.startsWith("http://") || trimmed.startsWith("https://")) && isAllowedImageUrl(trimmed)) {
      return trimmed;
    }
  }

  return FALLBACK_IMAGE_SRC;
}

export function shouldBypassImageOptimization(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}
