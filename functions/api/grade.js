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
const MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-sonnet-4-6",
  "claude-3-haiku-20240307",
];
async function callAnthropic(key, prompt, maxTokens) {
  let lastErr = "";
  for (const model of MODELS) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens || 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const text = (data && Array.isArray(data.content))
        ? data.content.filter(c => c.type === "text").map(c => c.text).join("").trim()
        : "";
      return { ok: true, text, model };
    }
    lastErr = "HTTP " + resp.status + ": " + (await resp.text().catch(() => "")).slice(0, 200);
    if (resp.status !== 404 && resp.status !== 400) break;
  }
  return { ok: false, error: lastErr };
}
export async function onRequestGet(context) {
  const key = context.env && context.env.ANTHROPIC_API_KEY;
  if (!key) return json({ ok: false, message: "ANTHROPIC_API_KEY not set" });
  const r = await callAnthropic(key, "Reply with exactly: OK", 20);
  return json(r);
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const key = env && env.ANTHROPIC_API_KEY;
    if (!key) return json({ error: "no-key" }, 500);
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad-json" }, 400); }
    const prompt = (body && typeof body.prompt === "string") ? body.prompt : "";
    const maxTokens = (body && Number.isFinite(body.max_tokens)) ? body.max_tokens : 400;
    if (!prompt.trim()) return json({ error: "empty-prompt" }, 400);
    const r = await callAnthropic(key, prompt, maxTokens);
    if (!r.ok) return json({ error: "anthropic", detail: r.error }, 502);
    return json({ text: r.text });
  } catch (e) {
    return json({ error: "server-error", message: String((e && e.message) || e) }, 500);
  }
}
