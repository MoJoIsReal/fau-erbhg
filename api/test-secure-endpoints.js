export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tests = [];
  const baseUrl = req.headers.host ? `https://${req.headers.host}` : 'http://localhost:5000';

  try {
    // Test 1: Status endpoint
    try {
      const statusResponse = await fetch(`${baseUrl}/api/secure-status`);
      const statusData = await statusResponse.json();
      tests.push({
        name: 'Status Endpoint',
        status: statusResponse.ok ? 'PASS' : 'FAIL',
        response: statusData
      });
    } catch (error) {
      tests.push({
        name: 'Status Endpoint',
        status: 'FAIL',
        error: error.message
      });
    }

    // Test 2: Database initialization
    try {
      const dbResponse = await fetch(`${baseUrl}/api/init-secure-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const dbData = await dbResponse.json();
      tests.push({
        name: 'Database Initialization',
        status: dbResponse.ok ? 'PASS' : 'FAIL',
        response: dbData
      });
    } catch (error) {
      tests.push({
        name: 'Database Initialization',
        status: 'FAIL',
        error: error.message
      });
    }

    // Test 3: Events endpoint
    try {
      const eventsResponse = await fetch(`${baseUrl}/api/secure-events`);
      const eventsData = await eventsResponse.json();
      tests.push({
        name: 'Events Endpoint',
        status: eventsResponse.ok ? 'PASS' : 'FAIL',
        response: Array.isArray(eventsData) ? `${eventsData.length} events` : eventsData
      });
    } catch (error) {
      tests.push({
        name: 'Events Endpoint',
        status: 'FAIL',
        error: error.message
      });
    }

    // Test 4: Documents endpoint
    try {
      const docsResponse = await fetch(`${baseUrl}/api/secure-documents`);
      const docsData = await docsResponse.json();
      tests.push({
        name: 'Documents Endpoint',
        status: docsResponse.ok ? 'PASS' : 'FAIL',
        response: Array.isArray(docsData) ? `${docsData.length} documents` : docsData
      });
    } catch (error) {
      tests.push({
        name: 'Documents Endpoint',
        status: 'FAIL',
        error: error.message
      });
    }

    // Environment checks
    const envChecks = {
      database: !!process.env.DATABASE_URL,
      session: !!process.env.SESSION_SECRET,
      email: !!process.env.SENDGRID_API_KEY,
      cloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
      admin_setup: !!process.env.ADMIN_SETUP_KEY
    };

    const passedTests = tests.filter(t => t.status === 'PASS').length;
    const totalTests = tests.length;

    return res.status(200).json({
      summary: `${passedTests}/${totalTests} tests passed`,
      environment: envChecks,
      tests: tests,
      timestamp: new Date().toISOString(),
      ready_for_deployment: passedTests === totalTests && Object.values(envChecks).every(Boolean)
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Test suite failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}