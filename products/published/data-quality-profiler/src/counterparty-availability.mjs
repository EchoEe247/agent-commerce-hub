const DAY_MS = 86_400_000;
const WEEKDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export const SUPPORTED_COUNTRIES = Object.freeze({
  US: { name: 'United States', defaultTimezone: 'America/New_York', currency: 'USD', callingCode: '+1', holidayScope: 'US federal' },
  CA: { name: 'Canada', defaultTimezone: 'America/Toronto', currency: 'CAD', callingCode: '+1', holidayScope: 'Canadian federal/common' },
  MX: { name: 'Mexico', defaultTimezone: 'America/Mexico_City', currency: 'MXN', callingCode: '+52', holidayScope: 'Mexican federal' },
  GB: { name: 'United Kingdom', defaultTimezone: 'Europe/London', currency: 'GBP', callingCode: '+44', holidayScope: 'England and Wales bank holidays' },
  DE: { name: 'Germany', defaultTimezone: 'Europe/Berlin', currency: 'EUR', callingCode: '+49', holidayScope: 'Germany nationwide' },
  FR: { name: 'France', defaultTimezone: 'Europe/Paris', currency: 'EUR', callingCode: '+33', holidayScope: 'Metropolitan France national' },
  ES: { name: 'Spain', defaultTimezone: 'Europe/Madrid', currency: 'EUR', callingCode: '+34', holidayScope: 'Spain nationwide' },
  IT: { name: 'Italy', defaultTimezone: 'Europe/Rome', currency: 'EUR', callingCode: '+39', holidayScope: 'Italy national' },
  BR: { name: 'Brazil', defaultTimezone: 'America/Sao_Paulo', currency: 'BRL', callingCode: '+55', holidayScope: 'Brazil national' },
  JP: { name: 'Japan', defaultTimezone: 'Asia/Tokyo', currency: 'JPY', callingCode: '+81', holidayScope: 'Japan national' },
  IN: { name: 'India', defaultTimezone: 'Asia/Kolkata', currency: 'INR', callingCode: '+91', holidayScope: 'India national core' },
  AU: { name: 'Australia', defaultTimezone: 'Australia/Sydney', currency: 'AUD', callingCode: '+61', holidayScope: 'Australia national/common' },
});

export function buildCounterpartyAvailability({ countryCode, timezone, at } = {}) {
  const code = String(countryCode ?? '').trim().toUpperCase();
  const country = SUPPORTED_COUNTRIES[code];
  if (!country) throw new Error(`UNSUPPORTED_COUNTRY: supported country codes: ${Object.keys(SUPPORTED_COUNTRIES).join(',')}`);

  const zone = timezone || country.defaultTimezone;
  assertTimezone(zone);
  const instant = at == null ? new Date() : new Date(at);
  if (Number.isNaN(instant.getTime())) throw new Error('INVALID_LOCALE_REQUEST: at must be a valid ISO timestamp');

  const local = localParts(instant, zone);
  const holidays = holidayMap(code, local.year);
  const currentDate = `${local.year}-${pad(local.month)}-${pad(local.day)}`;
  const holidayName = holidays.get(currentDate) ?? null;
  const weekdayIndex = calendarWeekday(local.year, local.month, local.day);
  const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
  const isBusinessDay = !isWeekend && !holidayName;

  let remaining = 0;
  for (let offset = 0; offset < 7; offset++) {
    const date = addCalendarDays(local.year, local.month, local.day, offset);
    const wd = calendarWeekday(date.year, date.month, date.day);
    if (wd === 0) break;
    if (wd !== 6 && !holidayMap(code, date.year).has(dateString(date))) remaining++;
  }

  let nextBusiness = null;
  for (let offset = 0; offset < 15; offset++) {
    const date = addCalendarDays(local.year, local.month, local.day, offset);
    const wd = calendarWeekday(date.year, date.month, date.day);
    if (wd !== 0 && wd !== 6 && !holidayMap(code, date.year).has(dateString(date))) {
      nextBusiness = dateString(date);
      break;
    }
  }

  const minutes = local.hour * 60 + local.minute;
  const insideWindow = isBusinessDay && minutes >= 9 * 60 && minutes < 17 * 60;
  const nextContact = insideWindow
    ? `${currentDate}T${pad(local.hour)}:${pad(local.minute)}`
    : isBusinessDay && minutes < 9 * 60
      ? `${currentDate}T09:00`
      : `${nextBusiness === currentDate ? dateString(addCalendarDays(local.year, local.month, local.day, 1)) : nextBusiness}T09:00`;

  const correctedNextContact = insideWindow || (isBusinessDay && minutes < 9 * 60)
    ? nextContact
    : `${findBusinessDateAfter(code, local.year, local.month, local.day)}T09:00`;

  return {
    country: {
      code,
      name: country.name,
      currency: country.currency,
      calling_code: country.callingCode,
      holiday_scope: country.holidayScope,
    },
    timezone: zone,
    timezone_source: timezone ? 'request' : 'country_default',
    local: {
      date: currentDate,
      time: `${pad(local.hour)}:${pad(local.minute)}`,
      weekday: WEEKDAY[weekdayIndex],
      iso: `${currentDate}T${pad(local.hour)}:${pad(local.minute)}`,
    },
    business: {
      is_weekend: isWeekend,
      is_public_holiday: Boolean(holidayName),
      holiday_name: holidayName,
      is_business_day: isBusinessDay,
      business_days_remaining_this_week: remaining,
      next_business_date: nextBusiness,
      contact_window: insideWindow ? 'open' : 'closed',
      next_contact_local: correctedNextContact,
      assumed_business_hours: '09:00-17:00 local',
    },
    caveat: 'National/federal calendar only; regional, state, company, and emergency closures are not included.',
  };
}

function findBusinessDateAfter(code, year, month, day) {
  for (let offset = 1; offset < 15; offset++) {
    const date = addCalendarDays(year, month, day, offset);
    const wd = calendarWeekday(date.year, date.month, date.day);
    if (wd !== 0 && wd !== 6 && !holidayMap(code, date.year).has(dateString(date))) return dateString(date);
  }
  throw new Error('INTERNAL_ERROR: could not find next business date');
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

function assertTimezone(timezone) {
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
  catch { throw new Error('INVALID_TIMEZONE: timezone must be a valid IANA timezone'); }
}

function holidayMap(code, year) {
  const m = new Map();
  const add = (month, day, name) => m.set(`${year}-${pad(month)}-${pad(day)}`, name);
  const addDate = (date, name) => m.set(dateString(date), name);
  const easter = easterSunday(year);

  if (code === 'US') {
    addObserved(m, year, 1, 1, "New Year's Day");
    addDate(nthWeekday(year, 1, 1, 3), 'Martin Luther King Jr. Day');
    addDate(nthWeekday(year, 2, 1, 3), "Washington's Birthday");
    addDate(lastWeekday(year, 5, 1), 'Memorial Day');
    addObserved(m, year, 6, 19, 'Juneteenth National Independence Day');
    addObserved(m, year, 7, 4, 'Independence Day');
    addDate(nthWeekday(year, 9, 1, 1), 'Labor Day');
    addDate(nthWeekday(year, 10, 1, 2), 'Columbus Day');
    addObserved(m, year, 11, 11, 'Veterans Day');
    addDate(nthWeekday(year, 11, 4, 4), 'Thanksgiving Day');
    addObserved(m, year, 12, 25, 'Christmas Day');
  } else if (code === 'CA') {
    addObserved(m, year, 1, 1, "New Year's Day"); addDate(addDays(easter, -2), 'Good Friday'); addObserved(m, year, 7, 1, 'Canada Day');
    addDate(nthWeekday(year, 9, 1, 1), 'Labour Day'); addObserved(m, year, 9, 30, 'National Day for Truth and Reconciliation'); addDate(nthWeekday(year, 10, 1, 2), 'Thanksgiving');
    addObserved(m, year, 11, 11, 'Remembrance Day'); addObserved(m, year, 12, 25, 'Christmas Day'); addObserved(m, year, 12, 26, 'Boxing Day');
  } else if (code === 'MX') {
    add(1, 1, 'Año Nuevo'); addDate(nthWeekday(year, 2, 1, 1), 'Constitution Day'); addDate(nthWeekday(year, 3, 1, 3), "Benito Juárez's Birthday");
    add(5, 1, 'Labour Day'); add(9, 16, 'Independence Day'); addDate(nthWeekday(year, 11, 1, 3), 'Revolution Day'); add(12, 25, 'Christmas Day');
  } else if (code === 'GB') {
    addObserved(m, year, 1, 1, "New Year's Day"); addDate(addDays(easter, -2), 'Good Friday'); addDate(addDays(easter, 1), 'Easter Monday');
    addDate(nthWeekday(year, 5, 1, 1), 'Early May bank holiday'); addDate(lastWeekday(year, 5, 1), 'Spring bank holiday'); addDate(lastWeekday(year, 8, 1), 'Summer bank holiday'); addUkChristmasBoxing(m, year);
  } else if (code === 'DE') {
    add(1, 1, 'New Year'); addDate(addDays(easter, -2), 'Good Friday'); addDate(addDays(easter, 1), 'Easter Monday'); add(5, 1, 'Labour Day');
    addDate(addDays(easter, 39), 'Ascension Day'); addDate(addDays(easter, 50), 'Whit Monday'); add(10, 3, 'German Unity Day'); add(12, 25, 'Christmas Day'); add(12, 26, 'Second Day of Christmas');
  } else if (code === 'FR') {
    add(1, 1, "New Year's Day"); addDate(addDays(easter, 1), 'Easter Monday'); add(5, 1, 'Labour Day'); add(5, 8, 'Victory Day'); addDate(addDays(easter, 39), 'Ascension Day');
    add(7, 14, 'Bastille Day'); add(8, 15, 'Assumption'); add(11, 1, "All Saints' Day"); add(11, 11, 'Armistice Day'); add(12, 25, 'Christmas Day');
  } else if (code === 'ES') {
    add(1, 1, 'New Year'); add(1, 6, 'Epiphany'); addDate(addDays(easter, -2), 'Good Friday'); add(5, 1, 'Labour Day'); add(8, 15, 'Assumption'); add(10, 12, 'National Day');
    add(11, 1, "All Saints' Day"); add(12, 6, 'Constitution Day'); add(12, 8, 'Immaculate Conception'); add(12, 25, 'Christmas Day');
  } else if (code === 'IT') {
    add(1, 1, 'New Year'); add(1, 6, 'Epiphany'); addDate(addDays(easter, 1), 'Easter Monday'); add(4, 25, 'Liberation Day'); add(5, 1, 'Labour Day'); add(6, 2, 'Republic Day');
    add(8, 15, 'Assumption'); add(11, 1, "All Saints' Day"); add(12, 8, 'Immaculate Conception'); add(12, 25, 'Christmas Day'); add(12, 26, "St Stephen's Day");
  } else if (code === 'BR') {
    add(1, 1, 'Confraternização Universal'); addDate(addDays(easter, -48), 'Carnival Monday'); addDate(addDays(easter, -47), 'Carnival Tuesday'); addDate(addDays(easter, -2), 'Good Friday');
    add(4, 21, 'Tiradentes'); add(5, 1, 'Labour Day'); add(9, 7, 'Independence Day'); add(10, 12, 'Our Lady of Aparecida'); add(11, 2, "All Souls' Day");
    add(11, 15, 'Republic Proclamation Day'); add(11, 20, 'Black Consciousness Day'); add(12, 25, 'Christmas Day');
  } else if (code === 'JP') {
    add(1, 1, "New Year's Day"); addDate(nthWeekday(year, 1, 1, 2), 'Coming of Age Day'); add(2, 11, 'National Foundation Day'); add(2, 23, "Emperor's Birthday");
    add(3, springEquinoxDay(year), 'Vernal Equinox Day'); add(4, 29, 'Shōwa Day'); add(5, 3, 'Constitution Memorial Day'); add(5, 4, 'Greenery Day'); add(5, 5, "Children's Day");
    addDate(nthWeekday(year, 7, 1, 3), 'Marine Day'); add(8, 11, 'Mountain Day'); addDate(nthWeekday(year, 9, 1, 3), 'Respect for the Aged Day'); add(9, autumnEquinoxDay(year), 'Autumnal Equinox Day');
    addDate(nthWeekday(year, 10, 1, 2), 'Sports Day'); add(11, 3, 'Culture Day'); add(11, 23, 'Labor Thanksgiving Day'); addJapanSubstitutes(m, year);
  } else if (code === 'IN') {
    add(1, 26, 'Republic Day'); add(8, 15, 'Independence Day'); add(10, 2, 'Gandhi Jayanti');
  } else if (code === 'AU') {
    addObserved(m, year, 1, 1, "New Year's Day"); addObserved(m, year, 1, 26, 'Australia Day'); addDate(addDays(easter, -2), 'Good Friday'); addDate(addDays(easter, 1), 'Easter Monday');
    add(4, 25, 'Anzac Day'); addObserved(m, year, 12, 25, 'Christmas Day'); addObserved(m, year, 12, 26, 'Boxing Day');
  }
  return m;
}

function addObserved(map, year, month, day, name) {
  const actual = { year, month, day };
  map.set(dateString(actual), name);
  const wd = calendarWeekday(year, month, day);
  if (wd === 6) map.set(dateString(addCalendarDays(year, month, day, -1)), `${name} (observed)`);
  if (wd === 0) map.set(dateString(addCalendarDays(year, month, day, 1)), `${name} (observed)`);
}

function addUkChristmasBoxing(map, year) {
  const c = { year, month: 12, day: 25 }, b = { year, month: 12, day: 26 };
  map.set(dateString(c), 'Christmas Day'); map.set(dateString(b), 'Boxing Day');
  const cw = calendarWeekday(year, 12, 25), bw = calendarWeekday(year, 12, 26);
  if (cw === 6 || cw === 0) map.set(`${year}-12-27`, 'Christmas Day (substitute)');
  if (bw === 6 || bw === 0) map.set(`${year}-12-28`, 'Boxing Day (substitute)');
}

function addJapanSubstitutes(map, year) {
  for (const [date, name] of [...map.entries()]) {
    const [y,m,d] = date.split('-').map(Number);
    if (calendarWeekday(y,m,d) === 0) {
      let next = addCalendarDays(y,m,d,1);
      while (map.has(dateString(next))) next = addCalendarDays(next.year,next.month,next.day,1);
      map.set(dateString(next), `${name} (substitute)`);
    }
  }
}

function springEquinoxDay(year) { return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)); }
function autumnEquinoxDay(year) { return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)); }
function nthWeekday(year, month, weekday, nth) {
  const first = calendarWeekday(year, month, 1);
  return { year, month, day: 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7 };
}
function lastWeekday(year, month, weekday) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastWd = calendarWeekday(year, month, days);
  return { year, month, day: days - ((lastWd - weekday + 7) % 7) };
}
function easterSunday(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return { year, month, day };
}
function addDays(date, offset) { return addCalendarDays(date.year,date.month,date.day,offset); }
function addCalendarDays(year, month, day, offset) {
  const d = new Date(Date.UTC(year, month - 1, day) + offset * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth()+1, day: d.getUTCDate() };
}
function calendarWeekday(year, month, day) { return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); }
function dateString({year,month,day}) { return `${year}-${pad(month)}-${pad(day)}`; }
function pad(n) { return String(n).padStart(2, '0'); }
