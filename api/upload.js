export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    const token = authHeader.substring(7);
    let decoded;
    
    try {
      decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      const tokenAge = Date.now() - decoded.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (!decoded.userId || !decoded.role || tokenAge >= maxAge) {
        return res.status(401).json({ message: 'Ikke innlogget' });
      }
      
      // Only admin can upload files
      if (decoded.role !== 'admin') {
        return res.status(403).json({ message: 'Ingen tilgang' });
      }
    } catch (parseError) {
      return res.status(401).json({ message: 'Ikke innlogget' });
    }

    // Check if Cloudinary credentials are available
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ message: 'Cloudinary ikke konfigurert' });
    }

    // Get file data from request body
    const { file, fileName } = req.body;
    
    if (!file || !fileName) {
      return res.status(400).json({ message: 'Fil og filnavn er påkrevd' });
    }

    // Create signature for Cloudinary upload
    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = `folder=fau-documents&timestamp=${timestamp}`;
    
    // Generate signature using crypto
    const crypto = await import('crypto');
    const signature = crypto
      .createHash('sha256')
      .update(paramsToSign + apiSecret)
      .digest('hex');

    // Upload to Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'fau-documents');
    formData.append('timestamp', timestamp.toString());
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    if (!uploadResponse.ok) {
      throw new Error('Cloudinary upload failed');
    }

    const uploadResult = await uploadResponse.json();

    return res.json({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ message: 'Feil ved opplasting' });
  }
}