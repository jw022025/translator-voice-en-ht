// Simple test function without any imports
exports.handler = async (event, context) => {
  console.log('🚀 TEST-SIMPLE FUNCTION CALLED', {
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString()
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Simple test function works!',
      timestamp: new Date().toISOString(),
      event: {
        method: event.httpMethod,
        path: event.path
      }
    })
  };
};