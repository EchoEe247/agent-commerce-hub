import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCounterpartyAvailability, HOLIDAY_RULESET, SUPPORTED_COUNTRIES } from '../src/counterparty-availability.mjs';

test('US business-day brief includes local time and days remaining', () => {
  const result = buildCounterpartyAvailability({ countryCode: 'US', timezone: 'America/Chicago', at: '2026-08-20T13:00:00.000Z' });
  assert.equal(result.country.code, 'US');
  assert.equal(result.timezone, 'America/Chicago');
  assert.equal(result.local.date, '2026-08-20');
  assert.equal(result.local.time, '08:00');
  assert.equal(result.business.is_weekend, false);
  assert.equal(result.business.is_public_holiday, false);
  assert.equal(result.business.business_days_remaining_this_week, 2);
  assert.equal(result.business.contact_window, 'closed');
  assert.equal(result.business.next_contact_local, '2026-08-20T09:00');
});

test('US federal holiday is excluded from business days', () => {
  const result = buildCounterpartyAvailability({ countryCode: 'US', timezone: 'America/New_York', at: '2026-11-26T15:00:00.000Z' });
  assert.equal(result.business.is_public_holiday, true);
  assert.match(result.business.holiday_name, /Thanksgiving/);
  assert.equal(result.business.business_days_remaining_this_week, 1);
  assert.equal(result.business.next_business_date, '2026-11-27');
});

test('weekend rolls next business date to Monday', () => {
  const result = buildCounterpartyAvailability({ countryCode: 'GB', timezone: 'Europe/London', at: '2026-08-22T12:00:00.000Z' });
  assert.equal(result.business.is_weekend, true);
  assert.equal(result.business.business_days_remaining_this_week, 0);
  assert.equal(result.business.next_business_date, '2026-08-24');
});

test('holiday determinations expose static-rule provenance and limitations', () => {
  const result = buildCounterpartyAvailability({ countryCode: 'US', at: '2026-07-04T16:00:00.000Z' });
  assert.equal(result.holiday_calendar.rule_set_id, HOLIDAY_RULESET.id);
  assert.equal(result.holiday_calendar.rule_set_version, HOLIDAY_RULESET.version);
  assert.equal(result.holiday_calendar.method, 'deterministic_repository_rules');
  assert.equal(result.holiday_calendar.repository_path, HOLIDAY_RULESET.repositoryPath);
  assert.equal(result.holiday_calendar.evaluated_year, 2026);
  assert.equal(result.holiday_calendar.jurisdiction_scope, 'US federal');
  assert.equal(result.holiday_calendar.live_authoritative_lookup, false);
  assert.equal(result.holiday_calendar.use, 'advisory_business_availability');
  assert.equal(result.holiday_calendar.limitations.length, 2);
  assert.match(result.caveat, /Advisory static/);
  assert.match(result.caveat, /official calendar/);
});

test('Brazil Carnival is not classified as a national public holiday', () => {
  for (const at of ['2026-02-16T15:00:00.000Z', '2026-02-17T15:00:00.000Z']) {
    const result = buildCounterpartyAvailability({ countryCode: 'BR', timezone: 'America/Sao_Paulo', at });
    assert.equal(result.business.is_public_holiday, false);
    assert.equal(result.business.holiday_name, null);
    assert.equal(result.business.is_business_day, true);
  }
});

test('Brazil national holiday remains classified as a public holiday', () => {
  const result = buildCounterpartyAvailability({ countryCode: 'BR', timezone: 'America/Sao_Paulo', at: '2026-04-21T15:00:00.000Z' });
  assert.equal(result.business.is_public_holiday, true);
  assert.equal(result.business.holiday_name, 'Tiradentes');
  assert.equal(result.business.is_business_day, false);
});

test('supports a focused set of major business markets', () => {
  for (const code of ['US','CA','MX','GB','DE','FR','ES','IT','BR','JP','IN','AU']) assert.ok(SUPPORTED_COUNTRIES[code], `${code} should be supported`);
});

test('rejects unsupported countries and invalid timezones', () => {
  assert.throws(() => buildCounterpartyAvailability({ countryCode: 'ZZ' }), /UNSUPPORTED_COUNTRY/);
  assert.throws(() => buildCounterpartyAvailability({ countryCode: 'US', timezone: 'Mars/Olympus' }), /INVALID_TIMEZONE/);
});
