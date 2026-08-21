export function parseCloudinaryDeliveryUrl(parsedUrl) {
  const parts = parsedUrl.pathname.split('/').filter(Boolean);
  const [cloudName, resourceType, deliveryType, ...rest] = parts;
  const publicIdParts = [...rest];

  if (publicIdParts[0] && /^v\d+$/.test(publicIdParts[0])) {
    publicIdParts.shift();
  }

  if (['image', 'video'].includes(resourceType)) {
    const lastIndex = publicIdParts.length - 1;
    const lastPart = publicIdParts[lastIndex] || '';
    const dotIndex = lastPart.lastIndexOf('.');

    if (dotIndex > 0) {
      publicIdParts[lastIndex] = lastPart.slice(0, dotIndex);
    }
  }

  return {
    cloudName,
    resourceType,
    deliveryType,
    publicId: decodeURIComponent(publicIdParts.join('/')),
  };
}
