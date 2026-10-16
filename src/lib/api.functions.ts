// Server functions: public reads, auth, checkout and admin mutations.

import { createServerFn } from "@tanstack/react-start";
import {
  createOrder,
  createPromotion,
  createUser,
  deleteBanner,
  deletePromotion,
  findPromotion,
  listAllBanners,
  listPromotions,
  setPromotionActive,
  upsertBanner,
  deleteProduct,
  findUserByEmail,
  getSettings,
  listBanners,
  listCategories,
  listOrders,
  listProducts,
  updateOrderStatus,
  updateSettings,
  upsertProduct,
} from "./db.server";
import { clearSession, ensureAdmin, hashPassword, readSession, requireAdmin, setSession, verifyPassword } from "./auth.server";
import type { Banner, Lang, Order, OrderItem, Product, PromoResult, Promotion, SessionUser, SiteSettings } from "./types";
import { envValue, githubStatus, putFile, textToBase64 } from "./github.server";

// Localize name/description fields for the requested language.
function localize<T extends { name_en: string; name_ar: string | null; name_fr: string | null; description_en?: string | null; description_ar?: string | null; description_fr?: string | null }>(
  item: T,
  lang: Lang,
): T {
  const pick = (en: string | null, ar: string | null | undefined, fr: string | null | undefined) =>
    (lang === "ar" ? ar : lang === "fr" ? fr : null) || en;
  return {
    ...item,
    name: pick(item.name_en, item.name_ar, item.name_fr) ?? item.name_en,
    ...(item.description_en !== undefined && {
      description: pick(item.description_en ?? null, item.description_ar, item.description_fr),
    }),
  };
}

export const getProductsFn = createServerFn({ method: "GET" })
  .inputValidator((lang?: Lang) => lang ?? "en")
  .handler(async ({ data: lang }) => {
    const products = await listProducts(true);
    const cats = await listCategories();
    return products.map((p) => {
      const loc = localize(p, lang);
      const cat = cats.find((c) => c.id === p.category_id);
      return { ...loc, categories: cat ? { slug: cat.slug, name: localize(cat, lang).name } : null };
    });
  });

export const getCategoriesFn = createServerFn({ method: "GET" })
  .inputValidator((lang?: Lang) => lang ?? "en")
  .handler(async ({ data: lang }) => (await listCategories()).map((c) => localize(c, lang)));

export const getBannersFn = createServerFn({ method: "GET" }).handler(() => listBanners());
export const getSettingsFn = createServerFn({ method: "GET" }).handler(() => getSettings());

// ---------- Auth ----------
export const getSessionFn = createServerFn({ method: "GET" }).handler(async (): Promise<SessionUser | null> => readSession());

export const signInFn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    await ensureAdmin();
    const user = await findUserByEmail(data.email);
    if (!user || !(await verifyPassword(data.password, user.password_hash))) {
      throw new Error("Invalid email or password");
    }
    const session: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role === "admin" ? "admin" : "customer" };
    await setSession(session);
    return session;
  });

export const signUpFn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; name?: string }) => d)
  .handler(async ({ data }) => {
    await ensureAdmin();
    const email = data.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (await findUserByEmail(email)) throw new Error("This email already has an account");
    const user = {
      id: crypto.randomUUID(),
      email,
      name: data.name?.trim() || null,
      password_hash: await hashPassword(data.password),
      role: "customer",
      created_at: new Date().toISOString(),
    };
    await createUser(user);
    const session: SessionUser = { id: user.id, email: user.email, name: user.name, role: "customer" };
    await setSession(session);
    return session;
  });

export const signOutFn = createServerFn({ method: "POST" }).handler(() => {
  clearSession();
  return { ok: true };
});

// ---------- Checkout ----------
export const placeOrderFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      customer_name: string;
      phone: string;
      governorate: string;
      district?: string;
      address?: string;
      notes?: string;
      fulfillment: "delivery" | "pickup";
      items: OrderItem[];
      subtotal_usd: number;
      discount_usd: number;
      delivery_usd: number;
      total_usd: number;
      promo_code?: string | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    const session = await readSession();
    const order: Order = {
      id: crypto.randomUUID(),
      user_id: session?.id ?? null,
      customer_name: data.customer_name,
      phone: data.phone,
      governorate: data.governorate,
      district: data.district || null,
      address: data.address || null,
      notes: data.notes || null,
      fulfillment: data.fulfillment,
      payment_method: data.fulfillment === "pickup" ? "pay_at_store" : "cod",
      items: data.items,
      subtotal_usd: data.subtotal_usd,
      discount_usd: data.discount_usd,
      delivery_usd: data.delivery_usd,
      total_usd: data.total_usd,
      promo_code: data.promo_code ?? null,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    await createOrder(order);
    return { id: order.id };
  });

// ---------- Admin ----------
export const adminListOrdersFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return listOrders();
});

export const adminSetOrderStatusFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; status: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await updateOrderStatus(data.id, data.status);
    return { ok: true };
  });

export const adminUpsertProductFn = createServerFn({ method: "POST" })
  .inputValidator((d: Product) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await upsertProduct(data);
    return { ok: true };
  });

export const adminDeleteProductFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await deleteProduct(data.id);
    return { ok: true };
  });

export const adminUpdateSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: SiteSettings) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await updateSettings(data);
    return { ok: true };
  });

// ---------- Banners ----------
export const adminListBannersFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return listAllBanners();
});
export const adminUpsertBannerFn = createServerFn({ method: "POST" })
  .inputValidator((d: Banner) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await upsertBanner({ ...data, id: data.id || crypto.randomUUID() });
    return { ok: true };
  });
export const adminDeleteBannerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await deleteBanner(data.id);
    return { ok: true };
  });

// ---------- Promotions ----------
export const adminListPromosFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return listPromotions();
});
export const adminCreatePromoFn = createServerFn({ method: "POST" })
  .inputValidator((d: Omit<Promotion, "id" | "created_at" | "is_active">) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await createPromotion({ ...data, code: data.code.trim().toUpperCase(), id: crypto.randomUUID(), is_active: true, created_at: new Date().toISOString() });
    return { ok: true };
  });
export const adminTogglePromoFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await setPromotionActive(data.id, data.is_active);
    return { ok: true };
  });
export const adminDeletePromoFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin();
    await deletePromotion(data.id);
    return { ok: true };
  });

export const validatePromoFn = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; subtotal: number }) => d)
  .handler(async ({ data }): Promise<PromoResult> => {
    const p = await findPromotion(data.code);
    const now = Date.now();
    if (!p || !p.is_active) return null;
    if (p.starts_at && Date.parse(p.starts_at) > now) return null;
    if (p.ends_at && Date.parse(p.ends_at) < now) return null;
    if (data.subtotal < p.min_order_usd) return null;
    const discount = p.discount_type === "PERCENTAGE" ? (data.subtotal * p.value) / 100 : p.value;
    return { code: p.code, discount_usd: Math.min(data.subtotal, Math.round(discount * 100) / 100) };
  });

// ---------- GitHub uploads & one-time publish ----------
export const publishStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return githubStatus();
});

export const uploadMediaFn = createServerFn({ method: "POST" })
  .inputValidator((d: { folder: string; name: string; base64: string }) => {
    if (!/^[a-z-]+$/.test(d.folder)) throw new Error("Invalid folder");
    if (d.base64.length > 34_000_000) throw new Error("File too large (max ~25 MB)");
    return d;
  })
  .handler(async ({ data }) => {
    await requireAdmin();
    const safe = data.name.replace(/[^\w.-]/g, "_").slice(-80);
    const path = `public/media/${data.folder}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
    const url = await putFile(path, data.base64, `Upload ${safe} from admin`);
    return { url };
  });

// "Done": writes one snapshot of the store to GitHub, then fires the deploy hook once.
export const publishFn = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const status = await githubStatus();
  let committed = false;
  if (status.github) {
    const snapshot = {
      exported_at: new Date().toISOString(),
      products: await listProducts(false),
      categories: await listCategories(),
      banners: await listAllBanners(),
      promotions: await listPromotions(),
      settings: await getSettings(),
    };
    await putFile("data/store-snapshot.json", textToBase64(JSON.stringify(snapshot, null, 2)), "Publish store from admin");
    committed = true;
  }
  const hook = await envValue("DEPLOY_HOOK_URL");
  let deployed = false;
  if (hook) {
    const res = await fetch(hook, { method: "POST" });
    if (!res.ok) throw new Error(`Deploy hook failed [${res.status}]: ${await res.text()}`);
    deployed = true;
  }
  return { committed, deployed };
});
