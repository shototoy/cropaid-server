DELETE FROM reports;
DELETE FROM farms;
DELETE FROM farmers;
DELETE FROM users;
DELETE FROM pest_categories;
DELETE FROM crop_types;
DELETE FROM barangays;
DELETE FROM system_settings;

-- Admin user (password: admin123)
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('admin-uuid', 'admin', 'admin@cropaid.gov.ph', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'admin');

-- Sample farmers
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('juan-uuid', 'juan', 'juan@gmail.com', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'farmer');
INSERT INTO farmers (id, user_id, rsbsa_id, first_name, last_name, address_barangay, address_province, cellphone) VALUES 
('farmer-juan', 'juan-uuid', '012-345-6789', 'Juan', 'dela Cruz', 'San Jose', 'South Cotabato', '09171234567');

INSERT INTO users (id, username, email, password_hash, role) VALUES 
('maria-uuid', 'maria', 'maria@gmail.com', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'farmer');
INSERT INTO farmers (id, user_id, rsbsa_id, first_name, last_name, address_barangay, address_province, cellphone) VALUES 
('farmer-maria', 'maria-uuid', '012-987-6543', 'Maria', 'Santos', 'Liberty', 'South Cotabato', '09181234567');

-- Sample farms
INSERT INTO farms (id, farmer_id, location_barangay, location_province, location_municipality) VALUES 
('farm-juan', 'farmer-juan', 'San Jose', 'South Cotabato', 'Norala');
INSERT INTO farms (id, farmer_id, location_barangay, location_province, location_municipality) VALUES 
('farm-maria', 'farmer-maria', 'Liberty', 'South Cotabato', 'Norala');

-- Sample reports
INSERT INTO reports (id, user_id, type, status, details, location, created_at) VALUES 
('report-1', 'juan-uuid', 'pest', 'pending', '{"crop":"Rice", "pestType":"Black Bug", "severity":"High", "description":"Black bug infestation observed in 2 hectares."}', 'San Jose', DATE_SUB(NOW(), INTERVAL 2 DAY)),
('report-2', 'juan-uuid', 'flood', 'verified', '{"crop":"Corn", "severity":"Critical", "description":"River overflow caused flooding."}', 'San Jose', DATE_SUB(NOW(), INTERVAL 5 DAY)),
('report-3', 'maria-uuid', 'drought', 'resolved', '{"crop":"Rice", "severity":"Medium", "description":"Lack of water supply affecting rice growth."}', 'Liberty', DATE_SUB(NOW(), INTERVAL 10 DAY));

-- Barangays of Norala
INSERT INTO barangays (id, name, municipality, province) VALUES
('brgy-1', 'Poblacion', 'Norala', 'South Cotabato'),
('brgy-2', 'San Jose', 'Norala', 'South Cotabato'),
('brgy-3', 'Liberty', 'Norala', 'South Cotabato'),
('brgy-4', 'Esperanza', 'Norala', 'South Cotabato'),
('brgy-5', 'Dumaguil', 'Norala', 'South Cotabato'),
('brgy-6', 'Tinago', 'Norala', 'South Cotabato'),
('brgy-7', 'Kibid', 'Norala', 'South Cotabato'),
('brgy-8', 'Lapuz', 'Norala', 'South Cotabato'),
('brgy-9', 'Bunao', 'Norala', 'South Cotabato'),
('brgy-10', 'Palavilla', 'Norala', 'South Cotabato'),
('brgy-11', 'Mabini', 'Norala', 'South Cotabato'),
('brgy-12', 'Puti', 'Norala', 'South Cotabato');

-- Pest categories
INSERT INTO pest_categories (id, name, description, severity_level, affected_crops, is_active) VALUES
('pest-1', 'Black Bug', 'Rice black bug infestation that damages rice plants', 'high', 'Rice', TRUE),
('pest-2', 'Rice Stem Borer', 'Larvae bore into rice stems causing deadhearts', 'high', 'Rice', TRUE),
('pest-3', 'Brown Planthopper', 'Sap-sucking insect causing hopper burn in rice', 'critical', 'Rice', TRUE),
('pest-4', 'Corn Borer', 'Larvae tunnel into corn stalks and ears', 'high', 'Corn', TRUE),
('pest-5', 'Armyworm', 'Caterpillars that feed on leaves of various crops', 'medium', 'Rice,Corn,Vegetables', TRUE),
('pest-6', 'Rats', 'Rodents damaging crops in field and storage', 'medium', 'Rice,Corn', TRUE),
('pest-7', 'Golden Apple Snail', 'Invasive snail that feeds on young rice seedlings', 'high', 'Rice', TRUE),
('pest-8', 'Tungro Virus', 'Viral disease transmitted by green leafhoppers', 'critical', 'Rice', TRUE);

-- Crop types
INSERT INTO crop_types (id, name, description, season, is_active) VALUES
('crop-1', 'Rice', 'Primary staple crop', 'Wet/Dry Season', TRUE),
('crop-2', 'Corn', 'Major grain crop for food and feed', 'Dry Season', TRUE),
('crop-3', 'Vegetables', 'Various vegetable crops', 'Year-round', TRUE),
('crop-4', 'Coconut', 'Perennial tree crop', 'Year-round', TRUE),
('crop-5', 'Banana', 'Fruit crop', 'Year-round', TRUE),
('crop-6', 'Sugarcane', 'Industrial crop', 'Dry Season', TRUE);

-- System settings
INSERT INTO system_settings (id, setting_key, setting_value, description) VALUES
('setting-1', 'app_name', 'CropAid', 'Application name'),
('setting-2', 'municipality', 'Norala', 'Target municipality'),
('setting-3', 'province', 'South Cotabato', 'Target province');
