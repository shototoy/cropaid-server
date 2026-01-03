-- CropAid Database Seed Data
-- Clean database and insert initial data

-- Clear existing data (order matters due to foreign keys)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE notifications;
TRUNCATE TABLE reports;
TRUNCATE TABLE farms;
TRUNCATE TABLE farmers;
TRUNCATE TABLE users;
TRUNCATE TABLE pest_categories;
TRUNCATE TABLE crop_types;
TRUNCATE TABLE barangays;
TRUNCATE TABLE system_settings;
SET FOREIGN_KEY_CHECKS = 1;

-- =====================
-- ADMIN USER
-- =====================
-- Password: admin123 (bcryptjs hash)
INSERT INTO users (id, username, email, password_hash, role, is_active) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'admin', 'admin@cropaid.gov.ph', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', TRUE);

-- =====================
-- BARANGAYS OF NORALA
-- =====================
INSERT INTO barangays (name, municipality, province) VALUES
('Poblacion', 'Norala', 'South Cotabato'),
('San Jose', 'Norala', 'South Cotabato'),
('Liberty', 'Norala', 'South Cotabato'),
('Esperanza', 'Norala', 'South Cotabato'),
('Dumaguil', 'Norala', 'South Cotabato'),
('Tinago', 'Norala', 'South Cotabato'),
('Kibid', 'Norala', 'South Cotabato'),
('Lapuz', 'Norala', 'South Cotabato'),
('Bunao', 'Norala', 'South Cotabato'),
('Palavilla', 'Norala', 'South Cotabato'),
('Mabini', 'Norala', 'South Cotabato'),
('Puti', 'Norala', 'South Cotabato');

-- =====================
-- PEST CATEGORIES
-- =====================
INSERT INTO pest_categories (name, description, severity_level, affected_crops, is_active) VALUES
('Black Bug', 'Rice black bug infestation that damages rice plants', 'high', 'Rice', TRUE),
('Rice Stem Borer', 'Larvae bore into rice stems causing deadhearts', 'high', 'Rice', TRUE),
('Brown Planthopper', 'Sap-sucking insect causing hopper burn in rice', 'critical', 'Rice', TRUE),
('Corn Borer', 'Larvae tunnel into corn stalks and ears', 'high', 'Corn', TRUE),
('Armyworm', 'Caterpillars that feed on leaves of various crops', 'medium', 'Rice,Corn,Vegetables', TRUE),
('Rats', 'Rodents damaging crops in field and storage', 'medium', 'Rice,Corn', TRUE),
('Golden Apple Snail', 'Invasive snail that feeds on young rice seedlings', 'high', 'Rice', TRUE),
('Tungro Virus', 'Viral disease transmitted by green leafhoppers', 'critical', 'Rice', TRUE);

-- =====================
-- CROP TYPES
-- =====================
INSERT INTO crop_types (name, description, season, is_active) VALUES
('Rice', 'Primary staple crop', 'Wet/Dry Season', TRUE),
('Corn', 'Major grain crop for food and feed', 'Dry Season', TRUE),
('Vegetables', 'Various vegetable crops', 'Year-round', TRUE),
('Coconut', 'Perennial tree crop', 'Year-round', TRUE),
('Banana', 'Fruit crop', 'Year-round', TRUE),
('Sugarcane', 'Industrial crop', 'Dry Season', TRUE);

-- =====================
-- SYSTEM SETTINGS
-- =====================
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('app_name', 'CropAid', 'Application name'),
('municipality', 'Norala', 'Target municipality'),
('province', 'South Cotabato', 'Target province');
