CREATE DATABASE IF NOT EXISTS booking_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE booking_portal;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NULL,
  pod VARCHAR(120) NOT NULL,
  job_title VARCHAR(120) NOT NULL,
  access_role ENUM('employee','manager','admin') NOT NULL DEFAULT 'employee',
  entity VARCHAR(80) NOT NULL DEFAULT 'Reckoner',
  monthly_target DECIMAL(8,2) NOT NULL DEFAULT 160.00,
  billing_rate DECIMAL(10,2) NULL,
  config_permissions VARCHAR(255) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  password_changed_at DATETIME NULL,
  session_version INT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email), INDEX idx_users_pod (pod), INDEX idx_users_access_role (access_role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mfa_challenges (
  challenge_id CHAR(64) PRIMARY KEY,
  user_id VARCHAR(24) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME NULL,
  requested_ip VARCHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_mfa_user_created (user_id,created_at),
  INDEX idx_mfa_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(24) NULL,
  email VARCHAR(190) NOT NULL DEFAULT '',
  event_type VARCHAR(40) NOT NULL,
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_email_time (email,created_at),
  INDEX idx_auth_ip_time (ip_address,created_at),
  INDEX idx_auth_user_time (user_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_challenges (
  challenge_id CHAR(64) PRIMARY KEY,
  user_id VARCHAR(24) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME NULL,
  requested_ip VARCHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_password_reset_user_created (user_id,created_at),
  INDEX idx_password_reset_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(40) PRIMARY KEY,
  person_id VARCHAR(24) NOT NULL,
  firm VARCHAR(120) NOT NULL DEFAULT 'Reckoner',
  client VARCHAR(180) NOT NULL,
  status ENUM('confirmed','potential') NOT NULL DEFAULT 'confirmed',
  stage VARCHAR(120) NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  color VARCHAR(12) NOT NULL DEFAULT '#2e5984',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_user FOREIGN KEY (person_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_booking_person_dates (person_id,start_date,end_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leaves (
  id VARCHAR(40) PRIMARY KEY,
  person_id VARCHAR(24) NOT NULL,
  leave_type VARCHAR(80) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leave_user FOREIGN KEY (person_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_leave_person_dates (person_id,start_date,end_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id VARCHAR(40) PRIMARY KEY,
  person_id VARCHAR(24) NOT NULL,
  billing_to_id VARCHAR(24) NULL,
  booking_id VARCHAR(40) NULL,
  entity VARCHAR(80) NOT NULL DEFAULT 'Reckoner',
  charge_type VARCHAR(80) NOT NULL DEFAULT 'Non-Chargeable',
  work_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  hours DECIMAL(6,2) NULL,
  client_name VARCHAR(180) NOT NULL DEFAULT '',
  assignment VARCHAR(180) NOT NULL DEFAULT '',
  work_area VARCHAR(180) NOT NULL DEFAULT '',
  work_done TEXT NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'self',
  import_batch_id CHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_entry_user FOREIGN KEY (person_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_entry_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  INDEX idx_entry_person_date (person_id,work_date), INDEX idx_entry_billing_to (billing_to_id), INDEX idx_entry_booking (booking_id), INDEX idx_entry_import_batch (import_batch_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS timesheet_import_batches (
  batch_id CHAR(32) PRIMARY KEY,
  imported_by VARCHAR(24) NULL,
  file_name VARCHAR(255) NOT NULL,
  row_count INT UNSIGNED NOT NULL,
  employee_count INT UNSIGNED NOT NULL,
  status ENUM('active','undone') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  undone_at DATETIME NULL,
  undone_by VARCHAR(24) NULL,
  CONSTRAINT fk_import_user FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_import_created (created_at), INDEX idx_import_user (imported_by)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS timesheet_import_changes (
  batch_id CHAR(32) NOT NULL,
  entry_id VARCHAR(40) NOT NULL,
  previous_json LONGTEXT NULL,
  PRIMARY KEY (batch_id,entry_id),
  CONSTRAINT fk_import_change_batch FOREIGN KEY (batch_id) REFERENCES timesheet_import_batches(batch_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sharepoint_backups (
  backup_month CHAR(7) PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  row_count INT UNSIGNED NOT NULL,
  graph_item_id VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('completed','failed') NOT NULL,
  error_message VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS public_holidays (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  holiday_name VARCHAR(180) NOT NULL,
  holiday_date DATE NOT NULL,
  UNIQUE KEY uq_holiday_name_date (holiday_name,holiday_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reference_values (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category ENUM('entity','type','assignment','work_area','client') NOT NULL,
  value VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_reference_category_value (category,value),
  INDEX idx_reference_category (category,active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_thresholds (
  client_name VARCHAR(255) PRIMARY KEY,
  minimum_hours DECIMAL(8,2) NOT NULL DEFAULT 40.00
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS entity_pricing (
  entity_name VARCHAR(180) NOT NULL,
  designation VARCHAR(120) NOT NULL,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_name,designation)
) ENGINE=InnoDB;
