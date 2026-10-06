CREATE DATABASE IF NOT EXISTS smart_light_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE smart_light_db;

CREATE TABLE IF NOT EXISTS command_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voice_command VARCHAR(255) NOT NULL,
        light_action ENUM('ON', 'OFF', 'NONE') NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'dashboard',
    status VARCHAR(50) NOT NULL DEFAULT 'Successful',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS device_status (
    id INT PRIMARY KEY,
    light_state ENUM('ON', 'OFF') NOT NULL DEFAULT 'OFF',
    last_seen DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO device_status (id, light_state)
VALUES (1, 'OFF');
