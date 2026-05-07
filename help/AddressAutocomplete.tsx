import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { MapPin, Loader2 } from "lucide-react";

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}

const AddressAutocomplete = ({
  value,
  onChange,
  placeholder = "Start typing your address…",
  id = "address",
  className,
}: AddressAutocompleteProps) => {
  const { loaded } = useGoogleMaps();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [, setIsReady] = useState(false);

  useEffect(() => {
    if (!loaded || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      fields: ["formatted_address", "address_components"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place?.formatted_address) {
        onChange(place.formatted_address);
      }
    });

    autocompleteRef.current = autocomplete;
    setIsReady(true);

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [loaded, onChange]);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        autoComplete="off"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
        {loaded ? (
          <MapPin className="h-4 w-4" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
      </div>
    </div>
  );
};

export default AddressAutocomplete;
