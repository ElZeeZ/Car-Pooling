CREATE USER IF NOT EXISTS 'carpool_app'@'localhost'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('carpool_password');

GRANT ALL PRIVILEGES ON carpooling_db.* TO 'carpool_app'@'localhost';

FLUSH PRIVILEGES;
