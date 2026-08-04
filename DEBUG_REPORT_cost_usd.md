# Debug Report: calls.cost_usd Always 0

## 1. All Writes to `calls` Table

### Files that write to `calls` table:

1. **web/src/app/api/webhooks/vapi/route.ts** (PRIMARY WEBHOOK HANDLER)
   - Line 114-122: `UPDATE` for `end-of-call-report` events (writes `cost_usd`)
   - Line 131-143: `UPSERT` for non-final events (does NOT write `cost_usd`)

2. **All other files are READ-ONLY** (select queries only):
   - `web/src/app/(app)/dashboard/calls/[callId]/page.tsx` - SELECT only
   - `web/src/app/(app)/dashboard/calls/page.tsx` - SELECT only
   - `web/src/app/api/admin/agents/[agentId]/route.ts` - SELECT only
   - `web/src/app/(app)/dashboard/analytics/page.tsx` - SELECT only
   - `web/src/app/(app)/dashboard/leads/[leadId]/page.tsx` - SELECT only
   - `web/src/app/api/admin/calls/[callId]/route.ts` - SELECT only
   - `web/src/app/api/admin/agents/[agentId]/kpi/route.ts` - SELECT only
   - `web/src/app/api/admin/agents/[agentId]/calls/route.ts` - SELECT only
   - `web/src/app/api/admin/calls/route.ts` - SELECT only
   - `web/src/app/admin/page.tsx` - SELECT only

**Conclusion**: Only the webhook route writes to `calls` table.

---

## 2. Webhook Route Verification

**Route**: `web/src/app/api/webhooks/vapi/route.ts`
- **Path**: `/api/webhooks/vapi`
- **Method**: POST
- **Status**: ✅ Only one route found (no shadowing)

---

## 3. Non-Final Event Handler Analysis

**Location**: `web/src/app/api/webhooks/vapi/route.ts` lines 130-146

**Current behavior**:
- Uses `UPSERT` with `onConflict: "vapi_call_id"`
- **Does NOT include `cost_usd` in payload** ✅ (Good - won't overwrite with 0)
- Only writes: `vapi_call_id`, `org_id`, `agent_id`, `direction`, `from_phone`, `to_phone`, `status`, `started_at`, `raw_payload`

**Conclusion**: Non-final events are NOT setting `cost_usd` to 0. ✅

---

## 4. Critical Bugs Found

### BUG #1: Variable Shadowing (CRITICAL)
**Location**: Line 102-106 in final event handler

**Problem**: `vapiCallId` is re-declared inside the `if` block, shadowing the outer scope variable. This means:
- If `call?.id` is null in final event (which it often is), the UPDATE uses `null`
- UPDATE query: `.eq("vapi_call_id", null)` matches 0 rows
- Cost never gets written

**Fix Applied**: Removed inner `vapiCallId` declaration, using outer scope variable.

### BUG #2: extractCost Returns 0 Instead of null
**Location**: Line 27-40

**Problem**: When cost is not found, function returns `0` instead of `null`. This means:
- If cost is missing, UPDATE writes `cost_usd = 0`
- This overwrites any existing cost value

**Fix Applied**: Changed to return `null` when cost not found.

### BUG #3: Insufficient Logging
**Problem**: No logging of:
- Event type
- Resolved vapiCallId
- Whether UPDATE matched any rows
- Affected row count

**Fix Applied**: Added comprehensive logging.

---

## 5. SQL Queries for Database Debugging

### Check for Triggers on `calls` table:
```sql
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'calls';
```

### Verify Recent Updates for a Specific Call:
```sql
-- Replace 'YOUR_VAPI_CALL_ID' with actual vapi_call_id
SELECT 
  id,
  vapi_call_id,
  cost_usd,
  outcome,
  ended_at,
  updated_at,
  created_at
FROM calls
WHERE vapi_call_id = 'YOUR_VAPI_CALL_ID'
ORDER BY updated_at DESC NULLS LAST, created_at DESC;
```

### Check All Calls with cost_usd = 0:
```sql
SELECT 
  id,
  vapi_call_id,
  cost_usd,
  outcome,
  ended_at,
  created_at,
  updated_at
FROM calls
WHERE cost_usd = 0 OR cost_usd IS NULL
ORDER BY created_at DESC
LIMIT 50;
```

### Check Update History (if audit table exists):
```sql
-- If you have an audit/history table
SELECT * FROM calls_history
WHERE vapi_call_id = 'YOUR_VAPI_CALL_ID'
ORDER BY updated_at DESC;
```

### Verify Row Exists Before UPDATE:
```sql
-- Check if row exists with the vapi_call_id
SELECT 
  id,
  vapi_call_id,
  cost_usd,
  created_at
FROM calls
WHERE vapi_call_id = 'YOUR_VAPI_CALL_ID';
```

---

## 6. Root Cause Conclusion

**PRIMARY ROOT CAUSE: UPDATE matches 0 rows (ID mismatch)**

### Evidence:
1. **Variable Shadowing Bug**: The final event handler re-declares `vapiCallId` inside the `if` block
2. **Final events may not have `call.id`**: According to requirements, final `end-of-call-report` may use `message.summary_table.id` or `message.id` instead
3. **If `call?.id` is null**: The inner `vapiCallId` becomes null, causing UPDATE to match 0 rows
4. **Non-final events don't write cost**: ✅ Confirmed - they don't include `cost_usd` in UPSERT

### Secondary Issues:
- `extractCost` returning `0` instead of `null` when cost missing (could overwrite with 0)
- Insufficient logging makes debugging difficult

### Fixes Applied:
1. ✅ Removed variable shadowing - use outer `vapiCallId`
2. ✅ Changed `extractCost` to return `null` instead of `0`
3. ✅ Added comprehensive logging:
   - Event type
   - Resolved vapiCallId from all sources
   - Cost extraction details
   - UPDATE result with affected row count
   - Warning if UPDATE matches 0 rows

### Next Steps for Verification:
1. Monitor logs for `[FINAL UPDATE RESULT]` - check `affectedRows`
2. If `affectedRows: 0`, check the `vapiCallId` value in logs
3. Run SQL query to verify row exists with that `vapi_call_id`
4. Check if `vapi_call_id` values differ between UPSERT (non-final) and UPDATE (final)

---

## 7. Additional Debugging Steps

### Check Logs For:
```
[WEBHOOK EVENT] - Shows event type and resolved IDs
[FINAL COST DEBUG] - Shows cost extraction
[FINAL UPDATE RESULT] - Shows affected rows (CRITICAL)
[CRITICAL] - Warning if UPDATE matched 0 rows
```

### If UPDATE Still Fails:
1. Compare `vapiCallId` from `[WEBHOOK EVENT]` (non-final) vs `[FINAL COST DEBUG]` (final)
2. If they differ, that's the root cause - ID normalization issue
3. Check if `vapi_call_id` column has any constraints or defaults
4. Verify no database triggers are resetting `cost_usd` to 0

