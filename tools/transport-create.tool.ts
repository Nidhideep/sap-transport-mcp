import { z } from "zod";
import { getSystem } from "../config/systems.js";
import { adtPost, debugLog } from "../lib/adt-client.js";
import { enforceWritePolicy, auditLog } from "../config/policy.js";
import { transportGetTool } from "./transport-get.tool.js";
import { mapType } from "../lib/status-codes.js";

export const TransportCreateInputSchema = z.object({
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(60, "Description must be 60 characters or fewer (SAP AS4TEXT field limit)")
    .describe(
      "Meaningful description for the transport request (10–60 chars). " +
        "Example: 'Add plant 1000 config for Q2 cutover'."
    ),
  type: z
    .enum(["Workbench", "Customizing"])
    .default("Workbench")
    .describe(
      "Transport type. 'Workbench' for ABAP development objects (programs, tables, function groups). " +
        "'Customizing' for configuration/IMG settings."
    ),
  targetSystem: z
    .string()
    .optional()
    .describe(
      "Target SAP system SID (e.g. QA1, PRD). " +
        "Omit to use the default transport route configured in SAP (recommended)."
    ),
  systemId: z
    .string()
    .optional()
    .describe("Logical SAP system to create the transport on. Omit for default."),
});

export type TransportCreateInput = z.infer<typeof TransportCreateInputSchema>;

export interface TransportCreateResult {
  success: boolean;
  transportNumber: string;
  message: string;
  verification: {
    exists: boolean;
    status: string;
    owner: string;
    targetSystem: string;
  };
}

const TYPE_CODE: Record<string, string> = {
  Workbench: "K",
  Customizing: "W",
};

export const transportCreateTool = {
  name: "transport_create_request",
  description:
    "Creates a new SAP transport request. " +
    "The transport starts empty — ABAP objects must be added via the SAP GUI or ADT before releasing. " +
    "Call transport_list_systems first to confirm the target system ID.",

  async handler(rawInput: unknown): Promise<TransportCreateResult> {
    const input = TransportCreateInputSchema.parse(rawInput);
    const system = getSystem(input.systemId);

    // 1. Governance
    enforceWritePolicy({
      toolName: "transport_create_request",
      systemId: system.id,
      description: input.description,
    });

    let result: TransportCreateResult;

    try {
      debugLog(`creating transport on ${system.id} type=${input.type}`);

      // SAP ADT CTS: POST body varies by version — XML payload is most compatible
      const xmlBody = buildCreateXml(input.description, TYPE_CODE[input.type] ?? "K", input.targetSystem);

      const response = await adtPost<Record<string, unknown>>(
        system,
        "/sap/bc/adt/cts/transports",
        xmlBody,
        undefined
      );

      // SAP returns the new transport number in Location header or response body
      const transportNumber = extractTransportNumber(response);
      if (!transportNumber) {
        throw new Error("SAP did not return a transport number in the create response");
      }

      // 2. Verify by reading back
      const verified = await transportGetTool.handler({
        transportNumber,
        systemId: input.systemId,
      });

      result = {
        success: true,
        transportNumber,
        message: `Transport ${transportNumber} created on ${system.id}. Add ABAP objects before releasing.`,
        verification: {
          exists: true,
          status: verified.status,
          owner: verified.owner,
          targetSystem: verified.targetSystem,
        },
      };
    } catch (error) {
      auditLog({
        toolName: "transport_create_request",
        systemId: system.id,
        input,
        result: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    auditLog({
      toolName: "transport_create_request",
      systemId: system.id,
      transportNumber: result.transportNumber,
      input,
      result: "success",
      detail: result.message,
    });

    return result;
  },
};

function buildCreateXml(description: string, typeCode: string, targetSystem?: string): string {
  const targetAttr = targetSystem ? ` tm:target="${targetSystem}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/api/transports">
  <tm:workbench-request tm:category="${typeCode}"${targetAttr}>
    <tm:description>${escapeXml(description)}</tm:description>
  </tm:workbench-request>
</tm:root>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractTransportNumber(response: Record<string, unknown>): string | null {
  // ADT may return it in different places depending on version
  const trkorr =
    response["TRKORR"] ??
    response["trkorr"] ??
    response["transportNumber"] ??
    (response["tm:root"] as Record<string, unknown> | undefined)?.["tm:workbench-request"];

  if (typeof trkorr === "string" && trkorr.match(/^[A-Z]{3}K\d{6}$/)) return trkorr;
  return null;
}
