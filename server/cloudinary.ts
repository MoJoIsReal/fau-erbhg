import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadFile(filePath: string, originalName: string, folder = 'fau-documents'): Promise<{
  url: string;
  publicId: string;
  format: string;
  bytes: number;
}> {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      public_id: originalName.replace(/\.[^/.]+$/, ''), // Remove file extension
      resource_type: 'auto', // Automatically detect file type
      use_filename: true,
      unique_filename: true,
      access_mode: 'public', // Ensure public access
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload file to Cloudinary');
  }
}

export async function deleteFile(publicId: string): Promise<boolean> {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === 'ok';
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return false;
  }
}

export default cloudinary;