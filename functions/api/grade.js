// Cloudflare Pages Function — runs on the server, NOT in the browser.
// It holds your Anthropic API key as a SECRET (set in the Cloudflare dashboard as ANTHROPIC_API_KEY),
// so the key is never sent to or visible in the app/browser. The app calls POST /api/grade with
// { prompt, max_tokens } and gets back { text }.

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS (same-origin in practice, but harmless and future-proof)
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) {
      return json({ error: "Server is missing ANTHROPIC_API_KEY" }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Bad JSON" }, 400, cors);
    }

    const prompt = (body && typeof body.prompt === "string") ? body.prompt : "";
    const maxTokens = (body && Number.isFinite(body.max_tokens)) ? body.max_tokens : 400;
    if (!prompt.trim()) {
      return json({ error: "Empty prompt" }, 400, cors);
    }

    // Call Anthropic from the server, with the secret key.
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
      return json({ error: "Anthropic error " + resp.status, detail }, 502, cors);
    }

    const data = await resp.json();
    const text = (data && Array.isArray(data.content))
      ? data.content.filter(c => c.type === "text").map(c => c.text).join("").trim()
      : "";

    return json({ text }, 200, cors);
  } catch (e) {
    return json({ error: "Server error", detail: String(e && e.message || e) }, 500, cors);
  }
}

// Handle preflight requests
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...(cors || {}) },
  });
}
