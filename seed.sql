-- =====================
-- USERS
-- =====================

-- Admin (password: cropaid123)
-- Role: admin
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('admin-uuid', 'admin', 'admin@cropaid.gov.ph', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'admin');

-- Farmer 1: Shara Dane Desamero (password: cropaid123)
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('shara-uuid', 'shara.desamero', 'shara@gmail.com', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'farmer');

-- Farmer 2: James Machico (password: cropaid123)
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('james-uuid', 'james.machico', 'james@gmail.com', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'farmer');


-- =====================
-- FARMERS PROFILES
-- =====================

-- 1. Shara
INSERT INTO farmers (
    user_id, rsbsa_id, first_name, middle_name, last_name, 
    address_sitio, address_barangay, address_municipality, address_province, 
    cellphone, sex, date_of_birth, civil_status
) VALUES (
    'shara-uuid', 
    '12-63-11-001', 
    'Shara Dane', 
    'A', 
    'Desamero', 
    'Purok 1', 
    'San Jose', 
    'Norala', 
    'South Cotabato', 
    '09171234444', 
    'Female', 
    '1995-05-15', 
    'Single'
);

-- 2. James
INSERT INTO farmers (
    user_id, rsbsa_id, first_name, middle_name, last_name, 
    address_sitio, address_barangay, address_municipality, address_province, 
    cellphone, sex, date_of_birth, civil_status
) VALUES (
    'james-uuid', 
    '12-63-11-002', 
    'James', 
    'B', 
    'Machico', 
    'Purok 3', 
    'Liberty', 
    'Norala', 
    'South Cotabato', 
    '09181235555', 
    'Male', 
    '1990-08-20', 
    'Married'
);


-- =====================
-- FARMS
-- =====================

-- Shara's Farm (San Jose)
INSERT INTO farms (
    farmer_id, location_barangay, location_sitio,
    latitude, longitude, farm_size_hectares
) 
SELECT id, 'San Jose', 'Purok 1', 6.2401, 124.8801, 2.5
FROM farmers WHERE user_id = 'shara-uuid';

-- James's Farm (Liberty)
INSERT INTO farms (
    farmer_id, location_barangay, location_sitio,
    latitude, longitude, farm_size_hectares
) 
SELECT id, 'Liberty', 'Purok 3', 6.2281, 124.8681, 1.8
FROM farmers WHERE user_id = 'james-uuid';


-- =====================
-- REPORTS
-- =====================

-- Reports from Shara
INSERT INTO reports (user_id, type, status, details, location, latitude, longitude, created_at) VALUES 
('shara-uuid', 'pest', 'pending', 
 '{"cropType":"Rice", "pestType":"Rice Black Bug", "severity":"High", "affectedArea":"1.5", "damageLevel":"Severe", "description":"Black bug infestation observed in rice field mostly in the lower part."}', 
 'San Jose', 6.2401, 124.8801, DATE_SUB(NOW(), INTERVAL 2 DAY)),

('shara-uuid', 'drought', 'verified', 
 '{"cropType":"Corn", "severity":"Medium", "affectedArea":"2.0", "damageLevel":"Moderate", "description":"Leaves curling due to lack of water for 2 weeks."}', 
 'San Jose', 6.2405, 124.8805, DATE_SUB(NOW(), INTERVAL 10 DAY));

-- Reports from James
INSERT INTO reports (user_id, type, status, details, location, latitude, longitude, created_at) VALUES 
('james-uuid', 'flood', 'resolved', 
 '{"cropType":"Vegetables", "severity":"Critical", "affectedArea":"0.5", "damageLevel":"Total Loss", "description":"River overflow washed away vegetable plots."}', 
 'Liberty', 6.2281, 124.8681, DATE_SUB(NOW(), INTERVAL 15 DAY)),

('james-uuid', 'pest', 'pending', 
 '{"cropType":"Corn", "pestType":"Army Worm", "severity":"Low", "affectedArea":"0.2", "damageLevel":"Minor", "description":"Early signs of army worm on young corn."}', 
 'Liberty', 6.2285, 124.8685, NOW());


-- =====================
-- SYSTEM SETTINGS
-- =====================
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('sms_alerts_enabled', 'true', 'Enable SMS notifications for critical alerts'),
('auto_verify_threshold', '5', 'Number of similar reports required for auto-verification');

-- =====================
-- PEST CATEGORIES
-- =====================
INSERT INTO pest_categories (name, description, severity_level, affected_crops) VALUES
('Rice Black Bug', 'Saps the plant of its nutrients causing it to turn reddish brown or yellow.', 'high', '["Rice"]'),
('Army Worm', 'Larvae feed on leaves and stems, causing massive defoliation.', 'high', '["Rice", "Corn", "Vegetables"]'),
('Rodents', 'Rats that eat crops and grains.', 'medium', '["Rice", "Corn"]');

-- =====================
-- CROP TYPES
-- =====================
INSERT INTO crop_types (name, description, season) VALUES
('Rice', 'Staple food crop', 'Wet/Dry'),
('Corn', 'Cereal grain', 'Dry'),
('Vegetables', 'Various garden crops', 'Year-round');

-- =====================
-- BARANGAYS
-- =====================
INSERT INTO barangays (name, latitude, longitude) VALUES 
('San Jose', 6.2401, 124.8801),
('Liberty', 6.2281, 124.8681),
('Esperanza', 6.2161, 124.8561),
('Poblacion', 6.2341, 124.8741);
