#!/bin/bash
# ============================================================
# RAG_01 TEST SCRIPT
# ============================================================
# Uso: ./test_rag01.sh
# ============================================================

N8N_BASE_URL="https://n8n.stax.ink"
WEBHOOK_PATH="/webhook/rag-ingest-document"
FULL_URL="${N8N_BASE_URL}${WEBHOOK_PATH}"

echo "=================================================="
echo "🧪 RAG_01 DOCUMENT INGESTION - TEST"
echo "=================================================="
echo ""

# Test 1: Documento válido
echo "📝 Test 1: Documento válido (schedule)"
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST "${FULL_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "title": "Horarios de Atención",
    "content": "Nuestra clínica atiende de lunes a viernes de 8:00 AM a 8:00 PM, y sábados de 9:00 AM a 2:00 PM. Los domingos y festivos estamos cerrados.",
    "source_type": "schedule",
    "status": "published",
    "language": "es",
    "metadata": {"version": "1.0", "author": "admin"}
  }')

echo "$RESPONSE" | jq '.'
echo ""

# Verificar success
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "✅ Test 1: PASÓ"
  DOCUMENT_ID=$(echo "$RESPONSE" | jq -r '.data.document_id')
  echo "📄 Document ID: $DOCUMENT_ID"
else
  echo "❌ Test 1: FALLÓ"
  ERROR=$(echo "$RESPONSE" | jq -r '.error_message')
  echo "⚠️  Error: $ERROR"
fi
echo ""

# Test 2: Documento válido (policy)
echo "📝 Test 2: Documento válido (policy)"
echo "--------------------------------------"
RESPONSE=$(curl -s -X POST "${FULL_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "title": "Política de Cancelación",
    "content": "Las reservas pueden cancelarse sin cargo hasta 24 horas antes de la cita. Cancelaciones con menos de 24 horas tendrán un cargo del 50% del valor.",
    "source_type": "policy",
    "status": "published",
    "language": "es"
  }')

echo "$RESPONSE" | jq '.'
echo ""

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "✅ Test 2: PASÓ"
else
  echo "❌ Test 2: FALLÓ"
fi
echo ""

# Test 3: Documento inválido (provider_id negativo)
echo "📝 Test 3: Documento inválido (provider_id negativo)"
echo "-----------------------------------------------------"
RESPONSE=$(curl -s -X POST "${FULL_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": -1,
    "title": "Test Invalido",
    "content": "Este documento no debería guardarse"
  }')

echo "$RESPONSE" | jq '.'
echo ""

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "false" ]; then
  echo "✅ Test 3: PASÓ (correctamente rechazado)"
else
  echo "❌ Test 3: FALLÓ (debería haber sido rechazado)"
fi
echo ""

# Test 4: Documento inválido (content muy corto)
echo "📝 Test 4: Documento inválido (content muy corto)"
echo "--------------------------------------------------"
RESPONSE=$(curl -s -X POST "${FULL_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "title": "Test",
    "content": "Corto"
  }')

echo "$RESPONSE" | jq '.'
echo ""

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "false" ]; then
  echo "✅ Test 4: PASÓ (correctamente rechazado)"
else
  echo "❌ Test 4: FALLÓ (debería haber sido rechazado)"
fi
echo ""

echo "=================================================="
echo "📊 RESUMEN DE TESTS"
echo "=================================================="
echo "Verificar en base de datos:"
echo ""
echo "SELECT id, title, source_type, status, created_at"
echo "FROM rag_documents"
echo "ORDER BY created_at DESC"
echo "LIMIT 5;"
echo ""
echo "=================================================="
