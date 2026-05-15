import {
  repairYamlText
} from "../_lib/processor.js";

const MAX_SUB_SIZE = 5 * 1024 * 1024;

export async function onRequestPost(context) {
  try {
    const request = context.request;
    const body = await request.json().catch(() => null);

    const subUrl = String(body?.url || "").trim();

    if (!subUrl) {
      return json({
        ok: false,
        error: "请输入订阅链接"
      }, 400);
    }

    const url = new URL(subUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return json({
        ok: false,
        error: "订阅链接必须是 http 或 https"
      }, 400);
    }

    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 Clash-YAML-Repair/1.0",
        "Accept": "text/yaml,text/plain,application/yaml,application/x-yaml,*/*"
      }
    });

    if (!resp.ok) {
      return json({
        ok: false,
        error: `订阅拉取失败：HTTP ${resp.status}`
      }, 400);
    }

    const contentLength = resp.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_SUB_SIZE) {
      return json({
        ok: false,
        error: "订阅内容过大，当前最大支持 5MB"
      }, 400);
    }

    const text = await resp.text();

    if (new TextEncoder().encode(text).length > MAX_SUB_SIZE) {
      return json({
        ok: false,
        error: "订阅内容过大，当前最大支持 5MB"
      }, 400);
    }

    const result = repairYamlText(text);

    return json({
      ok: true,
      source: "url",
      originalUrl: url.toString(),
      filename: "subscription_fixed.yaml",
      content: result.content,
      logs: [
        `订阅链接：${url.toString()}`,
        ...result.logs
      ],
      stats: result.stats
    });

  } catch (err) {
    return json({
      ok: false,
      error: err.message || "处理失败"
    }, 500);
  }
}

export async function onRequestGet() {
  return json({
    ok: false,
    error: "Method Not Allowed"
  }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}
