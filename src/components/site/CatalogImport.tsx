import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminBulkImportFn } from "@/lib/api.functions";
import { categoryFromRow, parseImport, productFromRow } from "@/lib/catalog";
import { importPhoto } from "@/lib/media";
import type { Category, Product } from "@/lib/types";

export function CatalogImport({ kind, categories, products = [], onSaved }: { kind: "products" | "categories"; categories: Category[]; products?: Product[]; onSaved: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<(Category | Product)[] | null>(null);
  function preview() {
    try {
      const source = parseImport(text);
      if (!source.length || source.length > 500) throw new Error("Choose between 1 and 500 records");
      const parsed = source.map((r, i) => {
        try { return kind === "categories" ? categoryFromRow(r, categories) : productFromRow(r, categories, products); }
        catch (e) { throw new Error(`Row ${i + 1}: ${e instanceof Error ? e.message : "Invalid record"}`); }
      });
      if (new Set(parsed.map((r) => r.slug)).size !== parsed.length) throw new Error("Duplicate slugs in import");
      setRows(parsed); setError("");
    } catch (e) { setRows(null); setError(e instanceof Error ? e.message : "Invalid import"); }
  }
  async function save() {
    if (!rows) return;
    setBusy(true); setError("");
    try {
      const ready = [];
      for (const [i, row] of rows.entries()) {
        setProgress(`Preparing ${i + 1} of ${rows.length}`);
        const image_url = row.image_url ? await importPhoto(row.image_url, kind) : null;
        if ("gallery" in row) {
          const gallery = [];
          for (const image of row.gallery) gallery.push(await importPhoto(image, kind));
          ready.push({ ...row, image_url, gallery });
        } else ready.push({ ...row, image_url });
      }
      setProgress("Saving records…");
      const result = await adminBulkImportFn({ data: { kind, rows: ready } });
      onSaved(); await qc.invalidateQueries(); toast.success(`${result.count} ${kind} imported`); setOpen(false); setRows(null); setText("");
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); setProgress(""); }
  }
  function template() {
    const example = kind === "categories" ? [{ name: "New collection", slug: "new-collection", description: "", image_url: "", sort_order: 7 }] : [{ name: "New piece", slug: "new-piece", category: categories[0]?.slug ?? "", price_usd: 100, stock: 1, image_url: "", gallery: [], metal: "18k_gold", is_active: true }];
    const url = URL.createObjectURL(new Blob([JSON.stringify(example, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `${kind}-template.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <>
    <Button variant="ghostGold" onClick={() => setOpen(true)}><Upload /> Bulk import</Button>
    <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-background sm:max-w-2xl">
        <DialogHeader><DialogTitle>Import {kind}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={template}><Download /> JSON template</Button>
          <label className="cursor-pointer text-sm text-gold">CSV / JSON file<input aria-label="Import file" type="file" accept=".csv,.json" className="block max-w-full text-xs" disabled={busy} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setRows(null); } }} /></label>
        </div>
        <Textarea aria-label="Import records" value={text} disabled={busy} onChange={(e) => { setText(e.target.value); setRows(null); }} className="min-h-48 font-mono text-xs" />
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        {rows && <div className="max-h-40 overflow-auto text-sm">{rows.map((r) => <p key={r.id} className="border-b py-2">{r.name_en} · {r.slug}{"price_usd" in r ? ` · $${r.price_usd}` : ""}</p>)}</div>}
        <Button variant="luxe" disabled={busy || !text} onClick={rows ? save : preview}>{busy ? progress : rows ? `Import ${rows.length} records` : "Review import"}</Button>
      </DialogContent>
    </Dialog>
  </>;
}