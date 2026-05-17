import yaml from "js-yaml";

/**
 * CP1252 mojibake reverse map.
 * 用于尝试修复 UTF-8 文本被错误当成 Latin-1 / CP1252 解码后的乱码。
 */

const REVERSE_BYTE_MAP = new Map();

for (let i = 0; i < 256; i++) {
  REVERSE_BYTE_MAP.set(i, i);
}

const CP1252_SPECIAL = {
  0x20AC: 0x80,
  0x201A: 0x82,
  0x0192: 0x83,
  0x201E: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02C6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8A,
  0x2039: 0x8B,
  0x0152: 0x8C,
  0x017D: 0x8E,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201C: 0x93,
  0x201D: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02DC: 0x98,
  0x2122: 0x99,
  0x0161: 0x9A,
  0x203A: 0x9B,
  0x0153: 0x9C,
  0x017E: 0x9E,
  0x0178: 0x9F
};

for (const [cp, b] of Object.entries(CP1252_SPECIAL)) {
  REVERSE_BYTE_MAP.set(Number(cp), b);
}

const decoder = new TextDecoder("utf-8", { fatal: true });

export function repairYamlText(rawText) {
  const logs = [];

  if (typeof rawText !== "string") {
    throw new Error("输入内容不是文本");
  }

  let text = rawText.replace(/\r\n/g, "\n");

  logs.push("读取内容完成");
  logs.push(`原始大小：${formatBytes(utf8Size(text))}`);

  /**
   * 重点：
   * 必须先修复 mojibake，再清理控制字符。
   *
   * 因为很多 UTF-8 mojibake 会包含 \x80-\x9F 范围内的字符，
   * 例如：
   *   å°æ¹¾ -> 台湾
   *   æ–°åŠ å¡ -> 新加坡
   *
   * 如果提前清理控制字符，会把关键字节删掉，导致无法还原。
   */
  logs.push("修复常见 UTF-8 mojibake 乱码");
  text = fixMojibakeText(text);

  logs.push("清理残留控制字符");
  text = cleanControlChars(text);

  logs.push("解析 YAML");

  let data;
  let parseError = null;

  try {
    data = yaml.load(text);
  } catch (err) {
    parseError = err;
  }

  /**
   * fallback:
   * 某些输入可能是被额外转义过的 YAML 文本。
   * 只有原始 YAML 解析失败时，才尝试替换 \" 后再解析。
   */
  if (data === undefined && parseError) {
    logs.push("原始 YAML 解析失败，尝试兼容模式解析");

    const fallbackText = text.replace(/\\"/g, '"');

    try {
      data = yaml.load(fallbackText);
      logs.push("兼容模式解析成功");
    } catch {
      throw new Error(`YAML 解析失败：${parseError.message}`);
    }
  }

  if (data === null || data === undefined) {
    throw new Error("YAML 内容为空");
  }

  logs.push("递归还原 Unicode 转义字符");
  data = convertAll(data);

  logs.push("重新生成 YAML");

  const output = yaml.dump(data, {
    noRefs: true,
    sortKeys: false,
    lineWidth: 500,
    noCompatMode: true,
    condenseFlow: false
  });

  logs.push(`修复后大小：${formatBytes(utf8Size(output))}`);
  logs.push("处理完成");

  return {
    ok: true,
    content: output,
    logs,
    stats: analyzeYaml(data, output)
  };
}

export function unicodeToChar(value) {
  if (typeof value !== "string") return value;

  let s = value;

  s = s.replace(/\\+U([0-9A-Fa-f]{8})/g, (_, hex) => {
    return safeCodePoint(hex);
  });

  s = s.replace(/\\+u([0-9A-Fa-f]{4})/g, (_, hex) => {
    return safeCodePoint(hex);
  });

  s = s.replace(/\\"/g, '"');

  return s;
}

export function convertAll(obj) {
  if (Array.isArray(obj)) {
    return obj.map(convertAll);
  }

  if (obj && typeof obj === "object") {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      out[convertAll(key)] = convertAll(value);
    }
    return out;
  }

  if (typeof obj === "string") {
    return unicodeToChar(obj);
  }

  return obj;
}

export function fixMojibakeText(text) {
  return text
    .split("\n")
    .map(fixMojibakeLine)
    .join("\n");
}

function fixMojibakeLine(line) {
  const whole = tryDecodeBytes(line);

  if (whole !== null && looksBetter(whole, line)) {
    return whole;
  }

  return fixLineSegmented(line);
}

function fixLineSegmented(line) {
  const result = [];
  let buffer = "";

  for (const ch of line) {
    if (isMojibakeChar(ch)) {
      buffer += ch;
    } else {
      if (buffer) {
        const fixed = tryDecodeBytes(buffer);
        result.push(fixed !== null && looksBetter(fixed, buffer) ? fixed : buffer);
        buffer = "";
      }
      result.push(ch);
    }
  }

  if (buffer) {
    const fixed = tryDecodeBytes(buffer);
    result.push(fixed !== null && looksBetter(fixed, buffer) ? fixed : buffer);
  }

  return result.join("");
}

function isMojibakeChar(ch) {
  const cp = ch.codePointAt(0);
  return cp >= 0x80 && REVERSE_BYTE_MAP.has(cp);
}

function tryDecodeBytes(segment) {
  const bytes = [];

  for (const ch of segment) {
    const cp = ch.codePointAt(0);

    if (cp < 0x80) {
      bytes.push(cp);
    } else if (REVERSE_BYTE_MAP.has(cp)) {
      bytes.push(REVERSE_BYTE_MAP.get(cp));
    } else {
      return null;
    }
  }

  try {
    const decoded = decoder.decode(new Uint8Array(bytes));
    if (decoded !== segment) return decoded;
    return null;
  } catch {
    return null;
  }
}

function looksBetter(decoded, original) {
  if (!decoded || decoded === original) return false;

  const originalBad = countMojibakeSignals(original);
  const decodedBad = countMojibakeSignals(decoded);

  const hasCjk = /[\u3400-\u9FFF]/.test(decoded);
  const hasEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(decoded);

  if (decodedBad < originalBad) return true;
  if ((hasCjk || hasEmoji) && originalBad > 0) return true;

  return false;
}

function countMojibakeSignals(s) {
  const matches = s.match(/[ÃÂâäåæçèéêëìíîïðñòóôõöùúûüýþÿ�]/g);
  return matches ? matches.length : 0;
}

function safeCodePoint(hex) {
  try {
    const cp = parseInt(hex, 16);

    if (!Number.isFinite(cp)) return `\\u${hex}`;

    if (cp < 0 || cp > 0x10FFFF) {
      return `\\u${hex}`;
    }

    return String.fromCodePoint(cp);
  } catch {
    return `\\u${hex}`;
  }
}

function cleanControlChars(text) {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}

function analyzeYaml(data, output) {
  const stats = {
    size: formatBytes(utf8Size(output)),
    type: Array.isArray(data) ? "YAML Array" : typeof data === "object" ? "YAML Object" : "YAML Value",
    proxies: "--",
    groups: "--",
    rules: "--"
  };

  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (Array.isArray(data.proxies)) {
      stats.proxies = String(data.proxies.length);
    }

    if (Array.isArray(data["proxy-groups"])) {
      stats.groups = String(data["proxy-groups"].length);
    }

    if (Array.isArray(data.rules)) {
      stats.rules = String(data.rules.length);
    }
  }

  return stats;
}

function utf8Size(text) {
  return new TextEncoder().encode(text).length;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function buildFixedFilename(filename = "subscription.yaml") {
  const safe = filename.split(/[\\/]/).pop() || "subscription.yaml";
  const idx = safe.lastIndexOf(".");

  if (idx === -1) {
    return `${safe}_fixed.yaml`;
  }

  const name = safe.slice(0, idx);
  const ext = safe.slice(idx).toLowerCase();

  // 保留原始后缀，统一加 _fixed
  return `${name}_fixed${ext}`;
}
