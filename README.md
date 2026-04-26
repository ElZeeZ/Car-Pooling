# Smart Carpooling Web-Based System

This repository is the starting backbone for the carpooling web app described in the SRS and project proposal. It is organized as a simple React frontend, Node.js + Express backend, and MySQL database schema that can be imported through HeidiSQL.

## Project Structure

```text
client/      React app with role-based pages and API helpers
server/      Express API with routes, controllers, services, models, and middleware
database/    MySQL schema and starter seed data
docs/        Project proposal and SRS documents
```

## Main Roles

- Passenger: register, view active drivers, book trips, message drivers, pay, rate/report, view trip history.
- Driver: register for verification, create trips, respond to bookings, message passengers, confirm pickup/drop-off, view earnings/history.
- Administrator: hard-coded project/dev access for managing accounts, verifying drivers, monitoring trips, viewing transactions, and managing reports.

## Local Setup

1. Import [database/schema.sql](database/schema.sql) into HeidiSQL.
2. Import [database/local-user.sql](database/local-user.sql) if your MySQL/MariaDB root account uses an auth plugin that Node cannot use directly.
   - If HeidiSQL shows an `auth_gssapi_client` problem, use [database/local-user-mariadb.sql](database/local-user-mariadb.sql).
   - If you are on MySQL 8 and need native password auth, use [database/local-user-mysql.sql](database/local-user-mysql.sql).
3. Copy [server/.env.example](server/.env.example) to `server/.env` and update the database credentials.
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

## Backend Notes

The API is intentionally scaffolded in layers so each requirement can be filled in later without reshaping the repo:

- `routes/` defines REST endpoints.
- `controllers/` handles HTTP request/response behavior.
- `services/` contains business logic such as authentication.
- `models/` contains database access helpers.
- `middleware/` contains auth, error, and 404 handling.

## Database Notes

The SRS ERD uses separate `drivers`, `passengers`, `trips`, `bookings`, `messages`, and `reports` tables. Admin access is handled by backend configuration instead of a database table.
