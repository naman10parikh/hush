#!/usr/bin/env node
/**
 * server.ts — hush's own MCP server (PLAN §3 component 7 / §4; HARNESS-OVERRIDES
 * component 7). A stdio JSON-RPC 2.0 server exposing the seven hush tools
 * (hush_scan/doctor/advise/remediate/rotate_plan/broker/tool) + the read-only
 * `hush://brain/*` resources, so a coding agent (Claude Code, the energy hub, a
 * sibling employee) can call hush locally.
 *
 * Transport: newline-delimited JSON-RPC over stdin/stdout (the MCP stdio
 * transport's line framing). We hand-roll the line loop rather than pulling in
 * the heavy @modelcontextprotocol/sdk — the PLAN §7 dependency pins do not include
 * it, the dev-tool stdio-local profile only needs request/response, and a
 * dependency-free server keeps the diff surgical (Karpathy simplicity). Methods:
 * `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`.
 *
 * HARD invariant (brain O-09): every tool/resource return is passed through
 * `redactResult()` / the resource redactor before serialization — no `value`
 * field, no secret-shaped string ever leaves this surface. stdout is the JSON-RPC
 * channel ONLY; all diagnostics go to stderr so the protocol stream stays clean.
 */
import { createInterface } from "node:readline";
import { HUSH_VERSION } from "../version.js";
import { TOOL_DESCRIPTORS, callTool, redactResult } from "./tools.js";
import { listResources, readResource } from "./resources.js";

const PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

interface JsonRpcError {
  readonly code: number;
  readonly message: string;
}

/** Write a single JSON-RPC response line to stdout (the ONLY thing on stdout). */
function reply(id: string | number | null, result: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

/** Write a JSON-RPC error response line. */
function replyError(id: string | number | null, error: JsonRpcError): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error }) + "\n");
}

/** MCP `content` envelope: text part carrying the JSON-stringified structured result. */
function textContent(payload: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

/** Dispatch one parsed request. Returns nothing for notifications (no id). */
function handle(req: JsonRpcRequest): void {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  try {
    switch (req.method) {
      case "initialize": {
        if (isNotification) return;
        reply(id, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: "hush", version: HUSH_VERSION },
          capabilities: { tools: {}, resources: {} },
          instructions:
            "hush — the secrets employee. I return handles, never values. Tools: hush_scan/doctor/advise/remediate/rotate_plan/broker/tool. Resources: hush://brain/* (the doctrine). I refuse to hand you a raw secret or to call a leak fixed before it's rotated.",
        });
        return;
      }

      // The MCP `notifications/initialized` ping — acknowledge by doing nothing.
      case "notifications/initialized":
        return;

      case "tools/list": {
        if (isNotification) return;
        reply(id, { tools: TOOL_DESCRIPTORS });
        return;
      }

      case "tools/call": {
        if (isNotification) return;
        const name = typeof req.params?.name === "string" ? req.params.name : "";
        const args =
          req.params?.arguments && typeof req.params.arguments === "object"
            ? (req.params.arguments as Record<string, unknown>)
            : {};
        try {
          const result = callTool(name, args);
          // O-09 gate: deep-redact before it leaves the process.
          const safe = redactResult(result.content);
          reply(id, { ...textContent(safe), isError: result.isError });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Tool-level failure is reported as an MCP error-content result, not a
          // transport error (so the client sees it as a tool outcome). Redact the
          // message too — an error string could echo a bad input (P-17).
          reply(id, { ...textContent({ error: redactResult(message) }), isError: true });
        }
        return;
      }

      case "resources/list": {
        if (isNotification) return;
        reply(id, { resources: listResources() });
        return;
      }

      case "resources/read": {
        if (isNotification) return;
        const uri = typeof req.params?.uri === "string" ? req.params.uri : "";
        const res = readResource(uri);
        if (!res) {
          replyError(id, { code: -32602, message: `unknown resource: ${uri}` });
          return;
        }
        reply(id, { contents: [{ uri: res.uri, mimeType: res.mimeType, text: res.text }] });
        return;
      }

      default: {
        if (isNotification) return;
        replyError(id, { code: -32601, message: `method not found: ${req.method}` });
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isNotification) replyError(id, { code: -32603, message });
  }
}

/** Read newline-delimited JSON-RPC from stdin; one request per line. */
function main(): void {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      // A non-JSON line cannot carry an id — emit a parse error with null id.
      replyError(null, { code: -32700, message: "parse error" });
      return;
    }
    handle(req);
  });
  rl.on("close", () => process.exit(0));
}

main();
