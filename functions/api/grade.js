// Cloudflare Pages Function — runs on the server, NOT in the browser.
// Holds your Anthropic API key as a SECRET (Cloudflare env var ANTHROPIC_API_KEY).
// The app calls POST /api/grade with { prompt, max_tokens } and gets back { text }.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// GET: a simple health check you can open in a browser to confirm the function is live
// and whether the key is present. It NEVER reveals the key — only yes/no that it's set.
export async function onRequestGet(context) {
  const hasKey = !!(context.env && context.env.ANTHROPIC_API_KEY);
  return json({ ok: true, function: "alive", keyConfigured: hasKey });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const key = env && env.ANTHROPIC_API_KEY;
    if (!key) return json({ error: "no-key", message: "ANTHROPIC_API_KEY is not set on the server" }, 500);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "bad-json" }, 400); }

    const prompt = (body && typeof body.prompt === "string") ? body.prompt : "";
    const maxTokens = (body && Number.isFinite(body.max_tokens)) ? body.max_tokens : 400;
    if (!prompt.trim()) return json({ error: "empty-prompt" }, 400);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return json({ error: "anthropic-" + resp.status, detail }, 502);
    }

    const data = await resp.json();
    const text = (data && Array.isArray(data.content))
      ? data.content.filter(c => c.type === "text").map(c => c.text).join("").trim()
      : "";
    return json({ text });
  } catch (e) {
    return json({ error: "server-error", message: String((e && e.message) || e) }, 500);
  }
}
