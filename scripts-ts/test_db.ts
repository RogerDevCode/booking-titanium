import * as fs from 'fs';
import * as path from 'path';

const p = path.join(process.cwd(), 'workflows', 'RAG_02_Document_Retrieval.json');
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

for (const node of data.nodes) {
  if (node.name === 'Build Interpolated Query' && node.type === 'n8n-nodes-base.code') {
    // Override the query to just fetch everything
    node.parameters.jsCode = `const query = \\\`
SELECT json_build_object(
  'success', true,
  'data', json_build_object(
    'query', 'debug',
    'documents', COALESCE((SELECT json_agg(r) FROM (SELECT id, title, provider_id, status FROM rag_documents LIMIT 10) r), '[]'::json)
  )
) AS response
\\\`.trim();
return [{ json: { query } }];`;
  }
}

fs.writeFileSync('workflows/DB_Debug.json', JSON.stringify({...data, name: 'DB_Debug'}, null, 2));
console.log('Created DB_Debug.json');
