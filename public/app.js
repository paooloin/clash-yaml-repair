const fileInput = document.getElementById("fileInput");
const selectedFile = document.getElementById("selectedFile");
const uploadZone = document.getElementById("uploadZone");

const urlInput = document.getElementById("urlInput");

const fileBtn = document.getElementById("fileBtn");
const urlBtn = document.getElementById("urlBtn");

const logBox = document.getElementById("logBox");
const outputBox = document.getElementById("outputBox");
const outputName = document.getElementById("outputName");

const statusPill = document.getElementById("statusPill");

const statType = document.getElementById("statType");
const statProxies = document.getElementById("statProxies");
const statGroups = document.getElementById("statGroups");
const statRules = document.getElementById("statRules");

const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");

let currentContent = "";
let currentFilename = "fixed.yaml";

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];

  if (file) {
    selectedFile.textContent = file.name;
  } else {
    selectedFile.textContent = "尚未选择文件";
  }
});

uploadZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadZone.classList.add("dragover");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("dragover");
});

uploadZone.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadZone.classList.remove("dragover");

  const file = event.dataTransfer.files?.[0];

  if (!file) return;

  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".yaml") && !lower.endsWith(".yml")) {
    alert("当前版本仅支持 .yaml / .yml 文件");
    return;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  selectedFile.textContent = file.name;
});

fileBtn.addEventListener("click", processFile);
urlBtn.addEventListener("click", processUrl);

copyBtn.addEventListener("click", copyOutput);
downloadBtn.addEventListener("click", downloadOutput);

clearBtn.addEventListener("click", () => {
  logBox.textContent = "日志已清空。";
});

async function processFile() {
  const file = fileInput.files?.[0];

  if (!file) {
    alert("请先选择 YAML 文件");
    return;
  }

  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".yaml") && !lower.endsWith(".yml")) {
    alert("当前版本仅支持 .yaml / .yml 文件");
    return;
  }

  setProcessing("正在上传并修复 YAML 文件...");
  setButtonsDisabled(true);

  try {
    const form = new FormData();
    form.append("file", file);

    const resp = await fetch("/api/process-file", {
      method: "POST",
      body: form
    });

    const data = await resp.json();
    handleResult(data);
  } catch (err) {
    showError(`请求失败：${err.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

async function processUrl() {
  const url = urlInput.value.trim();

  if (!url) {
    alert("请输入订阅链接");
    return;
  }

  setProcessing("正在拉取订阅链接并修复...");
  setButtonsDisabled(true);

  try {
    const resp = await fetch("/api/process-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    const data = await resp.json();
    handleResult(data);
  } catch (err) {
    showError(`请求失败：${err.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

function handleResult(data) {
  if (!data.ok) {
    showError(data.error || "处理失败");
    return;
  }

  currentContent = data.content || "";
  currentFilename = data.filename || "fixed.yaml";

  outputName.textContent = currentFilename;
  outputBox.textContent = currentContent || "没有输出内容。";

  logBox.textContent = Array.isArray(data.logs)
    ? data.logs.map((item) => `• ${item}`).join("\n")
    : String(data.logs || "处理完成");

  updateStats(data.stats || {});
  setStatus("success", "Fixed");

  document.getElementById("resultPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function showError(message) {
  currentContent = "";

  logBox.textContent = `处理失败\n\n${message}`;
  outputBox.textContent = "没有可用输出。";

  updateStats({});
  setStatus("error", "Failed");
}

function setProcessing(message) {
  logBox.textContent = message;
  outputBox.textContent = "处理中，请稍候...";
  setStatus("processing", "Processing");
}

function setStatus(type, text) {
  statusPill.className = "status-pill";

  if (type) {
    statusPill.classList.add(type);
  }

  statusPill.textContent = text;
}

function updateStats(stats) {
  statType.textContent = stats.type || "--";
  statProxies.textContent = stats.proxies || "--";
  statGroups.textContent = stats.groups || "--";
  statRules.textContent = stats.rules || "--";
}

async function copyOutput() {
  if (!currentContent) {
    alert("没有可复制的内容");
    return;
  }

  try {
    await navigator.clipboard.writeText(currentContent);
    alert("已复制修复后的 YAML");
  } catch {
    fallbackCopy(currentContent);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
    alert("已复制修复后的 YAML");
  } catch {
    alert("复制失败，请手动复制");
  } finally {
    textarea.remove();
  }
}

function downloadOutput() {
  if (!currentContent) {
    alert("没有可下载的内容");
    return;
  }

  const blob = new Blob([currentContent], {
    type: "text/yaml;charset=utf-8"
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = currentFilename || "fixed.yaml";

  document.body.appendChild(link);
  link.click();

  URL.revokeObjectURL(link.href);
  link.remove();
}

function setButtonsDisabled(disabled) {
  fileBtn.disabled = disabled;
  urlBtn.disabled = disabled;

  fileBtn.style.opacity = disabled ? "0.7" : "1";
  urlBtn.style.opacity = disabled ? "0.7" : "1";
}
