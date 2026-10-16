// GitHub Contents API helpers (workerd-safe: fetch + btoa only).
// Needs GITHUB_TOKEN (fine-grained, Contents: read & write) and GITHUB_REPO ("owner/name").
// Optional: GITHUB_BRANCH (default "main").

async function readEnv(name: string): Promise<string | undefined> {
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (fromProcess) return fromProcess;
  try {
    const mod = (await import("cloudflare:workers")) as { env?: Record<string, unknown> };
    const v = mod.env?.[name];
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

export async function envValue(name: string) {
  return readEnv(name);
}

async function config() {
  const token = await readEnv("GITHUB_TOKEN");
  const repo = await readEnv("GITHUB_REPO");
  const branch = (await readEnv("GITHUB_BRANCH")) || "main";
  if (!token || !repo) throw new Error("GitHub is not configured: add GITHUB_TOKEN and GITHUB_REPO secrets.");
  return { token, repo, branch };
}

export async function githubStatus() {
  const token = await readEnv("GITHUB_TOKEN");
  const repo = await readEnv("GITHUB_REPO");
  const hook = await readEnv("DEPLOY_HOOK_URL");
  return { github: !!(token && repo), repo: repo ?? null, deployHook: !!hook };
}

async function gh(path: string, init: RequestInit = {}) {
  const { token } = await config();
  const res = await fetch(`https://api.github.com/${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "fahed-jewelry-admin",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

/** Create or update one file. `base64` must already be base64-encoded. */
export async function putFile(path: string, base64: string, message: string): Promise<string> {
  const { repo, branch } = await config();
  const encPath = path.split("/").map(encodeURIComponent).join("/");
  let sha: string | undefined;
  const existing = await gh(`repos/${repo}/contents/${encPath}?ref=${encodeURIComponent(branch)}`);
  if (existing.ok) sha = ((await existing.json()) as { sha: string }).sha;
  else if (existing.status !== 404) throw new Error(`GitHub read failed [${existing.status}]: ${await existing.text()}`);

  const res = await gh(`repos/${repo}/contents/${encPath}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: base64, branch, ...(sha && { sha }) }),
  });
  if (!res.ok) throw new Error(`GitHub upload failed [${res.status}]: ${await res.text()}`);
  return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
