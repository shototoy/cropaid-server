CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL, 
    email VARCHAR(255) UNIQUE, 
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('farmer', 'admin') DEFAULT 'farmer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS farmers (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    rsbsa_id VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    middle_name VARCHAR(255),
    last_name VARCHAR(255) NOT NULL,
    tribe VARCHAR(255),
    address_sitio VARCHAR(255),
    address_barangay VARCHAR(255),
    address_municipality VARCHAR(255),
    address_province VARCHAR(255),
    cellphone VARCHAR(20),
    sex ENUM('Male', 'Female'),
    date_of_birth DATE,
    civil_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS farms (
    id CHAR(36) PRIMARY KEY,
    farmer_id CHAR(36) NOT NULL,
    location_sitio VARCHAR(255),
    location_barangay VARCHAR(255),
    location_municipality VARCHAR(255),
    location_province VARCHAR(255),
    boundary_north VARCHAR(255),
    boundary_south VARCHAR(255),
    boundary_east VARCHAR(255),
    boundary_west VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reports (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    type ENUM('pest', 'flood', 'drought') NOT NULL,
    status ENUM('pending', 'verified', 'resolved', 'rejected') DEFAULT 'pending',
    details JSON,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
