const IMAGE_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

export function imageMime(file: File): string | null {
  if (file.type.startsWith("image/")) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  return IMAGE_EXT_MIME[ext] ?? null;
}

// POST the raw bytes; the server saves them and returns the absolute path to inject.
export async function uploadImage(file: File, endpoint: string): Promise<string | null> {
  const mime = imageMime(file);

  if (!mime) return null;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": mime },
      body: file,
    });

    if (!res.ok) return null;
    const { path } = (await res.json()) as { path: string };

    return path ?? null;
  } catch {
    return null;
  }
}
