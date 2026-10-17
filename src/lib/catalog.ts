import Papa from "papaparse";
import { z } from "zod";
import type { Category, Product } from "./types";

export const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const photoSchema = z.string().refine((v) => !v || v.startsWith("/products/") || v.startsWith("/media/") || /^https:\/\//.test(v) || /^data:image\/(png|jpeg|webp);base64,/.test(v), "Use an HTTPS photo URL or embedded PNG, JPEG, or WebP");
export const categorySchema = z.object({
  id: z.string().min(1), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), name: z.string(), name_en: z.string().trim().min(1), name_ar: z.string(), name_fr: z.string(), description: z.string().nullable(), image_url: photoSchema.nullable(), sort_order: z.number().int(),
});
export const productSchema = z.object({
  id: z.string().min(1), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), name: z.string(), name_en: z.string().trim().min(1), name_ar: z.string(), name_fr: z.string(), description: z.string().nullable(), description_en: z.string().nullable(), description_ar: z.string().nullable(), description_fr: z.string().nullable(), price_usd: z.number().finite().nonnegative(), compare_at_usd: z.number().finite().nonnegative().nullable(), image_url: photoSchema.nullable(), gallery: z.array(photoSchema), model_url: z.string().nullable(), metal: z.enum(["18k_gold", "rose_gold", "white_gold", "platinum", "silver"]), gemstone: z.string().nullable(), stock: z.number().int().nonnegative(), is_active: z.boolean(), is_featured: z.boolean(), category_id: z.string().nullable(), created_at: z.string(),
});

export function parseImport(text: string): Record<string, unknown>[] {
  if (text.trim().startsWith("[")) {
    const rows: unknown = JSON.parse(text);
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) throw new Error("Import a JSON array of records.");
    return rows;
  }
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error(parsed.errors[0]?.message ?? "Invalid CSV");
  return parsed.data;
}
const str = (v: unknown) => v == null ? "" : String(v);
const bool = (v: unknown, fallback: boolean) => v == null || v === "" ? fallback : v === true || v === "true" || v === "1" || v === 1;
export function categoryFromRow(row: Record<string, unknown>, existing: Category[]): Category {
  const name = str(row["name_en"] ?? row["name"]);
  const slug = str(row["slug"]) || slugify(name);
  const old = existing.find((c) => c.slug === slug || c.id === row["id"]);
  return categorySchema.parse({ ...old, id: old?.id ?? (str(row["id"]) || crypto.randomUUID()), slug, name, name_en: name, name_ar: str(row["name_ar"] ?? old?.name_ar), name_fr: str(row["name_fr"] ?? old?.name_fr), description: str(row["description"] ?? old?.description) || null, image_url: str(row["image_url"] ?? row["photo"] ?? old?.image_url) || null, sort_order: Number(row["sort_order"] ?? old?.sort_order ?? existing.length) });
}
export function productFromRow(row: Record<string, unknown>, categories: Category[], existing: Product[]): Product {
  const name = str(row["name_en"] ?? row["name"]);
  const slug = str(row["slug"]) || slugify(name);
  const old = existing.find((p) => p.slug === slug || p.id === row["id"]);
  const category = str(row["category_id"] ?? row["category"] ?? old?.category_id);
  const cat = categories.find((c) => c.id === category || c.slug === category || c.name_en.toLowerCase() === category.toLowerCase());
  if (category && !cat) throw new Error(`Unknown category: ${category}`);
  const gallery = row["gallery"] == null ? old?.gallery ?? [] : Array.isArray(row["gallery"]) ? row["gallery"] : JSON.parse(str(row["gallery"]));
  return productSchema.parse({ ...old, id: old?.id ?? (str(row["id"]) || crypto.randomUUID()), slug, name, name_en: name, name_ar: str(row["name_ar"] ?? old?.name_ar), name_fr: str(row["name_fr"] ?? old?.name_fr), description: str(row["description_en"] ?? row["description"] ?? old?.description_en) || null, description_en: str(row["description_en"] ?? row["description"] ?? old?.description_en) || null, description_ar: old?.description_ar ?? null, description_fr: old?.description_fr ?? null, price_usd: Number(row["price_usd"] ?? row["price"] ?? old?.price_usd ?? 0), compare_at_usd: old?.compare_at_usd ?? null, image_url: str(row["image_url"] ?? row["photo"] ?? old?.image_url) || null, gallery, model_url: old?.model_url ?? null, metal: row["metal"] || old?.metal || "18k_gold", gemstone: str(row["gemstone"] ?? old?.gemstone) || null, stock: Number(row["stock"] ?? old?.stock ?? 0), is_active: bool(row["is_active"], old?.is_active ?? true), is_featured: bool(row["is_featured"], old?.is_featured ?? false), category_id: cat?.id ?? null, created_at: old?.created_at ?? new Date().toISOString() });
}

export function matchesPrice(price: number, max: number | null) { return max === null || price <= max; }
export function cleanBusinessPhone(value: string) { return /^(?:961)?03/.test(value.replace(/\D/g, "")) ? "" : value; }