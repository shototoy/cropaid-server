-- CropAid Database Schema
-- Municipality of Norala, South Cotabato

-- =====================
-- DROP TABLES (in reverse order of creation due to foreign keys)
-- =====================
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS farms;
DROP TABLE IF EXISTS farmers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS pest_categories;
DROP TABLE IF EXISTS crop_types;
DROP TABLE IF EXISTS barangays;
DROP TABLE IF EXISTS news;
DROP TABLE IF EXISTS system_settings;

-- =====================
-- USERS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('farmer', 'admin') DEFAULT 'farmer',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================
-- FARMERS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS farmers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL UNIQUE,
    rsbsa_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(20),
    tribe VARCHAR(100),
    address_sitio VARCHAR(255),
    address_barangay VARCHAR(255),
    address_municipality VARCHAR(255) DEFAULT 'Norala',
    address_province VARCHAR(255) DEFAULT 'South Cotabato',
    cellphone VARCHAR(20),
    sex ENUM('Male', 'Female'),
    date_of_birth DATE,
    civil_status VARCHAR(50),
    profile_picture LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================
-- FARMS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS farms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    farmer_id INT NOT NULL,
    location_sitio VARCHAR(255),
    location_barangay VARCHAR(255),
    location_municipality VARCHAR(255) DEFAULT 'Norala',
    location_province VARCHAR(255) DEFAULT 'South Cotabato',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    boundary_north VARCHAR(255),
    boundary_south VARCHAR(255),
    boundary_east VARCHAR(255),
    boundary_west VARCHAR(255),
    farm_size_hectares DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
);

-- =====================
-- REPORTS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    type ENUM('pest', 'flood', 'drought') NOT NULL,
    status ENUM('pending', 'verified', 'resolved', 'rejected') DEFAULT 'pending',
    location VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    details JSON,
    photo_base64 LONGTEXT,
    admin_notes TEXT,
    verified_by CHAR(36),
    verified_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================
-- NOTIFICATIONS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36),
    type ENUM('new_report', 'status_change', 'advisory', 'system') NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    reference_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================
-- PEST CATEGORIES TABLE
-- =====================
CREATE TABLE IF NOT EXISTS pest_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    severity_level ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    affected_crops TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- CROP TYPES TABLE
-- =====================
CREATE TABLE IF NOT EXISTS crop_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    variety VARCHAR(100),
    description TEXT,
    season VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- BARANGAYS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS barangays (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    municipality VARCHAR(100) DEFAULT 'Norala',
    province VARCHAR(100) DEFAULT 'South Cotabato',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================
-- SYSTEM SETTINGS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================
-- INDEXES
-- =====================
CREATE INDEX idx_farmers_user_id ON farmers(user_id);
CREATE INDEX idx_farmers_barangay ON farmers(address_barangay);
CREATE INDEX idx_farms_farmer_id ON farms(farmer_id);
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
