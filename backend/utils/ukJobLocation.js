const UK_COUNTRY_PATTERN = /\b(?:uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|gb|gbr)\b/i;

const UK_CITY_PATTERN = /\b(?:london|manchester|birmingham|bristol|leeds|liverpool|newcastle(?: upon tyne)?|nottingham|sheffield|southampton|brighton|cambridge|oxford|reading|milton keynes|coventry|leicester|york|bath|exeter|plymouth|derby|bournemouth|portsmouth|swindon|guildford|slough|watford|luton|st albans|canterbury|norwich|ipswich|chelmsford|colchester|hastings|croydon|woking|edinburgh|glasgow|aberdeen|dundee|stirling|cardiff|swansea|newport|belfast|lisburn|derry)\b/i;

const UK_REMOTE_PATTERN = /\b(?:remote|hybrid)\b.{0,40}\b(?:uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|gb|gbr)\b|\b(?:uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|gb|gbr)\b.{0,40}\b(?:remote|hybrid)\b/i;

/**
 * Returns true only when the job location has an explicit UK indicator or
 * a recognised UK city. Ambiguous locations such as "Remote", "EMEA",
 * or "Europe" are intentionally excluded rather than assumed to be UK.
 */
export function isUkJobLocation(location) {
  if (location && typeof location === 'object') {
    const parts = [location.country, location.countryCode, location.city, location.name, location.description]
      .filter(Boolean)
      .join(', ');
    return isUkJobLocation(parts);
  }

  const value = String(location || '').trim();
  if (!value) return false;

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
    ]
  };
}
