/**
 * Country and subdivision lists for the profile editor.
 *
 * Stored values stay plain strings, because that is what gets written into a
 * form. Nothing here changes the shape of the profile: it only constrains what
 * the editor offers, so the saved value is spelled the way a form's own
 * dropdown spells it. "TX" or "Tex." never match an option list; "Texas" does.
 *
 * Full names rather than ISO codes for the same reason. A form asking for a
 * country almost always offers names, and core/fill/options.ts can already get
 * from "United States of America" to an option reading "United States" by
 * containment. It cannot get from "US" to either.
 */

export interface Subdivision {
  name: string
  /** Kept for a future matcher that can accept a form's abbreviated options. */
  abbr: string
}

export const US_STATES: Subdivision[] = [
  { name: "Alabama", abbr: "AL" }, { name: "Alaska", abbr: "AK" },
  { name: "Arizona", abbr: "AZ" }, { name: "Arkansas", abbr: "AR" },
  { name: "California", abbr: "CA" }, { name: "Colorado", abbr: "CO" },
  { name: "Connecticut", abbr: "CT" }, { name: "Delaware", abbr: "DE" },
  { name: "District of Columbia", abbr: "DC" }, { name: "Florida", abbr: "FL" },
  { name: "Georgia", abbr: "GA" }, { name: "Hawaii", abbr: "HI" },
  { name: "Idaho", abbr: "ID" }, { name: "Illinois", abbr: "IL" },
  { name: "Indiana", abbr: "IN" }, { name: "Iowa", abbr: "IA" },
  { name: "Kansas", abbr: "KS" }, { name: "Kentucky", abbr: "KY" },
  { name: "Louisiana", abbr: "LA" }, { name: "Maine", abbr: "ME" },
  { name: "Maryland", abbr: "MD" }, { name: "Massachusetts", abbr: "MA" },
  { name: "Michigan", abbr: "MI" }, { name: "Minnesota", abbr: "MN" },
  { name: "Mississippi", abbr: "MS" }, { name: "Missouri", abbr: "MO" },
  { name: "Montana", abbr: "MT" }, { name: "Nebraska", abbr: "NE" },
  { name: "Nevada", abbr: "NV" }, { name: "New Hampshire", abbr: "NH" },
  { name: "New Jersey", abbr: "NJ" }, { name: "New Mexico", abbr: "NM" },
  { name: "New York", abbr: "NY" }, { name: "North Carolina", abbr: "NC" },
  { name: "North Dakota", abbr: "ND" }, { name: "Ohio", abbr: "OH" },
  { name: "Oklahoma", abbr: "OK" }, { name: "Oregon", abbr: "OR" },
  { name: "Pennsylvania", abbr: "PA" }, { name: "Rhode Island", abbr: "RI" },
  { name: "South Carolina", abbr: "SC" }, { name: "South Dakota", abbr: "SD" },
  { name: "Tennessee", abbr: "TN" }, { name: "Texas", abbr: "TX" },
  { name: "Utah", abbr: "UT" }, { name: "Vermont", abbr: "VT" },
  { name: "Virginia", abbr: "VA" }, { name: "Washington", abbr: "WA" },
  { name: "West Virginia", abbr: "WV" }, { name: "Wisconsin", abbr: "WI" },
  { name: "Wyoming", abbr: "WY" },
  { name: "Puerto Rico", abbr: "PR" }, { name: "Guam", abbr: "GU" },
  { name: "U.S. Virgin Islands", abbr: "VI" }, { name: "American Samoa", abbr: "AS" },
  { name: "Northern Mariana Islands", abbr: "MP" }
]

export const CA_PROVINCES: Subdivision[] = [
  { name: "Alberta", abbr: "AB" }, { name: "British Columbia", abbr: "BC" },
  { name: "Manitoba", abbr: "MB" }, { name: "New Brunswick", abbr: "NB" },
  { name: "Newfoundland and Labrador", abbr: "NL" },
  { name: "Northwest Territories", abbr: "NT" }, { name: "Nova Scotia", abbr: "NS" },
  { name: "Nunavut", abbr: "NU" }, { name: "Ontario", abbr: "ON" },
  { name: "Prince Edward Island", abbr: "PE" }, { name: "Quebec", abbr: "QC" },
  { name: "Saskatchewan", abbr: "SK" }, { name: "Yukon", abbr: "YT" }
]

export const AU_STATES: Subdivision[] = [
  { name: "Australian Capital Territory", abbr: "ACT" },
  { name: "New South Wales", abbr: "NSW" }, { name: "Northern Territory", abbr: "NT" },
  { name: "Queensland", abbr: "QLD" }, { name: "South Australia", abbr: "SA" },
  { name: "Tasmania", abbr: "TAS" }, { name: "Victoria", abbr: "VIC" },
  { name: "Western Australia", abbr: "WA" }
]

export const IN_STATES: Subdivision[] = [
  { name: "Andhra Pradesh", abbr: "AP" }, { name: "Arunachal Pradesh", abbr: "AR" },
  { name: "Assam", abbr: "AS" }, { name: "Bihar", abbr: "BR" },
  { name: "Chhattisgarh", abbr: "CG" }, { name: "Delhi", abbr: "DL" },
  { name: "Goa", abbr: "GA" }, { name: "Gujarat", abbr: "GJ" },
  { name: "Haryana", abbr: "HR" }, { name: "Himachal Pradesh", abbr: "HP" },
  { name: "Jammu and Kashmir", abbr: "JK" }, { name: "Jharkhand", abbr: "JH" },
  { name: "Karnataka", abbr: "KA" }, { name: "Kerala", abbr: "KL" },
  { name: "Madhya Pradesh", abbr: "MP" }, { name: "Maharashtra", abbr: "MH" },
  { name: "Manipur", abbr: "MN" }, { name: "Meghalaya", abbr: "ML" },
  { name: "Mizoram", abbr: "MZ" }, { name: "Nagaland", abbr: "NL" },
  { name: "Odisha", abbr: "OD" }, { name: "Punjab", abbr: "PB" },
  { name: "Rajasthan", abbr: "RJ" }, { name: "Sikkim", abbr: "SK" },
  { name: "Tamil Nadu", abbr: "TN" }, { name: "Telangana", abbr: "TG" },
  { name: "Tripura", abbr: "TR" }, { name: "Uttar Pradesh", abbr: "UP" },
  { name: "Uttarakhand", abbr: "UK" }, { name: "West Bengal", abbr: "WB" }
]

/**
 * Countries that ship a subdivision list.
 *
 * Only the ones where a form realistically presents a fixed dropdown. Every
 * other country falls back to a free text box, which is correct rather than
 * lazy: offering a wrong or partial list is worse than offering none, and a
 * German applicant should not have to pick a "state" that their form never
 * asks for.
 */
const SUBDIVISIONS: Record<string, Subdivision[]> = {
  "United States of America": US_STATES,
  Canada: CA_PROVINCES,
  Australia: AU_STATES,
  India: IN_STATES
}

export function subdivisionsFor(country: string): Subdivision[] {
  return SUBDIVISIONS[country] ?? []
}

/** What to call the subdivision field for a given country. */
export function subdivisionLabel(country: string): string {
  if (country === "Canada") return "Province"
  if (country === "United States of America" || country === "Australia" || country === "India") {
    return "State"
  }
  return "State / Province / Region"
}

export const COUNTRIES: string[] = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
  "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
  "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
  "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada",
  "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
  "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia",
  "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica",
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea",
  "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada",
  "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras",
  "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq",
  "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia",
  "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania",
  "Luxembourg", "Macao", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali",
  "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia",
  "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique",
  "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand",
  "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
  "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea",
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania",
  "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Samoa", "San Marino",
  "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles",
  "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
  "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka",
  "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan",
  "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago",
  "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States of America",
  "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam",
  "Yemen", "Zambia", "Zimbabwe"
]
