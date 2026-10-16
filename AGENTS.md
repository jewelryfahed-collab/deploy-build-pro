<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Data lives in Cloudflare D1 (binding `DB`) via `src/lib/db.server.ts`; no Supabase. Why: the site deploys to Cloudflare Workers with D1.
- Without a D1 binding (local preview) the data layer falls back to an in-memory seeded store. Why: preview works without Cloudflare.
- Auth is custom cookie sessions in `src/lib/auth.server.ts`; admin server functions call `requireAdmin()`. Why: no external auth provider.
- Media uploads and the "Done" publish go through the GitHub Contents API (`src/lib/github.server.ts`) using GITHUB_TOKEN / GITHUB_REPO secrets; "Done" also fires DEPLOY_HOOK_URL once. Why: one deploy per publish, not per edit.
