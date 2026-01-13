import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './db.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the script's directory
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '';

// Initialize cache (TTL: 1 hour for static data)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// CORS configuration for separate frontend/backend hosting
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const corsOptions = {
    origin: [
        FRONTEND_URL,
        'http://localhost:5173',
        'http://localhost:3000',
        'capacitor://localhost',
        'https://localhost',
        'ionic://localhost',
        'http://localhost',
        'https://shototoy.github.io/CropAid/',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://localhost:5176'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(compression()); // Compress all responses
app.use(cors(corsOptions));
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from frontend dist folder (optional - for combined hosting)
const distPath = join(__dirname, '../dist');
app.use(express.static(distPath));

// ============ VALIDATION SCHEMAS ============

// Custom validators
const philippinePhoneRegex = /^(09|\+639)\d{9}$/;
const philippineCoordinates = z.object({
    latitude: z.number().min(4.5).max(21.5), // Philippines latitude bounds
    longitude: z.number().min(116).max(127)  // Philippines longitude bounds
});

const RegisterSchema = z.object({
    email: z.string().email('Invalid email format'),
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    rsbsaId: z.string().min(5, 'RSBSA ID must be at least 5 characters'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    middleName: z.string().optional(),
    tribe: z.string().optional(),
    streetSitio: z.string().optional(),
    barangay: z.string().optional(),
    municipality: z.string().optional(),
    province: z.string().optional(),
    cellphone: z.string()
        .regex(philippinePhoneRegex, 'Invalid Philippine phone number format (e.g., 09171234567)')
        .optional()
        .or(z.literal('')),
    sex: z.enum(['Male', 'Female']).optional(),
    dobMonth: z.string().optional(),
    dobDay: z.string().optional(),
    dobYear: z.string().optional(),
    civilStatus: z.string().optional(),
    farmSitio: z.string().optional(),
    farmBarangay: z.string().optional(),
    farmMunicipality: z.string().optional(),
    farmProvince: z.string().optional(),
    farmLatitude: z.number()
        .min(4.5, 'Latitude must be within Philippines')
        .max(21.5, 'Latitude must be within Philippines')
        .nullable()
        .optional(),
    farmLongitude: z.number()
        .min(116, 'Longitude must be within Philippines')
        .max(127, 'Longitude must be within Philippines')
        .nullable()
        .optional(),
    farmSize: z.string().optional(),

    // New Farm Fields
    plantingMethod: z.string().optional(),
    currentCrop: z.string().optional(),
    dateOfSowing: z.string().optional(),
    dateOfTransplanting: z.string().optional(),
    dateOfHarvest: z.string().optional(),
    landCategory: z.string().optional(),
    topography: z.string().optional(),
    soilType: z.string().optional(),
    irrigationSource: z.string().optional(),
    tenuralStatus: z.string().optional(),
    boundaryNorth: z.string().optional(),
    boundarySouth: z.string().optional(),
    boundaryEast: z.string().optional(),
    boundaryWest: z.string().optional(),
    coverType: z.string().optional(),
    amountCover: z.string().optional(),
    insurancePremium: z.string().optional(),
    cltipSumInsured: z.string().optional(),
    cltipPremium: z.string().optional()
});

const LoginSchema = z.object({
    identifier: z.string(),
    password: z.string()
});

const ReportSchema = z.object({
    type: z.enum(['pest', 'flood', 'drought', 'mix']),
    details: z.object({
        description: z.string().optional(),
        damageLevel: z.string().optional(),
        cropType: z.string().optional(),
        pestType: z.string().optional(),
        severity: z.string().optional(),
        affectedArea: z.string().optional()
    }).passthrough().optional(),
    location: z.string().optional(),
    latitude: z.number()
        .min(4.5, 'Latitude must be within Philippines')
        .max(21.5, 'Latitude must be within Philippines')
        .nullable()
        .optional(),
    longitude: z.number()
        .min(116, 'Longitude must be within Philippines')
        .max(127, 'Longitude must be within Philippines')
        .nullable()
        .optional(),
    photoBase64: z.string().nullable().optional(),
    farmId: z.number().optional()
});

// ============ MIDDLEWARE ============

// Activity logging helper
const logActivity = async (userId, actionType, description, metadata = null, req = null) => {
    try {
        const ipAddress = req?.ip || req?.connection?.remoteAddress || null;
        const userAgent = req?.headers?.['user-agent'] || null;

        await pool.execute(
            `INSERT INTO activity_logs (user_id, action_type, description, metadata, ip_address, user_agent) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, actionType, description, metadata ? JSON.stringify(metadata) : null, ipAddress, userAgent]
        );
    } catch (err) {
        console.error('Activity logging error:', err);
    }
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.sendStatus(403);
    }
};

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'CropAid API is running', timestamp: new Date().toISOString() });
});

// ============ AUTHENTICATION ============

app.post('/api/auth/register', async (req, res) => {
    let connection;
    try {
        const data = RegisterSchema.parse(req.body);
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const userId = randomUUID();

        let dob = null;
        if (data.dobYear && data.dobMonth && data.dobDay) {
            dob = `${data.dobYear}-${data.dobMonth.padStart(2, '0')}-${data.dobDay.padStart(2, '0')}`;
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.execute(
            `INSERT INTO users (id, email, username, password_hash, role) 
             VALUES (?, ?, ?, ?, 'farmer')`,
            [userId, data.email, data.username, hashedPassword]
        );

        const [farmerResult] = await connection.execute(
            `INSERT INTO farmers (
                user_id, rsbsa_id, first_name, middle_name, last_name, 
                tribe, address_sitio, address_barangay, address_municipality, address_province, 
                cellphone, sex, date_of_birth, civil_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, data.rsbsaId, data.firstName, data.middleName || null, data.lastName,
                data.tribe || null, data.streetSitio || null, data.barangay || null,
                data.municipality || 'Norala', data.province || 'South Cotabato',
                data.cellphone || null, data.sex || null, dob, data.civilStatus || null
            ]
        );

        const farmerId = farmerResult.insertId;

        await connection.execute(
            `INSERT INTO farms (
                farmer_id, location_sitio, location_barangay, location_municipality, location_province,
                latitude, longitude, farm_size_hectares,
                planting_method, current_crop, date_of_sowing, date_of_transplanting, date_of_harvest,
                land_category, topography, soil_type, irrigation_source, tenural_status,
                boundary_north, boundary_south, boundary_east, boundary_west,
                cover_type, amount_cover, insurance_premium, cltip_sum_insured, cltip_premium
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                farmerId, data.farmSitio || null, data.farmBarangay || null,
                data.farmMunicipality || 'Norala', data.farmProvince || 'South Cotabato',
                data.farmLatitude || null, data.farmLongitude || null,
                data.farmSize ? parseFloat(data.farmSize) : null,
                data.plantingMethod || null, data.currentCrop || null, data.dateOfSowing || null, data.dateOfTransplanting || null, data.dateOfHarvest || null,
                data.landCategory || null, data.topography || null, data.soilType || null, data.irrigationSource || null, data.tenuralStatus || null,
                data.boundaryNorth || null, data.boundarySouth || null, data.boundaryEast || null, data.boundaryWest || null,
                data.coverType || null, data.amountCover ? parseFloat(data.amountCover) : null, data.insurancePremium ? parseFloat(data.insurancePremium) : null,
                data.cltipSumInsured ? parseFloat(data.cltipSumInsured) : null, data.cltipPremium ? parseFloat(data.cltipPremium) : null
            ]
        );

        await connection.commit();
        res.status(201).json({ message: 'Registration successful', userId });
    } catch (err) {
        if (connection) await connection.rollback();
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors });
        }
        if (err.code === 'ER_DUP_ENTRY') {
            if (err.message.includes('email')) return res.status(409).json({ error: 'Email already exists' });
            if (err.message.includes('username')) return res.status(409).json({ error: 'Username already exists' });
            if (err.message.includes('rsbsa_id')) return res.status(409).json({ error: 'RSBSA ID already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password } = LoginSchema.parse(req.body);
        const [rows] = await pool.execute(`
            SELECT u.*, f.rsbsa_id, f.first_name, f.last_name 
            FROM users u 
            LEFT JOIN farmers f ON u.id = f.user_id 
            WHERE (u.username = ? OR u.email = ? OR f.rsbsa_id = ?) AND u.is_active = TRUE
        `, [identifier, identifier, identifier]);

        const user = rows[0];
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Log login activity
        await logActivity(user.id, 'login', `User logged in successfully`, { role: user.role }, req);

        res.json({
            token,
            role: user.role,
            user: {
                id: user.id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
                rsbsa: user.rsbsa_id,
                email: user.email,
                username: user.username
            }
        });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'Invalid input' });
    }
});

// ============ WEATHER API ============

app.get('/api/weather', async (req, res) => {
    try {
        const { lat = 6.2341, lon = 124.8741 } = req.query;

        if (WEATHER_API_KEY) {
            const response = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
            );
            const data = await response.json();
            return res.json({
                temperature: Math.round(data.main.temp),
                condition: data.weather[0].main,
                description: data.weather[0].description,
                humidity: data.main.humidity,
                windSpeed: data.wind.speed,
                location: data.name,
                icon: data.weather[0].icon,
                timestamp: new Date().toISOString()
            });
        }

        const hour = new Date().getHours();
        const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Thunderstorm'];
        const temps = [28, 30, 32, 34, 31, 29];

        res.json({
            temperature: temps[hour % temps.length] + Math.floor(Math.random() * 3),
            condition: conditions[hour % conditions.length],
            description: 'Weather data for Norala, South Cotabato',
            humidity: 65 + Math.floor(Math.random() * 20),
            windSpeed: 5 + Math.floor(Math.random() * 10),
            location: 'Norala, South Cotabato',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Weather API error:', err);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
});


// ============ FARMER ENDPOINTS ============

app.get('/api/farmer/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [profileRows] = await pool.execute(
            `SELECT 
                f.first_name, f.last_name, f.rsbsa_id, f.cellphone,
                f.address_barangay, f.address_municipality,
                fm.location_barangay as farm_barangay, fm.farm_size_hectares
            FROM farmers f
            LEFT JOIN farms fm ON f.id = fm.farmer_id
            WHERE f.user_id = ?`,
            [userId]
        );

        const profile = profileRows[0] || {};
        const barangay = profile.farm_barangay || profile.address_barangay || 'Norala';

        const [statsRows] = await pool.execute(
            `SELECT 
                COUNT(*) as total_reports,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
            FROM reports WHERE user_id = ?`,
            [userId]
        );

        const [activityRows] = await pool.execute(
            `SELECT id, type, status, location, created_at, updated_at 
             FROM reports WHERE user_id = ? 
             ORDER BY created_at DESC LIMIT 5`,
            [userId]
        );

        res.json({
            profile: {
                name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
                rsbsa: profile.rsbsa_id,
                barangay: barangay,
                municipality: profile.address_municipality || 'Norala',
                cellphone: profile.cellphone,
                farmSize: profile.farm_size_hectares
            },
            stats: {
                total_reports: statsRows[0]?.total_reports || 0,
                pending: statsRows[0]?.pending || 0,
                verified: statsRows[0]?.verified || 0,
                resolved: statsRows[0]?.resolved || 0
            },
            recent_activity: activityRows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// Get farmer profile
app.get('/api/farmer/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            `SELECT 
                f.first_name, f.last_name, f.rsbsa_id, f.cellphone, f.profile_picture,
                f.address_barangay, f.address_municipality, f.address_province,
                u.email,
                fm.location_barangay as farm_barangay, fm.farm_size_hectares,
                fm.latitude as farm_latitude, fm.longitude as farm_longitude
            FROM farmers f
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN farms fm ON f.id = fm.farmer_id
            WHERE f.user_id = ?`,
            [userId]
        );

        if (!rows[0]) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Get specific farm location for map
// Get ALL farmer's farms
app.get('/api/farmer/farms', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            `SELECT 
                fm.id,
                fm.latitude as lat, 
                fm.longitude as lng, 
                fm.location_barangay as barangay,
                fm.location_sitio, 
                fm.farm_size_hectares as size,
                fm.planting_method, fm.date_of_sowing, fm.date_of_transplanting, fm.date_of_harvest,
                fm.land_category, fm.soil_type, fm.topography, fm.irrigation_source, fm.tenural_status,
                fm.boundary_north, fm.boundary_south, fm.boundary_east, fm.boundary_west,
                fm.current_crop, fm.cover_type, fm.amount_cover, fm.insurance_premium,
                fm.cltip_sum_insured, fm.cltip_premium
             FROM farmers f
             JOIN farms fm ON f.id = fm.farmer_id
             WHERE f.user_id = ?`,
            [userId]
        );

        res.json(rows.map(r => ({
            id: r.id,
            lat: r.lat ? parseFloat(r.lat) : null,
            lng: r.lng ? parseFloat(r.lng) : null,
            location_barangay: r.barangay, // alias for UI consistency
            location_sitio: r.location_sitio,
            farm_size_hectares: r.size,
            ...r // spread other fields
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch farms' });
    }
});

// Get Options (Crops, Pests)
app.get('/api/options', async (req, res) => {
    try {
        const [crops] = await pool.execute('SELECT name FROM crop_types WHERE is_active = TRUE ORDER BY name');
        const [pests] = await pool.execute('SELECT name, severity_level FROM pest_categories WHERE is_active = TRUE ORDER BY name');

        res.json({
            crops: crops.map(c => c.name),
            pests: pests.map(p => ({ name: p.name, severity: p.severity_level }))
        });
    } catch (err) {
        console.error('Error fetching options:', err);
        // Fallback or empty if table missing
        res.json({
            crops: ['Rice', 'Corn', 'Vegetables', 'Fruits', 'Others'],
            pests: []
        });
    }
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Add a new farm
app.post('/api/farmer/farm', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            lat, lng, location_barangay, location_sitio, farm_size_hectares,
            planting_method, date_of_sowing, date_of_transplanting, date_of_harvest,
            land_category, soil_type, topography, irrigation_source, tenural_status,
            boundary_north, boundary_south, boundary_east, boundary_west,
            current_crop, cover_type, amount_cover, insurance_premium,
            cltip_sum_insured, cltip_premium
        } = req.body;

        // Get farmer ID
        const [farmers] = await pool.execute('SELECT id FROM farmers WHERE user_id = ?', [userId]);
        if (!farmers[0]) return res.status(404).json({ error: 'Farmer profile not found' });
        const farmerId = farmers[0].id;

        const [result] = await pool.execute(
            `INSERT INTO farms (
                farmer_id, latitude, longitude, location_barangay, location_sitio, farm_size_hectares,
                planting_method, date_of_sowing, date_of_transplanting, date_of_harvest,
                land_category, soil_type, topography, irrigation_source, tenural_status,
                boundary_north, boundary_south, boundary_east, boundary_west,
                current_crop, cover_type, amount_cover, insurance_premium,
                cltip_sum_insured, cltip_premium
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                farmerId, lat, lng, location_barangay, location_sitio, farm_size_hectares,
                planting_method || null, date_of_sowing || null, date_of_transplanting || null, date_of_harvest || null,
                land_category || null, soil_type || null, topography || null, irrigation_source || null, tenural_status || null,
                boundary_north || null, boundary_south || null, boundary_east || null, boundary_west || null,
                current_crop || null, cover_type || null, amount_cover || null, insurance_premium || null,
                cltip_sum_insured || null, cltip_premium || null
            ]
        );

        res.status(201).json({
            id: result.insertId,
            lat, lng, barangay, size,
            message: 'Farm added successfully'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add farm' });
    }
});

// Update a specific farm
app.put('/api/farmer/farm/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const farmId = req.params.id;
        const {
            lat, lng, location_barangay, location_sitio, farm_size_hectares,
            planting_method, date_of_sowing, date_of_transplanting, date_of_harvest,
            land_category, soil_type, topography, irrigation_source, tenural_status,
            boundary_north, boundary_south, boundary_east, boundary_west,
            current_crop, cover_type, amount_cover, insurance_premium,
            cltip_sum_insured, cltip_premium
        } = req.body;

        // Verify ownership
        const [rows] = await pool.execute(
            `SELECT fm.id FROM farms fm 
             JOIN farmers f ON fm.farmer_id = f.id 
             WHERE fm.id = ? AND f.user_id = ?`,
            [farmId, userId]
        );
        if (rows.length === 0) return res.status(403).json({ error: 'Not authorized to edit this farm' });

        // Dynamic Update Logic
        const updates = [];
        const values = [];
        const allowedFields = [
            'latitude', 'longitude', 'location_barangay', 'location_sitio', 'farm_size_hectares',
            'planting_method', 'date_of_sowing', 'date_of_transplanting', 'date_of_harvest',
            'land_category', 'soil_type', 'topography', 'irrigation_source', 'tenural_status',
            'boundary_north', 'boundary_south', 'boundary_east', 'boundary_west',
            'current_crop', 'cover_type', 'amount_cover', 'insurance_premium',
            'cltip_sum_insured', 'cltip_premium'
        ];

        // Map req.body keys to DB columns (req.body uses same names mostly, except lat/lng alias)
        const fieldMap = {
            lat: 'latitude',
            lng: 'longitude',
            barangay: 'location_barangay',
            size: 'farm_size_hectares',
            ...allowedFields.reduce((acc, outputKey) => ({ ...acc, [outputKey]: outputKey }), {})
        };

        Object.keys(req.body).forEach(key => {
            const dbColumn = fieldMap[key];
            if (dbColumn && allowedFields.includes(dbColumn)) {
                updates.push(`${dbColumn} = ?`);
                values.push(req.body[key]);
            }
        });

        if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

        values.push(farmId);

        await pool.execute(
            `UPDATE farms SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        res.json({ message: 'Farm updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update farm' });
    }
});

// Delete a farm
app.delete('/api/farmer/farm/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const farmId = req.params.id;

        // Verify ownership
        const [rows] = await pool.execute(
            `SELECT fm.id FROM farms fm 
             JOIN farmers f ON fm.farmer_id = f.id 
             WHERE fm.id = ? AND f.user_id = ?`,
            [farmId, userId]
        );
        if (rows.length === 0) return res.status(403).json({ error: 'Not authorized to delete this farm' });

        await pool.execute('DELETE FROM farms WHERE id = ?', [farmId]);
        res.json({ message: 'Farm deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete farm' });
    }
});

// Update farmer profile
app.patch('/api/farmer/profile', authenticateToken, async (req, res) => {
    let connection;
    try {
        const userId = req.user.id;
        const { cellphone, address_barangay, farm_latitude, farm_longitude, profile_picture, farm_sitio, farm_barangay, farm_size_hectares } = req.body;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Get farmer id
        const [farmerRows] = await connection.execute(
            'SELECT id FROM farmers WHERE user_id = ?',
            [userId]
        );

        if (!farmerRows[0]) {
            await connection.rollback();
            return res.status(404).json({ error: 'Farmer not found' });
        }

        const farmerId = farmerRows[0].id;

        // Update farmer table
        const farmerUpdates = [];
        const farmerParams = [];

        if (cellphone !== undefined) {
            farmerUpdates.push('cellphone = ?');
            farmerParams.push(cellphone);
        }
        if (address_barangay !== undefined) {
            farmerUpdates.push('address_barangay = ?');
            farmerParams.push(address_barangay);
        }
        if (profile_picture !== undefined) {
            farmerUpdates.push('profile_picture = ?');
            farmerParams.push(profile_picture);
        }

        if (farmerUpdates.length > 0) {
            farmerParams.push(farmerId);
            await connection.execute(
                `UPDATE farmers SET ${farmerUpdates.join(', ')} WHERE id = ?`,
                farmerParams
            );
        }

        // Update farm table (location)
        if (farm_latitude !== undefined || farm_longitude !== undefined || farm_sitio !== undefined || farm_barangay !== undefined || farm_size_hectares !== undefined) {
            const farmUpdates = [];
            const farmParams = [];

            if (farm_latitude !== undefined) {
                farmUpdates.push('latitude = ?');
                farmParams.push(farm_latitude);
            }
            if (farm_longitude !== undefined) {
                farmUpdates.push('longitude = ?');
                farmParams.push(farm_longitude);
            }
            if (farm_sitio !== undefined) {
                farmUpdates.push('location_sitio = ?');
                farmParams.push(farm_sitio);
            }
            if (farm_barangay !== undefined) {
                farmUpdates.push('location_barangay = ?');
                farmParams.push(farm_barangay);
            }
            if (farm_size_hectares !== undefined) {
                farmUpdates.push('farm_size_hectares = ?');
                farmParams.push(farm_size_hectares);
            }

            if (farmUpdates.length > 0) {
                farmParams.push(farmerId);
                await connection.execute(
                    `UPDATE farms SET ${farmUpdates.join(', ')} WHERE farmer_id = ?`,
                    farmParams
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.status(500).json({ error: 'Failed to update profile' });
    } finally {
        if (connection) connection.release();
    }
});

// ============ NOTIFICATIONS API ============

// Get Notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 20;

        const [rows] = await pool.execute(
            `SELECT * FROM notifications 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [userId, limit]
        );
        res.json({ notifications: rows });
    } catch (err) {
        console.error('Fetch notifications error:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get Unread Count
app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        res.json({ count: rows[0].count });
    } catch (err) {
        console.error('Count notifications error:', err);
        res.status(500).json({ error: 'Failed to count notifications' });
    }
});

// Mark single as read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const notifId = req.params.id;

        await pool.execute(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [notifId, userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Mark all as read
app.put('/api/notifications/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await pool.execute(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
            [userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Mark all read error:', err);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// Get public reports for community map
app.get('/api/public/reports', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch all verified reports OR my reports (even if pending)
        const [rows] = await pool.execute(
            `SELECT 
                r.id, r.type, r.status, r.location, r.latitude, r.longitude, 
                r.details, r.created_at, r.user_id,
                f.first_name, f.last_name
             FROM reports r
             JOIN farmers f ON r.user_id = f.user_id
             WHERE 
                (r.status = 'verified' OR r.status = 'resolved') 
                OR r.user_id = ?
             ORDER BY r.created_at DESC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all farm locations for community map
app.get('/api/public/farms', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT 
                fm.id, fm.latitude, fm.longitude, fm.location_barangay,
                f.first_name, f.last_name
             FROM farms fm
             JOIN farmers f ON fm.farmer_id = f.id
             WHERE fm.latitude IS NOT NULL AND fm.longitude IS NOT NULL`
        );

        res.json(rows.map(row => ({
            id: row.id,
            lat: parseFloat(row.latitude),
            lng: parseFloat(row.longitude),
            barangay: row.location_barangay,
            owner: `${row.first_name} ${row.last_name}`
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/farmer/farms
app.get('/api/farmer/farms', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            `SELECT fm.*, f.address_municipality
             FROM farms fm
             JOIN farmers f ON fm.farmer_id = f.id
             WHERE f.user_id = ?
             ORDER BY fm.created_at DESC`,
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch farms' });
    }
});

const FarmSchema = z.object({
    farmSitio: z.string().optional(),
    farmBarangay: z.string().optional(),
    farmMunicipality: z.string().optional(),
    farmProvince: z.string().optional(),
    farmLatitude: z.number().optional(),
    farmLongitude: z.number().optional(),
    farmSize: z.string().optional(),
    plantingMethod: z.string().optional(),
    currentCrop: z.string().optional(),
    dateOfSowing: z.string().optional(),
    dateOfTransplanting: z.string().optional(),
    dateOfHarvest: z.string().optional(),
    landCategory: z.string().optional(),
    topography: z.string().optional(),
    soilType: z.string().optional(),
    irrigationSource: z.string().optional(),
    tenuralStatus: z.string().optional(),
    boundaryNorth: z.string().optional(),
    boundarySouth: z.string().optional(),
    boundaryEast: z.string().optional(),
    boundaryWest: z.string().optional(),
    coverType: z.string().optional(),
    amountCover: z.string().optional(),
    insurancePremium: z.string().optional(),
    cltipSumInsured: z.string().optional(),
    cltipPremium: z.string().optional()
});

// POST /api/farmer/farms (Add new farm)
app.post('/api/farmer/farms', authenticateToken, async (req, res) => {
    try {
        const data = FarmSchema.parse(req.body);
        const userId = req.user.id;

        const [farmerRows] = await pool.execute(
            'SELECT id FROM farmers WHERE user_id = ?',
            [userId]
        );

        if (!farmerRows[0]) {
            return res.status(404).json({ error: 'Farmer profile not found' });
        }
        const farmerId = farmerRows[0].id;

        const [result] = await pool.execute(
            `INSERT INTO farms (
                farmer_id, location_sitio, location_barangay, location_municipality, location_province,
                latitude, longitude, farm_size_hectares,
                planting_method, current_crop, date_of_sowing, date_of_transplanting, date_of_harvest,
                land_category, topography, soil_type, irrigation_source, tenural_status,
                boundary_north, boundary_south, boundary_east, boundary_west,
                cover_type, amount_cover, insurance_premium, cltip_sum_insured, cltip_premium
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                farmerId, data.farmSitio || null, data.farmBarangay || null,
                data.farmMunicipality || 'Norala', data.farmProvince || 'South Cotabato',
                data.farmLatitude || null, data.farmLongitude || null,
                data.farmSize ? parseFloat(data.farmSize) : null,
                data.plantingMethod || null, data.currentCrop || null, data.dateOfSowing || null, data.dateOfTransplanting || null, data.dateOfHarvest || null,
                data.landCategory || null, data.topography || null, data.soilType || null, data.irrigationSource || null, data.tenuralStatus || null,
                data.boundaryNorth || null, data.boundarySouth || null, data.boundaryEast || null, data.boundaryWest || null,
                data.coverType || null, data.amountCover ? parseFloat(data.amountCover) : null, data.insurancePremium ? parseFloat(data.insurancePremium) : null,
                data.cltipSumInsured ? parseFloat(data.cltipSumInsured) : null, data.cltipPremium ? parseFloat(data.cltipPremium) : null
            ]
        );

        res.status(201).json({ message: 'Farm added successfully', farmId: result.insertId });
    } catch (err) {
        console.error(err);
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors });
        }
        res.status(500).json({ error: 'Failed to add farm' });
    }
});

app.post('/api/reports', authenticateToken, async (req, res) => {
    try {
        const data = ReportSchema.parse(req.body);

        // Validate photo size (max 10MB)
        if (data.photoBase64) {
            const photoSizeInBytes = Buffer.from(data.photoBase64.split(',')[1] || data.photoBase64, 'base64').length;
            const photoSizeInMB = photoSizeInBytes / (1024 * 1024);

            if (photoSizeInMB > 10) {
                return res.status(400).json({
                    error: `Photo size (${photoSizeInMB.toFixed(2)}MB) exceeds the 10MB limit. Please compress the image or use a smaller photo.`
                });
            }
        }

        const [result] = await pool.execute(
            `INSERT INTO reports (user_id, farm_id, type, details, location, latitude, longitude, photo_base64)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id,
                data.farmId || null,
                data.type,
                JSON.stringify(data.details || {}),
                data.location || null,
                data.latitude || null,
                data.longitude || null,
                data.photoBase64 || null
            ]
        );

        const reportId = result.insertId;

        try {
            await pool.execute(
                `INSERT INTO notifications (user_id, type, title, message, reference_id)
                 SELECT id, 'new_report', ?, ?, ?
                 FROM users WHERE role = 'admin'`,
                [`New Report from ${req.user.name}`, `${req.user.name} filed a ${data.type} report.`, reportId.toString()]
            );
        } catch (e) { /* notifications table might not exist */ }

        // Log activity
        await logActivity(
            req.user.id,
            'report_submit',
            `Submitted ${data.type} report`,
            { report_id: reportId, type: data.type, location: data.location },
            req
        );

        const [rows] = await pool.execute('SELECT * FROM reports WHERE id = ?', [reportId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: err.errors });
        }
        res.status(500).json({ error: 'Failed to submit report' });
    }
});

app.get('/api/reports/history', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const status = req.query.status;
        const type = req.query.type;

        let query = `SELECT id, type, status, location, latitude, longitude, details, created_at, updated_at 
                     FROM reports WHERE user_id = ?`;
        const params = [req.user.id];

        if (status && status !== 'all') {
            query += ` AND status = ?`;
            params.push(status);
        }
        if (type && type !== 'all') {
            query += ` AND type = ?`;
            params.push(type);
        }

        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [rows] = await pool.query(query, params);

        let countQuery = `SELECT COUNT(*) as total FROM reports WHERE user_id = ?`;
        const countParams = [req.user.id];
        if (status && status !== 'all') {
            countQuery += ` AND status = ?`;
            countParams.push(status);
        }
        if (type && type !== 'all') {
            countQuery += ` AND type = ?`;
            countParams.push(type);
        }
        const [countResult] = await pool.execute(countQuery, countParams);

        res.json({
            reports: rows,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/reports/:id', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT r.*, f.first_name, f.last_name, f.rsbsa_id
             FROM reports r
             JOIN farmers f ON r.user_id = f.user_id
             WHERE r.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ ADMIN ENDPOINTS ============

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [farmerCount] = await pool.execute('SELECT COUNT(*) as count FROM farmers');
        const [reportStats] = await pool.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
            FROM reports
        `);
        const [reportsByType] = await pool.execute(`
            SELECT type, COUNT(*) as count FROM reports GROUP BY type
        `);
        const [reportsByBarangay] = await pool.execute(`
            SELECT location as barangay, COUNT(*) as count 
            FROM reports 
            WHERE location IS NOT NULL 
            GROUP BY location 
            ORDER BY count DESC
        `);
        const [recentReports] = await pool.execute(`
            SELECT r.id, r.type, r.status, r.location, r.created_at,
                   f.first_name, f.last_name
            FROM reports r
            JOIN farmers f ON r.user_id = f.user_id
            ORDER BY r.created_at DESC LIMIT 5
        `);

        res.json({
            totalFarmers: farmerCount[0].count,
            totalReports: reportStats[0].total || 0,
            pendingReports: reportStats[0].pending || 0,
            verifiedReports: reportStats[0].verified || 0,
            resolvedReports: reportStats[0].resolved || 0,
            rejectedReports: reportStats[0].rejected || 0,
            reportsByType: reportsByType,
            reportsByBarangay: reportsByBarangay,
            recentReports: recentReports
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/farmers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const barangay = req.query.barangay;

        let query = `
            SELECT 
                f.id, f.id as farmer_id, u.id as user_id, f.rsbsa_id, f.first_name, f.last_name, f.cellphone,
                f.address_barangay, f.created_at,
                fm.location_barangay, fm.location_sitio, fm.farm_size_hectares,
                u.email, u.username, u.is_active,
                (SELECT COUNT(*) FROM reports WHERE user_id = u.id) as report_count
            FROM farmers f
            JOIN users u ON f.user_id = u.id
            LEFT JOIN farms fm ON f.id = fm.farmer_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (f.first_name LIKE ? OR f.last_name LIKE ? OR f.rsbsa_id LIKE ? OR u.email LIKE ?)`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        if (barangay) {
            query += ` AND (f.address_barangay = ? OR fm.location_barangay = ?)`;
            params.push(barangay, barangay);
        }

        query += ` ORDER BY f.last_name ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [rows] = await pool.query(query, params);

        let countQuery = `SELECT COUNT(*) as total FROM farmers f JOIN users u ON f.user_id = u.id WHERE 1=1`;
        const countParams = [];
        if (search) {
            countQuery += ` AND (f.first_name LIKE ? OR f.last_name LIKE ? OR f.rsbsa_id LIKE ?)`;
            const searchPattern = `%${search}%`;
            countParams.push(searchPattern, searchPattern, searchPattern);
        }
        const [countResult] = await pool.execute(countQuery, countParams);

        res.json({
            farmers: rows,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add new farmer (admin)
app.post('/api/admin/farmers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            firstName, lastName, middleName, email, cellphone,
            rsbsaId, barangay, municipality, province,
            farmBarangay, farmSize,
            username: providedUsername, password: providedPassword
        } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !rsbsaId) {
            return res.status(400).json({ error: 'First name, last name, and RSBSA ID are required' });
        }

        // Check if RSBSA ID already exists
        const [existing] = await pool.execute('SELECT id FROM farmers WHERE rsbsa_id = ?', [rsbsaId]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'RSBSA ID already registered' });
        }

        // Create user account
        const userId = randomUUID();
        // Use provided username or auto-generate (though frontend requires it)
        const username = providedUsername || `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(/\s/g, '');
        const passwordToHash = providedPassword || 'cropaid123';
        const hashedPassword = await bcrypt.hash(passwordToHash, 10);

        await pool.execute(
            `INSERT INTO users (id, email, username, password_hash, role, is_active)
             VALUES (?, ?, ?, ?, 'farmer', TRUE)`,
            [userId, email || `${username}@cropaid.local`, username, hashedPassword]
        );

        // Create farmer profile
        const [farmerResult] = await pool.execute(
            `INSERT INTO farmers (user_id, rsbsa_id, first_name, last_name, middle_name, cellphone, address_barangay, address_municipality, address_province)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, rsbsaId, firstName, lastName, middleName || null, cellphone || null,
                barangay || 'Unspecified', municipality || 'Norala', province || 'South Cotabato']
        );

        const farmerId = farmerResult.insertId;

        // Create farm record if farm info provided
        if (farmBarangay || farmSize) {
            await pool.execute(
                `INSERT INTO farms (farmer_id, location_barangay, farm_size_hectares)
                 VALUES (?, ?, ?)`,
                [farmerId, farmBarangay || barangay || 'Unspecified', parseFloat(farmSize) || 0]
            );
        }

        res.status(201).json({
            message: 'Farmer created successfully',
            farmerId,
            username,
            defaultPassword: 'cropaid123'
        });
    } catch (err) {
        console.error(err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Email or username already exists' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

app.patch('/api/admin/farmers/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isActive } = req.body;
        const id = req.params.id;
        const isUUID = id.includes('-');

        if (isUUID) {
            // ID is user_id
            await pool.execute(
                `UPDATE users SET is_active = ? WHERE id = ?`,
                [isActive, id]
            );
        } else {
            // ID is farmer_id
            await pool.execute(
                `UPDATE users u 
                 JOIN farmers f ON u.id = f.user_id 
                 SET u.is_active = ? 
                 WHERE f.id = ?`,
                [isActive, id]
            );
        }
        res.json({ message: 'Farmer status updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get farmer reports (for admin farmer detail modal)
app.get('/api/admin/farmers/:id/reports', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const isUUID = id.includes('-');

        let userId;
        if (isUUID) {
            userId = id;
        } else {
            const [farmerRows] = await pool.execute('SELECT user_id FROM farmers WHERE id = ?', [id]);
            if (farmerRows.length === 0) {
                return res.status(404).json({ error: 'Farmer not found' });
            }
            userId = farmerRows[0].user_id;
        }

        const [reports] = await pool.execute(
            `SELECT id, type, status, location, created_at 
             FROM reports 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 10`,
            [userId]
        );

        res.json({ reports });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete farmer and their associated data
app.delete('/api/admin/farmers/:id', authenticateToken, requireAdmin, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const id = req.params.id;
        let farmerId, userId;

        // Check if ID is a UUID (user_id) or integer (farmer_id)
        const isUUID = id.includes('-');

        if (isUUID) {
            // ID is user_id (UUID), find farmer by user_id
            const [farmerRows] = await connection.execute(
                'SELECT id, user_id FROM farmers WHERE user_id = ?',
                [id]
            );
            if (farmerRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Farmer not found' });
            }
            farmerId = farmerRows[0].id;
            userId = farmerRows[0].user_id;
        } else {
            // ID is farmer_id (integer)
            const [farmerRows] = await connection.execute(
                'SELECT id, user_id FROM farmers WHERE id = ?',
                [id]
            );
            if (farmerRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Farmer not found' });
            }
            farmerId = farmerRows[0].id;
            userId = farmerRows[0].user_id;
        }

        // Delete related records in order (respecting foreign keys)
        // 1. Delete reports by this user
        await connection.execute('DELETE FROM reports WHERE user_id = ?', [userId]);

        // 2. Delete farms by this farmer
        await connection.execute('DELETE FROM farms WHERE farmer_id = ?', [farmerId]);

        // 3. Delete farmer record
        await connection.execute('DELETE FROM farmers WHERE id = ?', [farmerId]);

        // 4. Delete user account
        await connection.execute('DELETE FROM users WHERE id = ?', [userId]);

        await connection.commit();
        res.json({ message: 'Farmer and all associated data deleted successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Delete farmer error:', err);
        res.status(500).json({ error: 'Failed to delete farmer' });
    } finally {
        connection.release();
    }
});

app.get('/api/admin/reports', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = (page - 1) * limit;
        const status = req.query.status;
        const type = req.query.type;
        const barangay = req.query.barangay;
        const sortBy = req.query.sortBy || 'created_at';
        const sortOrder = req.query.sortOrder || 'DESC';

        let query = `
            SELECT 
                r.id, r.type, r.status, r.location, r.latitude, r.longitude,
                r.details, r.admin_notes, r.created_at, r.updated_at,
                r.photo_base64 IS NOT NULL as has_photo,
                
                -- Farmer Details
                f.first_name as farmer_first_name, f.last_name as farmer_last_name, 
                f.rsbsa_id as farmer_rsbsa_id, f.cellphone as farmer_cellphone,
                f.address_barangay as farmer_address_barangay, f.address_sitio as farmer_address_sitio,

                -- Farm Details (Linked via r.farm_id)
                fm.location_barangay as farm_barangay,
                fm.farm_size_hectares as farm_size,
                fm.planting_method as farm_planting_method,
                fm.current_crop as farm_current_crop,
                fm.date_of_sowing as farm_date_of_sowing,
                fm.date_of_transplanting as farm_date_of_transplanting,
                fm.date_of_harvest as farm_date_of_harvest,
                fm.land_category as farm_land_category,
                fm.topography as farm_topography,
                fm.soil_type as farm_soil_type,
                fm.irrigation_source as farm_irrigation_source,
                fm.tenural_status as farm_tenural_status,
                fm.cover_type as farm_cover_type,
                fm.amount_cover as farm_amount_cover,
                fm.insurance_premium as farm_insurance_premium,
                fm.cltip_sum_insured as farm_cltip_sum_insured,
                fm.cltip_premium as farm_cltip_premium

            FROM reports r
            JOIN farmers f ON r.user_id = f.user_id
            LEFT JOIN farms fm ON r.farm_id = fm.id
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== 'all') {
            query += ` AND r.status = ?`;
            params.push(status);
        }
        if (type && type !== 'all') {
            query += ` AND r.type = ?`;
            params.push(type);
        }
        if (barangay) {
            query += ` AND (r.location = ? OR fm.location_barangay = ?)`;
            params.push(barangay, barangay);
        }

        const validSortColumns = ['created_at', 'type', 'status', 'location'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        query += ` ORDER BY r.${sortColumn} ${order} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [rows] = await pool.query(query, params);

        let countQuery = `SELECT COUNT(*) as total FROM reports r WHERE 1=1`;
        const countParams = [];
        if (status && status !== 'all') {
            countQuery += ` AND r.status = ?`;
            countParams.push(status);
        }
        if (type && type !== 'all') {
            countQuery += ` AND r.type = ?`;
            countParams.push(type);
        }
        const [countResult] = await pool.execute(countQuery, countParams);

        res.json({
            reports: rows,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/reports/map', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const status = req.query.status;
        const type = req.query.type;
        const barangay = req.query.barangay;

        let query = `
            SELECT 
                r.id, r.type, r.status, r.location, r.latitude, r.longitude,
                r.details, r.created_at, f.first_name, f.last_name, f.rsbsa_id
            FROM reports r
            JOIN farmers f ON r.user_id = f.user_id
            WHERE r.latitude IS NOT NULL AND r.longitude IS NOT NULL
        `;
        const params = [];

        if (status && status !== 'all') {
            query += ` AND r.status = ?`;
            params.push(status);
        }
        if (type && type !== 'all') {
            query += ` AND r.type = ?`;
            params.push(type);
        }
        if (barangay) {
            query += ` AND r.location = ?`;
            params.push(barangay);
        }

        query += ` ORDER BY r.created_at DESC`;

        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.patch('/api/admin/reports/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, adminNotes } = req.body;
        if (!['pending', 'verified', 'resolved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        await pool.execute(
            `UPDATE reports SET status = ?, admin_notes = ?, verified_by = ?, verified_at = NOW() 
             WHERE id = ?`,
            [status, adminNotes || null, req.user.id, req.params.id]
        );

        try {
            const [report] = await pool.execute('SELECT user_id, type FROM reports WHERE id = ?', [req.params.id]);
            if (report[0]) {
                await pool.execute(
                    `INSERT INTO notifications (user_id, type, title, message, reference_id)
                     VALUES (?, 'status_change', ?, ?, ?)`,
                    [report[0].user_id, `Report ${status}`, `Your ${report[0].type} report has been ${status}`, req.params.id.toString()]
                );
            }
        } catch (e) { /* notifications table might not exist */ }

        res.json({ message: 'Status updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/reports/:id/photo', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT photo_base64 FROM reports WHERE id = ?', [req.params.id]);
        if (rows.length === 0 || !rows[0].photo_base64) {
            return res.status(404).json({ error: 'Photo not found' });
        }
        res.json({ photo: rows[0].photo_base64 });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ NOTIFICATIONS ============

app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM notifications 
             WHERE user_id = ? OR user_id IS NULL
             ORDER BY created_at DESC LIMIT 50`,
            [req.user.id]
        );
        const [unreadCount] = await pool.execute(
            `SELECT COUNT(*) as count FROM notifications 
             WHERE (user_id = ? OR user_id IS NULL) AND is_read = FALSE`,
            [req.user.id]
        );
        res.json({
            notifications: rows,
            unreadCount: unreadCount[0].count
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    try {
        const since = req.query.since;
        let query = `SELECT COUNT(*) as count FROM notifications
        WHERE(user_id = ? OR(user_id IS NULL AND ? = 'admin')) AND is_read = FALSE`;
        const params = [req.user.id, req.user.role];

        if (since) {
            query += ` AND created_at > ? `;
            params.push(since);
        }

        const [rows] = await pool.execute(query, params);
        res.json({ count: rows[0].count });
    } catch (err) {
        res.json({ count: 0 });
    }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await pool.execute('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await pool.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
    try {
        await pool.execute('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Notification deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/notifications/clear-read', authenticateToken, async (req, res) => {
    try {
        const [result] = await pool.execute('DELETE FROM notifications WHERE user_id = ? AND is_read = TRUE', [req.user.id]);
        res.json({ message: 'Read notifications cleared', count: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ REPORT COMMENTS ============

app.get('/api/reports/:id/comments', authenticateToken, async (req, res) => {
    try {
        const [comments] = await pool.execute(
            `SELECT c.*, u.username, u.role,
                    CASE 
                        WHEN u.role = 'farmer' THEN CONCAT(f.first_name, ' ', f.last_name)
                        ELSE u.username
                    END as author_name
             FROM report_comments c
             JOIN users u ON c.user_id = u.id
             LEFT JOIN farmers f ON u.id = f.user_id
             WHERE c.report_id = ?
             ORDER BY c.created_at ASC`,
            [req.params.id]
        );
        res.json(comments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

app.post('/api/reports/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { comment } = req.body;
        if (!comment || comment.trim().length === 0) {
            return res.status(400).json({ error: 'Comment cannot be empty' });
        }

        const isAdmin = req.user.role === 'admin';

        const [result] = await pool.execute(
            `INSERT INTO report_comments (report_id, user_id, comment, is_admin) VALUES (?, ?, ?, ?)`,
            [req.params.id, req.user.id, comment.trim(), isAdmin]
        );

        // Get report details for notification
        const [reportRows] = await pool.execute('SELECT user_id, type FROM reports WHERE id = ?', [req.params.id]);

        if (reportRows.length > 0) {
            const report = reportRows[0];
            // Notify the other party (if admin comments, notify farmer; if farmer comments, notify admin)
            const notifyUserId = isAdmin ? report.user_id : null; // null means all admins

            if (notifyUserId || !isAdmin) {
                const title = isAdmin ? 'Admin commented on your report' : 'New farmer comment on report';
                const message = isAdmin
                    ? `Admin has added a comment to your ${report.type} report.`
                    : `Farmer has responded to the ${report.type} report.`;

                if (isAdmin) {
                    // Notify farmer
                    await pool.execute(
                        `INSERT INTO notifications (user_id, type, title, message, reference_id) VALUES (?, 'status_change', ?, ?, ?)`,
                        [notifyUserId, title, message, req.params.id]
                    );
                } else {
                    // Notify all admins
                    await pool.execute(
                        `INSERT INTO notifications (user_id, type, title, message, reference_id)
                         SELECT id, 'new_report', ?, ?, ? FROM users WHERE role = 'admin'`,
                        [title, message, req.params.id]
                    );
                }
            }
        }

        // Log activity
        await logActivity(
            req.user.id,
            'other',
            `Added comment to report #${req.params.id}`,
            { report_id: req.params.id, comment_length: comment.length },
            req
        );

        res.status(201).json({ id: result.insertId, message: 'Comment added successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// ============ ACTIVITY LOGS ============

app.get('/api/activity-logs', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const actionType = req.query.action_type;

        // Admins can see all logs, farmers only see their own
        const isAdmin = req.user.role === 'admin';
        let query = `
            SELECT a.*, u.username, u.role,
                   CASE 
                       WHEN u.role = 'farmer' THEN CONCAT(f.first_name, ' ', f.last_name)
                       ELSE u.username
                   END as user_name
            FROM activity_logs a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN farmers f ON u.id = f.user_id
            WHERE 1=1
        `;
        const params = [];

        if (!isAdmin) {
            query += ` AND a.user_id = ?`;
            params.push(req.user.id);
        }

        if (actionType && actionType !== 'all') {
            query += ` AND a.action_type = ?`;
            params.push(actionType);
        }

        query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [rows] = await pool.execute(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM activity_logs WHERE 1=1`;
        const countParams = [];
        if (!isAdmin) {
            countQuery += ` AND user_id = ?`;
            countParams.push(req.user.id);
        }
        if (actionType && actionType !== 'all') {
            countQuery += ` AND action_type = ?`;
            countParams.push(actionType);
        }
        const [countResult] = await pool.execute(countQuery, countParams);

        res.json({
            logs: rows,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

// ============ ADMIN SETTINGS ============

app.get('/api/admin/pest-categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM pest_categories ORDER BY name');
        res.json(rows);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/admin/pest-categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, description, severityLevel, affectedCrops } = req.body;
        const [result] = await pool.execute(
            `INSERT INTO pest_categories(name, description, severity_level, affected_crops) VALUES(?, ?, ?, ?)`,
            [name, description, severityLevel || 'medium', affectedCrops]
        );
        res.status(201).json({ id: result.insertId, message: 'Pest category created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/pest-categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, description, severityLevel, affectedCrops, isActive } = req.body;
        await pool.execute(
            `UPDATE pest_categories SET name = ?, description = ?, severity_level = ?, affected_crops = ?, is_active = ? WHERE id = ? `,
            [name, description, severityLevel, affectedCrops, isActive, req.params.id]
        );
        res.json({ message: 'Pest category updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/pest-categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM pest_categories WHERE id = ?', [req.params.id]);
        res.json({ message: 'Pest category deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/crop-types', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM crop_types ORDER BY name');
        res.json(rows);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/admin/crop-types', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, variety, description, season } = req.body;
        const [result] = await pool.execute(`INSERT INTO crop_types(name, variety, description, season) VALUES(?, ?, ?, ?)`, [name, variety, description, season]);
        res.status(201).json({ id: result.insertId, message: 'Crop type created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/crop-types/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, variety, description, season, isActive } = req.body;
        await pool.execute(`UPDATE crop_types SET name = ?, variety = ?, description = ?, season = ?, is_active = ? WHERE id = ? `, [name, variety, description, season, isActive, req.params.id]);
        res.json({ message: 'Crop type updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/crop-types/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM crop_types WHERE id = ?', [req.params.id]);
        res.json({ message: 'Crop type deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/barangays', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM barangays ORDER BY name');
        res.json(rows);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/admin/barangays', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, municipality, province, latitude, longitude } = req.body;
        const [result] = await pool.execute(
            `INSERT INTO barangays(name, municipality, province, latitude, longitude) VALUES(?, ?, ?, ?, ?)`,
            [name, municipality || 'Norala', province || 'South Cotabato', latitude, longitude]
        );
        res.status(201).json({ id: result.insertId, message: 'Barangay created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM system_settings');
        const settings = {};
        rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
        res.json(settings);
    } catch (err) {
        res.json({});
    }
});

app.put('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            await pool.execute(
                `INSERT INTO system_settings(setting_key, setting_value) VALUES(?, ?) ON DUPLICATE KEY UPDATE setting_value = ? `,
                [key, value, value]
            );
        }
        res.json({ message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute(`SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = randomUUID();
        await pool.execute(`INSERT INTO users(id, username, email, password_hash, role) VALUES(?, ?, ?, ?, ?)`, [id, username, email, hashedPassword, role || 'admin']);
        res.status(201).json({ id, message: 'User created' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

app.patch('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isActive, role, password } = req.body;
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, req.params.id]);
        }
        if (typeof isActive !== 'undefined') {
            await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [isActive, req.params.id]);
        }
        if (role) {
            await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
        }
        res.json({ message: 'User updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ PUBLIC ENDPOINTS ============

app.get('/api/barangays', async (req, res) => {
    const cacheKey = 'barangays';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const [rows] = await pool.execute('SELECT id, name, latitude, longitude FROM barangays ORDER BY name');
        if (rows.length > 0) {
            cache.set(cacheKey, rows);
            return res.json(rows);
        }
    } catch (err) { }
    const fallback = [
        { id: '1', name: 'Poblacion', latitude: 6.2341, longitude: 124.8741 },
        { id: '2', name: 'San Jose', latitude: 6.2401, longitude: 124.8801 },
        { id: '3', name: 'Liberty', latitude: 6.2281, longitude: 124.8681 },
        { id: '4', name: 'Dumaguil', latitude: 6.2461, longitude: 124.8861 },
        { id: '5', name: 'Lapuz', latitude: 6.2221, longitude: 124.8621 },
        { id: '6', name: 'Benigno Aquino', latitude: 6.2521, longitude: 124.8921 },
        { id: '7', name: 'Esperanza', latitude: 6.2161, longitude: 124.8561 },
        { id: '8', name: 'Kibid', latitude: 6.2581, longitude: 124.8981 },
        { id: '9', name: 'Tinago', latitude: 6.2101, longitude: 124.8501 },
        { id: '10', name: 'Pag-asa', latitude: 6.2641, longitude: 124.9041 }
    ];
    cache.set(cacheKey, fallback);
    res.json(fallback);
});

app.get('/api/pest-types', async (req, res) => {
    const cacheKey = 'pest_types';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const [rows] = await pool.execute('SELECT id, name, severity_level FROM pest_categories WHERE is_active = TRUE ORDER BY name');
        if (rows.length > 0) {
            cache.set(cacheKey, rows);
            return res.json(rows);
        }
    } catch (err) { }
    const fallback = [
        { id: '1', name: 'Rice Black Bug', severity_level: 'high' },
        { id: '2', name: 'Rice Stem Borer', severity_level: 'high' },
        { id: '3', name: 'Brown Planthopper', severity_level: 'critical' },
        { id: '4', name: 'Corn Borer', severity_level: 'medium' },
        { id: '5', name: 'Aphids', severity_level: 'low' },
        { id: '6', name: 'Army Worm', severity_level: 'high' }
    ];
    cache.set(cacheKey, fallback);
    res.json(fallback);
});

app.get('/api/crop-types', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, name, season FROM crop_types WHERE is_active = TRUE ORDER BY name');
        if (rows.length > 0) return res.json(rows);
    } catch (err) { }
    res.json([
        { id: '1', name: 'Rice', season: 'Wet/Dry' },
        { id: '2', name: 'Corn', season: 'Dry' },
        { id: '3', name: 'Vegetables', season: 'Year-round' },
        { id: '4', name: 'Coconut', season: 'Year-round' },
        { id: '5', name: 'Banana', season: 'Year-round' }
    ]);
});

// ============ NEWS & ADVISORIES ============

// Ensure table exists (Auto-Migration)
const ensureNewsTable = async () => {
    try {
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS news(
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            type ENUM('news', 'advisory', 'weather', 'alert') DEFAULT 'news',
            priority ENUM('low', 'normal', 'medium', 'high', 'critical') DEFAULT 'normal',
            author_id CHAR(36),
            is_active BOOLEAN DEFAULT TRUE,
            expires_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        `);
        // console.log("News table verified");
    } catch (err) {
        console.error("Error checking news table:", err);
    }
};
ensureNewsTable();

app.get('/api/news', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM news WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 50'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/news', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, content, type, priority, expiresAt } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO news (title, content, type, priority, author_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [title, content, type || 'news', priority || 'normal', req.user.id, expiresAt || null]
        );

        res.status(201).json({ id: result.insertId, message: 'News item created' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/news/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM news WHERE id = ?', [req.params.id]);
        res.json({ message: 'News item deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ ADMIN SETTINGS ENDPOINTS ============

app.get('/api/admin/pest-categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM pest_categories ORDER BY name ASC');
        res.json({ categories: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/pest-categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO pest_categories (name, description) VALUES (?, ?)',
            [name, description || null]
        );
        res.status(201).json({ id: result.insertId, message: 'Pest category created' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/pest-categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;
        await pool.execute(
            'UPDATE pest_categories SET name = ?, description = ? WHERE id = ?',
            [name, description || null, req.params.id]
        );
        res.json({ message: 'Pest category updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/pest-categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM pest_categories WHERE id = ?', [req.params.id]);
        res.json({ message: 'Pest category deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/crop-types', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM crop_types ORDER BY name ASC');
        res.json({ cropTypes: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/crop-types', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, variety, description } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO crop_types (name, variety, description) VALUES (?, ?, ?)',
            [name, variety || null, description || null]
        );
        res.status(201).json({ id: result.insertId, message: 'Crop type created' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/crop-types/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, variety, description } = req.body;
        await pool.execute(
            'UPDATE crop_types SET name = ?, variety = ?, description = ? WHERE id = ?',
            [name, variety || null, description || null, req.params.id]
        );
        res.json({ message: 'Crop type updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/crop-types/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM crop_types WHERE id = ?', [req.params.id]);
        res.json({ message: 'Crop type deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/barangays', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM barangays ORDER BY name ASC');
        res.json({ barangays: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/barangays', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, municipality, province } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO barangays (name, municipality, province) VALUES (?, ?, ?)',
            [name, municipality || 'Norala', province || 'South Cotabato']
        );
        res.status(201).json({ id: result.insertId, message: 'Barangay created' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/barangays/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, municipality, province } = req.body;
        await pool.execute(
            'UPDATE barangays SET name = ?, municipality = ?, province = ? WHERE id = ?',
            [name, municipality || 'Norala', province || 'South Cotabato', req.params.id]
        );
        res.json({ message: 'Barangay updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/barangays/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM barangays WHERE id = ?', [req.params.id]);
        res.json({ message: 'Barangay deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT u.id, u.username, u.email, u.role, u.is_active, u.created_at
            FROM users u
            ORDER BY u.created_at DESC
        `);
        res.json({ users: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, email } = req.body;
        await pool.execute(
            'UPDATE users SET username = ?, email = ? WHERE id = ?',
            [username, email, req.params.id]
        );
        res.json({ message: 'User updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ============ NOTIFICATIONS API ============

// Get Notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 20;

        const [rows] = await pool.execute(
            `SELECT * FROM notifications 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [userId, limit]
        );
        res.json({ notifications: rows });
    } catch (err) {
        console.error('Fetch notifications error:', err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get Unread Count
app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.execute(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        res.json({ count: rows[0].count });
    } catch (err) {
        console.error('Count notifications error:', err);
        res.status(500).json({ error: 'Failed to count notifications' });
    }
});

// Mark single as read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const notifId = req.params.id;

        await pool.execute(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [notifId, userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Mark all as read
app.put('/api/notifications/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await pool.execute(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
            [userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Mark all read error:', err);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// ============ SPA FALLBACK - Serve frontend for non-API routes ============
app.get('*', (req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api')) {
        res.sendFile(join(__dirname, '../dist/index.html'));
    } else {
        res.status(404).json({ error: 'API endpoint not found' });
    }
});

// ============ START SERVER ============

app.listen(PORT, () => {
    console.log(`CropAid Server running on port ${PORT} `);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});
