// FAU Erdal Barnehage location configuration
import { KINDERGARTEN_ADDRESS_NORWAY } from "@shared/constants";

export const LOCATION_ADDRESSES = {
  "Småbarnsfløyen": KINDERGARTEN_ADDRESS_NORWAY,
  "Storbarnsfløyen": KINDERGARTEN_ADDRESS_NORWAY,
  "Møterom": KINDERGARTEN_ADDRESS_NORWAY,
  "Ute": KINDERGARTEN_ADDRESS_NORWAY,
} as const;

// Address validation using basic format checking
export function validateAddress(address: string): boolean {
  if (!address || address.trim().length < 5) {
    return false;
  }
  
  // Basic address format validation
  const addressPattern = /^[A-Za-zæøåÆØÅ0-9\s,.-]+$/;
  return addressPattern.test(address.trim());
}

// Generate map URLs for different platforms
export function generateMapUrls(address: string) {
  const encodedAddress = encodeURIComponent(address);
  
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
    apple: `https://maps.apple.com/?q=${encodedAddress}`,
    openstreetmap: `https://www.openstreetmap.org/search?query=${encodedAddress}`,
  };
}

// Get the display address for a location
export function getLocationAddress(location: string, customLocation?: string): string {
  if (location === "Annet" && customLocation) {
    return customLocation;
  }
  
  return LOCATION_ADDRESSES[location as keyof typeof LOCATION_ADDRESSES] || KINDERGARTEN_ADDRESS_NORWAY;
}