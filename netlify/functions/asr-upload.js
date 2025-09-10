// Temporary Netlify function to handle audio uploads until backend is deployed
export const handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
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

  try {
    // Parse the path to get language
    const pathParts = event.path.split('/');
    const lang = pathParts[pathParts.length - 1]; // Gets 'en' or 'ht' from path

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

    // Generate a mock response similar to the real backend
    const audioId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const bodySize = event.body ? event.body.length : 0;

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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        ...mockResponse 
      })
    };

  } catch (error) {
    console.error('Audio upload error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Internal server error',
        message: 'Audio upload failed temporarily. Backend deployment needed.',
        details: error.message
      })
    };
  }
};