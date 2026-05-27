# SAP Transport MCP

MCP server for SAP Change and Transport System (CTS). Gives Claude governed, auditable access to transport requests — list, inspect, create, release, and delete — via the SAP ADT REST API.

Built on [`sap-mcp-server-template`](https://github.com/Nidhideep/sap-mcp-server-template) and governed by the [SAP MCP Server Standard](../personal-enterprise-brain/ontology/mcp/sap-mcp-standard.md).

---

## What It Does

- Lists open and released transport requests
- Inspects transport contents (tasks, ABAP objects)
- Checks import queue on target systems (QA, PRD)
- Creates new transport requests with governance-validated descriptions
- Releases transports for import — with mandatory object verification and user confirmation
- Deletes unreleased transports — blocked if already released
- Supports multi-system DEV/QA/PRD in a single server instance

---

## Tech Stack

- TypeScript + Node.js ≥18
- `@modelcontextprotocol/sdk` — MCP server
- `axios` — HTTP client (supports mTLS for X.509 cert auth)
- `fast-xml-parser` — SAP ADT XML response handling
- `zod` — runtime schema validation
- SAP ADT REST API (`/sap/bc/adt/cts/`) over HTTPS

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| Node.js | v18 or later |
| SAP user | `S_ADT_RES` authorization, role `SAP_BC_DWB_ABAPDEVELOPER` |
| ICF service | `/sap/bc/adt/` activated in transaction SICF |
| Network | HTTPS access to SAP host |

---

## Setup

### 1. Clone

```bash
git clone https://github.com/Nidhideep/sap-transport-mcp
cd sap-transport-mcp
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your SAP system details
```

Minimum `.env`:
```env
SAP_HOSTNAME=your-sap-host.example.com
SAP_SYSNR=00
SAP_CLIENT=100
AUTH_METHOD=basic
SAP_USERNAME=your_user
SAP_PASSWORD=your_password
```

### 3. Build

```bash
npm run build
```

### 4. Register with Claude Code

```bash
cp .mcp.example.json .mcp.json
# Edit .mcp.json — set the absolute path to dist/index.js
```

---

## Available Tools

### Read Tools

| Tool | Description |
|------|-------------|
| `transport_list_systems` | List configured SAP systems |
| `transport_list_requests` | List transport requests (filter by owner/status) |
| `transport_get_request` | Full transport details: tasks, objects, status |
| `transport_list_objects` | ABAP objects in a transport |
| `transport_check_import_queue` | Pending imports on a target system |

### Write Tools

| Tool | Description | Risk |
|------|-------------|------|
| `transport_create_request` | Create a new transport request | Low |
| `transport_release_request` | Release transport for import | **High — irreversible** |
| `transport_delete_request` | Delete an unreleased transport | High |

---

## Standard Workflow

```
1. transport_list_systems       → confirm systemId values
2. transport_list_requests      → find open transports
3. transport_get_request        → inspect contents
4. transport_list_objects       → verify ABAP objects
5. transport_check_import_queue → check target system queue
6. [user confirms]
7. transport_release_request    → release with policy checks + verify
```

See [examples/release-workflow.md](examples/release-workflow.md) for a full walkthrough.

---

## Multi-System Setup (DEV / QA / PRD)

Set `SYSTEMS_CONFIG` in `.env`:

```env
SYSTEMS_CONFIG=[
  {"id":"DEV","hostname":"dev.sap.co","sysnr":"00","client":"100","language":"EN","isDefault":true},
  {"id":"QA","hostname":"qa.sap.co","sysnr":"01","client":"200","language":"EN","isDefault":false}
]
```

Every tool accepts an optional `systemId` parameter. Omit it to use the default system.

---

## Governance Rules

- Release is irreversible — Claude requires explicit user confirmation + shows full object list
- Empty transports (0 objects) cannot be released
- Released transports cannot be deleted
- Transport description must be ≥10 characters
- All writes are audit-logged (stderr JSON with timestamp, transport number, object count)
- `DRY_RUN=true` blocks all write tools — use for testing

See [docs/governance.md](docs/governance.md) for full policy details.

---

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md) for:
- Auth failures (Basic/certificate)
- Connection errors (VPN, port, ICF activation)
- CSRF token issues
- Policy violation errors

---

## Reference

- [SAP MCP Server Standard](../personal-enterprise-brain/ontology/mcp/sap-mcp-standard.md)
- [Transport Field Reference](docs/transport-field-reference.md)
- [Authentication Setup](docs/authentication.md)
- [Governance Policy](docs/governance.md)
- [Release Workflow Example](examples/release-workflow.md)
