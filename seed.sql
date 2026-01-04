-- =====================
-- USERS
-- =====================

-- Admin (password: cropaid123)
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('admin-uuid', 'admin', 'admin@cropaid.gov.ph', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'admin');

-- Farmer 1: Shara Dane Desamero (password: cropaid123)
-- San Jose, Norala
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('shara-uuid', 'shara.desamero', 'shara@gmail.com', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'farmer');

-- Farmer 2: James Machico (password: cropaid123)
-- Liberty, Norala
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

-- Shara's Farm (San Jose, Norala) -> Approx 6.525, 124.675
INSERT INTO farms (
    farmer_id, location_barangay, location_sitio,
    latitude, longitude, farm_size_hectares
) 
SELECT id, 'San Jose', 'Purok 1', 6.5250, 124.6750, 2.5
FROM farmers WHERE user_id = 'shara-uuid';

-- James's Farm (Liberty, Norala) -> Approx 6.505, 124.655
INSERT INTO farms (
    farmer_id, location_barangay, location_sitio,
    latitude, longitude, farm_size_hectares
) 
SELECT id, 'Liberty', 'Purok 3', 6.5050, 124.6550, 1.8
FROM farmers WHERE user_id = 'james-uuid';


-- =====================
-- REPORTS
-- =====================

-- Reports from Shara (San Jose)
INSERT INTO reports (user_id, type, status, details, location, latitude, longitude, created_at) VALUES 
('shara-uuid', 'pest', 'pending', 
 '{"cropType":"Rice", "pestType":"Rice Black Bug", "severity":"High", "affectedArea":"1.5", "damageLevel":"Severe", "description":"Black bug infestation observed in rice field mostly in the lower part."}', 
 'San Jose', 6.5250, 124.6750, DATE_SUB(NOW(), INTERVAL 2 DAY)),

('shara-uuid', 'drought', 'verified', 
 '{"cropType":"Corn", "severity":"Medium", "affectedArea":"2.0", "damageLevel":"Moderate", "description":"Leaves curling due to lack of water for 2 weeks."}', 
 'San Jose', 6.5255, 124.6755, DATE_SUB(NOW(), INTERVAL 10 DAY));

-- Reports from James (Liberty)
INSERT INTO reports (user_id, type, status, details, location, latitude, longitude, created_at) VALUES 
('james-uuid', 'flood', 'resolved', 
 '{"cropType":"Vegetables", "severity":"Critical", "affectedArea":"0.5", "damageLevel":"Total Loss", "description":"River overflow washed away vegetable plots."}', 
 'Liberty', 6.5050, 124.6550, DATE_SUB(NOW(), INTERVAL 15 DAY)),

('james-uuid', 'pest', 'pending', 
 '{"cropType":"Corn", "pestType":"Army Worm", "severity":"Low", "affectedArea":"0.2", "damageLevel":"Minor", "description":"Early signs of army worm on young corn."}', 
 'Liberty', 6.5055, 124.6555, NOW());


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
-- Coordinates adjusted to be within Norala, South Cotabato
INSERT INTO barangays (name, latitude, longitude) VALUES 
('San Jose', 6.5250, 124.6750),
('Liberty', 6.5050, 124.6550),
('Esperanza', 6.5500, 124.6900),
('Poblacion', 6.5180, 124.6660);

-- =====================
-- NEWS & ADVISORIES
-- =====================
INSERT INTO news (title, content, type, priority, created_at, is_active, author_id) VALUES
('Pest Alert: Black Bug Infestation Warning', 'The Municipal Agriculture Office has detected increased black bug activity in several barangays including Poblacion, San Miguel, and Benigno Aquino. Farmers are advised to monitor their rice fields closely and report any signs of infestation immediately.', 'alert', 'high', DATE_SUB(NOW(), INTERVAL 1 DAY), TRUE, 'admin-uuid'),
('Weather Advisory: Dry Season Preparations', 'The Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA) forecasts below-normal rainfall in the coming months. Farmers are encouraged to implement water-saving irrigation techniques and consider drought-resistant crop varieties.', 'advisory', 'medium', DATE_SUB(NOW(), INTERVAL 2 DAY), TRUE, 'admin-uuid'),
('New Seed Distribution Program', 'The Department of Agriculture, in partnership with the local government, will be distributing free certified high-yield rice seeds to all RSBSA-registered farmers. Distribution will be at the Municipal Agriculture Office starting Monday.', 'news', 'low', DATE_SUB(NOW(), INTERVAL 3 DAY), TRUE, 'admin-uuid'),
('Flood Warning: Low-lying Areas', 'PAGASA has issued a flood warning for low-lying areas due to continuous rainfall. Farmers are advised to harvest mature crops if possible and move equipment to higher ground. The CropAid system is ready to receive flood damage reports.', 'alert', 'high', DATE_SUB(NOW(), INTERVAL 4 DAY), TRUE, 'admin-uuid'),
('Free Pest Control Training', 'The Municipal Agriculture Office is conducting a free Integrated Pest Management (IPM) training for farmers. Topics include biological pest control, proper pesticide application, and early detection methods. Register at the MAO office.', 'news', 'low', DATE_SUB(NOW(), INTERVAL 5 DAY), TRUE, 'admin-uuid'),
('Fertilizer Subsidy Application Open', 'The Fertilizer Subsidy Program is now accepting applications. Eligible farmers can receive up to 50% discount on fertilizers. Bring your RSBSA card and valid ID to the Municipal Agriculture Office to apply.', 'news', 'medium', DATE_SUB(NOW(), INTERVAL 6 DAY), TRUE, 'admin-uuid');


-- =====================
-- NOTIFICATIONS
-- =====================
INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES 
('shara-uuid', 'status_change', 'Report Verified', 'Your drought report has been verified by the admin.', FALSE, DATE_SUB(NOW(), INTERVAL 9 DAY)),
('james-uuid', 'status_change', 'Report Resolved', 'Your flood report has been resolved and action has been taken.', TRUE, DATE_SUB(NOW(), INTERVAL 14 DAY));

