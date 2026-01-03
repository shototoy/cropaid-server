import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
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

// Increase payload limit for Base64 images
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============ VALIDATION SCHEMAS ============

const RegisterSchema = z.object({
    email: z.string().email(),
    username: z.string().min(3),
    password: z.string().min(6),
    rsbsaId: z.string().min(5),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    middleName: z.string().optional(),
    tribe: z.string().optional(),
    streetSitio: z.string().optional(),
    barangay: z.string().optional(),
    municipality: z.string().optional(),
    province: z.string().optional(),
    cellphone: z.string().optional(),
    sex: z.enum(['Male', 'Female']).optional(),
    dobMonth: z.string().optional(),
    dobDay: z.string().optional(),
    dobYear: z.string().optional(),
    civilStatus: z.string().optional(),
    farmSitio: z.string().optional(),
    farmBarangay: z.string().optional(),
    farmMunicipality: z.string().optional(),
    farmProvince: z.string().optional(),
    boundaryNorth: z.string().optional(),
    boundarySouth: z.string().optional(),
    boundaryEast: z.string().optional(),
    boundaryWest: z.string().optional(),
    farmSize: z.string().optional()
});

const LoginSchema = z.object({
    identifier: z.string(),
    password: z.string()
});

const ReportSchema = z.object({
    type: z.enum(['pest', 'flood', 'drought']),
    details: z.object({
        description: z.string().optional(),
        damageLevel: z.string().optional(),
        cropType: z.string().optional(),
        pestType: z.string().optional(),
        severity: z.string().optional(),
        affectedArea: z.string().optional()
    }).optional(),
    location: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    photoBase64: z.string().optional()
});

// ============ MIDDLEWARE ============

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
        const farmerId = randomUUID();
        const farmId = randomUUID();

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

        await connection.execute(
            `INSERT INTO farmers (
                id, user_id, rsbsa_id, first_name, middle_name, last_name, 
                tribe, address_sitio, address_barangay, address_municipality, address_province, 
                cellphone, sex, date_of_birth, civil_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                farmerId, userId, data.rsbsaId, data.firstName, data.middleName || null, data.lastName,
                data.tribe || null, data.streetSitio || null, data.barangay || null, 
                data.municipality || 'Norala', data.province || 'South Cotabato',
                data.cellphone || null, data.sex || null, dob, data.civilStatus || null
            ]
        );

        await connection.execute(
            `INSERT INTO farms (
                id, farmer_id, location_sitio, location_barangay, location_municipality, location_province,
                boundary_north, boundary_south, boundary_east, boundary_west, farm_size_hectares
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                farmId, farmerId, data.farmSitio || null, data.farmBarangay || null, 
                data.farmMunicipality || 'Norala', data.farmProvince || 'South Cotabato',
                data.boundaryNorth || null, data.boundarySouth || null, 
                data.boundaryEast || null, data.boundaryWest || null,
                data.farmSize ? parseFloat(data.farmSize) : null
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

app.post('/api/reports', authenticateToken, async (req, res) => {
    try {
        const data = ReportSchema.parse(req.body);
        const reportId = randomUUID();

        await pool.execute(
            `INSERT INTO reports (id, user_id, type, details, location, latitude, longitude, photo_base64)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                reportId, req.user.id, data.type, 
                JSON.stringify(data.details || {}), 
                data.location || null,
                data.latitude || null,
                data.longitude || null,
                data.photoBase64 || null
            ]
        );

        const notifId = randomUUID();
        try {
            await pool.execute(
                `INSERT INTO notifications (id, user_id, type, title, message, reference_id)
                 SELECT ?, id, 'new_report', ?, ?, ?
                 FROM users WHERE role = 'admin'`,
                [notifId, `New ${data.type} report`, `A new ${data.type} report has been submitted`, reportId]
            );
        } catch (e) { /* notifications table might not exist */ }

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

        const [rows] = await pool.execute(query, params);

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
                f.id, f.rsbsa_id, f.first_name, f.last_name, f.cellphone,
                f.address_barangay, f.created_at,
                fm.location_barangay, fm.farm_size_hectares,
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

        const [rows] = await pool.execute(query, params);

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

app.patch('/api/admin/farmers/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { isActive } = req.body;
        await pool.execute(
            `UPDATE users u 
             JOIN farmers f ON u.id = f.user_id 
             SET u.is_active = ? 
             WHERE f.id = ?`,
            [isActive, req.params.id]
        );
        res.json({ message: 'Farmer status updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admin/reports', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
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
                f.first_name, f.last_name, f.rsbsa_id, f.cellphone,
                fm.location_barangay as farm_barangay
            FROM reports r
            JOIN farmers f ON r.user_id = f.user_id
            LEFT JOIN farms fm ON f.id = fm.farmer_id
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

        const [rows] = await pool.execute(query, params);

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
                const notifId = randomUUID();
                await pool.execute(
                    `INSERT INTO notifications (id, user_id, type, title, message, reference_id)
                     VALUES (?, ?, 'status_change', ?, ?, ?)`,
                    [notifId, report[0].user_id, `Report ${status}`, `Your ${report[0].type} report has been ${status}`, req.params.id]
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
             WHERE user_id = ? OR (user_id IS NULL AND ? = 'admin')
             ORDER BY created_at DESC LIMIT 50`,
            [req.user.id, req.user.role]
        );
        const [unreadCount] = await pool.execute(
            `SELECT COUNT(*) as count FROM notifications 
             WHERE (user_id = ? OR (user_id IS NULL AND ? = 'admin')) AND is_read = FALSE`,
            [req.user.id, req.user.role]
        );
        res.json({ notifications: rows, unreadCount: unreadCount[0].count });
    } catch (err) {
        res.json({ notifications: [], unreadCount: 0 });
    }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    try {
        const since = req.query.since;
        let query = `SELECT COUNT(*) as count FROM notifications 
                     WHERE (user_id = ? OR (user_id IS NULL AND ? = 'admin')) AND is_read = FALSE`;
        const params = [req.user.id, req.user.role];
        
        if (since) {
            query += ` AND created_at > ?`;
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
        const id = randomUUID();
        await pool.execute(
            `INSERT INTO pest_categories (id, name, description, severity_level, affected_crops) VALUES (?, ?, ?, ?, ?)`,
            [id, name, description, severityLevel || 'medium', affectedCrops]
        );
        res.status(201).json({ id, message: 'Pest category created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/pest-categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, description, severityLevel, affectedCrops, isActive } = req.body;
        await pool.execute(
            `UPDATE pest_categories SET name = ?, description = ?, severity_level = ?, affected_crops = ?, is_active = ? WHERE id = ?`,
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
        const { name, description, season } = req.body;
        const id = randomUUID();
        await pool.execute(`INSERT INTO crop_types (id, name, description, season) VALUES (?, ?, ?, ?)`, [id, name, description, season]);
        res.status(201).json({ id, message: 'Crop type created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/crop-types/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, description, season, isActive } = req.body;
        await pool.execute(`UPDATE crop_types SET name = ?, description = ?, season = ?, is_active = ? WHERE id = ?`, [name, description, season, isActive, req.params.id]);
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
        const id = randomUUID();
        await pool.execute(
            `INSERT INTO barangays (id, name, municipality, province, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, name, municipality || 'Norala', province || 'South Cotabato', latitude, longitude]
        );
        res.status(201).json({ id, message: 'Barangay created' });
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
                `INSERT INTO system_settings (id, setting_key, setting_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?`,
                [randomUUID(), key, value, value]
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
        await pool.execute(`INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`, [id, username, email, hashedPassword, role || 'admin']);
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
    try {
        const [rows] = await pool.execute('SELECT id, name, latitude, longitude FROM barangays ORDER BY name');
        if (rows.length > 0) return res.json(rows);
    } catch (err) { }
    res.json([
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
    ]);
});

app.get('/api/pest-types', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, name, severity_level FROM pest_categories WHERE is_active = TRUE ORDER BY name');
        if (rows.length > 0) return res.json(rows);
    } catch (err) { }
    res.json([
        { id: '1', name: 'Rice Black Bug', severity_level: 'high' },
        { id: '2', name: 'Rice Stem Borer', severity_level: 'high' },
        { id: '3', name: 'Brown Planthopper', severity_level: 'critical' },
        { id: '4', name: 'Corn Borer', severity_level: 'medium' },
        { id: '5', name: 'Aphids', severity_level: 'low' },
        { id: '6', name: 'Army Worm', severity_level: 'high' }
    ]);
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

// ============ START SERVER ============

app.listen(PORT, () => {
    console.log(`CropAid Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});
