// utils/validation.js
// Pure, dependency-free input validation helpers shared by server.js and
// the test suite (test/validation.test.js).

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const AIRPORT_CODE_RE = /^[A-Za-z]{3}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_RE.test(username);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

function isValidAirportCode(code) {
  return typeof code === 'string' && AIRPORT_CODE_RE.test(code);
}

function isNonEmptyString(value, maxLen = 255) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

function isNonNegativeInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

// Columns the flight-create/flight-update endpoints are allowed to write.
// Anything outside this whitelist is silently dropped before it ever
// reaches a SQL statement, so request bodies can never name arbitrary
// columns.
const ALLOWED_FLIGHT_FIELDS = [
  'FLIGHT_CODE', 'SOURCE', 'DESTINATION', 'ARRIVAL', 'DEPARTURE', 'STATUS',
  'DURATION', 'FLIGHTTYPE', 'LAYOVER_TIME', 'NO_OF_STOPS', 'AIRLINEID',
  'AVAILABLE_SEATS'
];

// Fields required to create a new flight (a subset of ALLOWED_FLIGHT_FIELDS
// may be omitted on update, since update is a partial patch).
const REQUIRED_FLIGHT_FIELDS = [
  'FLIGHT_CODE', 'SOURCE', 'DESTINATION', 'ARRIVAL', 'DEPARTURE', 'STATUS',
  'DURATION', 'FLIGHTTYPE', 'AIRLINEID'
];

// Given a request body, returns only the entries whose key is in
// ALLOWED_FLIGHT_FIELDS, preserving nothing else.
function pickAllowedFlightFields(body) {
  const picked = {};
  if (!body || typeof body !== 'object') return picked;
  for (const key of ALLOWED_FLIGHT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      picked[key] = body[key];
    }
  }
  return picked;
}

function validateNewFlightPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Request body is required'];

  for (const field of REQUIRED_FLIGHT_FIELDS) {
    if (!isNonEmptyString(body[field])) errors.push(`${field} is required`);
  }
  if (body.SOURCE !== undefined && !isValidAirportCode(body.SOURCE)) {
    errors.push('SOURCE must be a 3-letter airport code');
  }
  if (body.DESTINATION !== undefined && !isValidAirportCode(body.DESTINATION)) {
    errors.push('DESTINATION must be a 3-letter airport code');
  }
  if (body.ARRIVAL !== undefined && !TIME_RE.test(body.ARRIVAL)) {
    errors.push('ARRIVAL must be in HH:MM 24-hour format');
  }
  if (body.DEPARTURE !== undefined && !TIME_RE.test(body.DEPARTURE)) {
    errors.push('DEPARTURE must be in HH:MM 24-hour format');
  }
  if (body.NO_OF_STOPS !== undefined && !isNonNegativeInt(body.NO_OF_STOPS)) {
    errors.push('NO_OF_STOPS must be a non-negative integer');
  }
  if (body.AVAILABLE_SEATS !== undefined && !isNonNegativeInt(body.AVAILABLE_SEATS)) {
    errors.push('AVAILABLE_SEATS must be a non-negative integer');
  }
  return errors;
}

function validateBookingPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Request body is required'];
  if (!isNonEmptyString(body.flightCode, 10)) errors.push('flightCode is required');
  if (!isNonEmptyString(body.passport, 10)) errors.push('passport is required');
  if (!isNonEmptyString(body.fname, 20)) errors.push('fname is required');
  if (!isNonEmptyString(body.lname, 20)) errors.push('lname is required');
  if (!isNonEmptyString(body.address, 100)) errors.push('address is required');
  if (!isNonEmptyString(body.phone, 20)) errors.push('phone is required');
  if (body.age === undefined || body.age === null || !Number.isInteger(Number(body.age)) || Number(body.age) < 0 || Number(body.age) > 130) {
    errors.push('age must be a valid number');
  }
  if (!isNonEmptyString(body.sex, 1)) errors.push('sex is required');
  return errors;
}

// Simplified demo seat map: 6 seats (A-F) per row. Given how many tickets
// already exist for a flight, returns the next seat label. This is not a
// real seat-collision-proof allocator (no seat map/class awareness) - it
// exists so seats aren't all hardcoded to "1A"; see README limitations.
function computeSeatNumber(existingTicketCount) {
  const seatsPerRow = 6;
  const letters = 'ABCDEF';
  const row = Math.floor(existingTicketCount / seatsPerRow) + 1;
  const letter = letters[existingTicketCount % seatsPerRow];
  return `${row}${letter}`;
}

// Generates a ticket number that is very unlikely to collide even for
// near-simultaneous bookings: millisecond timestamp with a random 3-digit
// suffix, well within BIGINT range.
function generateTicketNumber() {
  const random3 = Math.floor(Math.random() * 1000);
  return BigInt(Date.now()) * 1000n + BigInt(random3);
}

module.exports = {
  isValidUsername,
  isValidPassword,
  isValidAirportCode,
  isNonEmptyString,
  isNonNegativeInt,
  ALLOWED_FLIGHT_FIELDS,
  REQUIRED_FLIGHT_FIELDS,
  pickAllowedFlightFields,
  validateNewFlightPayload,
  validateBookingPayload,
  computeSeatNumber,
  generateTicketNumber
};
