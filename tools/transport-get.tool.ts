import { z } from "zod";
import { getSystem } from "../config/systems.js";
import { adtGet, debugLog } from "../lib/adt-client.js";
import {
  mapTransportSummary,
  mapTransportTask,
  mapTransportObject,
  type TransportDetail,
} from "../lib/transport-mapper.js";

export const TransportGetInputSchema = z.object({
  transportNumber: z
    .string()
    .regex(/^[A-Z]{3}K\d{6}$/, "Transport number format: 3 letters + K + 6 digits (e.g. DEVK900123)")
    .describe("SAP transport request number (e.g. DEVK900123)."),
  systemId: z
    .string()
    .optional()
    .describe("Logical SAP system ID (e.g. DEV, QA, PRD). Omit to use the default system."),
});

export type TransportGetInput = z.infer<typeof TransportGetInputSchema>;

export const transportGetTool = {
  name: "transport_get_request",
  description:
    "Fetches full details of a SAP transport request: description, status, owner, target system, " +
    "all tasks, and all included ABAP objects. " +
    "Call this before releasing to confirm the transport contains the expected objects. " +
    "Safe to call any time — read only.",

  async handler(rawInput: unknown): Promise<TransportDetail> {
    const input = TransportGetInputSchema.parse(rawInput);
    const system = getSystem(input.systemId);
    const trkorr = input.transportNumber.toUpperCase();

    debugLog(`fetching transport ${trkorr} on ${system.id}`);

    // Fetch header, tasks, and objects in parallel
    const [headerRaw, tasksRaw, objectsRaw] = await Promise.all([
      adtGet<Record<string, unknown>>(
        system,
        `/sap/bc/adt/cts/transports/${trkorr}`,
        { "$format": "json" }
      ),
      adtGet<unknown>(
        system,
        `/sap/bc/adt/cts/transports/${trkorr}/tasks`,
        { "$format": "json" }
      ).catch(() => []), // tasks may 404 on task-type transports
      adtGet<unknown>(
        system,
        `/sap/bc/adt/cts/transports/${trkorr}/objects`,
        { "$format": "json" }
      ).catch(() => []),
    ]);

    const tasks = (Array.isArray(tasksRaw) ? tasksRaw : []).map((t) =>
      mapTransportTask(t as Record<string, unknown>)
    );

    const objects = (Array.isArray(objectsRaw) ? objectsRaw : []).map((o) =>
      mapTransportObject(o as Record<string, unknown>)
    );

    const summary = mapTransportSummary(headerRaw);

    return {
      ...summary,
      tasks,
      objects,
      objectCount: objects.length,
    };
  },
};
