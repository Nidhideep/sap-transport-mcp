import { mapStatus, mapType, mapProgramId } from "./status-codes.js";

/**
 * Business-facing transport summary (list view).
 */
export interface TransportSummary {
  transportNumber: string;   // TRKORR
  description: string;       // AS4TEXT
  type: string;              // CATEGORY (mapped)
  status: string;            // TRSTATUS (mapped)
  owner: string;             // AS4USER
  targetSystem: string;      // TARSYSTEM
  createdAt: string;         // AS4DATE + AS4TIME → ISO 8601
}

/**
 * Business-facing transport detail (includes tasks and objects).
 */
export interface TransportDetail extends TransportSummary {
  tasks: TransportTask[];
  objects: TransportObject[];
  objectCount: number;
}

export interface TransportTask {
  taskNumber: string;
  description: string;
  owner: string;
  status: string;
}

export interface TransportObject {
  objectType: string;   // OBJECT (e.g. PROG, TABL, FUGR)
  objectName: string;   // OBJ_NAME
  programId: string;    // PGMID (mapped)
}

export interface ImportQueueEntry {
  transportNumber: string;
  description: string;
  owner: string;
  targetSystem: string;
  queuedAt: string;
}

/**
 * Maps a raw SAP ADT transport record to a business-friendly summary.
 * Handles both OData JSON (d.results) and XML-parsed objects.
 */
export function mapTransportSummary(raw: Record<string, unknown>): TransportSummary {
  const date = String(raw["AS4DATE"] ?? raw["as4date"] ?? "");
  const time = String(raw["AS4TIME"] ?? raw["as4time"] ?? "");
  return {
    transportNumber: String(raw["TRKORR"] ?? raw["trkorr"] ?? raw["Name"] ?? ""),
    description: String(raw["AS4TEXT"] ?? raw["as4text"] ?? raw["Description"] ?? ""),
    type: mapType(String(raw["CATEGORY"] ?? raw["category"] ?? raw["Category"] ?? "")),
    status: mapStatus(String(raw["TRSTATUS"] ?? raw["trstatus"] ?? raw["Status"] ?? "")),
    owner: String(raw["AS4USER"] ?? raw["as4user"] ?? raw["Owner"] ?? ""),
    targetSystem: String(raw["TARSYSTEM"] ?? raw["tarsystem"] ?? raw["TargetSystem"] ?? ""),
    createdAt: parseSapDateTime(date, time),
  };
}

export function mapTransportTask(raw: Record<string, unknown>): TransportTask {
  const date = String(raw["AS4DATE"] ?? "");
  const time = String(raw["AS4TIME"] ?? "");
  return {
    taskNumber: String(raw["TRKORR"] ?? raw["Name"] ?? ""),
    description: String(raw["AS4TEXT"] ?? raw["Description"] ?? ""),
    owner: String(raw["AS4USER"] ?? raw["Owner"] ?? ""),
    status: mapStatus(String(raw["TRSTATUS"] ?? raw["Status"] ?? "")),
  };
}

export function mapTransportObject(raw: Record<string, unknown>): TransportObject {
  return {
    objectType: String(raw["OBJECT"] ?? raw["Type"] ?? ""),
    objectName: String(raw["OBJ_NAME"] ?? raw["Name"] ?? ""),
    programId: mapProgramId(String(raw["PGMID"] ?? raw["ProgramId"] ?? "")),
  };
}

export function mapImportQueueEntry(raw: Record<string, unknown>): ImportQueueEntry {
  const date = String(raw["AS4DATE"] ?? "");
  const time = String(raw["AS4TIME"] ?? "");
  return {
    transportNumber: String(raw["TRKORR"] ?? raw["Name"] ?? ""),
    description: String(raw["AS4TEXT"] ?? raw["Description"] ?? ""),
    owner: String(raw["AS4USER"] ?? raw["Owner"] ?? ""),
    targetSystem: String(raw["TARSYSTEM"] ?? raw["TargetSystem"] ?? ""),
    queuedAt: parseSapDateTime(date, time),
  };
}

/**
 * Converts SAP date (YYYYMMDD) + time (HHMMSS) to ISO 8601.
 * Returns empty string if both are missing or zero-padded defaults.
 */
export function parseSapDateTime(date: string, time: string): string {
  if (!date || date === "00000000") return "";
  const y = date.slice(0, 4);
  const mo = date.slice(4, 6);
  const d = date.slice(6, 8);
  const hh = time.slice(0, 2) || "00";
  const mm = time.slice(2, 4) || "00";
  const ss = time.slice(4, 6) || "00";
  return `${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`;
}
