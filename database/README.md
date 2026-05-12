# Database Setup

Use these files from HeidiSQL:

1. `schema.sql` creates the `carpooling_db` database and all current project tables.
2. `Select Query.sql` is a saved inspection query for quickly viewing important tables after testing.

Recommended local app credentials:

```text
User: carpool_app
Password: carpool_password
Database: carpooling_db
Host: 127.0.0.1
Port: 3306
```

Keep `schema.sql` as the source of truth for fresh test runs. Any local user setup can be handled directly in HeidiSQL or through the credentials in `server/.env`.
