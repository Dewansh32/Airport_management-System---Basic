# Airport Management System

A full-stack Airport Management System: user registration/login, flight
search, flight booking and cancellation, and an admin panel for managing
flights. Built with Node.js, Express, vanilla HTML/CSS/JavaScript, and
MySQL as a DBMS coursework project.

## Features

- User registration and login (bcrypt-hashed passwords, server-side
  sessions)
- Flight search by source/destination/flight code
- Flight booking with live seat-count tracking, done transactionally so
  concurrent bookings can't oversell the last seat
- Booking cancellation, matched to the exact flight booked
- Admin panel: add / edit / delete flights, view passengers per flight
- Role-based access control (`user` vs `admin`) enforced on every
  admin-only API route

## Screenshots

_Add screenshots of the login page, dashboard, booking flow, and admin
panel here before publishing._

## Tech stack

| Layer     | Technology                                |
|-----------|--------------------------------------------|
| Frontend  | HTML, CSS, vanilla JavaScript (`public/`)  |
| Backend   | Node.js, Express 5                         |
| Database  | MySQL (`mysql2`)                           |
| Auth      | `bcrypt` password hashing, `express-session` |
| Config    | `dotenv`                                   |

## Architecture

```
public/            Static frontend (served by Express)
  index.html        Landing page
  register.html      Registration form
  login.html         Login form
  dashboard.html      Flight search + "your bookings" (regular users)
  booking.html        Booking confirmation form
  admin.html          Flight management panel (admin only)
  assets/style.css     Shared styles

server.js           Express app: routes, session/auth, validation
db.js               MySQL connection pool (mysql2), reads config from .env
utils/validation.js  Pure input-validation / field-whitelist helpers
scripts/
  init-db.js          Applies sql/schema.sql (npm run setup-db)
  create-admin.js      Interactively creates/promotes an admin user
sql/
  schema.sql            Idempotent schema + safe seed data (flights/airports/airlines)
  demo_reset.sql         DESTRUCTIVE full reset, for a clean demo state only
  legacy_full_design_reference.sql  Original coursework ER design (Oracle-flavored, not runnable on MySQL, kept for reference)
test/
  validation.test.js    Unit tests for validation.js (node's built-in test runner)
```

The frontend talks to the backend only through the JSON API under `/api/*`
listed below; there is no server-side templating.

## Prerequisites

- Node.js 18+ (developed/tested on Node 22)
- A running MySQL server (developed/tested on MySQL 8.0)

## Installation

```bash
npm install
```

## Environment setup

Copy the example file and fill in your local values:

```bash
cp .env.example .env
```

`.env` (gitignored, never commit it):

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=airportdb
SESSION_SECRET=replace_with_a_long_random_string
PORT=3000
NODE_ENV=development
```

Generate a strong `SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If `SESSION_SECRET` is left unset, the app still starts in development (a
random secret is generated per run, so existing sessions won't survive a
restart) but will refuse to start with `NODE_ENV=production` and no secret
configured.

## Database setup

With MySQL running and `.env` configured, apply the schema (creates the
database if needed, creates tables if missing, and adds any columns an
older copy of the schema might be missing - safe to re-run):

```bash
npm run setup-db
```

This also seeds reference data (cities, airports, airlines, and a handful
of demo flights) using `INSERT IGNORE`, so re-running it never duplicates
or overwrites existing rows. It does **not** seed passengers or tickets -
those are created naturally as real users book flights through the app.

To wipe the database and start over with a clean demo state (⚠
**destructive** - deletes all users, bookings, and any flights you've
added/edited):

```bash
mysql -u root -p airportdb < sql/demo_reset.sql
npm run setup-db
```

## Running the app

```bash
npm start
```

Then open http://localhost:3000.

## Creating an admin user

Regular registration always creates a `user`-role account. To create (or
promote) an admin account, run:

```bash
npm run create-admin
```

You'll be prompted for a username and password interactively - nothing is
hardcoded or stored in source control.

## API summary

All endpoints accept/return JSON. Endpoints marked **admin** require an
active session with `role = 'admin'`; endpoints marked **auth** require any
logged-in session.

| Method | Route                          | Auth  | Description                          |
|--------|----------------------------------|-------|---------------------------------------|
| POST   | `/api/register`                  |       | Create a `user`-role account          |
| POST   | `/api/login`                     |       | Log in, starts a session              |
| POST   | `/api/logout`                    |       | Destroys the session                  |
| GET    | `/api/flights`                   |       | List flights (optional `?code=`, `?source=`, `?destination=`) |
| GET    | `/api/airlines`                  | admin | List airlines (for the add-flight form) |
| POST   | `/api/flights`                   | admin | Create a flight                        |
| PUT    | `/api/flights/:code`             | admin | Update a flight (whitelisted columns only) |
| DELETE | `/api/flights/:code`             | admin | Delete a flight                        |
| GET    | `/api/flights/:code/passengers`  | admin | List passengers booked on a flight    |
| POST   | `/api/book`                      | auth  | Book a seat on a flight (transactional) |
| GET    | `/api/bookings`                  | auth  | List the current user's bookings      |
| DELETE | `/api/bookings/:tkt`             | auth  | Cancel one of the current user's bookings (transactional) |

## Security notes

- Passwords are hashed with `bcrypt`; plaintext passwords are never stored.
- All SQL uses parameterized queries.
- The flight-update endpoint whitelists which columns a request may modify
  (`utils/validation.js`), so a request body can never target an arbitrary
  database column.
- Booking and cancellation run inside MySQL transactions with `SELECT ...
  FOR UPDATE` row locking on the flight being booked, so concurrent
  requests can't oversell the last seat and a failure partway through
  can't leave seat counts and ticket rows out of sync.
- Cancellation is matched by the exact flight code stored on the ticket
  (not by source/destination), so cancelling a ticket only ever credits
  the seat back to the flight actually booked - even when multiple flights
  share the same route.
- Session cookies are `httpOnly`, `sameSite=lax`, and marked `secure` when
  `NODE_ENV=production`.

## Manual verification performed

The following flows were exercised end-to-end against a real local MySQL
database while building this project:

- Register with a weak password → rejected (400)
- Register with a duplicate username → rejected (409)
- Register + login with valid credentials → session established
- Login with wrong password → rejected (401)
- Public flight listing works without a session
- Admin-only routes return 401 with no session and 403 for a logged-in
  non-admin user
- Booking a flight decrements `AVAILABLE_SEATS` by exactly 1 and creates a
  ticket row
- Cancelling that booking restores the seat count and removes the ticket
- Cancelling another user's ticket ID returns 404 (ownership enforced)
- Booking a non-existent flight code is rejected (400)
- Editing a flight with an out-of-whitelist field (e.g. `role`) silently
  drops that field and only applies whitelisted columns
- Creating a flight with missing required fields is rejected with a
  field-by-field error message
- Viewing passengers for a flight only returns passengers on that exact
  flight code, not others sharing its route
- Deleting a non-existent flight code returns 404

`npm test` covers the pure validation/whitelisting/seat-numbering logic in
`utils/validation.js` with `node`'s built-in test runner.

## Known limitations

- **Seat assignment is a simplified demo allocator.** Seats are assigned
  as `1A, 1B, ... 1F, 2A, ...` based on how many tickets already exist for
  a flight - there's no real seat map, class-aware layout, or
  double-booking-proof seat reservation. It's safe (no two tickets get the
  same computed seat for a given flight at a given ticket count) but not a
  production seat map.
- **Ticket numbers** are generated from a millisecond timestamp plus a
  random suffix - extremely unlikely to collide, but not guaranteed unique
  the way a database sequence would be.
- The `FLIGHT` table has a leftover unused duplicate column,
  `SEATS_AVAILABLE`, from an earlier iteration of the schema (the app only
  reads/writes `AVAILABLE_SEATS`). It's harmless but hasn't been dropped
  automatically to avoid a destructive schema change on existing
  databases; drop it manually if you want it gone.
- `sql/legacy_full_design_reference.sql` preserves the original DBMS
  coursework design (employees, fare/price history, stored
  procedures/triggers) for academic reference. It uses Oracle PL/SQL
  syntax and does not run on MySQL, and none of it is wired into the
  running app.
- No automated integration tests against a live database are included
  (would require a disposable MySQL instance in CI); see "Manual
  verification performed" above for what was actually exercised.
- `bcrypt`'s native build toolchain has a known transitive vulnerability
  in `node-tar` (build-time only, not exploitable at runtime); fixing it
  requires upgrading to `bcrypt@6`, a breaking change left for a deliberate
  upgrade rather than an automatic one.

## Future improvements

- Real seat maps with class-aware layouts
- Email confirmation on registration / booking
- Pagination and richer filtering on flight search
- CSRF protection for state-changing requests
- Rate limiting on login/register
- Automated integration tests against a disposable MySQL container in CI
