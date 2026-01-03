DELETE FROM reports;
DELETE FROM farms;
DELETE FROM farmers;
DELETE FROM users;
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('admin-uuid', 'admin', 'admin@cropaid.gov.ph', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'admin');
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('juan-uuid', 'juan', 'juan@gmail.com', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'farmer');
INSERT INTO farmers (id, user_id, rsbsa_id, first_name, last_name, address_barangay, address_province, cellphone) VALUES 
('farmer-juan', 'juan-uuid', '012-345-6789', 'Juan', 'dela Cruz', 'San Jose', 'South Cotabato', '09171234567');
INSERT INTO users (id, username, email, password_hash, role) VALUES 
('maria-uuid', 'maria', 'maria@gmail.com', '$2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG', 'farmer');
INSERT INTO farmers (id, user_id, rsbsa_id, first_name, last_name, address_barangay, address_province, cellphone) VALUES 
('farmer-maria', 'maria-uuid', '012-987-6543', 'Maria', 'Santos', 'Liberty', 'South Cotabato', '09181234567');
INSERT INTO farms (id, farmer_id, location_barangay, location_province, location_municipality) VALUES 
('farm-juan', 'farmer-juan', 'San Jose', 'South Cotabato', 'Norala');
INSERT INTO farms (id, farmer_id, location_barangay, location_province, location_municipality) VALUES 
('farm-maria', 'farmer-maria', 'Liberty', 'South Cotabato', 'Norala');
INSERT INTO reports (id, user_id, type, status, details, location, created_at) VALUES 
('report-1', 'juan-uuid', 'pest', 'pending', '{\"crop\":\"Rice\", \"pestType\":\"Black Bug\", \"severity\":\"High\", \"description\":\"Black bug infestation observed in 2 hectares.\"}', 'San Jose', DATE_SUB(NOW(), INTERVAL 2 DAY)),
('report-2', 'juan-uuid', 'flood', 'verified', '{\"crop\":\"Corn\", \"severity\":\"Critical\", \"description\":\"River overflow caused flooding.\"}', 'San Jose', DATE_SUB(NOW(), INTERVAL 5 DAY)),
('report-3', 'maria-uuid', 'drought', 'resolved', '{\"crop\":\"Rice\", \"severity\":\"Medium\", \"description\":\"Lack of water supply affecting rice growth.\"}', 'Liberty', DATE_SUB(NOW(), INTERVAL 10 DAY));
