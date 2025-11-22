// Netlify serverless function
exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  console.log('\n========== NEW REQUEST ==========');
  
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('❌ ERROR: No API key found in environment variables');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'API key not configured. Add GEMINI_API_KEY to Netlify environment variables' 
      })
    };
  }

  console.log('✅ API key found');

  try {
    const { prompt, temperature = 0.9, maxTokens } = JSON.parse(event.body);

    const fetch = require('node-fetch');
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    console.log('🌐 Calling Gemini API with model: gemini-2.5-flash');
    
    const generationConfig = { temperature };
    if (maxTokens) {
      generationConfig.maxOutputTokens = maxTokens;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig
      })
    });

    console.log('📡 Response status:', response.status, response.statusText);

    const data = await response.json();
    
    console.log('✅ API Response received');

    // Check for API errors
    if (data.error) {
      console.error('❌ API Error:', data.error.message);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: `Gemini API Error: ${data.error.message}`,
          details: data.error
        })
      };
    }

    // Check structure
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Unexpected response structure');
      console.log('Response:', JSON.stringify(data, null, 2));
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Unexpected API response structure',
          details: data
        })
      };
    }

    console.log('✅ SUCCESS!');
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
    
  } catch (error) {
    console.error('❌ Exception:', error.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error.message
      })
    };
  }
};