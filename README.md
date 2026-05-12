# Smart Carpooling Web-Based System

This repository is the starting backbone for the carpooling web app described in the SRS and project proposal. It is organized as a simple React frontend, Node.js + Express backend, and MySQL database schema that can be imported through HeidiSQL.

## Project Structure

```text
client/      React app with role-based pages, maps, wallet, and API helpers
server/      Express API with routes, controllers, services, models, and middleware
database/    MySQL schema plus a saved inspection query
docs/        Project proposal and SRS documents
```

## Main Roles

- Passenger: register, view active drivers, book trips, message drivers, pay, rate/report, view trip history.
- Driver: register for verification, create trips, respond to bookings, message passengers, confirm pickup/drop-off, view earnings/history.
- Administrator: hard-coded project/dev access for managing accounts, verifying drivers, monitoring trips, viewing transactions, and managing reports.

## Local Setup

1. Import [database/schema.sql](database/schema.sql) into HeidiSQL. This is the clean source of truth for a fresh local database.
2. Keep [database/Select Query.sql](database/Select%20Query.sql) only as a quick inspection query after the schema has been imported.
3. Copy [server/.env.example](server/.env.example) to `server/.env` and update the database credentials you use in HeidiSQL.
4. Copy [client/.env.example](client/.env.example) to `client/.env` if the API URL changes.
5. Run:

```bash
npm install
npm run dev
```

On Windows PowerShell, if `npm.ps1` is blocked by execution policy, use `npm.cmd install` and `npm.cmd run dev` from the same folder.

If a previous dev server is still running, stop it first:

```bash
npm.cmd run dev:stop
```

The default ports are:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000/api`

## Moving to Another Laptop

When sending this project to another PC, do not copy `node_modules`, `client/node_modules`, `client/dist`, or private `.env` files. The project is portable from the source files plus `package-lock.json`.

On the new laptop:

1. Install Node.js and MySQL/MariaDB.
2. Import [database/schema.sql](database/schema.sql) into HeidiSQL or another MySQL client.
3. Run `npm install` from the project root.
4. Copy [server/.env.example](server/.env.example) to `server/.env` and update the database user, password, database name, JWT secret, admin email, and admin password.
5. Copy [client/.env.example](client/.env.example) to `client/.env` only if you need custom ports or a custom API URL. Leave `VITE_API_BASE_URL` empty for the automatic local/Tailscale behavior.
6. Run `npm run dev`.

For Tailscale multi-device testing, run `npm run dev:vpn`. The script forwards the local Vite app through Tailscale Serve over HTTPS, which is useful for phone testing because browser location access works more reliably on secure origins. If you change the frontend port, update `VITE_DEV_PORT` in `client/.env` or set it in the shell before running the script.

## Map Setup

Passenger and driver home pages use the browser geolocation API with Leaflet and OpenStreetMap tiles. The `Relocate` button only recenters the map on the current device location; it does not keep snapping the map while you drive. Driver location is pushed to the backend on a lean 3-5 second cadence only when the car meaningfully moves, with a light heartbeat for reliability, so passenger and driver maps stay live without burning as much mobile data.

## Backend Notes

The API is intentionally scaffolded in layers so each requirement can be filled in later without reshaping the repo:

- `routes/` defines REST endpoints.
- `controllers/` handles HTTP request/response behavior.
- `services/` contains business logic such as authentication.
- `models/` contains database access helpers.
- `middleware/` contains auth, error, and 404 handling.

## Database Notes

The SRS ERD uses separate `drivers`, `passengers`, `trips`, `bookings`, `messages`, and `reports` tables, with wallet/card support added for local payment testing. Booking payment fields stay on `bookings`; driver ratings are stored on completed bookings and averaged into the driver record. Admin access is handled by backend configuration instead of a database table.
