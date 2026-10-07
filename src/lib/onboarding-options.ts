import type { Country } from "react-phone-number-input";

export const TICKET_SIZES = [
  { value: "25k-50k", label: "$25k – $50k" },
  { value: "50k-150k", label: "$50k – $150k" },
  { value: "150k-500k", label: "$150k – $500k" },
  { value: "500k+", label: "$500k+" },
];

export const COUNTRIES: { country: string; nationality: string; iso?: Country }[] = [
  { country: "Singapore", nationality: "Singaporean", iso: "SG" },
  { country: "United States", nationality: "American", iso: "US" },
  { country: "United Kingdom", nationality: "British", iso: "GB" },
  { country: "Australia", nationality: "Australian", iso: "AU" },
  { country: "Canada", nationality: "Canadian", iso: "CA" },
  { country: "Hong Kong", nationality: "Hong Konger", iso: "HK" },
  { country: "Japan", nationality: "Japanese", iso: "JP" },
  { country: "Germany", nationality: "German", iso: "DE" },
  { country: "France", nationality: "French", iso: "FR" },
  { country: "India", nationality: "Indian", iso: "IN" },
  { country: "Indonesia", nationality: "Indonesian", iso: "ID" },
  { country: "Malaysia", nationality: "Malaysian", iso: "MY" },
  { country: "Thailand", nationality: "Thai", iso: "TH" },
  { country: "Vietnam", nationality: "Vietnamese", iso: "VN" },
  { country: "Other", nationality: "Other" },
];
