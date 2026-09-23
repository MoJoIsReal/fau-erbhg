import { Input } from "@/components/ui/input";
import { useState, useEffect, type ComponentProps } from "react";

// Every other Input prop passes through, so a <Label htmlFor> and the id,
// aria-describedby and aria-invalid that <FormControl> injects reach the
// actual <input> — a validation error on the field is then announced too.
type TimeInput24hProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & {
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
};

export function TimeInput24h({ value, onChange, onBlur, id, name, ...rest }: TimeInput24hProps) {
  const [displayValue, setDisplayValue] = useState(value || "");

  useEffect(() => {
    setDisplayValue(value || "");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setDisplayValue(newValue);
    onChange?.(newValue);
  };

  const handleBlur = () => {
    // Validate and format the time to ensure 24-hour format
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (displayValue && !timeRegex.test(displayValue)) {
      // Try to parse and reformat
      const parts = displayValue.match(/(\d{1,2}):?(\d{0,2})/);
      if (parts) {
        let hours = parseInt(parts[1]);
        let minutes = parseInt(parts[2] || "0");
        
        // Ensure valid ranges
        hours = Math.min(23, Math.max(0, hours));
        minutes = Math.min(59, Math.max(0, minutes));
        
        const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        setDisplayValue(formatted);
        onChange?.(formatted);
      }
    }
    onBlur?.();
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-2]?[0-9]:[0-5][0-9]"
      placeholder="HH:MM"
      {...rest}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      id={id ?? name}
      name={name}
    />
  );
}
