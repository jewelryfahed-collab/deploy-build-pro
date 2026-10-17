import { describe, expect, it } from "vitest";
import { categoryFromRow, cleanBusinessPhone, matchesPrice, parseImport, productFromRow } from "@/lib/catalog";

describe("catalog rules", () => {
  it("shows every price by default, including products above $5,000", () => {
    expect(matchesPrice(8000, null)).toBe(true);
    expect(matchesPrice(8000, 5000)).toBe(false);
  });
  it("removes the 03 business number but retains the other number", () => {
    expect(cleanBusinessPhone("+961 03 859 562")).toBe("");
    expect(cleanBusinessPhone("03 859 562")).toBe("");
    expect(cleanBusinessPhone("+961 78 859 562")).toBe("+961 78 859 562");
  });
  it("imports categories with embedded photos", () => {
    const c = categoryFromRow({ name: "Pearls", photo: "data:image/webp;base64,AAAA" }, []);
    expect(c.slug).toBe("pearls");
    expect(c.image_url).toBe("data:image/webp;base64,AAAA");
  });
  it("assigns imported products to a preferred category by slug", () => {
    const c = categoryFromRow({ name: "Pearls", id: "pearls-id" }, []);
    const p = productFromRow({ name: "Pearl necklace", category: "pearls", price: 180, image_url: "https://example.com/photo.webp" }, [c], []);
    expect(p.category_id).toBe("pearls-id");
    expect(p.price_usd).toBe(180);
    expect(p.image_url).toBe("https://example.com/photo.webp");
  });
  it("updates existing records rather than duplicating imports", () => {
    const c = categoryFromRow({ name: "Pearls", id: "pearls-id" }, []);
    const updated = categoryFromRow({ name: "Pearl collection", slug: "pearls" }, [c]);
    expect(updated.id).toBe("pearls-id");
    expect(updated.name_en).toBe("Pearl collection");
  });
  it("rejects an unknown product category", () => {
    expect(() => productFromRow({ name: "Ring", category: "unknown" }, [], [])).toThrow("Unknown category");
  });
  it("accepts CSV with commas inside descriptions", () => {
    const rows = parseImport('name,description,image_url\nRing,"Gold, pearl",https://example.com/ring.webp');
    expect(rows[0]?.["description"]).toBe("Gold, pearl");
  });
});