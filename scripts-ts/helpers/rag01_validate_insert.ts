/**
 * RAG_01 Document Ingestion - Post-Validate Insert
 * Version: 1.7.4
 * 
 * Post-Validate Insert (SEC02)
 * Validates database insert response
 */

interface DBOutput {
  json?: {
    id?: any;
    [key: string]: any;
  };
}

interface Output {
  json: {
    db_result: any;
  };
}

export function postValidateInsert(dbOutput: DBOutput[]): Output[] {
  if (!dbOutput || dbOutput.length === 0 || !dbOutput[0].json || !dbOutput[0].json.id) {
    throw new Error('DATABASE_ERROR: Insert failed');
  }
  
  return [{
    json: {
      db_result: dbOutput[0].json
    }
  }];
}
