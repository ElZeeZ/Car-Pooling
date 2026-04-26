CREATE USER IF NOT EXISTS 'carpool_app'@'localhost'
  IDENTIFIED BY 'carpool_password';

GRANT ALL PRIVILEGES ON carpooling_db.* TO 'carpool_app'@'localhost';

FLUSH PRIVILEGES;
