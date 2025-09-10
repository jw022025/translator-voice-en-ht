// Export functionality for model training data
const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('🎯 EXPORT FUNCTION CALLED', {
      path: event.path,
      queryParams: event.queryStringParameters,
      timestamp: new Date().toISOString()
    });

    // Parse query parameters
    const params = event.queryStringParameters || {};
    const format = params.format || 'json'; // json, csv, jsonl
    const category = params.category; // medical, insurance, or all
    const since = params.since; // ISO date string
    const includeAudio = params.includeAudio === 'true'; // include audio metadata

    // For Netlify functions, we can't access the real file system
    // So we'll return mock training data that shows the expected structure
    const mockTrainingData = generateMockTrainingData(category, since, includeAudio);

    // Set appropriate content type and filename
    let contentType, filename, responseBody;
    
    switch (format.toLowerCase()) {
      case 'csv':
        contentType = 'text/csv';
        filename = `training-data-${new Date().toISOString().split('T')[0]}.csv`;
        responseBody = convertToCSV(mockTrainingData);
        break;
        
      case 'jsonl':
        contentType = 'application/x-jsonlines';
        filename = `training-data-${new Date().toISOString().split('T')[0]}.jsonl`;
        responseBody = convertToJSONL(mockTrainingData);
        break;
        
      default: // json
        contentType = 'application/json';
        filename = `training-data-${new Date().toISOString().split('T')[0]}.json`;
        responseBody = JSON.stringify({
          metadata: {
            exportedAt: new Date().toISOString(),
            totalPairs: mockTrainingData.length,
            category: category || 'all',
            includeAudio: includeAudio,
            format: 'json'
          },
          data: mockTrainingData
        }, null, 2);
    }

    console.log('✅ EXPORT SUCCESS', {
      format,
      dataCount: mockTrainingData.length,
      filename
    });

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`
      },
      body: responseBody
    };

  } catch (error) {
    console.error('💥 EXPORT ERROR:', error);
    
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Export failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

function generateMockTrainingData(category, since, includeAudio) {
  const mockData = [
    {
      sampleId: "sample-001",
      createdAt: "2025-09-10T00:54:22.382Z",
      term: "Hypertension",
      category: "medical",
      annotator: "medical-expert-1",
      en: {
        text: "I have a question about hypertension.",
        audioId: "en-audio-001",
        audioFile: includeAudio ? "en-audio-001.webm" : undefined,
        duration: includeAudio ? 3.2 : undefined
      },
      ht: {
        text: "Mwen gen yon kesyon sou tansyon wo.",
        audioId: "ht-audio-001", 
        audioFile: includeAudio ? "ht-audio-001.webm" : undefined,
        duration: includeAudio ? 3.8 : undefined
      }
    },
    {
      sampleId: "sample-002",
      createdAt: "2025-09-10T01:15:33.123Z",
      term: "Premium",
      category: "insurance",
      annotator: "insurance-expert-1",
      en: {
        text: "How does my premium affect the price?",
        audioId: "en-audio-002",
        audioFile: includeAudio ? "en-audio-002.webm" : undefined,
        duration: includeAudio ? 2.9 : undefined
      },
      ht: {
        text: "Kijan prim mwen an afekte pri a?",
        audioId: "ht-audio-002",
        audioFile: includeAudio ? "ht-audio-002.webm" : undefined,
        duration: includeAudio ? 3.1 : undefined
      }
    },
    {
      sampleId: "sample-003", 
      createdAt: "2025-09-10T02:30:45.456Z",
      term: "Diabetes",
      category: "medical",
      annotator: "medical-expert-2", 
      en: {
        text: "My doctor mentioned diabetes. What does it mean?",
        audioId: "en-audio-003",
        audioFile: includeAudio ? "en-audio-003.webm" : undefined,
        duration: includeAudio ? 4.1 : undefined
      },
      ht: {
        text: "Doktè mwen an te mansyone dyabèt. Kisa sa vle di?",
        audioId: "ht-audio-003",
        audioFile: includeAudio ? "ht-audio-003.webm" : undefined,
        duration: includeAudio ? 4.5 : undefined
      }
    }
  ];

  // Filter by category if specified
  let filteredData = category ? 
    mockData.filter(item => item.category === category) : 
    mockData;

  // Filter by date if specified
  if (since) {
    const sinceDate = new Date(since);
    filteredData = filteredData.filter(item => 
      new Date(item.createdAt) >= sinceDate
    );
  }

  return filteredData;
}

function convertToCSV(data) {
  if (data.length === 0) return 'No data available';

  const headers = [
    'sampleId', 'createdAt', 'term', 'category', 'annotator',
    'en_text', 'en_audioId', 'en_audioFile', 'en_duration',
    'ht_text', 'ht_audioId', 'ht_audioFile', 'ht_duration'
  ];

  const csvRows = [headers.join(',')];

  data.forEach(item => {
    const row = [
      escapeCSV(item.sampleId),
      escapeCSV(item.createdAt),
      escapeCSV(item.term),
      escapeCSV(item.category),
      escapeCSV(item.annotator),
      escapeCSV(item.en.text),
      escapeCSV(item.en.audioId),
      escapeCSV(item.en.audioFile || ''),
      escapeCSV(item.en.duration || ''),
      escapeCSV(item.ht.text),
      escapeCSV(item.ht.audioId),
      escapeCSV(item.ht.audioFile || ''),
      escapeCSV(item.ht.duration || '')
    ];
    csvRows.push(row.join(','));
  });

  return csvRows.join('\n');
}

function convertToJSONL(data) {
  return data.map(item => JSON.stringify(item)).join('\n');
}

function escapeCSV(field) {
  if (typeof field !== 'string') field = String(field);
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}