import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary once at module initialization
// This is more efficient than configuring on every request
let isConfigured = false;

export function configureCloudinary() {
  if (isConfigured) {
    return cloudinary;
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET) {
    console.warn('Cloudinary configuration missing. File uploads will fail.');
    throw new Error('Cloudinary configuration not available');
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  isConfigured = true;
  return cloudinary;
}

export default cloudinary;
