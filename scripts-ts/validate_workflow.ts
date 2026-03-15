#!/usr/bin/env npx tsx
// ══════════════════════════════════════════════════════════════
// validate_workflow.ts v2 — N8N Workflow Validator con Live Discovery
//
// Consulta tu instancia n8n real para obtener los node types
// instalados y sus versiones disponibles. Valida contra eso.
//
// Uso:
//   npx tsx scripts-ts/validate_workflow.ts <workflow.json>
//   npx tsx scripts-ts/validate_workflow.ts <workflow.json> --live
//   npx tsx scripts-ts/validate_workflow.ts <workflow.json> --refresh
//   npx tsx scripts-ts/validate_workflow.ts --discover-only
//
// Flags:
//   --live          Consulta la API en cada ejecución (no usa caché)
//   --refresh       Fuerza re-descubrimiento y actualiza caché
//   --discover-only Solo descubre node types y guarda caché (no valida)
//   --verbose       Muestra detalles extra de discovery
//   --help          Muestra ayuda
//
// Requiere .env con:
//   N8N_API_URL=https://n8n.stax.ink
//   N8N_API_KEY=tu-api-key
//   N8N_ACCESS_TOKEN=tu-access-token
//
// Compatible: n8n v2.10.2+
// ══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "fs";
import { basename, resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── __dirname para ESM ───────────────────────────────────────
const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);

// ─── Colores ANSI ─────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
};

// ─── Tipos ────────────────────────────────────────────────────
interface N8NNode {
  id?: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
}

interface N8NConnectionTarget {
  node: string;
  type: string;
  index: number;
}

type N8NConnections = Record<string, Record<string, N8NConnectionTarget[][]>>;

interface N8NWorkflow {
  id?: string;
  name?: string;
  nodes?: N8NNode[];
  connections?: N8NConnections;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  tags?: unknown[];
  pinData?: Record<string, unknown>;
}

type Severity = "FATAL" | "ERROR" | "WARN" | "INFO";

interface Finding {
  severity: Severity;
  category: string;
  message: string;
  node?: string;
  fix?: string;
}

interface DiscoveredNodeType {
  displayName: string;
  availableVersions: number[];
  latestVersion: number;
  group: string[];
  description?: string;
}

interface NodeTypeCache {
  discoveredAt: string;
  n8nBaseUrl: string;
  totalTypes: number;
  nodeTypes: Record<string, DiscoveredNodeType>;
}

interface EnvConfig {
  apiUrl: string;
  apiKey: string;
  accessToken: string;
}

interface ResolvedSOT {
  source: "live" | "cache" | "fallback";
  sourceDetail: string;
  nodeTypes: Record<string, DiscoveredNodeType>;
}

// ─── Fallback SOT (cuando la API no está disponible) ──────────
const FALLBACK_SOT: Record<
  string,
  { min: number; recommended: number; label: string }
> = {
  "@n8n/n8n-nodes-langchain.agent": { min: 3.1, recommended: 3.1, label: "AI Agent" },
  "@n8n/n8n-nodes-langchain.agentTool": { min: 3, recommended: 3, label: "AI Agent Tool" },
  "@n8n/n8n-nodes-langchain.anthropic": { min: 1, recommended: 1, label: "Anthropic" },
  "@n8n/n8n-nodes-langchain.chainLlm": { min: 1.9, recommended: 1.9, label: "Basic LLM Chain" },
  "@n8n/n8n-nodes-langchain.chainRetrievalQa": { min: 1.7, recommended: 1.7, label: "Question and Answer Chain" },
  "@n8n/n8n-nodes-langchain.chainSummarization": { min: 2.1, recommended: 2.1, label: "Summarization Chain" },
  "@n8n/n8n-nodes-langchain.chat": { min: 1.2, recommended: 1.2, label: "Chat" },
  "@n8n/n8n-nodes-langchain.chatTrigger": { min: 1.4, recommended: 1.4, label: "Chat Trigger" },
  "@n8n/n8n-nodes-langchain.code": { min: 1, recommended: 1, label: "LangChain Code" },
  "@n8n/n8n-nodes-langchain.documentBinaryInputLoader": { min: 1, recommended: 1, label: "Binary Input Loader" },
  "@n8n/n8n-nodes-langchain.documentDefaultDataLoader": { min: 1.1, recommended: 1.1, label: "Default Data Loader" },
  "@n8n/n8n-nodes-langchain.documentGithubLoader": { min: 1.1, recommended: 1.1, label: "GitHub Document Loader" },
  "@n8n/n8n-nodes-langchain.documentJsonInputLoader": { min: 1, recommended: 1, label: "JSON Input Loader" },
  "@n8n/n8n-nodes-langchain.embeddingsAwsBedrock": { min: 1, recommended: 1, label: "Embeddings AWS Bedrock" },
  "@n8n/n8n-nodes-langchain.embeddingsAzureOpenAi": { min: 1, recommended: 1, label: "Embeddings Azure OpenAI" },
  "@n8n/n8n-nodes-langchain.embeddingsCohere": { min: 1, recommended: 1, label: "Embeddings Cohere" },
  "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini": { min: 1, recommended: 1, label: "Embeddings Google Gemini" },
  "@n8n/n8n-nodes-langchain.embeddingsGoogleVertex": { min: 1, recommended: 1, label: "Embeddings Google Vertex" },
  "@n8n/n8n-nodes-langchain.embeddingsHuggingFaceInference": { min: 1, recommended: 1, label: "Embeddings Hugging Face Inference" },
  "@n8n/n8n-nodes-langchain.embeddingsLemonade": { min: 1, recommended: 1, label: "Embeddings Lemonade" },
  "@n8n/n8n-nodes-langchain.embeddingsMistralCloud": { min: 1, recommended: 1, label: "Embeddings Mistral Cloud" },
  "@n8n/n8n-nodes-langchain.embeddingsOllama": { min: 1, recommended: 1, label: "Embeddings Ollama" },
  "@n8n/n8n-nodes-langchain.embeddingsOpenAi": { min: 1.2, recommended: 1.2, label: "Embeddings OpenAI" },
  "@n8n/n8n-nodes-langchain.googleGemini": { min: 1.1, recommended: 1.1, label: "Google Gemini" },
  "@n8n/n8n-nodes-langchain.guardrails": { min: 2, recommended: 2, label: "Guardrails" },
  "@n8n/n8n-nodes-langchain.informationExtractor": { min: 1.2, recommended: 1.2, label: "Information Extractor" },
  "@n8n/n8n-nodes-langchain.lmChatAnthropic": { min: 1.3, recommended: 1.3, label: "Anthropic Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatAwsBedrock": { min: 1.1, recommended: 1.1, label: "AWS Bedrock Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatAzureOpenAi": { min: 1, recommended: 1, label: "Azure OpenAI Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatCohere": { min: 1, recommended: 1, label: "Cohere Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatDeepSeek": { min: 1, recommended: 1, label: "DeepSeek Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatGoogleGemini": { min: 1, recommended: 1, label: "Google Gemini Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatGoogleVertex": { min: 1, recommended: 1, label: "Google Vertex Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatGroq": { min: 1, recommended: 1, label: "Groq Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatLemonade": { min: 1, recommended: 1, label: "Lemonade Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatMistralCloud": { min: 1, recommended: 1, label: "Mistral Cloud Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatOllama": { min: 1, recommended: 1, label: "Ollama Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatOpenAi": { min: 1.3, recommended: 1.3, label: "OpenAI Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatOpenRouter": { min: 1, recommended: 1, label: "OpenRouter Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatVercelAiGateway": { min: 1, recommended: 1, label: "Vercel AI Gateway Chat Model" },
  "@n8n/n8n-nodes-langchain.lmChatXAiGrok": { min: 1, recommended: 1, label: "xAI Grok Chat Model" },
  "@n8n/n8n-nodes-langchain.lmCohere": { min: 1, recommended: 1, label: "Cohere Model" },
  "@n8n/n8n-nodes-langchain.lmLemonade": { min: 1, recommended: 1, label: "Lemonade Model" },
  "@n8n/n8n-nodes-langchain.lmOllama": { min: 1, recommended: 1, label: "Ollama Model" },
  "@n8n/n8n-nodes-langchain.lmOpenAi": { min: 1, recommended: 1, label: "OpenAI Model" },
  "@n8n/n8n-nodes-langchain.lmOpenHuggingFaceInference": { min: 1, recommended: 1, label: "Hugging Face Inference Model" },
  "@n8n/n8n-nodes-langchain.manualChatTrigger": { min: 1.1, recommended: 1.1, label: "Manual Chat Trigger" },
  "@n8n/n8n-nodes-langchain.mcpClient": { min: 1, recommended: 1, label: "MCP Client" },
  "@n8n/n8n-nodes-langchain.mcpClientTool": { min: 1.2, recommended: 1.2, label: "MCP Client Tool" },
  "@n8n/n8n-nodes-langchain.mcpTrigger": { min: 2, recommended: 2, label: "MCP Server Trigger" },
  "@n8n/n8n-nodes-langchain.memoryBufferWindow": { min: 1.3, recommended: 1.3, label: "Simple Memory" },
  "@n8n/n8n-nodes-langchain.memoryChatRetriever": { min: 1, recommended: 1, label: "Chat Messages Retriever" },
  "@n8n/n8n-nodes-langchain.memoryManager": { min: 1.1, recommended: 1.1, label: "Chat Memory Manager" },
  "@n8n/n8n-nodes-langchain.memoryMongoDbChat": { min: 1, recommended: 1, label: "MongoDB Chat Memory" },
  "@n8n/n8n-nodes-langchain.memoryMotorhead": { min: 1.3, recommended: 1.3, label: "Motorhead" },
  "@n8n/n8n-nodes-langchain.memoryPostgresChat": { min: 1.3, recommended: 1.3, label: "Postgres Chat Memory" },
  "@n8n/n8n-nodes-langchain.memoryRedisChat": { min: 1.5, recommended: 1.5, label: "Redis Chat Memory" },
  "@n8n/n8n-nodes-langchain.memoryXata": { min: 1.4, recommended: 1.4, label: "Xata" },
  "@n8n/n8n-nodes-langchain.memoryZep": { min: 1.3, recommended: 1.3, label: "Zep" },
  "@n8n/n8n-nodes-langchain.microsoftAgent365Trigger": { min: 1, recommended: 1, label: "Microsoft Agent 365 Trigger" },
  "@n8n/n8n-nodes-langchain.modelSelector": { min: 1, recommended: 1, label: "Model Selector" },
  "@n8n/n8n-nodes-langchain.ollama": { min: 1, recommended: 1, label: "Ollama" },
  "@n8n/n8n-nodes-langchain.openAi": { min: 2.1, recommended: 2.1, label: "OpenAI" },
  "@n8n/n8n-nodes-langchain.openAiAssistant": { min: 1.1, recommended: 1.1, label: "OpenAI Assistant" },
  "@n8n/n8n-nodes-langchain.outputParserAutofixing": { min: 1, recommended: 1, label: "Auto-fixing Output Parser" },
  "@n8n/n8n-nodes-langchain.outputParserItemList": { min: 1, recommended: 1, label: "Item List Output Parser" },
  "@n8n/n8n-nodes-langchain.outputParserStructured": { min: 1.3, recommended: 1.3, label: "Structured Output Parser" },
  "@n8n/n8n-nodes-langchain.rerankerCohere": { min: 1, recommended: 1, label: "Reranker Cohere" },
  "@n8n/n8n-nodes-langchain.retrieverContextualCompression": { min: 1, recommended: 1, label: "Contextual Compression Retriever" },
  "@n8n/n8n-nodes-langchain.retrieverMultiQuery": { min: 1, recommended: 1, label: "MultiQuery Retriever" },
  "@n8n/n8n-nodes-langchain.retrieverVectorStore": { min: 1, recommended: 1, label: "Vector Store Retriever" },
  "@n8n/n8n-nodes-langchain.retrieverWorkflow": { min: 1.1, recommended: 1.1, label: "Workflow Retriever" },
  "@n8n/n8n-nodes-langchain.sentimentAnalysis": { min: 1.1, recommended: 1.1, label: "Sentiment Analysis" },
  "@n8n/n8n-nodes-langchain.textClassifier": { min: 1.1, recommended: 1.1, label: "Text Classifier" },
  "@n8n/n8n-nodes-langchain.textSplitterCharacterTextSplitter": { min: 1, recommended: 1, label: "Character Text Splitter" },
  "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter": { min: 1, recommended: 1, label: "Recursive Character Text Splitter" },
  "@n8n/n8n-nodes-langchain.textSplitterTokenSplitter": { min: 1, recommended: 1, label: "Token Splitter" },
  "@n8n/n8n-nodes-langchain.toolCalculator": { min: 1, recommended: 1, label: "Calculator" },
  "@n8n/n8n-nodes-langchain.toolCode": { min: 1.3, recommended: 1.3, label: "Code Tool" },
  "@n8n/n8n-nodes-langchain.toolExecutor": { min: 1, recommended: 1, label: "Tool Executor" },
  "@n8n/n8n-nodes-langchain.toolHttpRequest": { min: 1.1, recommended: 1.1, label: "HTTP Request Tool" },
  "@n8n/n8n-nodes-langchain.toolSearXng": { min: 1, recommended: 1, label: "SearXNG" },
  "@n8n/n8n-nodes-langchain.toolSerpApi": { min: 1, recommended: 1, label: "SerpApi (Google Search)" },
  "@n8n/n8n-nodes-langchain.toolThink": { min: 1.1, recommended: 1.1, label: "Think Tool" },
  "@n8n/n8n-nodes-langchain.toolVectorStore": { min: 1.1, recommended: 1.1, label: "Vector Store Question Answer Tool" },
  "@n8n/n8n-nodes-langchain.toolWikipedia": { min: 1, recommended: 1, label: "Wikipedia" },
  "@n8n/n8n-nodes-langchain.toolWolframAlpha": { min: 1, recommended: 1, label: "Wolfram|Alpha" },
  "@n8n/n8n-nodes-langchain.toolWorkflow": { min: 2.2, recommended: 2.2, label: "Call n8n Sub-Workflow Tool" },
  "@n8n/n8n-nodes-langchain.vectorStoreAzureAISearch": { min: 1.3, recommended: 1.3, label: "Azure AI Search Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreChromaDB": { min: 1.3, recommended: 1.3, label: "Chroma Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreInMemory": { min: 1.3, recommended: 1.3, label: "Simple Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreInMemoryInsert": { min: 1, recommended: 1, label: "In Memory Vector Store Insert" },
  "@n8n/n8n-nodes-langchain.vectorStoreInMemoryLoad": { min: 1, recommended: 1, label: "In Memory Vector Store Load" },
  "@n8n/n8n-nodes-langchain.vectorStoreMilvus": { min: 1.3, recommended: 1.3, label: "Milvus Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreMongoDBAtlas": { min: 1.3, recommended: 1.3, label: "MongoDB Atlas Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStorePGVector": { min: 1.3, recommended: 1.3, label: "Postgres PGVector Store" },
  "@n8n/n8n-nodes-langchain.vectorStorePinecone": { min: 1.3, recommended: 1.3, label: "Pinecone Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStorePineconeInsert": { min: 1, recommended: 1, label: "Pinecone: Insert" },
  "@n8n/n8n-nodes-langchain.vectorStorePineconeLoad": { min: 1, recommended: 1, label: "Pinecone: Load" },
  "@n8n/n8n-nodes-langchain.vectorStoreQdrant": { min: 1.3, recommended: 1.3, label: "Qdrant Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreRedis": { min: 1.3, recommended: 1.3, label: "Redis Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreSupabase": { min: 1.3, recommended: 1.3, label: "Supabase Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreSupabaseInsert": { min: 1, recommended: 1, label: "Supabase: Insert" },
  "@n8n/n8n-nodes-langchain.vectorStoreSupabaseLoad": { min: 1, recommended: 1, label: "Supabase: Load" },
  "@n8n/n8n-nodes-langchain.vectorStoreWeaviate": { min: 1.3, recommended: 1.3, label: "Weaviate Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreZep": { min: 1.3, recommended: 1.3, label: "Zep Vector Store" },
  "@n8n/n8n-nodes-langchain.vectorStoreZepInsert": { min: 1, recommended: 1, label: "Zep Vector Store: Insert" },
  "@n8n/n8n-nodes-langchain.vectorStoreZepLoad": { min: 1, recommended: 1, label: "Zep Vector Store: Load" },
  "n8n-nodes-base.actionNetwork": { min: 1, recommended: 1, label: "Action Network" },
  "n8n-nodes-base.activeCampaign": { min: 1, recommended: 1, label: "ActiveCampaign" },
  "n8n-nodes-base.activeCampaignTrigger": { min: 1, recommended: 1, label: "ActiveCampaign Trigger" },
  "n8n-nodes-base.acuitySchedulingTrigger": { min: 1, recommended: 1, label: "Acuity Scheduling Trigger" },
  "n8n-nodes-base.adalo": { min: 1, recommended: 1, label: "Adalo" },
  "n8n-nodes-base.affinity": { min: 1, recommended: 1, label: "Affinity" },
  "n8n-nodes-base.affinityTrigger": { min: 1, recommended: 1, label: "Affinity Trigger" },
  "n8n-nodes-base.aggregate": { min: 1, recommended: 1, label: "Aggregate" },
  "n8n-nodes-base.agileCrm": { min: 1, recommended: 1, label: "Agile CRM" },
  "n8n-nodes-base.airtable": { min: 2.1, recommended: 2.1, label: "Airtable" },
  "n8n-nodes-base.airtableTrigger": { min: 1, recommended: 1, label: "Airtable Trigger" },
  "n8n-nodes-base.airtop": { min: 1, recommended: 1, label: "Airtop" },
  "n8n-nodes-base.aiTransform": { min: 1, recommended: 1, label: "AI Transform" },
  "n8n-nodes-base.amqp": { min: 1, recommended: 1, label: "AMQP Sender" },
  "n8n-nodes-base.amqpTrigger": { min: 1, recommended: 1, label: "AMQP Trigger" },
  "n8n-nodes-base.apiTemplateIo": { min: 1, recommended: 1, label: "APITemplate.io" },
  "n8n-nodes-base.asana": { min: 1, recommended: 1, label: "Asana" },
  "n8n-nodes-base.asanaTrigger": { min: 1, recommended: 1, label: "Asana Trigger" },
  "n8n-nodes-base.autopilot": { min: 1, recommended: 1, label: "Autopilot" },
  "n8n-nodes-base.autopilotTrigger": { min: 1, recommended: 1, label: "Autopilot Trigger" },
  "n8n-nodes-base.awsCertificateManager": { min: 1, recommended: 1, label: "AWS Certificate Manager" },
  "n8n-nodes-base.awsCognito": { min: 1, recommended: 1, label: "AWS Cognito" },
  "n8n-nodes-base.awsComprehend": { min: 1, recommended: 1, label: "AWS Comprehend" },
  "n8n-nodes-base.awsDynamoDb": { min: 1, recommended: 1, label: "AWS DynamoDB" },
  "n8n-nodes-base.awsElb": { min: 1, recommended: 1, label: "AWS ELB" },
  "n8n-nodes-base.awsIam": { min: 1, recommended: 1, label: "AWS IAM" },
  "n8n-nodes-base.awsLambda": { min: 1, recommended: 1, label: "AWS Lambda" },
  "n8n-nodes-base.awsRekognition": { min: 1, recommended: 1, label: "AWS Rekognition" },
  "n8n-nodes-base.awsS3": { min: 2, recommended: 2, label: "AwsS3" },
  "n8n-nodes-base.awsSes": { min: 1, recommended: 1, label: "AWS SES" },
  "n8n-nodes-base.awsSns": { min: 1, recommended: 1, label: "AWS SNS" },
  "n8n-nodes-base.awsSnsTrigger": { min: 1, recommended: 1, label: "AWS SNS Trigger" },
  "n8n-nodes-base.awsSqs": { min: 1, recommended: 1, label: "AWS SQS" },
  "n8n-nodes-base.awsTextract": { min: 1, recommended: 1, label: "AWS Textract" },
  "n8n-nodes-base.awsTranscribe": { min: 1, recommended: 1, label: "AWS Transcribe" },
  "n8n-nodes-base.azureCosmosDb": { min: 1, recommended: 1, label: "Azure Cosmos DB" },
  "n8n-nodes-base.azureStorage": { min: 1, recommended: 1, label: "Azure Storage" },
  "n8n-nodes-base.bambooHr": { min: 1, recommended: 1, label: "BambooHR" },
  "n8n-nodes-base.bannerbear": { min: 1, recommended: 1, label: "Bannerbear" },
  "n8n-nodes-base.baserow": { min: 1, recommended: 1, label: "Baserow" },
  "n8n-nodes-base.beeminder": { min: 1, recommended: 1, label: "Beeminder" },
  "n8n-nodes-base.bitbucketTrigger": { min: 1.1, recommended: 1.1, label: "Bitbucket Trigger" },
  "n8n-nodes-base.bitly": { min: 1, recommended: 1, label: "Bitly" },
  "n8n-nodes-base.bitwarden": { min: 1, recommended: 1, label: "Bitwarden" },
  "n8n-nodes-base.box": { min: 1, recommended: 1, label: "Box" },
  "n8n-nodes-base.boxTrigger": { min: 1, recommended: 1, label: "Box Trigger" },
  "n8n-nodes-base.Brandfetch": { min: 1, recommended: 1, label: "Brandfetch" },
  "n8n-nodes-base.bubble": { min: 1, recommended: 1, label: "Bubble" },
  "n8n-nodes-base.calendlyTrigger": { min: 1, recommended: 1, label: "Calendly Trigger" },
  "n8n-nodes-base.calTrigger": { min: 2, recommended: 2, label: "Cal.com Trigger" },
  "n8n-nodes-base.chargebee": { min: 1, recommended: 1, label: "Chargebee" },
  "n8n-nodes-base.chargebeeTrigger": { min: 1, recommended: 1, label: "Chargebee Trigger" },
  "n8n-nodes-base.circleCi": { min: 1, recommended: 1, label: "CircleCI" },
  "n8n-nodes-base.ciscoWebex": { min: 1, recommended: 1, label: "Webex by Cisco" },
  "n8n-nodes-base.ciscoWebexTrigger": { min: 1, recommended: 1, label: "Webex by Cisco Trigger" },
  "n8n-nodes-base.citrixAdc": { min: 1, recommended: 1, label: "Netscaler ADC" },
  "n8n-nodes-base.clearbit": { min: 1, recommended: 1, label: "Clearbit" },
  "n8n-nodes-base.clickUp": { min: 1, recommended: 1, label: "ClickUp" },
  "n8n-nodes-base.clickUpTrigger": { min: 1, recommended: 1, label: "ClickUp Trigger" },
  "n8n-nodes-base.clockify": { min: 1, recommended: 1, label: "Clockify" },
  "n8n-nodes-base.clockifyTrigger": { min: 1, recommended: 1, label: "Clockify Trigger" },
  "n8n-nodes-base.cloudflare": { min: 1, recommended: 1, label: "Cloudflare" },
  "n8n-nodes-base.cockpit": { min: 1, recommended: 1, label: "Cockpit" },
  "n8n-nodes-base.coda": { min: 1.1, recommended: 1.1, label: "Coda" },
  "n8n-nodes-base.code": { min: 2, recommended: 2, label: "Code" },
  "n8n-nodes-base.coinGecko": { min: 1, recommended: 1, label: "CoinGecko" },
  "n8n-nodes-base.compareDatasets": { min: 2.3, recommended: 2.3, label: "Compare Datasets" },
  "n8n-nodes-base.compression": { min: 1.1, recommended: 1.1, label: "Compression" },
  "n8n-nodes-base.contentful": { min: 1, recommended: 1, label: "Contentful" },
  "n8n-nodes-base.convertKit": { min: 1, recommended: 1, label: "ConvertKit" },
  "n8n-nodes-base.convertKitTrigger": { min: 1, recommended: 1, label: "ConvertKit Trigger" },
  "n8n-nodes-base.convertToFile": { min: 1.1, recommended: 1.1, label: "Convert to File" },
  "n8n-nodes-base.copper": { min: 1, recommended: 1, label: "Copper" },
  "n8n-nodes-base.copperTrigger": { min: 1, recommended: 1, label: "Copper Trigger" },
  "n8n-nodes-base.cortex": { min: 1, recommended: 1, label: "Cortex" },
  "n8n-nodes-base.crateDb": { min: 1, recommended: 1, label: "CrateDB" },
  "n8n-nodes-base.cron": { min: 1, recommended: 1, label: "Cron" },
  "n8n-nodes-base.crypto": { min: 2, recommended: 2, label: "Crypto" },
  "n8n-nodes-base.currents": { min: 1, recommended: 1, label: "Currents" },
  "n8n-nodes-base.currentsTrigger": { min: 1, recommended: 1, label: "Currents Trigger" },
  "n8n-nodes-base.customerIo": { min: 1, recommended: 1, label: "Customer.io" },
  "n8n-nodes-base.customerIoTrigger": { min: 1, recommended: 1, label: "Customer.io Trigger" },
  "n8n-nodes-base.dataTable": { min: 1.1, recommended: 1.1, label: "Data table" },
  "n8n-nodes-base.dateTime": { min: 2, recommended: 2, label: "Date & Time" },
  "n8n-nodes-base.debugHelper": { min: 1, recommended: 1, label: "DebugHelper" },
  "n8n-nodes-base.deepL": { min: 1, recommended: 1, label: "DeepL" },
  "n8n-nodes-base.demio": { min: 1, recommended: 1, label: "Demio" },
  "n8n-nodes-base.dhl": { min: 1, recommended: 1, label: "DHL" },
  "n8n-nodes-base.discord": { min: 2, recommended: 2, label: "Discord" },
  "n8n-nodes-base.discourse": { min: 1, recommended: 1, label: "Discourse" },
  "n8n-nodes-base.disqus": { min: 1, recommended: 1, label: "Disqus" },
  "n8n-nodes-base.drift": { min: 1, recommended: 1, label: "Drift" },
  "n8n-nodes-base.dropbox": { min: 1, recommended: 1, label: "Dropbox" },
  "n8n-nodes-base.dropcontact": { min: 1, recommended: 1, label: "Dropcontact" },
  "n8n-nodes-base.e2eTest": { min: 1, recommended: 1, label: "E2E Test" },
  "n8n-nodes-base.editImage": { min: 1, recommended: 1, label: "Edit Image" },
  "n8n-nodes-base.egoi": { min: 1, recommended: 1, label: "E-goi" },
  "n8n-nodes-base.elasticsearch": { min: 1, recommended: 1, label: "Elasticsearch" },
  "n8n-nodes-base.elasticSecurity": { min: 1, recommended: 1, label: "Elastic Security" },
  "n8n-nodes-base.emailReadImap": { min: 2.1, recommended: 2.1, label: "Email Trigger (IMAP)" },
  "n8n-nodes-base.emailSend": { min: 2.1, recommended: 2.1, label: "Send Email" },
  "n8n-nodes-base.emelia": { min: 1, recommended: 1, label: "Emelia" },
  "n8n-nodes-base.emeliaTrigger": { min: 1, recommended: 1, label: "Emelia Trigger" },
  "n8n-nodes-base.erpNext": { min: 1, recommended: 1, label: "ERPNext" },
  "n8n-nodes-base.errorTrigger": { min: 1, recommended: 1, label: "Error Trigger" },
  "n8n-nodes-base.eventbriteTrigger": { min: 1, recommended: 1, label: "Eventbrite Trigger" },
  "n8n-nodes-base.executeCommand": { min: 1, recommended: 1, label: "Execute Command" },
  "n8n-nodes-base.executeWorkflow": { min: 1.3, recommended: 1.3, label: "Execute Sub-workflow" },
  "n8n-nodes-base.executeWorkflowTrigger": { min: 1.1, recommended: 1.1, label: "Execute Workflow Trigger" },
  "n8n-nodes-base.executionData": { min: 1.1, recommended: 1.1, label: "Execution Data" },
  "n8n-nodes-base.extractFromFile": { min: 1.1, recommended: 1.1, label: "Extract from File" },
  "n8n-nodes-base.facebookGraphApi": { min: 1, recommended: 1, label: "Facebook Graph API" },
  "n8n-nodes-base.facebookLeadAdsTrigger": { min: 1, recommended: 1, label: "Facebook Lead Ads Trigger" },
  "n8n-nodes-base.facebookTrigger": { min: 1, recommended: 1, label: "Facebook Trigger" },
  "n8n-nodes-base.figmaTrigger": { min: 1, recommended: 1, label: "Figma Trigger (Beta)" },
  "n8n-nodes-base.filemaker": { min: 1, recommended: 1, label: "FileMaker" },
  "n8n-nodes-base.filter": { min: 2.3, recommended: 2.3, label: "Filter" },
  "n8n-nodes-base.flow": { min: 1, recommended: 1, label: "Flow" },
  "n8n-nodes-base.flowTrigger": { min: 1, recommended: 1, label: "Flow Trigger" },
  "n8n-nodes-base.form": { min: 2.5, recommended: 2.5, label: "n8n Form" },
  "n8n-nodes-base.formIoTrigger": { min: 1, recommended: 1, label: "Form.io Trigger" },
  "n8n-nodes-base.formstackTrigger": { min: 1, recommended: 1, label: "Formstack Trigger" },
  "n8n-nodes-base.formTrigger": { min: 2.5, recommended: 2.5, label: "n8n Form Trigger" },
  "n8n-nodes-base.freshdesk": { min: 1, recommended: 1, label: "Freshdesk" },
  "n8n-nodes-base.freshservice": { min: 1, recommended: 1, label: "Freshservice" },
  "n8n-nodes-base.freshworksCrm": { min: 1, recommended: 1, label: "Freshworks CRM" },
  "n8n-nodes-base.ftp": { min: 1, recommended: 1, label: "FTP" },
  "n8n-nodes-base.function": { min: 1, recommended: 1, label: "Function" },
  "n8n-nodes-base.functionItem": { min: 1, recommended: 1, label: "Function Item" },
  "n8n-nodes-base.getResponse": { min: 1, recommended: 1, label: "GetResponse" },
  "n8n-nodes-base.getResponseTrigger": { min: 1, recommended: 1, label: "GetResponse Trigger" },
  "n8n-nodes-base.ghost": { min: 1, recommended: 1, label: "Ghost" },
  "n8n-nodes-base.git": { min: 1.1, recommended: 1.1, label: "Git" },
  "n8n-nodes-base.github": { min: 1.1, recommended: 1.1, label: "GitHub" },
  "n8n-nodes-base.githubTrigger": { min: 1, recommended: 1, label: "Github Trigger" },
  "n8n-nodes-base.gitlab": { min: 1, recommended: 1, label: "GitLab" },
  "n8n-nodes-base.gitlabTrigger": { min: 1, recommended: 1, label: "GitLab Trigger" },
  "n8n-nodes-base.gmail": { min: 2.2, recommended: 2.2, label: "Gmail" },
  "n8n-nodes-base.gmailTrigger": { min: 1.3, recommended: 1.3, label: "Gmail Trigger" },
  "n8n-nodes-base.gong": { min: 1, recommended: 1, label: "Gong" },
  "n8n-nodes-base.googleAds": { min: 1, recommended: 1, label: "Google Ads" },
  "n8n-nodes-base.googleAnalytics": { min: 2, recommended: 2, label: "Google Analytics" },
  "n8n-nodes-base.googleBigQuery": { min: 2.1, recommended: 2.1, label: "Google BigQuery" },
  "n8n-nodes-base.googleBooks": { min: 2, recommended: 2, label: "Google Books" },
  "n8n-nodes-base.googleBusinessProfile": { min: 1, recommended: 1, label: "Google Business Profile" },
  "n8n-nodes-base.googleBusinessProfileTrigger": { min: 1, recommended: 1, label: "Google Business Profile Trigger" },
  "n8n-nodes-base.googleCalendar": { min: 1.3, recommended: 1.3, label: "Google Calendar" },
  "n8n-nodes-base.googleCalendarTrigger": { min: 1, recommended: 1, label: "Google Calendar Trigger" },
  "n8n-nodes-base.googleChat": { min: 1, recommended: 1, label: "Google Chat" },
  "n8n-nodes-base.googleCloudNaturalLanguage": { min: 1, recommended: 1, label: "Google Cloud Natural Language" },
  "n8n-nodes-base.googleCloudStorage": { min: 1, recommended: 1, label: "Google Cloud Storage" },
  "n8n-nodes-base.googleContacts": { min: 1, recommended: 1, label: "Google Contacts" },
  "n8n-nodes-base.googleDocs": { min: 2, recommended: 2, label: "Google Docs" },
  "n8n-nodes-base.googleDrive": { min: 3, recommended: 3, label: "Google Drive" },
  "n8n-nodes-base.googleDriveTrigger": { min: 1, recommended: 1, label: "Google Drive Trigger" },
  "n8n-nodes-base.googleFirebaseCloudFirestore": { min: 1.1, recommended: 1.1, label: "Google Cloud Firestore" },
  "n8n-nodes-base.googleFirebaseRealtimeDatabase": { min: 1, recommended: 1, label: "Google Cloud Realtime Database" },
  "n8n-nodes-base.googlePerspective": { min: 1, recommended: 1, label: "Google Perspective" },
  "n8n-nodes-base.googleSheets": { min: 4.7, recommended: 4.7, label: "Google Sheets" },
  "n8n-nodes-base.googleSheetsTrigger": { min: 1, recommended: 1, label: "Google Sheets Trigger" },
  "n8n-nodes-base.googleSlides": { min: 2, recommended: 2, label: "Google Slides" },
  "n8n-nodes-base.googleTasks": { min: 1, recommended: 1, label: "Google Tasks" },
  "n8n-nodes-base.googleTranslate": { min: 2, recommended: 2, label: "Google Translate" },
  "n8n-nodes-base.gotify": { min: 1, recommended: 1, label: "Gotify" },
  "n8n-nodes-base.goToWebinar": { min: 1, recommended: 1, label: "GoToWebinar" },
  "n8n-nodes-base.grafana": { min: 1, recommended: 1, label: "Grafana" },
  "n8n-nodes-base.graphql": { min: 1.1, recommended: 1.1, label: "GraphQL" },
  "n8n-nodes-base.grist": { min: 1, recommended: 1, label: "Grist" },
  "n8n-nodes-base.gSuiteAdmin": { min: 1, recommended: 1, label: "Google Workspace Admin" },
  "n8n-nodes-base.gumroadTrigger": { min: 1, recommended: 1, label: "Gumroad Trigger" },
  "n8n-nodes-base.hackerNews": { min: 1, recommended: 1, label: "Hacker News" },
  "n8n-nodes-base.haloPSA": { min: 1, recommended: 1, label: "HaloPSA" },
  "n8n-nodes-base.harvest": { min: 1, recommended: 1, label: "Harvest" },
  "n8n-nodes-base.helpScout": { min: 1, recommended: 1, label: "Help Scout" },
  "n8n-nodes-base.helpScoutTrigger": { min: 1, recommended: 1, label: "Help Scout Trigger" },
  "n8n-nodes-base.highLevel": { min: 2, recommended: 2, label: "HighLevel" },
  "n8n-nodes-base.homeAssistant": { min: 1, recommended: 1, label: "Home Assistant" },
  "n8n-nodes-base.html": { min: 1.2, recommended: 1.2, label: "HTML" },
  "n8n-nodes-base.htmlExtract": { min: 1, recommended: 1, label: "HTML Extract" },
  "n8n-nodes-base.httpRequest": { min: 4.4, recommended: 4.4, label: "HTTP Request" },
  "n8n-nodes-base.hubspot": { min: 2.2, recommended: 2.2, label: "HubSpot" },
  "n8n-nodes-base.hubspotTrigger": { min: 1, recommended: 1, label: "HubSpot Trigger" },
  "n8n-nodes-base.humanticAi": { min: 1, recommended: 1, label: "Humantic AI" },
  "n8n-nodes-base.hunter": { min: 1, recommended: 1, label: "Hunter" },
  "n8n-nodes-base.iCal": { min: 1, recommended: 1, label: "iCalendar" },
  "n8n-nodes-base.if": { min: 2.3, recommended: 2.3, label: "If" },
  "n8n-nodes-base.intercom": { min: 1, recommended: 1, label: "Intercom" },
  "n8n-nodes-base.interval": { min: 1, recommended: 1, label: "Interval" },
  "n8n-nodes-base.invoiceNinja": { min: 2, recommended: 2, label: "Invoice Ninja" },
  "n8n-nodes-base.invoiceNinjaTrigger": { min: 2, recommended: 2, label: "Invoice Ninja Trigger" },
  "n8n-nodes-base.itemLists": { min: 3.1, recommended: 3.1, label: "Item Lists" },
  "n8n-nodes-base.iterable": { min: 1, recommended: 1, label: "Iterable" },
  "n8n-nodes-base.jenkins": { min: 1, recommended: 1, label: "Jenkins" },
  "n8n-nodes-base.jinaAi": { min: 1, recommended: 1, label: "Jina AI" },
  "n8n-nodes-base.jira": { min: 1, recommended: 1, label: "Jira Software" },
  "n8n-nodes-base.jiraTrigger": { min: 1.1, recommended: 1.1, label: "Jira Trigger" },
  "n8n-nodes-base.jotFormTrigger": { min: 1, recommended: 1, label: "Jotform Trigger" },
  "n8n-nodes-base.jwt": { min: 1, recommended: 1, label: "JWT" },
  "n8n-nodes-base.kafka": { min: 1, recommended: 1, label: "Kafka" },
  "n8n-nodes-base.kafkaTrigger": { min: 1.3, recommended: 1.3, label: "Kafka Trigger" },
  "n8n-nodes-base.keap": { min: 1, recommended: 1, label: "Keap" },
  "n8n-nodes-base.keapTrigger": { min: 1, recommended: 1, label: "Keap Trigger" },
  "n8n-nodes-base.koBoToolbox": { min: 1, recommended: 1, label: "KoBoToolbox" },
  "n8n-nodes-base.koBoToolboxTrigger": { min: 1, recommended: 1, label: "KoBoToolbox Trigger" },
  "n8n-nodes-base.ldap": { min: 1, recommended: 1, label: "Ldap" },
  "n8n-nodes-base.lemlist": { min: 2, recommended: 2, label: "Lemlist" },
  "n8n-nodes-base.lemlistTrigger": { min: 1, recommended: 1, label: "Lemlist Trigger" },
  "n8n-nodes-base.limit": { min: 1, recommended: 1, label: "Limit" },
  "n8n-nodes-base.line": { min: 1, recommended: 1, label: "Line" },
  "n8n-nodes-base.linear": { min: 1.1, recommended: 1.1, label: "Linear" },
  "n8n-nodes-base.linearTrigger": { min: 1, recommended: 1, label: "Linear Trigger" },
  "n8n-nodes-base.lingvaNex": { min: 1, recommended: 1, label: "LingvaNex" },
  "n8n-nodes-base.linkedIn": { min: 1, recommended: 1, label: "LinkedIn" },
  "n8n-nodes-base.localFileTrigger": { min: 1, recommended: 1, label: "Local File Trigger" },
  "n8n-nodes-base.loneScale": { min: 1, recommended: 1, label: "LoneScale" },
  "n8n-nodes-base.loneScaleTrigger": { min: 1, recommended: 1, label: "LoneScale Trigger" },
  "n8n-nodes-base.magento2": { min: 1, recommended: 1, label: "Magento 2" },
  "n8n-nodes-base.mailcheck": { min: 1, recommended: 1, label: "Mailcheck" },
  "n8n-nodes-base.mailchimp": { min: 1, recommended: 1, label: "Mailchimp" },
  "n8n-nodes-base.mailchimpTrigger": { min: 1, recommended: 1, label: "Mailchimp Trigger" },
  "n8n-nodes-base.mailerLite": { min: 2, recommended: 2, label: "MailerLite" },
  "n8n-nodes-base.mailerLiteTrigger": { min: 2, recommended: 2, label: "MailerLite Trigger" },
  "n8n-nodes-base.mailgun": { min: 1, recommended: 1, label: "Mailgun" },
  "n8n-nodes-base.mailjet": { min: 1, recommended: 1, label: "Mailjet" },
  "n8n-nodes-base.mailjetTrigger": { min: 1, recommended: 1, label: "Mailjet Trigger" },
  "n8n-nodes-base.mandrill": { min: 1, recommended: 1, label: "Mandrill" },
  "n8n-nodes-base.manualTrigger": { min: 1, recommended: 1, label: "Manual Trigger" },
  "n8n-nodes-base.markdown": { min: 1, recommended: 1, label: "Markdown" },
  "n8n-nodes-base.marketstack": { min: 1, recommended: 1, label: "Marketstack" },
  "n8n-nodes-base.matrix": { min: 1, recommended: 1, label: "Matrix" },
  "n8n-nodes-base.mattermost": { min: 1, recommended: 1, label: "Mattermost" },
  "n8n-nodes-base.mautic": { min: 1, recommended: 1, label: "Mautic" },
  "n8n-nodes-base.mauticTrigger": { min: 1, recommended: 1, label: "Mautic Trigger" },
  "n8n-nodes-base.medium": { min: 1, recommended: 1, label: "Medium" },
  "n8n-nodes-base.merge": { min: 3.2, recommended: 3.2, label: "Merge" },
  "n8n-nodes-base.messageBird": { min: 1, recommended: 1, label: "MessageBird" },
  "n8n-nodes-base.metabase": { min: 1, recommended: 1, label: "Metabase" },
  "n8n-nodes-base.microsoftDynamicsCrm": { min: 1, recommended: 1, label: "Microsoft Dynamics CRM" },
  "n8n-nodes-base.microsoftEntra": { min: 1, recommended: 1, label: "Microsoft Entra ID" },
  "n8n-nodes-base.microsoftExcel": { min: 2.2, recommended: 2.2, label: "Microsoft Excel 365" },
  "n8n-nodes-base.microsoftGraphSecurity": { min: 1, recommended: 1, label: "Microsoft Graph Security" },
  "n8n-nodes-base.microsoftOneDrive": { min: 1.1, recommended: 1.1, label: "Microsoft OneDrive" },
  "n8n-nodes-base.microsoftOneDriveTrigger": { min: 1, recommended: 1, label: "Microsoft OneDrive Trigger" },
  "n8n-nodes-base.microsoftOutlook": { min: 2, recommended: 2, label: "Microsoft Outlook" },
  "n8n-nodes-base.microsoftOutlookTrigger": { min: 1, recommended: 1, label: "Microsoft Outlook Trigger" },
  "n8n-nodes-base.microsoftSharePoint": { min: 1, recommended: 1, label: "Microsoft SharePoint" },
  "n8n-nodes-base.microsoftSql": { min: 1.1, recommended: 1.1, label: "Microsoft SQL" },
  "n8n-nodes-base.microsoftTeams": { min: 2, recommended: 2, label: "Microsoft Teams" },
  "n8n-nodes-base.microsoftTeamsTrigger": { min: 1, recommended: 1, label: "Microsoft Teams Trigger" },
  "n8n-nodes-base.microsoftToDo": { min: 1, recommended: 1, label: "Microsoft To Do" },
  "n8n-nodes-base.mindee": { min: 3, recommended: 3, label: "Mindee" },
  "n8n-nodes-base.misp": { min: 1, recommended: 1, label: "MISP" },
  "n8n-nodes-base.mistralAi": { min: 1, recommended: 1, label: "Mistral AI" },
  "n8n-nodes-base.mocean": { min: 1, recommended: 1, label: "Mocean" },
  "n8n-nodes-base.mondayCom": { min: 1, recommended: 1, label: "Monday.com" },
  "n8n-nodes-base.mongoDb": { min: 1.2, recommended: 1.2, label: "MongoDB" },
  "n8n-nodes-base.monicaCrm": { min: 1, recommended: 1, label: "Monica CRM" },
  "n8n-nodes-base.moveBinaryData": { min: 1.1, recommended: 1.1, label: "Convert to/from binary data" },
  "n8n-nodes-base.mqtt": { min: 1, recommended: 1, label: "MQTT" },
  "n8n-nodes-base.mqttTrigger": { min: 1, recommended: 1, label: "MQTT Trigger" },
  "n8n-nodes-base.msg91": { min: 1, recommended: 1, label: "MSG91" },
  "n8n-nodes-base.mySql": { min: 2.5, recommended: 2.5, label: "MySQL" },
  "n8n-nodes-base.n8n": { min: 1, recommended: 1, label: "n8n" },
  "n8n-nodes-base.n8nTrainingCustomerDatastore": { min: 1, recommended: 1, label: "Customer Datastore (n8n training)" },
  "n8n-nodes-base.n8nTrainingCustomerMessenger": { min: 1, recommended: 1, label: "Customer Messenger (n8n training)" },
  "n8n-nodes-base.n8nTrigger": { min: 1, recommended: 1, label: "n8n Trigger" },
  "n8n-nodes-base.nasa": { min: 1, recommended: 1, label: "NASA" },
  "n8n-nodes-base.netlify": { min: 1, recommended: 1, label: "Netlify" },
  "n8n-nodes-base.netlifyTrigger": { min: 1, recommended: 1, label: "Netlify Trigger" },
  "n8n-nodes-base.nextCloud": { min: 1, recommended: 1, label: "Nextcloud" },
  "n8n-nodes-base.nocoDb": { min: 3, recommended: 3, label: "NocoDB" },
  "n8n-nodes-base.noOp": { min: 1, recommended: 1, label: "No Operation, do nothing" },
  "n8n-nodes-base.notion": { min: 2.2, recommended: 2.2, label: "Notion" },
  "n8n-nodes-base.notionTrigger": { min: 1, recommended: 1, label: "Notion Trigger" },
  "n8n-nodes-base.npm": { min: 1, recommended: 1, label: "Npm" },
  "n8n-nodes-base.odoo": { min: 1, recommended: 1, label: "Odoo" },
  "n8n-nodes-base.okta": { min: 1, recommended: 1, label: "Okta" },
  "n8n-nodes-base.oneSimpleApi": { min: 1, recommended: 1, label: "One Simple API" },
  "n8n-nodes-base.onfleet": { min: 1, recommended: 1, label: "Onfleet" },
  "n8n-nodes-base.onfleetTrigger": { min: 1, recommended: 1, label: "Onfleet Trigger" },
  "n8n-nodes-base.openAi": { min: 1.1, recommended: 1.1, label: "OpenAI" },
  "n8n-nodes-base.openThesaurus": { min: 1, recommended: 1, label: "OpenThesaurus" },
  "n8n-nodes-base.openWeatherMap": { min: 1, recommended: 1, label: "OpenWeatherMap" },
  "n8n-nodes-base.oracleDatabase": { min: 1, recommended: 1, label: "Oracle Database" },
  "n8n-nodes-base.orbit": { min: 1, recommended: 1, label: "Orbit" },
  "n8n-nodes-base.oura": { min: 1, recommended: 1, label: "Oura" },
  "n8n-nodes-base.paddle": { min: 1, recommended: 1, label: "Paddle" },
  "n8n-nodes-base.pagerDuty": { min: 1, recommended: 1, label: "PagerDuty" },
  "n8n-nodes-base.payPal": { min: 1, recommended: 1, label: "PayPal" },
  "n8n-nodes-base.payPalTrigger": { min: 1, recommended: 1, label: "PayPal Trigger" },
  "n8n-nodes-base.peekalink": { min: 1, recommended: 1, label: "Peekalink" },
  "n8n-nodes-base.perplexity": { min: 1, recommended: 1, label: "Perplexity" },
  "n8n-nodes-base.phantombuster": { min: 1, recommended: 1, label: "Phantombuster" },
  "n8n-nodes-base.philipsHue": { min: 1, recommended: 1, label: "Philips Hue" },
  "n8n-nodes-base.pipedrive": { min: 1, recommended: 1, label: "Pipedrive" },
  "n8n-nodes-base.pipedriveTrigger": { min: 1.1, recommended: 1.1, label: "Pipedrive Trigger" },
  "n8n-nodes-base.plivo": { min: 1, recommended: 1, label: "Plivo" },
  "n8n-nodes-base.postBin": { min: 1, recommended: 1, label: "PostBin" },
  "n8n-nodes-base.postgres": { min: 2.6, recommended: 2.6, label: "Postgres" },
  "n8n-nodes-base.postgresTrigger": { min: 1, recommended: 1, label: "Postgres Trigger" },
  "n8n-nodes-base.postHog": { min: 1, recommended: 1, label: "PostHog" },
  "n8n-nodes-base.postmarkTrigger": { min: 1, recommended: 1, label: "Postmark Trigger" },
  "n8n-nodes-base.profitWell": { min: 1, recommended: 1, label: "ProfitWell" },
  "n8n-nodes-base.pushbullet": { min: 1, recommended: 1, label: "Pushbullet" },
  "n8n-nodes-base.pushcut": { min: 1, recommended: 1, label: "Pushcut" },
  "n8n-nodes-base.pushcutTrigger": { min: 1, recommended: 1, label: "Pushcut Trigger" },
  "n8n-nodes-base.pushover": { min: 1, recommended: 1, label: "Pushover" },
  "n8n-nodes-base.questDb": { min: 1, recommended: 1, label: "QuestDB" },
  "n8n-nodes-base.quickbase": { min: 1, recommended: 1, label: "Quick Base" },
  "n8n-nodes-base.quickbooks": { min: 1, recommended: 1, label: "QuickBooks Online" },
  "n8n-nodes-base.quickChart": { min: 1, recommended: 1, label: "QuickChart" },
  "n8n-nodes-base.rabbitmq": { min: 1.1, recommended: 1.1, label: "RabbitMQ" },
  "n8n-nodes-base.rabbitmqTrigger": { min: 1, recommended: 1, label: "RabbitMQ Trigger" },
  "n8n-nodes-base.raindrop": { min: 1, recommended: 1, label: "Raindrop" },
  "n8n-nodes-base.readBinaryFile": { min: 1, recommended: 1, label: "Read Binary File" },
  "n8n-nodes-base.readBinaryFiles": { min: 1, recommended: 1, label: "Read Binary Files" },
  "n8n-nodes-base.readPDF": { min: 1, recommended: 1, label: "Read PDF" },
  "n8n-nodes-base.readWriteFile": { min: 1.1, recommended: 1.1, label: "Read/Write Files from Disk" },
  "n8n-nodes-base.reddit": { min: 1, recommended: 1, label: "Reddit" },
  "n8n-nodes-base.redis": { min: 1, recommended: 1, label: "Redis" },
  "n8n-nodes-base.redisTrigger": { min: 1, recommended: 1, label: "Redis Trigger" },
  "n8n-nodes-base.removeDuplicates": { min: 2, recommended: 2, label: "Remove Duplicates" },
  "n8n-nodes-base.renameKeys": { min: 1, recommended: 1, label: "Rename Keys" },
  "n8n-nodes-base.respondToWebhook": { min: 1.5, recommended: 1.5, label: "Respond to Webhook" },
  "n8n-nodes-base.rocketchat": { min: 1, recommended: 1, label: "RocketChat" },
  "n8n-nodes-base.rssFeedRead": { min: 1.2, recommended: 1.2, label: "RSS Read" },
  "n8n-nodes-base.rssFeedReadTrigger": { min: 1, recommended: 1, label: "RSS Feed Trigger" },
  "n8n-nodes-base.rundeck": { min: 1, recommended: 1, label: "Rundeck" },
  "n8n-nodes-base.s3": { min: 1, recommended: 1, label: "S3" },
  "n8n-nodes-base.salesforce": { min: 1, recommended: 1, label: "Salesforce" },
  "n8n-nodes-base.salesforceTrigger": { min: 1, recommended: 1, label: "Salesforce Trigger" },
  "n8n-nodes-base.salesmate": { min: 1, recommended: 1, label: "Salesmate" },
  "n8n-nodes-base.scheduleTrigger": { min: 1.3, recommended: 1.3, label: "Schedule Trigger" },
  "n8n-nodes-base.seaTable": { min: 2, recommended: 2, label: "SeaTable" },
  "n8n-nodes-base.seaTableTrigger": { min: 2, recommended: 2, label: "SeaTable Trigger" },
  "n8n-nodes-base.securityScorecard": { min: 1, recommended: 1, label: "SecurityScorecard" },
  "n8n-nodes-base.segment": { min: 1, recommended: 1, label: "Segment" },
  "n8n-nodes-base.sendGrid": { min: 1, recommended: 1, label: "SendGrid" },
  "n8n-nodes-base.sendInBlue": { min: 1, recommended: 1, label: "Brevo" },
  "n8n-nodes-base.sendInBlueTrigger": { min: 1, recommended: 1, label: "Brevo Trigger" },
  "n8n-nodes-base.sendy": { min: 1, recommended: 1, label: "Sendy" },
  "n8n-nodes-base.sentryIo": { min: 1, recommended: 1, label: "Sentry.io" },
  "n8n-nodes-base.serviceNow": { min: 1, recommended: 1, label: "ServiceNow" },
  "n8n-nodes-base.set": { min: 3.4, recommended: 3.4, label: "Set" },
  "n8n-nodes-base.shopify": { min: 1, recommended: 1, label: "Shopify" },
  "n8n-nodes-base.shopifyTrigger": { min: 1, recommended: 1, label: "Shopify Trigger" },
  "n8n-nodes-base.signl4": { min: 1, recommended: 1, label: "SIGNL4" },
  "n8n-nodes-base.simulate": { min: 1, recommended: 1, label: "Simulate" },
  "n8n-nodes-base.simulateTrigger": { min: 1, recommended: 1, label: "Simulate Trigger" },
  "n8n-nodes-base.slack": { min: 2.4, recommended: 2.4, label: "Slack" },
  "n8n-nodes-base.slackTrigger": { min: 1, recommended: 1, label: "Slack Trigger" },
  "n8n-nodes-base.sms77": { min: 1, recommended: 1, label: "seven" },
  "n8n-nodes-base.snowflake": { min: 1, recommended: 1, label: "Snowflake" },
  "n8n-nodes-base.sort": { min: 1, recommended: 1, label: "Sort" },
  "n8n-nodes-base.splitInBatches": { min: 3, recommended: 3, label: "Split In Batches" },
  "n8n-nodes-base.splitOut": { min: 1, recommended: 1, label: "Split Out" },
  "n8n-nodes-base.splunk": { min: 2, recommended: 2, label: "Splunk" },
  "n8n-nodes-base.spotify": { min: 1, recommended: 1, label: "Spotify" },
  "n8n-nodes-base.spreadsheetFile": { min: 2, recommended: 2, label: "Spreadsheet File" },
  "n8n-nodes-base.sseTrigger": { min: 1, recommended: 1, label: "SSE Trigger" },
  "n8n-nodes-base.ssh": { min: 1, recommended: 1, label: "SSH" },
  "n8n-nodes-base.stackby": { min: 1, recommended: 1, label: "Stackby" },
  "n8n-nodes-base.stickyNote": { min: 1, recommended: 1, label: "Sticky Note" },
  "n8n-nodes-base.stopAndError": { min: 1, recommended: 1, label: "Stop and Error" },
  "n8n-nodes-base.storyblok": { min: 1, recommended: 1, label: "Storyblok" },
  "n8n-nodes-base.strapi": { min: 1, recommended: 1, label: "Strapi" },
  "n8n-nodes-base.strava": { min: 1.1, recommended: 1.1, label: "Strava" },
  "n8n-nodes-base.stravaTrigger": { min: 1, recommended: 1, label: "Strava Trigger" },
  "n8n-nodes-base.stripe": { min: 1, recommended: 1, label: "Stripe" },
  "n8n-nodes-base.stripeTrigger": { min: 1, recommended: 1, label: "Stripe Trigger" },
  "n8n-nodes-base.summarize": { min: 1.1, recommended: 1.1, label: "Summarize" },
  "n8n-nodes-base.supabase": { min: 1, recommended: 1, label: "Supabase" },
  "n8n-nodes-base.surveyMonkeyTrigger": { min: 1, recommended: 1, label: "SurveyMonkey Trigger" },
  "n8n-nodes-base.switch": { min: 3.4, recommended: 3.4, label: "Switch" },
  "n8n-nodes-base.syncroMsp": { min: 1, recommended: 1, label: "SyncroMSP" },
  "n8n-nodes-base.taiga": { min: 1, recommended: 1, label: "Taiga" },
  "n8n-nodes-base.taigaTrigger": { min: 1, recommended: 1, label: "Taiga Trigger" },
  "n8n-nodes-base.tapfiliate": { min: 1, recommended: 1, label: "Tapfiliate" },
  "n8n-nodes-base.telegram": { min: 1.2, recommended: 1.2, label: "Telegram" },
  "n8n-nodes-base.telegramTrigger": { min: 1.2, recommended: 1.2, label: "Telegram Trigger" },
  "n8n-nodes-base.theHive": { min: 1, recommended: 1, label: "TheHive" },
  "n8n-nodes-base.theHiveProject": { min: 1, recommended: 1, label: "TheHive 5" },
  "n8n-nodes-base.theHiveProjectTrigger": { min: 1, recommended: 1, label: "TheHive 5 Trigger" },
  "n8n-nodes-base.theHiveTrigger": { min: 2, recommended: 2, label: "TheHive Trigger" },
  "n8n-nodes-base.timeSaved": { min: 1, recommended: 1, label: "Track Time Saved" },
  "n8n-nodes-base.timescaleDb": { min: 1, recommended: 1, label: "TimescaleDB" },
  "n8n-nodes-base.todoist": { min: 2.2, recommended: 2.2, label: "Todoist" },
  "n8n-nodes-base.togglTrigger": { min: 1, recommended: 1, label: "Toggl Trigger" },
  "n8n-nodes-base.totp": { min: 1, recommended: 1, label: "TOTP" },
  "n8n-nodes-base.travisCi": { min: 1, recommended: 1, label: "TravisCI" },
  "n8n-nodes-base.trello": { min: 1, recommended: 1, label: "Trello" },
  "n8n-nodes-base.trelloTrigger": { min: 1, recommended: 1, label: "Trello Trigger" },
  "n8n-nodes-base.twake": { min: 1, recommended: 1, label: "Twake" },
  "n8n-nodes-base.twilio": { min: 1, recommended: 1, label: "Twilio" },
  "n8n-nodes-base.twilioTrigger": { min: 1, recommended: 1, label: "Twilio Trigger" },
  "n8n-nodes-base.twist": { min: 1, recommended: 1, label: "Twist" },
  "n8n-nodes-base.twitter": { min: 2, recommended: 2, label: "X (Formerly Twitter)" },
  "n8n-nodes-base.typeformTrigger": { min: 1.1, recommended: 1.1, label: "Typeform Trigger" },
  "n8n-nodes-base.unleashedSoftware": { min: 1, recommended: 1, label: "Unleashed Software" },
  "n8n-nodes-base.uplead": { min: 1, recommended: 1, label: "Uplead" },
  "n8n-nodes-base.uproc": { min: 1, recommended: 1, label: "uProc" },
  "n8n-nodes-base.uptimeRobot": { min: 1, recommended: 1, label: "UptimeRobot" },
  "n8n-nodes-base.urlScanIo": { min: 1, recommended: 1, label: "urlscan.io" },
  "n8n-nodes-base.venafiTlsProtectCloud": { min: 1, recommended: 1, label: "Venafi TLS Protect Cloud" },
  "n8n-nodes-base.venafiTlsProtectCloudTrigger": { min: 1, recommended: 1, label: "Venafi TLS Protect Cloud Trigger" },
  "n8n-nodes-base.venafiTlsProtectDatacenter": { min: 1, recommended: 1, label: "Venafi TLS Protect Datacenter" },
  "n8n-nodes-base.venafiTlsProtectDatacenterTrigger": { min: 1, recommended: 1, label: "Venafi TLS Protect Datacenter Trigger" },
  "n8n-nodes-base.vero": { min: 1, recommended: 1, label: "Vero" },
  "n8n-nodes-base.vonage": { min: 1, recommended: 1, label: "Vonage" },
  "n8n-nodes-base.wait": { min: 1.1, recommended: 1.1, label: "Wait" },
  "n8n-nodes-base.webflow": { min: 2, recommended: 2, label: "Webflow" },
  "n8n-nodes-base.webflowTrigger": { min: 2, recommended: 2, label: "Webflow Trigger" },
  "n8n-nodes-base.webhook": { min: 2.1, recommended: 2.1, label: "Webhook" },
  "n8n-nodes-base.wekan": { min: 1, recommended: 1, label: "Wekan" },
  "n8n-nodes-base.whatsApp": { min: 1.1, recommended: 1.1, label: "WhatsApp Business Cloud" },
  "n8n-nodes-base.whatsAppTrigger": { min: 1, recommended: 1, label: "WhatsApp Trigger" },
  "n8n-nodes-base.wise": { min: 1, recommended: 1, label: "Wise" },
  "n8n-nodes-base.wiseTrigger": { min: 1, recommended: 1, label: "Wise Trigger" },
  "n8n-nodes-base.wooCommerce": { min: 1, recommended: 1, label: "WooCommerce" },
  "n8n-nodes-base.wooCommerceTrigger": { min: 1, recommended: 1, label: "WooCommerce Trigger" },
  "n8n-nodes-base.wordpress": { min: 1, recommended: 1, label: "Wordpress" },
  "n8n-nodes-base.workableTrigger": { min: 1, recommended: 1, label: "Workable Trigger" },
  "n8n-nodes-base.workflowTrigger": { min: 1, recommended: 1, label: "Workflow Trigger" },
  "n8n-nodes-base.writeBinaryFile": { min: 1, recommended: 1, label: "Write Binary File" },
  "n8n-nodes-base.wufooTrigger": { min: 1, recommended: 1, label: "Wufoo Trigger" },
  "n8n-nodes-base.xero": { min: 1, recommended: 1, label: "Xero" },
  "n8n-nodes-base.xml": { min: 1, recommended: 1, label: "XML" },
  "n8n-nodes-base.yourls": { min: 1, recommended: 1, label: "Yourls" },
  "n8n-nodes-base.youTube": { min: 1, recommended: 1, label: "YouTube" },
  "n8n-nodes-base.zammad": { min: 1, recommended: 1, label: "Zammad" },
  "n8n-nodes-base.zendesk": { min: 1, recommended: 1, label: "Zendesk" },
  "n8n-nodes-base.zendeskTrigger": { min: 1, recommended: 1, label: "Zendesk Trigger" },
  "n8n-nodes-base.zohoCrm": { min: 1, recommended: 1, label: "Zoho CRM" },
  "n8n-nodes-base.zoom": { min: 1, recommended: 1, label: "Zoom" },
  "n8n-nodes-base.zulip": { min: 1, recommended: 1, label: "Zulip" },
};

const CACHE_FILENAME = ".n8n-node-types-cache.json";

const ICONS: Record<Severity, string> = {
  FATAL: `${C.red}✖ FATAL${C.reset}`,
  ERROR: `${C.red}✘ ERROR${C.reset}`,
  WARN: `${C.yellow}⚠ WARN ${C.reset}`,
  INFO: `${C.cyan}ℹ INFO ${C.reset}`,
};

const TRIGGER_TYPES = new Set([
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.executeWorkflowTrigger",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.emailTrigger",
  "n8n-nodes-base.telegramTrigger",
  "n8n-nodes-base.cronTrigger",
  "n8n-nodes-base.errorTrigger",
  "n8n-nodes-base.formTrigger",
  "n8n-nodes-base.chatTrigger",
]);

const isTrigger = (type: string): boolean =>
  TRIGGER_TYPES.has(type) || type.toLowerCase().includes("trigger");

// ══════════════════════════════════════════════════════════════
//  .ENV LOADER
// ══════════════════════════════════════════════════════════════

function loadEnv(): EnvConfig {
  const envPaths = [
    resolve(__dirname_local, "..", ".env"),
    resolve(process.cwd(), ".env"),
  ];

  let envContent = "";
  for (const p of envPaths) {
    if (existsSync(p)) {
      envContent = readFileSync(p, "utf-8");
      break;
    }
  }

  const vars: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }

  return {
    apiUrl:
      vars["N8N_API_URL"] || process.env.N8N_API_URL || "https://n8n.stax.ink",
    apiKey: vars["N8N_API_KEY"] || process.env.N8N_API_KEY || "",
    accessToken: vars["N8N_ACCESS_TOKEN"] || process.env.N8N_ACCESS_TOKEN || "",
  };
}

// ══════════════════════════════════════════════════════════════
//  DISCOVERY: Consultar n8n por node types instalados
// ══════════════════════════════════════════════════════════════

function getBaseUrl(apiUrl: string): string {
  let base = apiUrl
    .replace(/\/api\/v\d+\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "");
  return base;
}

function normalizeVersions(version: unknown): number[] {
  if (typeof version === "number") return [version];
  if (Array.isArray(version)) {
    return version
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b);
  }
  return [];
}

async function tryEndpoint(
  url: string,
  auth: { apiKey: string; accessToken: string },
  method: "GET" | "POST",
  body?: unknown,
  verbose?: boolean,
): Promise<unknown[] | null> {
  try {
    if (verbose) console.log(`  ${C.gray}→ ${method} ${url}${C.reset}`);

    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };

    if (auth.accessToken) {
      headers["authorization"] = `Bearer ${auth.accessToken}`;
    }
    if (auth.apiKey) {
      headers["x-n8n-api-key"] = auth.apiKey;
    }

    if (verbose) {
      const authMethods: string[] = [];
      if (auth.apiKey) authMethods.push("API Key");
      if (auth.accessToken) authMethods.push("Bearer Token");
      console.log(
        `  ${C.gray}  Auth: ${authMethods.join(" + ") || "NINGUNA"}${C.reset}`,
      );
    }

    const opts: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(15_000),
    };
    if (body && method === "POST") {
      opts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, opts);

    if (verbose) console.log(`  ${C.gray}  ← HTTP ${resp.status}${C.reset}`);

    if (!resp.ok) return null;

    const json = (await resp.json()) as unknown;

    if (Array.isArray(json)) return json;
    if (
      json &&
      typeof json === "object" &&
      "data" in json &&
      Array.isArray((json as Record<string, unknown>).data)
    ) {
      return (json as Record<string, unknown>).data as unknown[];
    }

    if (verbose) console.log(`  ${C.gray}  ← Respuesta no es array${C.reset}`);
    return null;
  } catch (err) {
    if (verbose)
      console.log(`  ${C.gray}  ← Error: ${(err as Error).message}${C.reset}`);
    return null;
  }
}

async function discoverNodeTypes(
  env: EnvConfig,
  verbose: boolean,
): Promise<NodeTypeCache | null> {
  const baseUrl = getBaseUrl(env.apiUrl);

  if (!baseUrl) {
    console.log(
      `  ${C.yellow}⚠ N8N_API_URL no configurado — usando fallback SOT${C.reset}`,
    );
    return null;
  }

  const auth = { apiKey: env.apiKey, accessToken: env.accessToken };

  const detected: string[] = [];
  if (env.apiKey) detected.push("N8N_API_KEY ✓");
  if (env.accessToken) detected.push("N8N_ACCESS_TOKEN ✓");
  if (detected.length === 0) detected.push("⚠ NINGUNA — requests sin auth");

  console.log(`\n  ${C.bold}🔍 Descubriendo node types${C.reset}`);
  console.log(`  ${C.gray}URL:${C.reset}  ${baseUrl}`);
  console.log(`  ${C.gray}Auth:${C.reset} ${detected.join(", ")}`);
  console.log("");

  const endpoints: Array<{
    url: string;
    method: "GET" | "POST";
    body?: unknown;
    label: string;
    isConnTest?: boolean;
  }> = [
    {
      url: `${baseUrl}/rest/node-types`,
      method: "POST",
      body: {},
      label: "POST /rest/node-types (bearer)",
    },
    {
      url: `${baseUrl}/rest/node-types`,
      method: "GET",
      label: "GET /rest/node-types",
    },
    {
      url: `${baseUrl}/types/nodes.json`,
      method: "GET",
      label: "GET /types/nodes.json (static)",
    },
    {
      url: `${baseUrl}/rest/nodes`,
      method: "GET",
      label: "GET /rest/nodes",
    },
    {
      url: `${baseUrl}/api/v1/workflows?limit=1`,
      method: "GET",
      label: "GET /api/v1/workflows (connectivity test)",
      isConnTest: true,
    },
  ];

  let rawTypes: unknown[] | null = null;
  let successLabel = "";

  for (const ep of endpoints) {
    if (ep.isConnTest) {
      const testResult = await tryEndpoint(
        ep.url,
        auth,
        ep.method,
        ep.body,
        verbose,
      );
      if (testResult !== null && verbose) {
        console.log(`  ${C.green}  ✔ Conexión OK con API key${C.reset}`);
      }
      continue;
    }

    rawTypes = await tryEndpoint(ep.url, auth, ep.method, ep.body, verbose);
    if (rawTypes && rawTypes.length > 0) {
      successLabel = ep.label;
      break;
    }
  }

  if (!rawTypes || rawTypes.length === 0) {
    console.log(`  ${C.yellow}⚠ No se pudieron obtener node types${C.reset}`);
    console.log(`  ${C.gray}  Posibles causas:${C.reset}`);
    console.log(
      `  ${C.gray}  • N8N_ACCESS_TOKEN necesario para /rest/* (UI session token)${C.reset}`,
    );
    console.log(
      `  ${C.gray}  • N8N_API_KEY solo funciona con /api/v1/* (no expone node types)${C.reset}`,
    );
    console.log(`  ${C.gray}  • Reverse proxy bloqueando /rest/*${C.reset}`);
    console.log(`  ${C.gray}  → Usando fallback SOT hardcodeado${C.reset}\n`);
    return null;
  }

  console.log(`  ${C.green}✔ Éxito via ${successLabel}${C.reset}`);

  const nodeTypes: Record<string, DiscoveredNodeType> = {};

  for (const raw of rawTypes) {
    if (!raw || typeof raw !== "object") continue;

    const entry = raw as Record<string, unknown>;
    const name = entry.name as string | undefined;
    if (!name || typeof name !== "string") continue;

    const versions = normalizeVersions(entry.version);
    if (versions.length === 0) continue;

    const displayName =
      (entry.displayName as string) || name.split(".").pop() || name;
    const group = Array.isArray(entry.group) ? (entry.group as string[]) : [];
    const description = (entry.description as string) || undefined;

    nodeTypes[name] = {
      displayName,
      availableVersions: versions,
      latestVersion: versions[versions.length - 1],
      group,
      description,
    };
  }

  const totalTypes = Object.keys(nodeTypes).length;
  console.log(
    `  ${C.green}✔ ${totalTypes} node types descubiertos${C.reset}\n`,
  );

  return {
    discoveredAt: new Date().toISOString(),
    n8nBaseUrl: baseUrl,
    totalTypes,
    nodeTypes,
  };
}

// ── Cache management ──────────────────────────────────────────
function getCachePath(): string {
  return resolve(__dirname_local, "..", CACHE_FILENAME);
}

function loadCache(): NodeTypeCache | null {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) return null;

  try {
    const raw = readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as NodeTypeCache;
    if (!parsed.nodeTypes || typeof parsed.nodeTypes !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(cache: NodeTypeCache): void {
  const cachePath = getCachePath();
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
  console.log(`  ${C.green}✔ Caché guardado: ${cachePath}${C.reset}`);
  console.log(
    `  ${C.gray}  (Agregar ${CACHE_FILENAME} a .gitignore)${C.reset}\n`,
  );
}

// ══════════════════════════════════════════════════════════════
//  SOT RESOLUTION: Dynamic (API) → Cache → Fallback
// ══════════════════════════════════════════════════════════════

async function resolveSOT(flags: {
  live: boolean;
  refresh: boolean;
  verbose: boolean;
}): Promise<ResolvedSOT> {
  const env = loadEnv();

  if (flags.live || flags.refresh) {
    const discovered = await discoverNodeTypes(env, flags.verbose);
    if (discovered) {
      if (flags.refresh) saveCache(discovered);
      return {
        source: "live",
        sourceDetail: `API ${discovered.n8nBaseUrl} (${discovered.totalTypes} types)`,
        nodeTypes: discovered.nodeTypes,
      };
    }
  }

  if (!flags.live) {
    const cached = loadCache();
    if (cached) {
      const ageHours = Math.round(
        (Date.now() - new Date(cached.discoveredAt).getTime()) / 3600000,
      );
      if (ageHours > 24) {
        console.log(
          `  ${C.yellow}⚠ Caché tiene ${ageHours}h — considera --refresh${C.reset}`,
        );
      }
      return {
        source: "cache",
        sourceDetail: `${getCachePath()} (${cached.totalTypes} types, ${ageHours}h)`,
        nodeTypes: cached.nodeTypes,
      };
    }

    if (!flags.refresh) {
      console.log(`  ${C.gray}Sin caché. Auto-discovery...${C.reset}`);
      const discovered = await discoverNodeTypes(env, flags.verbose);
      if (discovered) {
        saveCache(discovered);
        return {
          source: "live",
          sourceDetail: `API ${discovered.n8nBaseUrl} (auto, ${discovered.totalTypes} types)`,
          nodeTypes: discovered.nodeTypes,
        };
      }
    }
  }

  console.log(
    `  ${C.yellow}⚠ Fallback SOT (${Object.keys(FALLBACK_SOT).length} tipos)${C.reset}\n`,
  );
  const fallbackTypes: Record<string, DiscoveredNodeType> = {};
  for (const [name, info] of Object.entries(FALLBACK_SOT)) {
    fallbackTypes[name] = {
      displayName: info.label,
      availableVersions: [info.recommended],
      latestVersion: info.recommended,
      group: [],
    };
  }

  return {
    source: "fallback",
    sourceDetail: `SOT hardcodeado (${Object.keys(FALLBACK_SOT).length} tipos)`,
    nodeTypes: fallbackTypes,
  };
}

// ══════════════════════════════════════════════════════════════
//  VALIDATION CHECKS
// ══════════════════════════════════════════════════════════════

function checkStructure(wf: N8NWorkflow, findings: Finding[]): boolean {
  if (!wf.name || typeof wf.name !== "string" || wf.name.trim() === "") {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: "Workflow sin nombre o nombre vacío.",
      fix: 'Agregar campo "name" con valor descriptivo.',
    });
  }

  if (!Array.isArray(wf.nodes)) {
    findings.push({
      severity: "FATAL",
      category: "STRUCTURE",
      message: '"nodes" no es un array o no existe.',
      fix: 'El campo "nodes" debe ser un array de objetos.',
    });
    return false;
  }

  if (wf.nodes.length === 0) {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: "Workflow sin nodos (array vacío).",
    });
    return false;
  }

  if (!wf.connections || typeof wf.connections !== "object") {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: '"connections" falta o no es un objeto.',
      fix: 'Agregar campo "connections": {}.',
    });
  }

  return true;
}

function checkNodeFields(nodes: N8NNode[], findings: Finding[]): void {
  const required: (keyof N8NNode)[] = [
    "name",
    "type",
    "typeVersion",
    "position",
  ];

  nodes.forEach((node, idx) => {
    for (const field of required) {
      if (node[field] === undefined || node[field] === null) {
        findings.push({
          severity: "ERROR",
          category: "NODE_FIELD",
          message: `Campo "${field}" faltante.`,
          node: node.name || `[índice ${idx}]`,
          fix: `Agregar "${field}" al nodo.`,
        });
      }
    }

    if (node.position) {
      if (
        !Array.isArray(node.position) ||
        node.position.length !== 2 ||
        typeof node.position[0] !== "number" ||
        typeof node.position[1] !== "number"
      ) {
        findings.push({
          severity: "WARN",
          category: "NODE_FIELD",
          message: '"position" debe ser [number, number].',
          node: node.name,
        });
      }
    }

    if (
      node.typeVersion !== undefined &&
      (typeof node.typeVersion !== "number" || node.typeVersion <= 0)
    ) {
      findings.push({
        severity: "ERROR",
        category: "NODE_FIELD",
        message: `typeVersion inválido: ${node.typeVersion}. Debe ser > 0.`,
        node: node.name,
      });
    }
  });
}

function checkDuplicateNames(nodes: N8NNode[], findings: Finding[]): void {
  const seen = new Map<string, number>();
  for (const node of nodes) {
    if (!node.name) continue;
    seen.set(node.name, (seen.get(node.name) || 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      findings.push({
        severity: "ERROR",
        category: "DUPLICATE",
        message: `Nombre "${name}" duplicado ×${count}. n8n usa nombres como key en connections.`,
        node: name,
        fix: "Renombrar para que cada nodo sea único.",
      });
    }
  }
}

function checkDuplicateIds(nodes: N8NNode[], findings: Finding[]): void {
  const seen = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.id) continue;
    if (!seen.has(node.id)) seen.set(node.id, []);
    seen.get(node.id)!.push(node.name);
  }
  for (const [id, names] of seen) {
    if (names.length > 1) {
      findings.push({
        severity: "ERROR",
        category: "DUPLICATE",
        message: `ID "${id}" compartido por: ${names.join(", ")}.`,
        node: names[0],
        fix: "Cada nodo debe tener un UUID único.",
      });
    }
  }
}

function checkNodeTypesAndVersions(
  nodes: N8NNode[],
  sot: ResolvedSOT,
  findings: Finding[],
): void {
  for (const node of nodes) {
    if (node.disabled) continue;

    const known = sot.nodeTypes[node.type];

    if (!known) {
      if (node.type.startsWith("n8n-nodes-base.") && sot.source === "live") {
        findings.push({
          severity: "ERROR",
          category: "NODE_TYPE",
          message: `Tipo "${node.type}" NO está instalado en tu instancia n8n.`,
          node: node.name,
          fix: "Verificar que el node package está instalado, o cambiar a un tipo disponible.",
        });
      } else if (node.type.startsWith("@n8n/")) {
        if (sot.source === "live") {
          findings.push({
            severity: "ERROR",
            category: "NODE_TYPE",
            message: `Tipo "${node.type}" NO encontrado en tu instancia.`,
            node: node.name,
            fix: "Verificar que el paquete langchain está instalado.",
          });
        } else {
          findings.push({
            severity: "INFO",
            category: "NODE_TYPE",
            message: `Tipo langchain "${node.type}" — no validable con fallback SOT.`,
            node: node.name,
          });
        }
      } else if (
        !node.type.startsWith("n8n-nodes-base.") &&
        !node.type.startsWith("@n8n/")
      ) {
        findings.push({
          severity: "INFO",
          category: "NODE_TYPE",
          message: `Tipo community/custom: "${node.type}". Verificar que está instalado.`,
          node: node.name,
        });
      }
      continue;
    }

    const usedVersion = node.typeVersion;
    const available = known.availableVersions;
    const latest = known.latestVersion;

    if (!available.includes(usedVersion)) {
      const isCritical = node.type === "n8n-nodes-base.if" && usedVersion < 2;

      findings.push({
        severity: isCritical ? "FATAL" : "ERROR",
        category: "VERSION",
        message:
          `v${usedVersion} NO disponible para ${known.displayName}. ` +
          `Versiones instaladas: [${available.join(", ")}].` +
          (isCritical
            ? ' CAUSA: "propertyValues[itemName] is not iterable"'
            : ""),
        node: node.name,
        fix: `Cambiar typeVersion a ${latest} (latest disponible).`,
      });
    } else if (usedVersion < latest) {
      findings.push({
        severity: "WARN",
        category: "VERSION",
        message: `v${usedVersion} es válida pero v${latest} es la más reciente para ${known.displayName}.`,
        node: node.name,
        fix: `Considerar actualizar typeVersion a ${latest}.`,
      });
    }
  }
}

function checkConnections(
  nodes: N8NNode[],
  connections: N8NConnections,
  findings: Finding[],
): { inbound: Map<string, string[]>; outbound: Map<string, string[]> } {
  const nodeNames = new Set(nodes.map((n) => n.name));
  const inbound = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();

  for (const name of nodeNames) {
    inbound.set(name, []);
    outbound.set(name, []);
  }

  for (const [sourceName, outputs] of Object.entries(connections)) {
    if (!nodeNames.has(sourceName)) {
      findings.push({
        severity: "ERROR",
        category: "CONNECTION",
        message: `Conexión desde nodo inexistente "${sourceName}".`,
        node: sourceName,
        fix: "Eliminar de connections o crear el nodo.",
      });
      continue;
    }

    for (const [_outputType, branches] of Object.entries(outputs)) {
      if (!Array.isArray(branches)) continue;

      for (let bi = 0; bi < branches.length; bi++) {
        const branch = branches[bi];
        if (!Array.isArray(branch)) continue;

        for (const target of branch) {
          if (!target || typeof target.node !== "string") {
            findings.push({
              severity: "ERROR",
              category: "CONNECTION",
              message: `Target malformado en branch ${bi}.`,
              node: sourceName,
              fix: '{ "node": "string", "type": "main", "index": number }',
            });
            continue;
          }

          if (!nodeNames.has(target.node)) {
            findings.push({
              severity: "ERROR",
              category: "CONNECTION",
              message: `Apunta a nodo inexistente: "${target.node}".`,
              node: sourceName,
              fix: `Crear "${target.node}" o corregir la conexión.`,
            });
            continue;
          }

          outbound.get(sourceName)?.push(target.node);
          inbound.get(target.node)?.push(sourceName);
        }
      }
    }
  }

  return { inbound, outbound };
}

function checkOrphans(
  nodes: N8NNode[],
  inbound: Map<string, string[]>,
  outbound: Map<string, string[]>,
  findings: Finding[],
): void {
  for (const node of nodes) {
    if (node.disabled) continue;

    const hasIn = (inbound.get(node.name)?.length ?? 0) > 0;
    const hasOut = (outbound.get(node.name)?.length ?? 0) > 0;
    const trigger = isTrigger(node.type);

    if (trigger && !hasOut) {
      findings.push({
        severity: "WARN",
        category: "ORPHAN",
        message: "Trigger sin salida — no dispara nada.",
        node: node.name,
        fix: "Conectar al primer nodo de procesamiento.",
      });
    }

    if (!trigger && !hasIn) {
      findings.push({
        severity: "WARN",
        category: "ORPHAN",
        message: "Nodo sin entrada — nunca se ejecutará.",
        node: node.name,
        fix: "Conectar desde un trigger/nodo previo, o eliminar.",
      });
    }

    if (!trigger && !hasIn && !hasOut) {
      findings.push({
        severity: "ERROR",
        category: "ORPHAN",
        message: "Nodo isla — sin entrada ni salida. Aislado.",
        node: node.name,
        fix: "Eliminar o conectar al flujo.",
      });
    }
  }
}

function checkCycles(
  nodes: N8NNode[],
  outbound: Map<string, string[]>,
  findings: Finding[],
): void {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.name, WHITE);

  const cycles: string[] = [];

  function dfs(name: string): void {
    color.set(name, GRAY);
    for (const neighbor of outbound.get(name) ?? []) {
      if (color.get(neighbor) === GRAY) {
        cycles.push(`${name} → ${neighbor}`);
      } else if (color.get(neighbor) === WHITE) {
        dfs(neighbor);
      }
    }
    color.set(name, BLACK);
  }

  for (const n of nodes) {
    if (color.get(n.name) === WHITE) dfs(n.name);
  }

  if (cycles.length > 0) {
    findings.push({
      severity: "WARN",
      category: "CYCLE",
      message: `Ciclo(s): ${cycles.join("; ")}. ¿Intencional (retry loop)?`,
      fix: "Si no es intencional, romper el ciclo.",
    });
  }
}

function checkTripleEntry(nodes: N8NNode[], findings: Finding[]): void {
  const activeTypes = new Set(
    nodes.filter((n) => !n.disabled).map((n) => n.type),
  );

  const hasManual = activeTypes.has("n8n-nodes-base.manualTrigger");
  const hasWebhook = activeTypes.has("n8n-nodes-base.webhook");
  const hasExecTrig = activeTypes.has("n8n-nodes-base.executeWorkflowTrigger");

  if (hasExecTrig && !hasManual && !hasWebhook) {
    findings.push({
      severity: "INFO",
      category: "TRIPLE_ENTRY",
      message:
        "Sub-workflow (solo Execute Workflow Trigger). Triple Entry opcional.",
    });
    return;
  }

  const missing: string[] = [];
  if (!hasManual) missing.push("Manual Trigger");
  if (!hasWebhook) missing.push("Webhook");
  if (!hasExecTrig) missing.push("Execute Workflow Trigger");

  if (missing.length > 0) {
    findings.push({
      severity: "WARN",
      category: "TRIPLE_ENTRY",
      message: `Faltan: ${missing.join(", ")}.`,
      fix: "Agregar triggers faltantes → primer nodo de lógica (OBLIGATORIO_01).",
    });
  } else {
    findings.push({
      severity: "INFO",
      category: "TRIPLE_ENTRY",
      message: "Triple Entry Pattern completo ✓",
    });
  }
}

function checkWebhookPaths(nodes: N8NNode[], findings: Finding[]): void {
  for (const node of nodes) {
    if (node.type !== "n8n-nodes-base.webhook") continue;
    const path = (node.parameters as Record<string, unknown>)?.path;
    if (typeof path === "string" && path.includes("webhook-test")) {
      findings.push({
        severity: "ERROR",
        category: "WEBHOOK",
        message: 'Ruta contiene "webhook-test" — PROHIBIDO_07.',
        node: node.name,
        fix: "Usar ruta de producción /webhook/.",
      });
    }
  }
}

function checkDisabledNodes(nodes: N8NNode[], findings: Finding[]): void {
  const disabled = nodes.filter((n) => n.disabled === true);
  if (disabled.length > 0) {
    findings.push({
      severity: "INFO",
      category: "DISABLED",
      message: `${disabled.length} nodo(s) deshabilitado(s): ${disabled.map((n) => n.name).join(", ")}.`,
      fix: "Revisar si son necesarios o eliminar.",
    });
  }
}

function checkCredentials(nodes: N8NNode[], findings: Finding[]): void {
  for (const node of nodes) {
    if (!node.credentials) continue;
    for (const [credType, credValue] of Object.entries(node.credentials)) {
      if (!credValue || typeof credValue !== "object") {
        findings.push({
          severity: "WARN",
          category: "CREDENTIALS",
          message: `Credencial "${credType}" malformada.`,
          node: node.name,
          fix: "Reconfigurar desde UI n8n → Settings → Credentials.",
        });
      }
    }
  }
}

function checkStandardContract(
  nodes: N8NNode[],
  outbound: Map<string, string[]>,
  findings: Finding[],
): void {
  const terminals = nodes.filter(
    (n) =>
      !n.disabled &&
      !isTrigger(n.type) &&
      (outbound.get(n.name)?.length ?? 0) === 0,
  );

  if (terminals.length === 0) return;

  for (const node of terminals) {
    if (node.type === "n8n-nodes-base.code") {
      const code = String(
        (node.parameters as Record<string, unknown>)?.jsCode ?? "",
      );
      if (!code.includes("success")) {
        findings.push({
          severity: "WARN",
          category: "CONTRACT",
          message:
            'Nodo terminal Code sin "success" — ¿falta Standard Contract?',
          node: node.name,
          fix: "Retornar { success, error_code, error_message, data, _meta } (OBLIGATORIO_02).",
        });
      }
    }
  }

  findings.push({
    severity: "INFO",
    category: "CONTRACT",
    message: `Nodo(s) terminal(es): ${terminals.map((n) => n.name).join(", ")}`,
    fix: "Verificar Standard Contract manualmente (OBLIGATORIO_02).",
  });
}

// ══════════════════════════════════════════════════════════════
//  REPORTE
// ══════════════════════════════════════════════════════════════

function printReport(
  fileName: string,
  wf: N8NWorkflow,
  findings: Finding[],
  sot: ResolvedSOT,
): void {
  const nodeCount = wf.nodes?.length ?? 0;
  const connCount = Object.keys(wf.connections ?? {}).length;

  const sourceColors: Record<string, string> = {
    live: C.green,
    cache: C.cyan,
    fallback: C.yellow,
  };
  const sourceIcon: Record<string, string> = {
    live: "🔴 LIVE",
    cache: "💾 CACHE",
    fallback: "📋 FALLBACK",
  };

  console.log("");
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(
    `${C.bold}  N8N WORKFLOW VALIDATOR v2 — Live Discovery${C.reset}`,
  );
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log("");
  console.log(`  ${C.gray}Archivo:${C.reset}      ${fileName}`);
  console.log(
    `  ${C.gray}Workflow:${C.reset}     ${wf.name ?? "(sin nombre)"}`,
  );
  console.log(`  ${C.gray}ID:${C.reset}           ${wf.id ?? "(no asignado)"}`);
  console.log(`  ${C.gray}Nodos:${C.reset}        ${nodeCount}`);
  console.log(`  ${C.gray}Conexiones:${C.reset}   ${connCount} fuentes`);
  console.log(
    `  ${C.gray}SOT:${C.reset}          ${sourceColors[sot.source]}${sourceIcon[sot.source]}${C.reset} ${C.gray}${sot.sourceDetail}${C.reset}`,
  );
  console.log("");

  const counts: Record<Severity, number> = {
    FATAL: 0,
    ERROR: 0,
    WARN: 0,
    INFO: 0,
  };
  for (const f of findings) counts[f.severity]++;

  const bar = (sev: Severity, count: number) => {
    const colors: Record<Severity, string> = {
      FATAL: C.red,
      ERROR: C.red,
      WARN: C.yellow,
      INFO: C.cyan,
    };
    const filled =
      count > 0
        ? `${colors[sev]}${C.bold}${sev}: ${count}${C.reset}`
        : `${C.gray}${sev}: 0${C.reset}`;
    return filled;
  };

  console.log(
    `  ${bar("FATAL", counts.FATAL)}  │  ${bar("ERROR", counts.ERROR)}  │  ${bar("WARN", counts.WARN)}  │  ${bar("INFO", counts.INFO)}`,
  );
  console.log("");

  const categories = [...new Set(findings.map((f) => f.category))];

  for (const cat of categories) {
    const catFindings = findings.filter((f) => f.category === cat);
    console.log(`  ${C.bold}${C.magenta}─── ${cat} ───${C.reset}`);

    for (const f of catFindings) {
      const nodeLabel = f.node ? ` ${C.gray}[${f.node}]${C.reset}` : "";
      console.log(`    ${ICONS[f.severity]}${nodeLabel} ${f.message}`);
      if (f.fix) {
        console.log(`           ${C.green}→ ${f.fix}${C.reset}`);
      }
    }
    console.log("");
  }

  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );

  if (counts.FATAL > 0) {
    console.log(
      `  ${C.red}${C.bold}✖ FATAL — Workflow inutilizable en n8n actual${C.reset}`,
    );
    process.exitCode = 2;
  } else if (counts.ERROR > 0) {
    console.log(
      `  ${C.red}${C.bold}✘ ERRORES — Corregir antes de subir${C.reset}`,
    );
    process.exitCode = 1;
  } else if (counts.WARN > 0) {
    console.log(
      `  ${C.yellow}${C.bold}⚠ ADVERTENCIAS — Funcional pero revisar${C.reset}`,
    );
    process.exitCode = 0;
  } else {
    console.log(`  ${C.green}${C.bold}✔ WORKFLOW VÁLIDO${C.reset}`);
    process.exitCode = 0;
  }

  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log("");
}

// ══════════════════════════════════════════════════════════════
//  DISCOVER-ONLY: Imprimir node types instalados
// ══════════════════════════════════════════════════════════════

function printDiscoveryReport(cache: NodeTypeCache): void {
  console.log(
    `\n${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(
    `${C.bold}  NODE TYPES INSTALADOS — ${cache.n8nBaseUrl}${C.reset}`,
  );
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(`  ${C.gray}Descubierto:${C.reset} ${cache.discoveredAt}`);
  console.log(`  ${C.gray}Total:${C.reset}       ${cache.totalTypes} tipos\n`);

  const groups: Record<string, Array<[string, DiscoveredNodeType]>> = {};

  for (const [name, info] of Object.entries(cache.nodeTypes)) {
    const prefix = name.split(".")[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push([name, info]);
  }

  for (const [prefix, entries] of Object.entries(groups)) {
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    console.log(
      `  ${C.bold}${C.magenta}─── ${prefix} (${entries.length}) ───${C.reset}`,
    );

    for (const [name, info] of entries) {
      const shortName = name.replace(`${prefix}.`, "");
      const versions = info.availableVersions.join(", ");
      const latest = info.latestVersion;

      console.log(
        `    ${C.cyan}${shortName.padEnd(35)}${C.reset} ` +
          `v${C.bold}${latest}${C.reset} ` +
          `${C.gray}[${versions}]${C.reset} ` +
          `${C.gray}${info.displayName}${C.reset}`,
      );
    }
    console.log("");
  }

  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}\n`,
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = {
    live: args.includes("--live"),
    refresh: args.includes("--refresh"),
    verbose: args.includes("--verbose"),
    discoverOnly: args.includes("--discover-only"),
    help: args.includes("--help") || args.includes("-h"),
  };

  const positionalArgs = args.filter(
    (a) => !a.startsWith("--") && !a.startsWith("-"),
  );

  if (flags.help) {
    console.log(`
  ${C.bold}N8N Workflow Validator v2 — Con Live Discovery${C.reset}

  ${C.bold}Uso:${C.reset}
    npx tsx scripts-ts/validate_workflow.ts <workflow.json>           ${C.gray}# Auto: cache → discovery → fallback${C.reset}
    npx tsx scripts-ts/validate_workflow.ts <workflow.json> --live    ${C.gray}# Siempre consulta la API${C.reset}
    npx tsx scripts-ts/validate_workflow.ts <workflow.json> --refresh ${C.gray}# Consulta API + actualiza cache${C.reset}
    npx tsx scripts-ts/validate_workflow.ts --discover-only           ${C.gray}# Lista todos los node types instalados${C.reset}
    npx tsx scripts-ts/validate_workflow.ts --discover-only --refresh ${C.gray}# Fuerza re-discovery${C.reset}

  ${C.bold}Flags:${C.reset}
    --live           Consulta n8n API en cada ejecución (no usa caché)
    --refresh        Fuerza re-descubrimiento y actualiza caché
    --discover-only  Solo descubre node types, no valida workflow
    --verbose        Detalles extra de discovery
    --help           Muestra esta ayuda

  ${C.bold}Resolución de SOT (Source of Truth):${C.reset}
    1. 🔴 LIVE     API de tu instancia n8n → versiones exactas instaladas
    2. 💾 CACHE    ${CACHE_FILENAME} (auto-generated, < 24h)
    3. 📋 FALLBACK SOT hardcodeado del system prompt v3.1

  ${C.bold}Auth (ambos enviados si disponibles):${C.reset}
    N8N_API_KEY       → X-N8N-Api-Key   (/api/v1/*)
    N8N_ACCESS_TOKEN  → Bearer token    (/rest/*)

  ${C.bold}Validaciones (14 checks):${C.reset}
    • Estructura JSON             • Campos requeridos por nodo
    • Nombres duplicados          • IDs duplicados
    • Tipos instalados (live!)    • Versiones disponibles (live!)
    • Conexiones rotas            • Nodos huérfanos / islas
    • Ciclos en el grafo          • Triple Entry Pattern
    • Standard Contract           • Webhook paths prohibidos
    • Nodos deshabilitados        • Credenciales malformadas

  ${C.bold}Requiere .env:${C.reset}
    N8N_API_URL=https://n8n.stax.ink
    N8N_API_KEY=tu-api-key
    N8N_ACCESS_TOKEN=tu-access-token

  ${C.bold}Exit codes:${C.reset}  0=OK  1=Errores  2=Fatal
`);
    return;
  }

  if (flags.discoverOnly) {
    const env = loadEnv();
    if (!env.apiUrl) {
      console.error(`${C.red}✖ N8N_API_URL no configurado${C.reset}`);
      process.exitCode = 1;
      return;
    }

    if (!flags.refresh) {
      const cached = loadCache();
      if (cached) {
        printDiscoveryReport(cached);
        return;
      }
    }

    const discovered = await discoverNodeTypes(env, flags.verbose);
    if (!discovered) {
      console.error(`${C.red}✖ No se pudieron descubrir node types${C.reset}`);
      process.exitCode = 1;
      return;
    }

    saveCache(discovered);
    printDiscoveryReport(discovered);
    return;
  }

  if (positionalArgs.length === 0) {
    console.error(
      `${C.red}✖ Especificar archivo: npx tsx scripts-ts/validate_workflow.ts <file.json>${C.reset}`,
    );
    console.error(
      `${C.gray}  Usa --help para ver todas las opciones${C.reset}`,
    );
    process.exitCode = 1;
    return;
  }

  const filePath = positionalArgs[0];
  if (!existsSync(filePath)) {
    console.error(`${C.red}✖ Archivo no encontrado: ${filePath}${C.reset}`);
    process.exitCode = 2;
    return;
  }

  let wf: N8NWorkflow;
  try {
    const raw = readFileSync(filePath, "utf-8");
    wf = JSON.parse(raw) as N8NWorkflow;
  } catch (err) {
    console.error(
      `${C.red}✖ JSON inválido: ${(err as Error).message}${C.reset}`,
    );
    process.exitCode = 2;
    return;
  }

  const sot = await resolveSOT(flags);

  const findings: Finding[] = [];
  const structureOK = checkStructure(wf, findings);

  if (structureOK && wf.nodes) {
    checkNodeFields(wf.nodes, findings);
    checkDuplicateNames(wf.nodes, findings);
    checkDuplicateIds(wf.nodes, findings);
    checkNodeTypesAndVersions(wf.nodes, sot, findings);
    checkDisabledNodes(wf.nodes, findings);
    checkCredentials(wf.nodes, findings);
    checkWebhookPaths(wf.nodes, findings);
    checkTripleEntry(wf.nodes, findings);

    if (wf.connections) {
      const { inbound, outbound } = checkConnections(
        wf.nodes,
        wf.connections,
        findings,
      );
      checkOrphans(wf.nodes, inbound, outbound, findings);
      checkCycles(wf.nodes, outbound, findings);
      checkStandardContract(wf.nodes, outbound, findings);
    }
  }

  const order: Record<Severity, number> = {
    FATAL: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
  };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  printReport(basename(filePath), wf, findings, sot);
}

main();
