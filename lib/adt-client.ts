import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import https from "https";
import { XMLParser } from "fast-xml-parser";
import { getAuthHeaders, getCertificatePem } from "../config/auth.js";
import { systemBaseUrl, type SapSystem } from "../config/systems.js";
import { env } from "../config/env.js";

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

// CSRF token cache keyed by system ID
const csrfCache = new Map<string, string>();

/**
 * Central HTTP client for SAP ADT REST API calls.
 * Handles CSRF token lifecycle, XML/JSON response parsing,
 * and SAP error message extraction.
 *
 * Usage:
 *   const data = await adtGet(system, "/sap/bc/adt/cts/transports");
 *   await adtPost(system, "/sap/bc/adt/cts/transports", payload);
 */

function buildAxiosInstance(system: SapSystem): AxiosInstance {
  const certPem = getCertificatePem();

  const agentOptions: https.AgentOptions = {
    rejectUnauthorized: true, // always verify SAP server cert in production
  };

  if (certPem) {
    agentOptions.cert = certPem;
  }

  return axios.create({
    baseURL: systemBaseUrl(system),
    httpsAgent: new https.Agent(agentOptions),
    timeout: 30_000,
    headers: getAuthHeaders(system),
  });
}

async function fetchCsrfToken(system: SapSystem): Promise<string> {
  const cached = csrfCache.get(system.id);
  if (cached) return cached;

  const client = buildAxiosInstance(system);
  const resp = await client.get("/sap/bc/adt/", {
    headers: { "X-CSRF-Token": "Fetch" },
  });

  const token = resp.headers["x-csrf-token"] as string | undefined;
  if (!token || token === "Required") {
    throw new Error(
      `Failed to fetch CSRF token from SAP system ${system.id}. ` +
        "Ensure ICF service /sap/bc/adt/ is activated (transaction SICF)."
    );
  }

  csrfCache.set(system.id, token);
  return token;
}

function invalidateCsrf(systemId: string): void {
  csrfCache.delete(systemId);
}

/**
 * Parses SAP ADT response — handles both JSON (OData d.results) and XML.
 * Returns the unwrapped data array or object.
 */
function parseAdtResponse(data: unknown, contentType: string): unknown {
  if (typeof data === "string" && (contentType.includes("xml") || data.trim().startsWith("<"))) {
    return xmlParser.parse(data);
  }

  // OData JSON: unwrap { d: { results: [...] } } or { d: {...} }
  if (data && typeof data === "object" && "d" in data) {
    const d = (data as Record<string, unknown>)["d"];
    if (d && typeof d === "object" && "results" in d) {
      return (d as Record<string, unknown>)["results"];
    }
    return d;
  }

  return data;
}

/**
 * Extracts a human-readable error message from SAP ADT error responses.
 * SAP can return errors as XML (<error><message>) or JSON ({ error: { message } }).
 */
function extractSapError(error: unknown): string {
  if (!axios.isAxiosError(error)) return String(error);

  const status = error.response?.status ?? "unknown";
  const raw = error.response?.data;
  const contentType = String(error.response?.headers?.["content-type"] ?? "");

  if (typeof raw === "string" && raw.includes("<error>")) {
    const parsed = xmlParser.parse(raw) as Record<string, unknown>;
    const msg =
      (parsed["error"] as Record<string, unknown> | undefined)?.["message"] ??
      raw.slice(0, 200);
    return `SAP ADT error [${status}]: ${msg}`;
  }

  if (raw && typeof raw === "object" && "error" in raw) {
    const errObj = (raw as Record<string, unknown>)["error"] as Record<string, unknown>;
    const msg = errObj?.["message"] ?? JSON.stringify(raw).slice(0, 200);
    return `SAP ADT error [${status}]: ${msg}`;
  }

  return `SAP ADT HTTP ${status}: ${String(raw ?? error.message).slice(0, 200)}`;
}

export async function adtGet<T = unknown>(system: SapSystem, path: string, params?: Record<string, string>): Promise<T> {
  const client = buildAxiosInstance(system);
  try {
    const config: AxiosRequestConfig = { params };
    const resp = await client.get(path, config);
    const contentType = String(resp.headers["content-type"] ?? "");
    return parseAdtResponse(resp.data, contentType) as T;
  } catch (e) {
    throw new Error(extractSapError(e));
  }
}

export async function adtPost<T = unknown>(
  system: SapSystem,
  path: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<T> {
  const csrfToken = await fetchCsrfToken(system);
  const client = buildAxiosInstance(system);

  try {
    const config: AxiosRequestConfig = {
      params,
      headers: { "X-CSRF-Token": csrfToken },
    };
    const resp = await client.post(path, body ?? {}, config);
    const contentType = String(resp.headers["content-type"] ?? "");
    return parseAdtResponse(resp.data, contentType) as T;
  } catch (e) {
    // CSRF may have expired — invalidate and surface the error
    if (axios.isAxiosError(e) && e.response?.status === 403) {
      invalidateCsrf(system.id);
    }
    throw new Error(extractSapError(e));
  }
}

export async function adtDelete(system: SapSystem, path: string): Promise<void> {
  const csrfToken = await fetchCsrfToken(system);
  const client = buildAxiosInstance(system);

  try {
    await client.delete(path, {
      headers: { "X-CSRF-Token": csrfToken },
    });
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 403) {
      invalidateCsrf(system.id);
    }
    throw new Error(extractSapError(e));
  }
}

export function debugLog(msg: string): void {
  if (env.LOG_LEVEL === "debug") console.error(`[adt-client] ${msg}`);
}
