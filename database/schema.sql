CREATE DATABASE IF NOT EXISTS carpooling_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE carpooling_db;

CREATE TABLE IF NOT EXISTS drivers (
  driver_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  license_number VARCHAR(80) NOT NULL UNIQUE,
  verification_status ENUM('pending', 'verified', 'rejected', 'suspended') NOT NULL DEFAULT 'pending',
  vehicle_info VARCHAR(255) NOT NULL,
  available_seats INT NOT NULL DEFAULT 1,
  rating_average DECIMAL(3, 2) NOT NULL DEFAULT 4.80,
  rating_count INT NOT NULL DEFAULT 0,
  account_status ENUM('pending', 'active', 'suspended') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS passengers (
  passenger_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  account_status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
  trip_id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id INT NOT NULL,
  origin VARCHAR(160) NOT NULL,
  origin_lat DECIMAL(10, 7),
  origin_lng DECIMAL(10, 7),
  destination VARCHAR(160) NOT NULL,
  destination_lat DECIMAL(10, 7),
  destination_lng DECIMAL(10, 7),
  driver_current_lat DECIMAL(10, 7),
  driver_current_lng DECIMAL(10, 7),
  last_location_at DATETIME,
  route VARCHAR(255),
  trip_time DATETIME NOT NULL,
  available_seats INT NOT NULL DEFAULT 1,
  trip_status ENUM('draft', 'active', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_trips_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  booking_id INT AUTO_INCREMENT PRIMARY KEY,
  passenger_id INT NOT NULL,
  trip_id INT NOT NULL,
  pickup_location VARCHAR(160) NOT NULL,
  pickup_lat DECIMAL(10, 7),
  pickup_lng DECIMAL(10, 7),
  dropoff_location VARCHAR(160) NOT NULL,
  dropoff_lat DECIMAL(10, 7),
  dropoff_lng DECIMAL(10, 7),
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
  driver_rating TINYINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bookings_passenger
    FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bookings_trip
    FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  wallet_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_type ENUM('driver', 'passenger') NOT NULL,
  owner_id INT NOT NULL,
  balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wallet_owner (owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS payment_cards (
  card_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_type ENUM('driver', 'passenger') NOT NULL,
  owner_id INT NOT NULL,
  cardholder_name VARCHAR(120) NOT NULL,
  card_brand VARCHAR(40) NOT NULL,
  last_four CHAR(4) NOT NULL,
  card_token_hash VARCHAR(255) NOT NULL,
  expiry_month TINYINT NOT NULL,
  expiry_year SMALLINT NOT NULL,
  card_status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  wallet_id INT NOT NULL,
  booking_id INT,
  transaction_type ENUM('top_up', 'fare_payment', 'fare_payout', 'withdrawal', 'refund') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallet_transactions_wallet
    FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(wallet_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_wallet_transactions_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  message_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  sender_type ENUM('driver', 'passenger', 'admin') NOT NULL,
  message_text VARCHAR(1000) NOT NULL,
  sent_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  report_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  passenger_id INT NOT NULL,
  driver_id INT NOT NULL,
  comment VARCHAR(1000),
  report_type ENUM('safety', 'payment', 'other') NOT NULL DEFAULT 'other',
  report_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  report_status ENUM('open', 'reviewing', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  CONSTRAINT fk_reports_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reports_passenger
    FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reports_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_drivers_status ON drivers(verification_status, account_status);
CREATE INDEX idx_trips_status_time ON trips(trip_status, trip_time);
CREATE INDEX idx_bookings_status ON bookings(booking_status, payment_status);
CREATE INDEX idx_reports_status ON reports(report_status);
CREATE INDEX idx_payment_cards_owner ON payment_cards(owner_type, owner_id);
CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id, created_at);
