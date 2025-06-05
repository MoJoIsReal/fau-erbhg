import { v2 as cloudinary } from 'cloudinary';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(500).json({ error: 'Cloudinary configuration missing' });
    }

    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const { fileData, fileName, category = 'documents' } = req.body;

    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'File data and name are required' });
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(fileData, {
      folder: `fau-barnehage/${category}`,
      public_id: `${Date.now()}-${fileName}`,
      resource_type: 'auto',
      allowed_formats: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif']
    });

    return res.status(200).json({
      success: true,
      fileUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName: fileName,
      message: 'File uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      error: 'Upload failed',
      details: error.message 
    });
  }
}