#!/bin/bash
PROJECT_ROOT="/home/manager/Sync/N8N_Projects/booking-titanium"
SEED_DIR="$PROJECT_ROOT/workflows/seed_clean"

cd "$PROJECT_ROOT"

for file in "$SEED_DIR"/*.json; do
    echo "Processing $file..."
    WF_NAME=$(grep -o '"name": "[^"]*"' "$file" | head -1 | cut -d'"' -f4)
    if [ -z "$WF_NAME" ]; then
        echo "Error: Could not find name in $file"
        continue
    fi
    echo "Pushing $WF_NAME from $file..."
    npx tsx scripts-ts/n8n_push_v2.ts --name "$WF_NAME" --file "$file" --no-verify
done
