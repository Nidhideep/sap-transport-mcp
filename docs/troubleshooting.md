# Troubleshooting

---

## Server Not Discovered by Claude

1. Run `npm run build` — `dist/index.js` must exist
2. Path in `.mcp.json` must be absolute
3. Restart Claude Code after editing `.mcp.json`
4. Test manually: `node dist/index.js` — should print `[sap-transport-mcp] server running on stdio`

---

## Authentication Failures (HTTP 401/403)

**Basic auth:**
- Verify `SAP_USERNAME` and `SAP_PASSWORD` in `.env`
- Confirm user is not locked in SAP (transaction SU01)
- Check `SAP_CLIENT` matches your logon client

**Certificate auth:**
- Confirm `CERT_THUMBPRINT` matches the cert in SAP STRUST
- Check the cert is in your OS keychain (not expired)
- On macOS: `security find-certificate -a -Z ~/Library/Keychains/login.keychain-db`

**CSRF 403 on writes:**
- ADT CSRF token may have expired — the client auto-retries once
- If persistent, check that ICF `/sap/bc/adt/` is active (transaction SICF)

---

## Connection Errors (ECONNREFUSED / ETIMEDOUT)

1. `curl -k https://${SAP_HOSTNAME}:${PORT}/sap/bc/adt/` — test reachability
2. Check VPN — on-prem SAP often requires VPN
3. Verify `SAP_HTTPS_PORT` if your system uses a non-standard port (443 for BTP/cloud)
4. Check `SAP_SYSNR` — port = 8000 + sysnr (e.g. sysnr=00 → port 8000)

---

## ICF Service Not Active

Error: `404 Not Found` on any ADT endpoint

Fix: In SAP, go to transaction SICF → navigate to `/sap/bc/adt/` → right-click → Activate Service.
Requires Basis admin access.

---

## Transport Not Found

Error: `SAP ADT error [404]`

- Verify the transport number format: `[A-Z]{3}K[0-9]{6}` (e.g. DEVK900123)
- Confirm you're querying the correct `systemId`
- The transport may exist on a different client

---

## Release Blocked: Empty Transport

Error: `Policy violation [EMPTY_TRANSPORT]`

Add ABAP objects to the transport via SAP GUI (SE09) or Eclipse ADT before releasing.

---

## Release Blocked: DRY_RUN

Error: `Policy violation [DRY_RUN]`

Set `DRY_RUN=false` in `.env` to enable live writes.

---

## XML Parse Errors

Some SAP ADT endpoints return XML even when `Accept: application/json` is sent.
`lib/adt-client.ts` handles this automatically. If you see raw XML in error messages,
enable debug logging: `LOG_LEVEL=debug` in `.env`.

---

## Debug Logging

```env
LOG_LEVEL=debug
```

Emits per-request logs to stderr. View in Claude Code developer console or your MCP log output.
