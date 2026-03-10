/**
 * RAG_01 Document Ingestion - Error Formatters
 * Version: 1.7.4
 * 
 * Central Error Handler + Format Validation/Embedding/Database Error
 * Consolidates all error formatting into single helper
 */

interface ErrorInput {
  json?: {
    message?: string;
    error_code?: string;
    error_message?: string;
    success?: boolean;
    [key: string]: any;
  };
}

interface Output {
  json: {
    success: boolean;
    error_code: string;
    error_message: string;
    data: null;
    _meta: {
      source: string;
      timestamp: string;
      version: string;
    };
  };
}

/**
 * Format Validation Error
 */
export function formatValidationError(input: ErrorInput): Output[] {
  const msg = input.json?.message || 'Validation failed';
  return [{
    json: {
      error_code: 'VALIDATION_ERROR',
      error_message: msg
    }
  }];
}

/**
 * Format Embedding Error
 */
export function formatEmbeddingError(input: ErrorInput): Output[] {
  const msg = input.json?.message || 'Embedding failed';
  return [{
    json: {
      error_code: 'EMBEDDING_ERROR',
      error_message: msg
    }
  }];
}

/**
 * Format Database Error
 */
export function formatDatabaseError(input: ErrorInput): Output[] {
  const msg = input.json?.message || 'Database failed';
  return [{
    json: {
      error_code: 'DATABASE_ERROR',
      error_message: msg
    }
  }];
}

/**
 * Central Error Handler
 * Consolidates error codes and messages into standard contract
 */
export function centralErrorHandler(input: ErrorInput): Output[] {
  const input_data = input.json || {};
  let errorCode = input_data.error_code || 'GENERAL_ERROR';
  let errorMessage = input_data.error_message || input_data.message || 'Unknown error';
  
  return [{
    json: {
      success: false,
      error_code: errorCode,
      error_message: errorMessage,
      data: null,
      _meta: {
        source: 'RAG_01_Document_Ingestion',
        timestamp: new Date().toISOString(),
        version: '1.7.4'
      }
    }
  }];
}
