-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: booking_portal
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `app_settings`
--

DROP TABLE IF EXISTS `app_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `app_settings` (
  `setting_key` varchar(80) NOT NULL,
  `setting_value` text NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_thresholds`
--

DROP TABLE IF EXISTS `audit_thresholds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audit_thresholds` (
  `client_name` varchar(255) NOT NULL,
  `minimum_hours` decimal(8,2) NOT NULL DEFAULT 40.00,
  PRIMARY KEY (`client_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auth_events`
--

DROP TABLE IF EXISTS `auth_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `auth_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` varchar(24) DEFAULT NULL,
  `email` varchar(190) NOT NULL DEFAULT '',
  `event_type` varchar(40) NOT NULL,
  `ip_address` varchar(64) NOT NULL DEFAULT '',
  `user_agent` varchar(255) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_auth_email_time` (`email`,`created_at`),
  KEY `idx_auth_ip_time` (`ip_address`,`created_at`),
  KEY `idx_auth_user_time` (`user_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `bookings` (
  `id` varchar(40) NOT NULL,
  `person_id` varchar(24) NOT NULL,
  `firm` varchar(120) NOT NULL DEFAULT 'Reckoner',
  `client` varchar(180) NOT NULL,
  `status` enum('confirmed','potential') NOT NULL DEFAULT 'confirmed',
  `stage` varchar(120) NOT NULL DEFAULT '',
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `note` varchar(500) NOT NULL DEFAULT '',
  `color` varchar(12) NOT NULL DEFAULT '#2e5984',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_booking_person_dates` (`person_id`,`start_date`,`end_date`),
  CONSTRAINT `fk_booking_user` FOREIGN KEY (`person_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `client_pricing`
--

DROP TABLE IF EXISTS `client_pricing`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `client_pricing` (
  `client_name` varchar(180) NOT NULL,
  `designation` varchar(120) NOT NULL,
  `hourly_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`client_name`,`designation`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entity_pricing`
--

DROP TABLE IF EXISTS `entity_pricing`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `entity_pricing` (
  `entity_name` varchar(180) NOT NULL,
  `designation` varchar(120) NOT NULL,
  `hourly_rate` decimal(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`entity_name`,`designation`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `leaves`
--

DROP TABLE IF EXISTS `leaves`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `leaves` (
  `id` varchar(40) NOT NULL,
  `person_id` varchar(24) NOT NULL,
  `leave_type` varchar(80) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `note` varchar(500) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_leave_person_dates` (`person_id`,`start_date`,`end_date`),
  CONSTRAINT `fk_leave_user` FOREIGN KEY (`person_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mfa_challenges`
--

DROP TABLE IF EXISTS `mfa_challenges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mfa_challenges` (
  `challenge_id` char(64) NOT NULL,
  `user_id` varchar(24) NOT NULL,
  `code_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `consumed_at` datetime DEFAULT NULL,
  `requested_ip` varchar(64) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`challenge_id`),
  KEY `idx_mfa_user_created` (`user_id`,`created_at`),
  KEY `idx_mfa_expiry` (`expires_at`),
  CONSTRAINT `fk_mfa_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `password_reset_challenges`
--

DROP TABLE IF EXISTS `password_reset_challenges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_challenges` (
  `challenge_id` char(64) NOT NULL,
  `user_id` varchar(24) NOT NULL,
  `code_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `consumed_at` datetime DEFAULT NULL,
  `requested_ip` varchar(64) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`challenge_id`),
  KEY `idx_password_reset_user_created` (`user_id`,`created_at`),
  KEY `idx_password_reset_expiry` (`expires_at`),
  CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `public_holidays`
--

DROP TABLE IF EXISTS `public_holidays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `public_holidays` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `holiday_name` varchar(180) NOT NULL,
  `holiday_date` date NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_holiday_name_date` (`holiday_name`,`holiday_date`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reference_values`
--

DROP TABLE IF EXISTS `reference_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `reference_values` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `category` enum('entity','type','assignment','work_area','client') NOT NULL,
  `value` varchar(255) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reference_category_value` (`category`,`value`),
  KEY `idx_reference_category` (`category`,`active`)
) ENGINE=InnoDB AUTO_INCREMENT=13221 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sharepoint_backups`
--

DROP TABLE IF EXISTS `sharepoint_backups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sharepoint_backups` (
  `backup_month` char(7) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `row_count` int(10) unsigned NOT NULL,
  `graph_item_id` varchar(255) NOT NULL DEFAULT '',
  `status` enum('completed','failed') NOT NULL,
  `error_message` varchar(500) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`backup_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timesheet_entries`
--

DROP TABLE IF EXISTS `timesheet_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `timesheet_entries` (
  `id` varchar(40) NOT NULL,
  `person_id` varchar(24) NOT NULL,
  `billing_to_id` varchar(24) DEFAULT NULL,
  `booking_id` varchar(40) DEFAULT NULL,
  `entity` varchar(80) NOT NULL DEFAULT 'Reckoner',
  `charge_type` varchar(80) NOT NULL DEFAULT 'Non-Chargeable',
  `work_date` date NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `hours` decimal(6,2) DEFAULT NULL,
  `client_name` varchar(180) NOT NULL DEFAULT '',
  `assignment` varchar(180) NOT NULL DEFAULT '',
  `work_area` varchar(180) NOT NULL DEFAULT '',
  `work_done` text NOT NULL,
  `source` varchar(24) NOT NULL DEFAULT 'self',
  `import_batch_id` char(32) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_entry_person_date` (`person_id`,`work_date`),
  KEY `idx_entry_booking` (`booking_id`),
  KEY `idx_entry_billing_to` (`billing_to_id`),
  KEY `idx_entry_import_batch` (`import_batch_id`),
  CONSTRAINT `fk_entry_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_entry_user` FOREIGN KEY (`person_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timesheet_import_batches`
--

DROP TABLE IF EXISTS `timesheet_import_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `timesheet_import_batches` (
  `batch_id` char(32) NOT NULL,
  `imported_by` varchar(24) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `row_count` int(10) unsigned NOT NULL,
  `employee_count` int(10) unsigned NOT NULL,
  `status` enum('active','undone') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `undone_at` datetime DEFAULT NULL,
  `undone_by` varchar(24) DEFAULT NULL,
  PRIMARY KEY (`batch_id`),
  KEY `idx_import_created` (`created_at`),
  KEY `idx_import_user` (`imported_by`),
  CONSTRAINT `fk_import_user` FOREIGN KEY (`imported_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timesheet_import_changes`
--

DROP TABLE IF EXISTS `timesheet_import_changes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `timesheet_import_changes` (
  `batch_id` char(32) NOT NULL,
  `entry_id` varchar(40) NOT NULL,
  `previous_json` longtext DEFAULT NULL,
  PRIMARY KEY (`batch_id`,`entry_id`),
  CONSTRAINT `fk_import_change_batch` FOREIGN KEY (`batch_id`) REFERENCES `timesheet_import_batches` (`batch_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` varchar(24) NOT NULL,
  `name` varchar(120) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `pod` varchar(120) NOT NULL,
  `job_title` varchar(120) NOT NULL,
  `access_role` enum('employee','manager','admin') NOT NULL DEFAULT 'employee',
  `entity` varchar(80) NOT NULL DEFAULT 'Reckoner',
  `monthly_target` decimal(8,2) NOT NULL DEFAULT 160.00,
  `billing_rate` decimal(10,2) DEFAULT NULL,
  `config_permissions` varchar(255) NOT NULL DEFAULT '',
  `password_hash` varchar(255) NOT NULL,
  `mfa_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
  `password_changed_at` datetime DEFAULT NULL,
  `session_version` int(10) unsigned NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_pod` (`pod`),
  KEY `idx_users_access_role` (`access_role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-25 10:56:32
