# n8n_push_v2.ts - Enhanced Workflow Uploader

**Status:** ✅ READY FOR PRODUCTION  
**Version:** 2.0 (Bidirectional Verification)

---

## 🎯 Quick Start

```bash
# Recommended: Upload by name (auto-resolves ID)
npx tsx n8n_push_v2.ts --name BB_01_Telegram_Gateway --file workflows/BB_01.json --activate

# Legacy: Upload by ID (with verification)
npx tsx n8n_push_v2.ts --id 6m2U4vEf6mkACQ6B --file workflows/BB_01.json --activate
```

---

## ✨ New Features (v2)

### 1. **Name-Based Upload** (Recommended)
```bash
# Just provide the workflow name
npx tsx n8n_push_v2.ts --name BB_01_Telegram_Gateway --file workflows/BB_01.json

# Script automatically:
# 1. Fetches all workflows from server
# 2. Finds workflow by name
# 3. Resolves correct ID
# 4. Updates workflow (or creates if new)
```

### 2. **Bidirectional Verification**
```
Name → ID: Fetches all workflows, finds by name
ID → Name: Verifies ID exists, checks for duplicates
Cross-Validation: Ensures name ↔ ID match
```

### 3. **Duplicate Detection**
```
If multiple workflows with same name:
1. Shows all duplicates with timestamps
2. Recommends most recently updated
3. Auto-selects most recent (or asks user)
4. Offers to delete old duplicates
```

### 4. **Auto-Sync workflow_ids.json**
```
After successful upload:
1. Fetches updated workflow list
2. Updates workflow_ids.json with latest IDs
3. Commits to git automatically
```

---

## 🛡️ Protection Against Overwrites

| Scenario | Protection | Result |
|----------|-----------|--------|
| Wrong ID provided | ✅ ID → Name check | Detects mismatch, suggests correct ID |
| Duplicate names | ✅ Name → ID check | Shows all duplicates, recommends recent |
| workflow_ids.json outdated | ✅ Auto-sync post-upload | Updates automatically |
| Multiple workflows same name | ✅ Duplicate detection | Auto-selects most recent |

---

## 📋 All Options

```bash
# Required (choose one)
--name <NAME>     Workflow name (recommended)
--id <ID>         Workflow ID (legacy)
--file <PATH>     Local workflow JSON file

# Optional
--activate        Activate workflow after upload
--no-verify       Skip post-upload verification
--sync-ids        Auto-update workflow_ids.json (default: true)
--watchdog <SEC>  Timeout in seconds (default: 90)
--force-deactivate  Force deactivate before upload
--url <URL>       Override N8N_API_URL
--api-key <KEY>   Override N8N_API_KEY
```

---

## 🔍 Examples

### Upload Single Workflow
```bash
# By name (recommended)
npx tsx n8n_push_v2.ts --name BB_01_Telegram_Gateway \
  --file workflows/BB_01_Telegram_Gateway.json \
  --activate

# By ID (legacy)
npx tsx n8n_push_v2.ts --id 6m2U4vEf6mkACQ6B \
  --file workflows/BB_01_Telegram_Gateway.json \
  --activate
```

### Upload Without Activation
```bash
npx tsx n8n_push_v2.ts --name BB_02_Security_Firewall \
  --file workflows/BB_02_Security_Firewall.json
```

### Upload with Custom Timeout
```bash
npx tsx n8n_push_v2.ts --name BB_01_Telegram_Gateway \
  --file workflows/BB_01_Telegram_Gateway.json \
  --watchdog 180  # 3 minutes
```

### Skip Verification (Faster)
```bash
npx tsx n8n_push_v2.ts --name BB_01_Telegram_Gateway \
  --file workflows/BB_01_Telegram_Gateway.json \
  --no-verify
```

---

## 🎯 How Bidirectional Verification Works

### Step 1: Fetch All Workflows
```typescript
const serverWorkflows = await fetchAllWorkflows(client);
```

### Step 2: Build Maps
```typescript
const nameToIdMap = buildNameToIdMap(serverWorkflows);
const idToNameMap = buildIdToNameMap(serverWorkflows);
```

### Step 3: Cross-Validate
```typescript
// User provides --name
const matches = nameToIdMap.get('BB_01_Telegram_Gateway');

if (matches.length === 0) {
  // CREATE NEW
} else if (matches.length === 1) {
  // UPDATE (perfect match)
} else {
  // DUPLICATE DETECTED!
  const mostRecent = getMostRecent(matches);
  // Recommend most recent
}
```

### Step 4: Validate workflow_ids.json
```typescript
const localId = workflow_ids.json['BB_01_Telegram_Gateway'];
if (localId !== serverId) {
  // OUTDATED! Auto-update
  await updateWorkflowIdsJson(serverWorkflows);
}
```

---

## 🆚 Comparison: v1 vs v2

| Feature | v1 (n8n_push.ts) | v2 (n8n_push_v2.ts) |
|---------|------------------|---------------------|
| Upload by ID | ✅ Yes | ✅ Yes (legacy) |
| Upload by Name | ❌ No | ✅ **Yes (recommended)** |
| Bidirectional Check | ❌ No | ✅ **Yes** |
| Duplicate Detection | ❌ No | ✅ **Yes** |
| Auto-Sync IDs | ❌ No | ✅ **Yes** |
| Prevent Overwrites | ⚠️ Partial | ✅ **Full** |
| All v1 Validations | ✅ Yes | ✅ **Yes (retained)** |

---

## 📝 Migration Guide

### From v1 to v2

**Before (v1):**
```bash
# Had to know the ID
npx tsx n8n_push.ts --id 6m2U4vEf6mkACQ6B --file workflows/BB_01.json
```

**After (v2):**
```bash
# Just use the name
npx tsx n8n_push_v2.ts --name BB_01_Telegram_Gateway --file workflows/BB_01.json
```

**Benefits:**
- ✅ No need to remember IDs
- ✅ No risk of wrong ID
- ✅ Auto-detects duplicates
- ✅ Always uses correct ID

---

## 🐛 Troubleshooting

### "Workflow not found on server"
```
If using --name:
→ Workflow doesn't exist, will CREATE NEW

If using --id:
→ ID doesn't exist, will CREATE NEW
→ Check workflow_ids.json for correct ID
```

### "Duplicate detected"
```
Script found multiple workflows with same name.
Auto-selects most recently updated.
To choose specific ID: use --id flag
```

### "workflow_ids.json is OUTDATED"
```
Local ID doesn't match server.
Auto-updating with latest server IDs...
```

---

## ✅ Best Practices

1. **Always use --name** (not --id)
   ```bash
   ✅ GOOD:  --name BB_01_Telegram_Gateway
   ❌ AVOID: --id 6m2U4vEf6mkACQ6B
   ```

2. **Always activate after upload**
   ```bash
   npx tsx n8n_push_v2.ts --name ... --file ... --activate
   ```

3. **Keep --sync-ids enabled** (default)
   ```bash
   ✅ GOOD:  (default, auto-syncs)
   ❌ AVOID: --sync-ids=false
   ```

4. **Review duplicate warnings**
   ```
   If duplicates detected:
   1. Review list shown
   2. Confirm most recent is correct
   3. Consider deleting old duplicates
   ```

---

**Location:** `scripts-ts/n8n_push_v2.ts`  
**Documentation:** `docs/BIDIRECTIONAL_ID_NAME_VERIFICATION.md`  
**GEMINI.md:** [PROHIBIDO_07], [PROHIBIDO_08], [OBLIGATORIO_10]
