const UK_COUNTRY_PATTERN = /\b(?:uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|gb|gbr)\b/i;

const UK_CITY_PATTERN = /\b(?:london|manchester|birmingham|bristol|leeds|liverpool|newcastle(?: upon tyne)?|nottingham|sheffield|southampton|brighton|cambridge|oxford|reading|milton keynes|coventry|leicester|york|bath|exeter|plymouth|derby|bournemouth|portsmouth|swindon|guildford|slough|watford|luton|st albans|canterbury|norwich|ipswich|chelmsford|colchester|hastings|croydon|woking|edinburgh|glasgow|aberdeen|dundee|stirling|cardiff|swansea|newport|belfast|lisburn|derry)\b/i;

const UK_REMOTE_PATTERN = /\b(?:remote|hybrid)\b.{0,40}\b(?:uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|gb|gbr)\b|\b(?:uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|gb|gbr)\b.{0,40}\b(?:remote|hybrid)\b/i;

// Prevent foreign city names from being treated as UK evidence when an ATS
// returns a location such as "New York Office" without a country field.
const NON_UK_CITY_PATTERN = /\b(?:new york|new york city|san francisco|los angeles|seattle|boston|chicago|austin|toronto|vancouver|sydney|melbourne|paris|berlin|munich|amsterdam|dublin|helsinki|stockholm|copenhagen|oslo|madrid|barcelona|milan|rome|zurich|vienna|warsaw|prague|budapest)\b/i;

const NON_UK_COUNTRY_PATTERN = /\b(?:afghanistan|albania|algeria|andorra|angola|argentina|armenia|australia|austria|azerbaijan|bahamas|bahrain|bangladesh|barbados|belarus|belgium|belize|benin|bhutan|bolivia|bosnia(?: and herzegovina)?|botswana|brazil|brunei|bulgaria|burkina faso|cambodia|cameroon|canada|chile|china|colombia|costa rica|croatia|cuba|cyprus|czech(?: republic)?|denmark|dominican republic|ecuador|egypt|estonia|ethiopia|finland|france|georgia|germany|ghana|greece|guatemala|honduras|hong kong|hungary|iceland|india|indonesia|iran|iraq|(?<!northern )ireland|israel|italy|jamaica|japan|jordan|kazakhstan|kenya|kuwait|latvia|lebanon|liechtenstein|lithuania|luxembourg|malaysia|maldives|malta|mauritius|mexico|moldova|monaco|mongolia|montenegro|morocco|myanmar|namibia|nepal|netherlands|new zealand|nicaragua|nigeria|north macedonia|norway|oman|pakistan|panama|paraguay|philippines|poland|portugal|qatar|romania|russia|rwanda|saudi arabia|serbia|singapore|slovakia|slovenia|south africa|south korea|spain|sri lanka|sweden|switzerland|taiwan|thailand|tunisia|turkey|ukraine|united arab emirates|uruguay|usa|u\.s\.a\.|united states|uzbekistan|vatican|venezuela|vietnam|zambia|zimbabwe)\b/i;

const UK_LOCATION_PATTERN = new RegExp(
  `(?:${UK_COUNTRY_PATTERN.source}|${UK_CITY_PATTERN.source}|${UK_REMOTE_PATTERN.source})`,
  'i'
);

function normaliseLocationParts(location) {
  if (location && typeof location === 'object') {
    return [location.country, location.countryCode, location.city, location.name, location.description]
      .filter(Boolean)
      .join(', ');
  }
  return String(location || '').trim();
}

export function resolveUkJobLocation(location, fallbackCountry = '') {
  const primary = normaliseLocationParts(location);
  const fallback = normaliseLocationParts(fallbackCountry);
  const value = primary || fallback;

  if (!value) return { status: 'unknown', evidenceSource: 'missing', value: '' };
  if (NON_UK_COUNTRY_PATTERN.test(value) || NON_UK_CITY_PATTERN.test(value)) {
    return { status: 'non_uk', evidenceSource: primary ? 'location' : 'fallback_country', value };
  }
  if (UK_COUNTRY_PATTERN.test(value)) {
    return { status: 'confirmed_uk', evidenceSource: primary ? 'location_country' : 'fallback_country', value };
  }
  if (primary && UK_CITY_PATTERN.test(primary)) {
    return { status: 'confirmed_uk', evidenceSource: 'location_city', value: primary };
  }
  if (UK_REMOTE_PATTERN.test(value)) {
    return { status: 'confirmed_uk', evidenceSource: primary ? 'location_remote' : 'fallback_country', value };
  }
  return { status: 'unknown', evidenceSource: primary ? 'location_unresolved' : 'fallback_unresolved', value };
}

export function isUkJobLocation(location) {
  return resolveUkJobLocation(location).status === 'confirmed_uk';
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
      { location: { $not: { $regex: NON_UK_COUNTRY_PATTERN } } },
      { location: { $not: { $regex: NON_UK_CITY_PATTERN } } }
    ]
  };
}
