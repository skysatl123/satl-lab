function parseCookies(header) {
  const out = Object.create(null);
  if (!header) return out;

  const parts = header.split(";");
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function makeStateHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequest(context) {
  const { request, env } = context;

  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return new Response("Missing GITHUB_CLIENT_ID", { status: 500 });

  const url = new URL(request.url);

  // allowlist: ALLOWED_ORIGINS가 있으면 우선, 없으면 SITE_ORIGIN
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const siteOrigin = String(env.SITE_ORIGIN || "").trim();
  const allowlist = allowed.length ? allowed : (siteOrigin ? [siteOrigin] : []);

  if (allowlist.length && !allowlist.includes(url.origin)) {
    return new Response("Forbidden origin", { status: 403 });
  }

  const redirectBase = siteOrigin || url.origin;
  const redirectUri = `${redirectBase}/api/callback`;

  // ✅ 핵심: state 쿠키가 이미 있으면 "재사용" (Decap이 /api/auth를 여러 번 불러도 안전)
  const cookies = parseCookies(request.headers.get("Cookie"));
  const existing = cookies.satl_oauth_state;
  const state = existing || makeStateHex();

  // public repo면 public_repo 권장, private면 repo
  const scope = env.GITHUB_SCOPE || "public_repo user";

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);

  // 쿠키는 "처음 생성했을 때만" 세팅 (재사용이면 Set-Cookie 불필요)
  const headers = new Headers();
  headers.set("Location", authorizeUrl.toString());
  headers.set("Cache-Control", "no-store");

  if (!existing) {
    const isHttps = redirectBase.startsWith("https://");
    const cookie =
      `satl_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax` +
      (isHttps ? "; Secure" : "");
    headers.set("Set-Cookie", cookie);
  }

  return new Response(null, { status: 302, headers });
}