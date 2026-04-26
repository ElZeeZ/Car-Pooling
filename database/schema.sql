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
  account_status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
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
  destination VARCHAR(160) NOT NULL,
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
  dropoff_location VARCHAR(160) NOT NULL,
  booking_status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
  booking_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_amount DECIMAL(10, 2) DEFAULT 0.00,
  payment_method ENUM('cash', 'card', 'wallet') DEFAULT 'cash',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bookings_passenger
    FOREIGN KEY (passenger_id) REFERENCES passengers(passenger_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bookings_trip
    FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
    ON DELETE CASCADE
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
  rating INT,
  comment VARCHAR(1000),
  report_type ENUM('driver_review', 'passenger_review', 'safety', 'payment', 'other') NOT NULL DEFAULT 'other',
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
