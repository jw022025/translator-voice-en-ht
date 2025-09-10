// Temporary health check function until backend is deployed
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  const health = {
    ok: true,
    service: 'translator-voice-en-ht-temp',
    version: '0.1.0-temp',
    timestamp: new Date().toISOString(),
    environment: 'netlify-functions',
    status: 'temporary',
    message: 'Using temporary Netlify functions. Full backend deployment needed.',
    uptime: Math.floor(Date.now() / 1000) // Rough uptime
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(health, null, 2)
  };
};