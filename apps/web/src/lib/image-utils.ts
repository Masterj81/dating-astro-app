const FALLBACK_IMAGE_SRC = "/icon-512.png";

export function resolveImageSrc(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") {
      continue;
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
      return trimmed;
    }
  }

  return FALLBACK_IMAGE_SRC;
}

export function shouldBypassImageOptimization(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}
