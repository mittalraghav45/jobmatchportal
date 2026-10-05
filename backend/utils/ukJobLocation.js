const UK_COUNTRY_PATTERN = /\b(?:uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|gb|gbr)\b/i;

const UK_CITY_PATTERN = /\b(?:london|manchester|birmingham|bristol|leeds|liverpool|newcastle(?: upon tyne)?|nottingham|sheffield|southampton|brighton|cambridge|oxford|reading|milton keynes|coventry|leicester|york|bath|exeter|plymouth|derby|bournemouth|portsmouth|swindon|guildford|slough|watford|luton|st albans|canterbury|norwich|ipswich|chelmsford|colchester|hastings|croydon|woking|edinburgh|glasgow|aberdeen|dundee|stirling|cardiff|swansea|newport|belfast|lisburn|derry)\b/i;

const UK_REMOTE_PATTERN = /\b(?:remote|hybrid)\b.{0,40}\b(?:uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|gb|gbr)\b|\b(?:uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|gb|gbr)\b.{0,40}\b(?:remote|hybrid)\b/i;

// A UK city can appear in an otherwise non-UK location string (for example,
// "London, Finland"). Explicitly reject country evidence so that the UK
// allow-list cannot be bypassed by a coincidental city-name match.
const NON_UK_COUNTRY_PATTERN = /\b(?:afghanistan|albania|algeria|andorra|angola|argentina|armenia|australia|austria|azerbaijan|bahamas|bahrain|bangladesh|barbados|belarus|belgium|belize|benin|bhutan|bolivia|bosnia(?: and herzegovina)?|botswana|brazil|brunei|bulgaria|burkina faso|cambodia|cameroon|canada|chile|china|colombia|costa rica|croatia|cuba|cyprus|czech(?: republic)?|denmark|dominican republic|ecuador|egypt|estonia|ethiopia|finland|france|georgia|germany|ghana|greece|guatemala|honduras|hong kong|hungary|iceland|india|indonesia|iran|iraq|ireland|israel|italy|jamaica|japan|jordan|kazakhstan|kenya|kuwait|latvia|lebanon|liechtenstein|lithuania|luxembourg|malaysia|maldives|malta|mauritius|mexico|moldova|monaco|mongolia|montenegro|morocco|myanmar|namibia|nepal|netherlands|new zealand|nicaragua|nigeria|north macedonia|norway|oman|pakistan|panama|paraguay|peru|philippines|poland|portugal|qatar|romania|russia|rwanda|saudi arabia|serbia|singapore|slovakia|slovenia|south africa|south korea|spain|sri lanka|sweden|switzerland|taiwan|thailand|tunisia|turkey|ukraine|united arab emirates|uruguay|usa|u\.s\.a\.|united states|uzbekistan|vatican|venezuela|vietnam|zambia|zimbabwe)\b/i;

const UK_LOCATION_PATTERN = new RegExp(
  `(?:${UK_COUNTRY_PATTERN.source}|${UK_CITY_PATTERN.source}|${UK_REMOTE_PATTERN.source})`,
  'i'
);

export function isUkJobLocation(location) {
  if (location && typeof location === 'object') {
    const parts = [location.country, location.countryCode, location.city, location.name, location.description]
      .filter(Boolean)
      .join(', ');
    return isUkJobLocation(parts);
  }

  const value = String(location || '').trim();
  if (!value) return false;

  if (NON_UK_COUNTRY_PATTERN.test(value)) return false;

  return UK_COUNTRY_PATTERN.test(value)
    || UK_CITY_PATTERN.test(value)
    || UK_REMOTE_PATTERN.test(value);
}

export function ukJobMongoFilter() {
  return {
    $or: [
      { location: { $regex: UK_COUNTRY_PATTERN } },
      { location: { $regex: UK_CITY_PATTERN } },
      { location: { $regex: UK_REMOTE_PATTERN } }
    ],
    $and: [
      { location: { $regex: UK_LOCATION_PATTERN } },
      { location: { $not: { $regex: NON_UK_COUNTRY_PATTERN } } }
    ]
  };
}
