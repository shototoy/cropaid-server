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
    
    -- Farm Details
    planting_method ENUM('Direct Seeding', 'Transplanting'),
    date_of_sowing DATE,
    date_of_transplanting DATE,
    date_of_harvest DATE,
    land_category ENUM('Irrigated', 'Rainfed', 'Upland'),
    soil_type ENUM('Clay Loam', 'Silty Clay Loam', 'Silty Loam', 'Sandy Loam', 'Others'),
    topography ENUM('Flat', 'Rolling', 'Hilly'),
    irrigation_source ENUM('NIA/CIS', 'Deep Well', 'SWIP', 'STW'),
    tenural_status ENUM('Owner', 'Lessee', 'Tenant'),
    
    -- Insurance / Coverage
    current_crop VARCHAR(100),
    cover_type VARCHAR(100),
    amount_cover DECIMAL(15,2),
    insurance_premium DECIMAL(15,2),
    
    -- CLTIP - ADSS
    cltip_sum_insured DECIMAL(15,2),
    cltip_premium DECIMAL(15,2),

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
    farm_id INT, -- Optional link to specific farm
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
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL
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
-- REPORT COMMENTS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS report_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    user_id CHAR(36) NOT NULL,
    comment TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================
-- ACTIVITY LOGS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    action_type ENUM('login', 'logout', 'report_submit', 'report_update', 'profile_update', 'farmer_add', 'farmer_update', 'farmer_delete', 'status_change', 'other') NOT NULL,
    description TEXT,
    metadata JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
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
-- NEWS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS news (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    type ENUM('news', 'advisory', 'weather', 'alert') DEFAULT 'news',
    priority ENUM('low', 'normal', 'medium', 'high', 'critical') DEFAULT 'normal',
    author_id CHAR(36),
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================

-- User & Authentication indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Farmer indexes
CREATE INDEX idx_farmers_user_id ON farmers(user_id);
CREATE INDEX idx_farmers_rsbsa_id ON farmers(rsbsa_id);
CREATE INDEX idx_farmers_barangay ON farmers(address_barangay);
CREATE INDEX idx_farmers_name ON farmers(last_name, first_name);

-- Farm indexes
CREATE INDEX idx_farms_farmer_id ON farms(farmer_id);
CREATE INDEX idx_farms_barangay ON farms(location_barangay);
CREATE INDEX idx_farms_coordinates ON farms(latitude, longitude);

-- Report indexes (most frequently queried)
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX idx_reports_location ON reports(location);
CREATE INDEX idx_reports_coordinates ON reports(latitude, longitude);
-- Composite indexes for common query patterns
CREATE INDEX idx_reports_status_type ON reports(status, type);
CREATE INDEX idx_reports_status_created ON reports(status, created_at DESC);
CREATE INDEX idx_reports_user_status ON reports(user_id, status);

-- Notification indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_type ON notifications(type);
-- Composite index for unread notifications query
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

-- Report Comments indexes
CREATE INDEX idx_comments_report_id ON report_comments(report_id);
CREATE INDEX idx_comments_user_id ON report_comments(user_id);
CREATE INDEX idx_comments_created_at ON report_comments(created_at DESC);

-- Activity Logs indexes
CREATE INDEX idx_activity_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_action_type ON activity_logs(action_type);
CREATE INDEX idx_activity_created_at ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_user_created ON activity_logs(user_id, created_at DESC);

-- News indexes
CREATE INDEX idx_news_is_active ON news(is_active);
CREATE INDEX idx_news_type ON news(type);
CREATE INDEX idx_news_created_at ON news(created_at DESC);
CREATE INDEX idx_news_active_created ON news(is_active, created_at DESC);
