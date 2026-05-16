-- Run this as a MySQL admin/root user after schema.sql if you want to use
-- the default credentials from server/.env.

CREATE USER IF NOT EXISTS 'carpool_app'@'localhost'
  IDENTIFIED BY 'carpool_password';

CREATE USER IF NOT EXISTS 'carpool_app'@'127.0.0.1'
  IDENTIFIED BY 'carpool_password';

ALTER USER 'carpool_app'@'localhost'
  IDENTIFIED BY 'carpool_password';

ALTER USER 'carpool_app'@'127.0.0.1'
  IDENTIFIED BY 'carpool_password';

GRANT ALL PRIVILEGES ON carpooling_db.* TO 'carpool_app'@'localhost';
GRANT ALL PRIVILEGES ON carpooling_db.* TO 'carpool_app'@'127.0.0.1';

FLUSH PRIVILEGES;
