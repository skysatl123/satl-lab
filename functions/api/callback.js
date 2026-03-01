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

function buildAllowlist(env) {
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const siteOrigin = String(env.SITE_ORIGIN || "").trim();
  const base = siteOrigin ? [siteOrigin] : [];
  return allowed.length ? allowed : base;
}

function renderBody(status, content, allowlist) {
  const allowedJson = JSON.stringify(Array.isArray(allowlist) ? allowlist : []);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
</head>
<body>
<script>
  (function () {
    const ALLOWED = ${allowedJson};

    function isAllowed(origin) {
      if (!origin) return false;
      if (!ALLOWED.length) return true; // allowlist 미설정이면 동작은 유지(권장X)
      return ALLOWED.indexOf(origin) !== -1;
    }

    function receiveMessage(event) {
      try {
        if (!isAllowed(event.origin)) return;

        window.opener.postMessage(
          'authorization:github:${status}:${JSON.stringify(content)}',
          event.origin
        );
      } finally {
        window.removeEventListener("message", receiveMessage, false);
        try { window.close(); } catch (e) {}
      }
    }

    window.addEventListener("message", receiveMessage, false);

    // authorizing 신호도 allowlist로만 전송 (절대 "*"(와일드카드) 금지)
    try {
      if (window.opener && window.opener.postMessage) {
        if (ALLOWED.length) {
          for (let i = 0; i < ALLOWED.length; i++) {
            window.opener.postMessage("authorizing:github", ALLOWED[i]);
          }
        }
      }
    } catch (e) {}
  })();
</script>
</body>
</html>`;
  return html;
}

export async function onRequest(context) {
  const { request, env } = context;

  const client_id = env.GITHUB_CLIENT_ID;
  const client_secret = env.GITHUB_CLIENT_SECRET;
  if (!client_id || !client_secret) {
    return new Response("Missing GitHub OAuth env", { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) return new Response("Missing code", { status: 400 });
  if (!state) return new Response("Missing state", { status: 400 });

  const allowlist = buildAllowlist(env);

  // ✅ state 검증
  const cookies = parseCookies(request.headers.get("Cookie"));
  const cookieState = cookies.satl_oauth_state;

  const clearCookie = "satl_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure";

  if (!cookieState || cookieState !== state) {
    return new Response("Invalid state", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearCookie,
      },
    });
  }

  // code -> token 교환
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "cloudflare-pages-decap-oauth",
      accept: "application/json",
    },
    body: JSON.stringify({ client_id, client_secret, code }),
  });

  const result = await response.json();

  if (result.error) {
    return new Response(renderBody("error", result, allowlist), {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "Cache-Control": "no-store",
        "Set-Cookie": clearCookie,
      },
      status: 401,
    });
  }

  const token = result.access_token;

  return new Response(renderBody("success", { token, provider: "github" }, allowlist), {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",
      "Set-Cookie": clearCookie,
    },
    status: 200,
  });
}