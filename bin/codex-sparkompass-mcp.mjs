#!/usr/bin/env node
import process from "node:process";
import { MCP_TOOLS, callMcpTool } from "../src/mcp-tools.mjs";
import { getMcpToolsForProfile, normalizeToolProfileName } from "../src/tool-profiles.mjs";

const SERVER_INFO = {
  name: "codex-sparkompass",
  version: "0.1.0-alpha.0"
};

const ACTIVE_TOOL_PROFILE = normalizeToolProfileName(process.env.SPARKOMPASS_TOOL_PROFILE || process.env.SPARKOMPASS_MCP_TOOL_PROFILE || "debug");
const ACTIVE_MCP_TOOLS = getMcpToolsForProfile(MCP_TOOLS, ACTIVE_TOOL_PROFILE);
const ACTIVE_MCP_TOOL_NAMES = new Set(ACTIVE_MCP_TOOLS.map((tool) => tool.name));
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  drainBuffer();
});

process.stdin.on("error", (error) => {
  process.stderr.write(`sparkompass MCP stdin error: ${error.message}\n`);
});

function drainBuffer() {
  while (buffer.length) {
    const contentLengthMatch = buffer.match(/^Content-Length:\s*(\d+)\r?\n\r?\n/i);
    if (contentLengthMatch) {
      const headerLength = contentLengthMatch[0].length;
      const contentLength = Number(contentLengthMatch[1]);
      if (buffer.length < headerLength + contentLength) return;
      const raw = buffer.slice(headerLength, headerLength + contentLength);
      buffer = buffer.slice(headerLength + contentLength);
      receive(raw);
      continue;
    }

    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex === -1) return;
    const raw = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (raw) receive(raw);
  }
}

function receive(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch (error) {
    sendError(null, -32700, `Parse error: ${error.message}`);
    return;
  }

  handleMessage(message).catch((error) => {
    sendError(message.id ?? null, -32603, error?.message ?? String(error));
  });
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0") {
    sendError(message?.id ?? null, -32600, "Invalid JSON-RPC message.");
    return;
  }

  if (message.id === undefined || message.id === null) {
    return;
  }

  if (message.method === "initialize") {
    sendResult(message.id, {
      protocolVersion: message.params?.protocolVersion || "2024-11-05",
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: SERVER_INFO,
      instructions: [
        "Use Sparkompass tools to select minimal repository context before reading full files.",
        "Load evidence for exact source details and fall back to broader context when verification is uncertain.",
        `Active tool profile: ${ACTIVE_TOOL_PROFILE}.`
      ].join(" ")
    });
    return;
  }

  if (message.method === "tools/list") {
    sendResult(message.id, {
      tools: ACTIVE_MCP_TOOLS
    });
    return;
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (!ACTIVE_MCP_TOOL_NAMES.has(name)) {
      throw new Error(`Sparkompass MCP tool is not available in active profile ${ACTIVE_TOOL_PROFILE}: ${name}`);
    }
    const args = message.params?.arguments || {};
    const result = await callMcpTool(name, args);
    sendResult(message.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result,
      isError: false
    });
    return;
  }

  sendError(message.id, -32601, `Method not found: ${message.method}`);
}

function sendResult(id, result) {
  send({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
