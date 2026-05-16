# Routely Database Setup

Use these files from HeidiSQL:

1. `schema.sql` creates the local Routely database and all current project tables. The database is still named `carpooling_db` for compatibility with the existing setup scripts.
2. `local-user.sql` creates the local MySQL user expected by `server/.env`.
3. `Select Query.sql` is a saved inspection query for quickly viewing important tables after testing.

Recommended local app credentials:

```text
User: carpool_app
Password: carpool_password
Database: carpooling_db
Host: 127.0.0.1
Port: 3306
```

For a fresh local setup in HeidiSQL:

1. Connect as your MySQL admin/root user.
2. Run `schema.sql`.
3. Run `local-user.sql`.
4. Start the backend and check `http://localhost:5000/api/health`.

Keep `schema.sql` as the source of truth for fresh test runs. If you prefer using a different MySQL user, update `server/.env` to match it.
