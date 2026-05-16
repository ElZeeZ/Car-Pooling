CREATE DATABASE IF NOT EXISTS carpooling_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE carpooling_db;

CREATE TABLE IF NOT EXISTS drivers (
  driver_id INT NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  birth_date DATE DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  license_number VARCHAR(80) NOT NULL,
  verification_status ENUM('pending', 'verified', 'rejected', 'suspended') NOT NULL DEFAULT 'pending',
  vehicle_info VARCHAR(255) NOT NULL,
  available_seats INT NOT NULL DEFAULT 1,
  profile_image LONGTEXT DEFAULT NULL,
  rating_average DECIMAL(3, 2) DEFAULT NULL,
  rating_count INT NOT NULL DEFAULT 0,
  account_status ENUM('pending', 'active', 'suspended') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (driver_id),
  UNIQUE KEY email (email),
  UNIQUE KEY license_number (license_number),
  KEY idx_drivers_status (verification_status, account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS passengers (
  passenger_id INT NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  account_status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (passenger_id),
  UNIQUE KEY email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_vehicles (
  vehicle_id INT NOT NULL AUTO_INCREMENT,
  driver_id INT NOT NULL,
  license_number VARCHAR(80) NOT NULL,
  vehicle_info VARCHAR(255) NOT NULL,
  available_seats INT NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (vehicle_id),
  UNIQUE KEY license_number (license_number),
  KEY idx_driver_vehicles_driver (driver_id, is_active),
  CONSTRAINT fk_driver_vehicles_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trips (
  trip_id INT NOT NULL AUTO_INCREMENT,
  driver_id INT NOT NULL,
  origin VARCHAR(160) NOT NULL,
  origin_lat DECIMAL(10, 7) DEFAULT NULL,
  origin_lng DECIMAL(10, 7) DEFAULT NULL,
  destination VARCHAR(160) NOT NULL,
  destination_lat DECIMAL(10, 7) DEFAULT NULL,
  destination_lng DECIMAL(10, 7) DEFAULT NULL,
  driver_current_lat DECIMAL(10, 7) DEFAULT NULL,
  driver_current_lng DECIMAL(10, 7) DEFAULT NULL,
  last_location_at DATETIME DEFAULT NULL,
  route VARCHAR(255) DEFAULT NULL,
  trip_time DATETIME NOT NULL,
  available_seats INT NOT NULL DEFAULT 1,
  trip_status ENUM('draft', 'active', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (trip_id),
  KEY fk_trips_driver (driver_id),
  KEY idx_trips_status_time (trip_status, trip_time),
  CONSTRAINT fk_trips_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookings (
  booking_id INT NOT NULL AUTO_INCREMENT,
  passenger_id INT NOT NULL,
  trip_id INT NOT NULL,
  pickup_location VARCHAR(160) NOT NULL,
  pickup_lat DECIMAL(10, 7) DEFAULT NULL,
  pickup_lng DECIMAL(10, 7) DEFAULT NULL,
  dropoff_location VARCHAR(160) NOT NULL,
  dropoff_lat DECIMAL(10, 7) DEFAULT NULL,
  dropoff_lng DECIMAL(10, 7) DEFAULT NULL,
  seats_requested INT NOT NULL DEFAULT 1,
  booking_status ENUM('pending', 'accepted', 'picked_up', 'payment_due', 'rejected', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
  booking_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  passenger_trip_km DECIMAL(8, 2) DEFAULT 0.00,
  pickup_detour_km DECIMAL(8, 2) DEFAULT 0.00,
  payment_base_amount DECIMAL(10, 2) DEFAULT 0.00,
  payment_detour_amount DECIMAL(10, 2) DEFAULT 0.00,
  payment_amount DECIMAL(10, 2) DEFAULT 0.00,
  payment_method ENUM('cash', 'card', 'wallet') DEFAULT 'cash',
  payment_status ENUM('pending', 'cash_pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  driver_rating TINYINT DEFAULT NULL,
  PRIMARY KEY (booking_id),
  KEY fk_bookings_passenger (passenger_id),
  KEY fk_bookings_trip (trip_id),
  KEY idx_bookings_status (booking_status, payment_status),
  CONSTRAINT fk_bookings_passenger
    FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bookings_trip
    FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_accounts (
  wallet_id INT NOT NULL AUTO_INCREMENT,
  owner_type ENUM('driver', 'passenger') NOT NULL,
  owner_id INT NOT NULL,
  balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (wallet_id),
  UNIQUE KEY uq_wallet_owner (owner_type, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_cards (
  card_id INT NOT NULL AUTO_INCREMENT,
  owner_type ENUM('driver', 'passenger') NOT NULL,
  owner_id INT NOT NULL,
  cardholder_name VARCHAR(120) NOT NULL,
  card_brand VARCHAR(40) NOT NULL,
  last_four CHAR(4) NOT NULL,
  card_token_hash VARCHAR(255) NOT NULL,
  expiry_month TINYINT NOT NULL,
  expiry_year SMALLINT NOT NULL,
  card_status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (card_id),
  KEY idx_payment_cards_owner (owner_type, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  transaction_id INT NOT NULL AUTO_INCREMENT,
  wallet_id INT NOT NULL,
  booking_id INT DEFAULT NULL,
  transaction_type ENUM('top_up', 'fare_payment', 'fare_payout', 'withdrawal', 'refund') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (transaction_id),
  KEY fk_wallet_transactions_booking (booking_id),
  KEY idx_wallet_transactions_wallet (wallet_id, created_at),
  CONSTRAINT fk_wallet_transactions_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
    ON DELETE SET NULL,
  CONSTRAINT fk_wallet_transactions_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(wallet_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  message_id INT NOT NULL AUTO_INCREMENT,
  booking_id INT NOT NULL,
  sender_type ENUM('driver', 'passenger', 'admin') NOT NULL,
  message_text VARCHAR(1000) NOT NULL,
  sent_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id),
  KEY fk_messages_booking (booking_id),
  CONSTRAINT fk_messages_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  report_id INT NOT NULL AUTO_INCREMENT,
  booking_id INT NOT NULL,
  passenger_id INT NOT NULL,
  driver_id INT NOT NULL,
  comment VARCHAR(1000) DEFAULT NULL,
  report_type ENUM('safety', 'payment', 'other') NOT NULL DEFAULT 'other',
  report_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  report_status ENUM('open', 'reviewing', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  PRIMARY KEY (report_id),
  KEY fk_reports_booking (booking_id),
  KEY fk_reports_passenger (passenger_id),
  KEY fk_reports_driver (driver_id),
  KEY idx_reports_status (report_status),
  CONSTRAINT fk_reports_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reports_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reports_passenger
    FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
