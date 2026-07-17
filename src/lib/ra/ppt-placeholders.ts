/** Image-slot placeholder naming used in PPT templates */
const IMAGE_KEY_RE =
  /^(img_|image_|photo_|pic_|图|cover|hero|logo|portrait|avatar)/i;

export function isImagePlaceholder(key: string): boolean {
  if (!key) return false;
  if (key.startsWith("__img_")) return true;
  if (IMAGE_KEY_RE.test(key)) return true;
  if (/Image$/i.test(key)) return true;
  return false;
}

export function splitPlaceholders(keys: string[]): {
  textKeys: string[];
  imageKeys: string[];
} {
  const textKeys: string[] = [];
  const imageKeys: string[] = [];
  for (const key of keys) {
    if (isImagePlaceholder(key)) imageKeys.push(key);
    else textKeys.push(key);
  }
  return { textKeys, imageKeys };
}

/** Asset refs: ach:{id} | lib:{id} */
export function assetRefToUrl(ref: string): string {
  if (!ref) return "";
  if (ref.startsWith("ach:")) return `/api/ra-achievements/${ref.slice(4)}/file`;
  if (ref.startsWith("lib:")) return `/api/ra-image-library/${ref.slice(4)}/file`;
  if (ref.startsWith("/api/")) return ref;
  return ref;
}

export function makeAssetRef(kind: "achievement" | "library", id: string): string {
  return kind === "achievement" ? `ach:${id}` : `lib:${id}`;
}
