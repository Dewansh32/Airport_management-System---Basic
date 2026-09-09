// test/validation.test.js
// Unit tests for the highest-risk pure logic in utils/validation.js:
// the flight-update column whitelist (the SQL-injection-shaped fix) and
// the booking helpers. Run with: npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidUsername,
  isValidPassword,
  pickAllowedFlightFields,
  validateNewFlightPayload,
  validateBookingPayload,
  computeSeatNumber,
  generateTicketNumber
} = require('../utils/validation');

test('isValidUsername accepts reasonable usernames and rejects bad ones', () => {
  assert.equal(isValidUsername('john_doe'), true);
  assert.equal(isValidUsername('ab'), false); // too short
  assert.equal(isValidUsername('a'.repeat(31)), false); // too long
  assert.equal(isValidUsername('bad user'), false); // spaces
  assert.equal(isValidUsername("robert'; DROP TABLE users;--"), false);
});

test('isValidPassword enforces a minimum length', () => {
  assert.equal(isValidPassword('short'), false);
  assert.equal(isValidPassword('longenough123'), true);
});

test('pickAllowedFlightFields keeps only whitelisted columns', () => {
  const picked = pickAllowedFlightFields({
    STATUS: 'Delayed',
    AVAILABLE_SEATS: 5,
    role: 'admin',                 // not a flight column - must be dropped
    'FLIGHT_CODE = ?; DROP TABLE FLIGHT; --': 'x' // must be dropped
  });
  assert.deepEqual(picked, { STATUS: 'Delayed', AVAILABLE_SEATS: 5 });
});

test('pickAllowedFlightFields returns empty object for an empty/invalid body', () => {
  assert.deepEqual(pickAllowedFlightFields({}), {});
  assert.deepEqual(pickAllowedFlightFields(null), {});
});

test('validateNewFlightPayload rejects a payload missing required fields', () => {
  const errors = validateNewFlightPayload({ FLIGHT_CODE: 'AI101' });
  assert.ok(errors.length > 0);
  assert.ok(errors.some(e => e.includes('SOURCE')));
});

test('validateNewFlightPayload accepts a complete, well-formed payload', () => {
  const errors = validateNewFlightPayload({
    FLIGHT_CODE: 'AI101', SOURCE: 'DEL', DESTINATION: 'BOM',
    ARRIVAL: '10:00', DEPARTURE: '09:00', STATUS: 'On-time',
    DURATION: '01:00', FLIGHTTYPE: 'Non-stop', AIRLINEID: 'AI',
    NO_OF_STOPS: 0, AVAILABLE_SEATS: 100
  });
  assert.deepEqual(errors, []);
});

test('validateNewFlightPayload rejects malformed airport codes and times', () => {
  const errors = validateNewFlightPayload({
    FLIGHT_CODE: 'AI101', SOURCE: 'DELHI', DESTINATION: 'BOM',
    ARRIVAL: '25:99', DEPARTURE: '09:00', STATUS: 'On-time',
    DURATION: '01:00', FLIGHTTYPE: 'Non-stop', AIRLINEID: 'AI'
  });
  assert.ok(errors.some(e => e.includes('SOURCE')));
  assert.ok(errors.some(e => e.includes('ARRIVAL')));
});

test('validateBookingPayload requires the key passenger fields', () => {
  const errors = validateBookingPayload({ flightCode: 'AI101' });
  assert.ok(errors.length > 0);
});

test('computeSeatNumber assigns distinct, deterministic seats', () => {
  assert.equal(computeSeatNumber(0), '1A');
  assert.equal(computeSeatNumber(5), '1F');
  assert.equal(computeSeatNumber(6), '2A');
  assert.equal(computeSeatNumber(13), '3B');
});

test('generateTicketNumber returns unique-looking bigints', () => {
  const a = generateTicketNumber();
  const b = generateTicketNumber();
  assert.equal(typeof a, 'bigint');
  assert.ok(a > 0n);
  // Extremely unlikely to collide even when generated back-to-back.
  assert.notEqual(a, b);
});
