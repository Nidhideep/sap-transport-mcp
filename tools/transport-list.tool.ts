import { z } from "zod";
import { getSystem } from "../config/systems.js";
import { adtGet, debugLog } from "../lib/adt-client.js";
import { mapTransportSummary, type TransportSummary } from "../lib/transport-mapper.js";

export const TransportListInputSchema = z.object({
  owner: z
    .string()
    .optional()
    .describe("SAP username to filter by owner. Omit to list all accessible transports."),
  status: z
    .enum(["Modifiable", "Released", "All"])
    .optional()
    .default("All")
    .describe("Filter by transport status. 'Modifiable' = open for changes, 'Released' = exported."),
  systemId: z
    .string()
    .optional()
    .describe("Logical SAP system ID (e.g. DEV, QA, PRD). Omit to use the default system."),
});

export type TransportListInput = z.infer<typeof TransportListInputSchema>;

export interface TransportListResult {
  system: string;
  totalCount: number;
  transports: TransportSummary[];
}

const STATUS_FILTER: Record<string, string> = {
  Modifiable: "D",
  Released: "L",
  All: "",
};

export const transportListTool = {
  name: "transport_list_requests",
  description:
    "Lists SAP transport requests visible to the current user. " +
    "Use this first to discover open transports before inspecting or releasing. " +
    "Safe to call any time — read only.",

  async handler(rawInput: unknown): Promise<TransportListResult> {
    const input = TransportListInputSchema.parse(rawInput);
    const system = getSystem(input.systemId);

    const params: Record<string, string> = {
      "$format": "json",
    };
    if (input.owner) params["user"] = input.owner;
    const statusCode = STATUS_FILTER[input.status ?? "All"];
    if (statusCode) params["status"] = statusCode;

    debugLog(`listing transports on ${system.id} owner=${input.owner ?? "any"} status=${input.status}`);

    const raw = await adtGet<unknown[]>(system, "/sap/bc/adt/cts/transports", params);

    const records = Array.isArray(raw) ? raw : [];
    const transports = records.map((r) => mapTransportSummary(r as Record<string, unknown>));

    return {
      system: system.id,
      totalCount: transports.length,
      transports,
    };
  },
};
