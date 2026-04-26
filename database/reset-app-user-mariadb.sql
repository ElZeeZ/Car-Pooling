USE mysql;

DROP USER IF EXISTS 'carpool_app'@'localhost';
DROP USER IF EXISTS 'carpool_app'@'127.0.0.1';

CREATE USER 'carpool_app'@'localhost'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('carpool_password');

CREATE USER 'carpool_app'@'127.0.0.1'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('carpool_password');

GRANT ALL PRIVILEGES ON carpooling_db.* TO 'carpool_app'@'localhost';
GRANT ALL PRIVILEGES ON carpooling_db.* TO 'carpool_app'@'127.0.0.1';

FLUSH PRIVILEGES;
