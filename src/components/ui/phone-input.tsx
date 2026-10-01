import { Select as SelectPrimitive } from "@base-ui/react/select";
import PhoneInputPrimitive, { getCountryCallingCode, type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// react-phone-number-input with the shadcn Input and Select supplied as its parts,
// so it needs none of the library's stylesheet.

type CountryOption = { value?: Country; label: string; divider?: boolean };

const INTERNATIONAL = "ZZ";

function Flag({ country, label }: { country?: Country; label: string }) {
  const Svg = country ? flags[country] : undefined;
  return (
    <span className="flex h-4 w-6 shrink-0 items-center overflow-hidden rounded-xs bg-muted [&_svg]:size-full">
      {Svg ? <Svg title={label} /> : null}
    </span>
  );
}

function CountrySelect({
  value,
  onChange,
  options,
  disabled,
  finalFocus,
}: {
  value?: Country;
  onChange: (country?: Country) => void;
  options: CountryOption[];
  disabled?: boolean;
  finalFocus?: SelectPrimitive.Popup.Props["finalFocus"];
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <Select
      value={value ?? INTERNATIONAL}
      onValueChange={(next) =>
        next && onChange(next === INTERNATIONAL ? undefined : (next as Country))
      }
      disabled={disabled}
    >
      <SelectTrigger aria-label="Phone number country" className="pl-2">
        <Flag country={value} label={selected?.label ?? "International"} />
      </SelectTrigger>
      <SelectContent className="max-h-72 w-auto min-w-64" finalFocus={finalFocus}>
        {options
          .filter((option) => !option.divider)
          .map((option) => (
            <SelectItem key={option.value ?? INTERNATIONAL} value={option.value ?? INTERNATIONAL}>
              <Flag country={option.value} label={option.label} />
              <span>{option.label}</span>
              {option.value && (
                <span className="text-muted-foreground">
                  +{getCountryCallingCode(option.value)}
                </span>
              )}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

type PhoneInputProps = {
  id?: string;
  value: string;
  onChange: (value?: string) => void;
  onBlur?: () => void;
  defaultCountry?: Country;
  className?: string;
  disabled?: boolean;
  required?: boolean;
};

function PhoneInput({ className, id, ...props }: PhoneInputProps) {
  return (
    <PhoneInputPrimitive
      id={id}
      international
      countryCallingCodeEditable={false}
      // The Select decides where focus goes when its popup closes (the library's own
      // focusInputOnCountrySelection fires too early and loses). Send it to the number
      // input, which carries the given id, so the investor can type straight away.
      focusInputOnCountrySelection={false}
      countrySelectProps={{ finalFocus: () => (id && document.getElementById(id)) || true }}
      className={cn("flex items-center gap-2", className)}
      inputComponent={Input}
      countrySelectComponent={CountrySelect}
      {...props}
    />
  );
}

export { PhoneInput };
