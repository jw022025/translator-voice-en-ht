// Temporary Netlify function to handle audio uploads until backend is deployed
export const handler = async (event, context) => {
  // TRACE: Function entry point
  console.log('🚀 ASR-UPLOAD FUNCTION STARTED', {
    timestamp: new Date().toISOString(),
    requestId: context.awsRequestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion
  });

  // Define CORS headers at the top level for consistent use
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Safety wrapper to prevent any unhandled errors from causing 502s
  try {
    console.log('📋 ENTERING MAIN HANDLER LOGIC');

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    console.log('✅ HANDLING OPTIONS REQUEST - CORS PREFLIGHT');
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    console.log('❌ METHOD NOT ALLOWED:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Method not allowed',
        message: 'This endpoint only accepts POST requests' 
      })
    };
  }

  console.log('✅ POST REQUEST CONFIRMED - PROCEEDING TO MAIN LOGIC');

  try {
    // Debug logging to help diagnose the issue
    console.log('Event object:', JSON.stringify({
      path: event.path,
      httpMethod: event.httpMethod,
      headers: event.headers,
      queryStringParameters: event.queryStringParameters
    }, null, 2));
    
    // Parse the path to get language - handle different path formats
    let lang = 'en'; // default
    if (event.path) {
      const pathParts = event.path.split('/').filter(part => part.length > 0);
      console.log('Path parts:', pathParts);
      
      // Look for language in the last part of the path
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart === 'en' || lastPart === 'ht') {
        lang = lastPart;
      }
      // Also check if it's in the query params or headers
      else if (event.queryStringParameters?.lang) {
        lang = event.queryStringParameters.lang;
      }
    }
    
    console.log('Detected language:', lang);

    // Validate language
    if (!['en', 'ht'].includes(lang)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error: 'Invalid language parameter',
          message: `Language must be 'en' or 'ht', got '${lang}'`
        })
      };
    }

    // Safely handle the request body
    let bodySize = 0;
    try {
      bodySize = event.body ? event.body.length : 0;
      console.log('Request body size:', bodySize, 'bytes');
    } catch (bodyError) {
      console.warn('Error reading body size:', bodyError.message);
    }
    
    // Generate a mock response similar to the real backend
    const audioId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    const mockResponse = {
      kind: 'audio',
      id: audioId,
      lang: lang === 'ht' ? 'ht-HT' : 'en-US',
      createdAt: new Date().toISOString(),
      contentType: event.headers['content-type'] || 'application/octet-stream',
      bytes: bodySize,
      audioFile: `${audioId}.webm`,
      transcript: lang === 'ht' ? 'Bonjou mond (Temp ASR)' : 'Hello World (Temp ASR)',
      codec: 'opus',
      sr: null,
      duration_s: null,
      domain: [],
      status: 'temporary',
      message: 'This is a temporary response. Backend deployment needed for full functionality.'
    };

    console.log('🎉 SUCCESS - RETURNING RESPONSE:', { audioId, lang, bodySize });
    
    const successResponse = {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        ...mockResponse 
      })
    };
    
    console.log('📤 FINAL RESPONSE:', JSON.stringify(successResponse, null, 2));
    return successResponse;

  } catch (error) {
    console.error('Audio upload error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      event: {
        path: event.path,
        httpMethod: event.httpMethod,
        headers: event.headers
      }
    });
    
    // Always return a proper response structure
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Internal server error',
        message: 'Audio upload failed temporarily. Backend deployment needed.',
        details: error.message || 'Unknown error',
        debug: {
          path: event.path,
          method: event.httpMethod,
          timestamp: new Date().toISOString()
        }
      })
    };
  }
  
  } catch (unexpectedError) {
    // Final safety net - if anything goes wrong at all, return a proper error response
    console.error('💥 CRITICAL ERROR IN ASR-UPLOAD HANDLER:', {
      name: unexpectedError.name,
      message: unexpectedError.message,
      stack: unexpectedError.stack,
      timestamp: new Date().toISOString()
    });
    
    const errorResponse = {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Critical server error',
        message: 'Function crashed unexpectedly. Backend deployment needed.',
        details: unexpectedError.message || 'Unknown critical error',
        timestamp: new Date().toISOString()
      })
    };
    
    console.log('🚨 RETURNING ERROR RESPONSE:', JSON.stringify(errorResponse, null, 2));
    return errorResponse;
  }
};