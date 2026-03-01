export async function onRequest(context) {
  const { request, env } = context;

  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return new Response("Missing GITHUB_CLIENT_ID", { status: 500 });

  const url = new URL(request.url);

  // Allowlist: ALLOWED_ORIGINS가 있으면 그걸 사용, 없으면 SITE_ORIGIN만 허용
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const siteOrigin = String(env.SITE_ORIGIN || "").trim();
  const allowlist = allowed.length ? allowed : (siteOrigin ? [siteOrigin] : []);

  if (allowlist.length && !allowlist.includes(url.origin)) {
    return new Response("Forbidden origin", { status: 403 });
  }

  // redirect_uri는 가능한 한 고정
  const redirectBase = siteOrigin || url.origin;
  const redirectUri = `${redirectBase}/api/callback`;

  // CSRF state 생성 + 쿠키 저장
  const stateBytes = new Uint8Array(16);
  crypto.getRandomValues(stateBytes);
  const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // scope: public repo면 public_repo 권장, private이면 repo
  const scope = env.GITHUB_SCOPE || "public_repo user";

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);

  const isHttps = redirectBase.startsWith("https://");
  const cookie =
    `satl_oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax` +
    (isHttps ? "; Secure" : "");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}