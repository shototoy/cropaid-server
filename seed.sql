-- =====================
-- USERS
-- =====================

-- Admin (password: cropaid123)
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('admin-uuid', 'admin', 'admin@cropaid.gov.ph', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'admin');

-- =====================
-- SYSTEM SETTINGS
-- =====================
--INSERT INTO system_settings (setting_key, setting_value, description) VALUES
--('sms_alerts_enabled', 'true', 'Enable SMS notifications for critical alerts'),
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
