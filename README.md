# Smart Carpooling Web-Based System

This repository is a full prototype for the carpooling web app described in the SRS and project proposal. It is organized as a simple React frontend, Node.js + Express backend, and MySQL database schema that can be imported through HeidiSQL.

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

## Server Setup With Tailscale

For testing the app from multiple devices, install and sign in to [Tailscale](https://tailscale.com/) on the computer running the project and on any device that needs access.

Run:

```bash
npm run dev:vpn
```

This starts the local development servers and configures Tailscale Serve to expose the Vite frontend over HTTPS. The script prints a Tailscale URL that can be opened from another device on the same Tailscale network. The backend is reached through the same HTTPS origin using the `/api` proxy, so `/api/health` should also work through the printed Tailscale URL.

Useful VPN commands:

```bash
npm run vpn:status
npm run vpn:serve
npm run vpn:stop
```

If the frontend port is changed, set `VITE_DEV_PORT` in `client/.env` or in the shell before running the VPN command.

## Backend Notes

The API is intentionally scaffolded in layers so each requirement can be filled in later without reshaping the repo:

- `routes/` defines REST endpoints.
- `controllers/` handles HTTP request/response behavior.
- `services/` contains business logic such as authentication.
- `models/` contains database access helpers.
- `middleware/` contains auth, error, and 404 handling.

## Database Notes

The SRS ERD uses separate `drivers`, `passengers`, `trips`, `bookings`, `messages`, and `reports` tables, with wallet/card support added for local payment testing. Booking payment fields stay on `bookings`; driver ratings are stored on completed bookings and averaged into the driver record. Admin access is handled by backend configuration instead of a database table.


