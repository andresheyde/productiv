#!/usr/bin/env node

const { mkdirSync, openSync } = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");

const model = process.env.OLLAMA_MODEL || "llama3.2:3b";
const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(
  /\/$/,
  "",
);
const logPath = ".local/ollama.log";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (!(await isOllamaRunning())) {
    startNativeOllama();
    await waitForOllama();
  }

  await pullModel();
}

async function isOllamaRunning() {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

function startNativeOllama() {
  const versionCheck = spawnSync("ollama", ["--version"], {
    encoding: "utf8",
  });

  if (versionCheck.error) {
    throw new Error(
      [
        "Native Ollama is not installed or is not on PATH.",
        "",
        "Install it from https://ollama.com/download, then rerun:",
        "  npm run local",
        "",
        "If you want to use Docker Ollama instead, run:",
        "  npm run local:docker",
      ].join("\n"),
    );
  }

  mkdirSync(".local", { recursive: true });
  const logFd = openSync(logPath, "a");
  const child = spawn("ollama", ["serve"], {
    detached: true,
    env: {
      ...process.env,
      OLLAMA_FLASH_ATTENTION: process.env.OLLAMA_FLASH_ATTENTION || "1",
      OLLAMA_KV_CACHE_TYPE: process.env.OLLAMA_KV_CACHE_TYPE || "q8_0",
    },
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  console.log(`[Ollama] Started native server. Logs: ${logPath}`);
}

async function waitForOllama() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isOllamaRunning()) {
      return;
    }

    await sleep(1_000);
  }

  throw new Error(`Ollama did not start at ${baseUrl}.`);
}

async function pullModel() {
  console.log(`[Ollama] Ensuring model ${model} is available at ${baseUrl}...`);

  const response = await fetch(`${baseUrl}/api/pull`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: model,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to pull Ollama model ${model}: ${body || response.statusText}`,
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
