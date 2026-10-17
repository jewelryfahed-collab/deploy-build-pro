import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminDeleteCategoryFn, adminUpsertCategoryFn } from "@/lib/api.functions";
import { categorySchema, slugify } from "@/lib/catalog";
import { uploadMedia } from "@/lib/media";
import { categoriesQuery, categoryImage, type Category } from "@/lib/store";
import { CatalogImport } from "./CatalogImport";

export function CategoriesAdmin({ onSaved }: { onSaved: () => void }) {
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery(categoriesQuery());
  const [edit, setEdit] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!edit) return;
    setBusy(true);
    try { await adminUpsertCategoryFn({ data: categorySchema.parse({ ...edit, name: edit.name_en }) }); onSaved(); await qc.invalidateQueries(); setEdit(null); toast.success("Category saved"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Unable to save"); }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!confirm("Delete this category?")) return;
    try { await adminDeleteCategoryFn({ data: { id } }); onSaved(); await qc.invalidateQueries(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Unable to delete"); }
  }
  return <>
    <div className="mb-6 flex flex-wrap items-center gap-3"><p className="mr-auto text-muted-foreground">{categories.length} categories</p><CatalogImport kind="categories" categories={categories} onSaved={onSaved} /><Button variant="luxe" onClick={() => setEdit({ id: crypto.randomUUID(), name: "", name_en: "", name_ar: "", name_fr: "", slug: "", description: "", image_url: null, sort_order: categories.length + 1 })}><Plus /> New category</Button></div>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{categories.map((c) => <div key={c.id} className="overflow-hidden rounded-lg border"><img src={c.image_url || categoryImage(c.slug)} alt={c.name} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" /><div className="flex items-center gap-2 p-4"><div className="min-w-0 flex-1"><p className="font-display text-xl">{c.name}</p><p className="text-xs text-muted-foreground">{c.slug}</p></div><Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEdit(c)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`} onClick={() => del(c.id)}><Trash2 /></Button></div></div>)}</div>
    <Dialog open={!!edit} onOpenChange={(v) => !v && !busy && setEdit(null)}><DialogContent className="max-h-[90vh] overflow-auto bg-background"><DialogHeader><DialogTitle>Edit category</DialogTitle></DialogHeader>{edit && <div className="space-y-4">
      <Label>Name<Input value={edit.name_en} onChange={(e) => setEdit({ ...edit, name_en: e.target.value, slug: edit.slug === slugify(edit.name_en) ? slugify(e.target.value) : edit.slug })} /></Label>
      <Label>Slug<Input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Label>
      <Label>Arabic name<Input value={edit.name_ar} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} /></Label>
      <Label>French name<Input value={edit.name_fr} onChange={(e) => setEdit({ ...edit, name_fr: e.target.value })} /></Label>
      <Label>Description<Textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Label>
      <Label>Display order<Input type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Label>
      <Label>Photo URL<Input value={edit.image_url ?? ""} onChange={(e) => setEdit({ ...edit, image_url: e.target.value || null })} /></Label>
      <Label>Upload photo<input aria-label="Category photo" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="block w-full text-sm" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { const url = await uploadMedia(file, "categories"); setEdit((c) => c ? { ...c, image_url: url } : null); } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); } finally { setBusy(false); } }} /></Label>
      {edit.image_url && <img src={edit.image_url} alt="Category preview" className="h-32 w-full object-contain" />}
      <Button variant="luxe" className="w-full" disabled={busy} onClick={save}>{busy ? "Please wait…" : "Save category"}</Button>
    </div>}</DialogContent></Dialog>
  </>;
}