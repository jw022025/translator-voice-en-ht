// Temporary Netlify function to handle sample linking until backend is deployed
exports.handler = async (event, context) => {
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
    // Parse the request body
    const payload = JSON.parse(event.body || '{}');
    const { term, category, enText, htText, enAudioId, htAudioId, annotator, consent } = payload;

    // Validate required fields
    const requiredFields = { term, category, enAudioId, htAudioId };
    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);
    
    if (missingFields.length > 0 || !consent) {
      const error = missingFields.length > 0 
        ? `Missing required fields: ${missingFields.join(', ')}`
        : 'Consent is required';
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          ok: false, 
          error, 
          missingFields: missingFields.length > 0 ? missingFields : undefined
        })
      };
    }

    // Generate a mock sample ID
    const sampleId = `temp-sample-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    const mockRecord = {
      kind: 'pair',
      sampleId,
      createdAt: new Date().toISOString(),
      term,
      category,
      annotator: annotator || 'anonymous',
      consent: !!consent,
      en: { text: enText || term, audioRef: enAudioId },
      ht: { text: htText || '', audioRef: htAudioId },
      status: 'temporary',
      message: 'This is a temporary response. Backend deployment needed for permanent storage.'
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        sampleId, 
        record: mockRecord 
      })
    };

  } catch (error) {
    console.error('Sample linking error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Internal server error',
        message: 'Sample linking failed temporarily. Backend deployment needed.',
        details: error.message
      })
    };
  }
};