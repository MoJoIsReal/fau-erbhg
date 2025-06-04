import { Button } from "@/components/ui/button";
import { MapPin, ExternalLink } from "lucide-react";
import { generateMapUrls, getLocationAddress } from "@/lib/location-utils";

interface LocationMapLinkProps {
  location: string;
  customLocation?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export default function LocationMapLink({ 
  location, 
  customLocation, 
  variant = "outline", 
  size = "sm" 
}: LocationMapLinkProps) {
  const address = getLocationAddress(location, customLocation);
  const mapUrls = generateMapUrls(address);

  const handleMapClick = () => {
    // Default to Google Maps
    window.open(mapUrls.google, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button 
      variant={variant} 
      size={size} 
      className="gap-2" 
      onClick={handleMapClick}
      title={`Åpne kart for: ${address}`}
    >
      <MapPin className="h-4 w-4" />
      <span className="truncate max-w-[150px]">{location}</span>
      <ExternalLink className="h-3 w-3" />
    </Button>
  );
}