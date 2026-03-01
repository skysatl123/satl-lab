function renderBody(status, content) {
  const html = `
<script>
  const receiveMessage = (message) => {
    window.opener.postMessage(
      'authorization:github:${status}:${JSON.stringify(content)}',
      message.origin
    );
    window.removeEventListener("message", receiveMessage, false);
  };
  window.addEventListener("message", receiveMessage, false);
  window.opener.postMessage("authorizing:github", "*");
</script>
`;
  return html;
}

export async function onRequest(context) {
  const { request, env } = context;

  const client_id = env.GITHUB_CLIENT_ID;
  const client_secret = env.GITHUB_CLIENT_SECRET;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");

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
    return new Response(renderBody("error", result), {
      headers: { "content-type": "text/html;charset=UTF-8" },
      status: 401,
    });
  }

  const token = result.access_token;

  return new Response(
    renderBody("success", { token, provider: "github" }),
    { headers: { "content-type": "text/html;charset=UTF-8" }, status: 200 }
  );
}