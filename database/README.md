# HeidiSQL Setup

Use these scripts from HeidiSQL:

1. `schema.sql` creates the `carpooling_db` database and all project tables.
2. `local-user-mariadb.sql` creates the app user for MariaDB/XAMPP-style local installs.
3. `local-user-mysql.sql` creates the app user for MySQL 8 local installs.
4. `reset-app-user-mariadb.sql` force-resets the local MariaDB app user if login fails.
5. `drop-admins-table.sql` removes the old `admins` table if you created it before the schema was simplified.

Recommended local app credentials:

```text
User: carpool_app
Password: carpool_password
Database: carpooling_db
Host: 127.0.0.1
Port: 3306
```

The Express backend defaults to these credentials, so you do not need to change `.env` unless you choose a different username or password.
