import { uploadMediaFn } from "./api.functions";

export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") throw new Error("Please upload a still PNG, JPEG, or WebP photo.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image conversion is unavailable in this browser.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image conversion failed")), "image/webp", 0.94));
    if (blob.type !== "image/webp") throw new Error("This browser cannot export WebP photos.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } finally { bitmap.close(); }
}

export async function uploadMedia(file: File, folder: string) {
  const prepared = await prepareImage(file);
  const bytes = new Uint8Array(await prepared.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return (await uploadMediaFn({ data: { folder, name: prepared.name, base64: btoa(bin) } })).url;
}

export async function importPhoto(value: string, folder: string) {
  if (!value.startsWith("data:image/")) return value;
  const res = await fetch(value);
  const blob = await res.blob();
  return uploadMedia(new File([blob], "import-photo", { type: blob.type }), folder);
}