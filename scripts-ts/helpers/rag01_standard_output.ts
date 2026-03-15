/**
 * RAG_01 Document Ingestion - Standard Contract Output
 * Version: 4.3.1
 * 
 * Final output formatter that ensures standard contract compliance
 */

interface Input {
  json?: {
    success?: boolean;
    error_code?: string;
    error_message?: string;
    data?: any;
    [key: string]: any;
  };
}

interface Output {
  json: {
    success: boolean;
    error_code: string | null;
    error_message: string | null;
    data: any;
    _meta: {
      source: string;
      workflow_id: string;
      timestamp: string;
      version: string;
    };
  };
}

export function standardContractOutput(input: Input): Output[] {
  const result = input.json || {};
  const isSuccess = result.success !== false;
  
  return [{
    json: {
      success: isSuccess,
      error_code: isSuccess ? null : (result.error_code || 'UNKNOWN_ERROR'),
      error_message: isSuccess ? null : (result.error_message || 'An error occurred'),
      data: result.data || null,
      _meta: {
        source: 'RAG_01_DOCUMENT_INGESTION',
        workflow_id: 'RAG_01_DOCUMENT_INGESTION',
        timestamp: new Date().toISOString(),
        version: '4.3.1'
      }
    }
  }];
}
