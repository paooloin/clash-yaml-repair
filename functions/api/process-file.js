import {
  repairYamlText,
  buildFixedFilename,
  assertYamlFilename
} from "../_lib/processor.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function onRequestPost(context) {
  try {
    const request = context.request;
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return json({
        ok: false,
        error: "请上传 YAML 文件"
      }, 400);
    }

    assertYamlFilename(file.name);

    if (file.size > MAX_FILE_SIZE) {
      return json({
        ok: false,
        error: "文件过大，当前最大支持 5MB"
      }, 400);
    }

    const text = await file.text();
    const result = repairYamlText(text);

    return json({
      ok: true,
      source: "file",
      originalFilename: file.name,
      filename: buildFixedFilename(file.name),
      content: result.content,
      logs: result.logs,
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
