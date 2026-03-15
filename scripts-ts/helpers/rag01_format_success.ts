/**
 * RAG_01 Document Ingestion - Format Success Response
 * Version: 1.7.4
 * 
 * Formats successful insert response with standard contract
 */

interface DBRecord {
  id?: any;
  title?: string;
  provider_id?: number;
  created_at?: string;
  [key: string]: any;
}

interface Input {
  json?: {
    db_result?: DBRecord;
  };
}

interface Output {
  json: {
    success: boolean;
    error_code: null;
    error_message: null;
    data: {
      document_id: any;
      title: string;
      provider_id: number;
      created_at: string;
    };
    _meta: {
      source: string;
      timestamp: string;
      workflow_id: string;
      version: string;
    };
  };
}

export function formatSuccessResponse(input: Input): Output[] {
  const dbRecord = input.json?.db_result || {};
  
  return [{
    json: {
      success: true,
      error_code: null,
      error_message: null,
      data: {
        document_id: dbRecord.id,
        title: dbRecord.title,
        provider_id: dbRecord.provider_id,
        created_at: dbRecord.created_at
      },
      _meta: {
        source: 'RAG_01_Document_Ingestion',
        timestamp: new Date().toISOString(),
        workflow_id: 'RAG_01',
        version: '1.7.4'
      }
    }
  }];
}
