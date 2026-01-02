import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import pool from './db.js';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
app.use(cors());
app.use(helmet());
app.use(express.json());
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
    boundaryWest: z.string().optional()
});
const LoginSchema = z.object({
    identifier: z.string(),
    password: z.string()
});
const ReportSchema = z.object({
    type: z.enum(['pest', 'flood', 'drought']),
    details: z.object({
        description: z.string().optional(),
        damageLevel: z.string().optional()
    }).optional(),
    location: z.string().optional()
});
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
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'CropAid API is running' });
});
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
            dob = `${data.dobYear}-${data.dobMonth}-${data.dobDay}`;
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
        tribe, address_sitio, address_barangay, address_province, 
        cellphone, sex, date_of_birth, civil_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                farmerId, userId, data.rsbsaId, data.firstName, data.middleName, data.lastName,
                data.tribe, data.streetSitio, data.barangay, data.province,
                data.cellphone, data.sex, dob, data.civilStatus
            ]
        );
        await connection.execute(
            `INSERT INTO farms (
        id, farmer_id, location_sitio, location_barangay, location_municipality, location_province,
        boundary_north, boundary_south, boundary_east, boundary_west
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                farmId, farmerId, data.farmSitio, data.farmBarangay, data.farmMunicipality, data.farmProvince,
                data.boundaryNorth, data.boundarySouth, data.boundaryEast, data.boundaryWest
            ]
        );
        await connection.commit();
        res.status(201).json({ message: 'Registration successful' });
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
        WHERE u.username = ? OR f.rsbsa_id = ?
    `, [identifier, identifier]);
        const user = rows[0];
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign(
            { id: user.id, role: user.role, name: `${user.first_name} ${user.last_name}` },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({
            token,
            role: user.role,
            user: {
                id: user.id,
                name: user.full_name || `${user.first_name} ${user.last_name}`,
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
app.get('/api/farmer/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [profileRows] = await pool.execute(
            `SELECT 
        f.first_name, f.last_name, f.rsbsa_id, 
        fm.location_barangay as farm_barangay,
        f.address_barangay as home_barangay
       FROM farmers f
       LEFT JOIN farms fm ON f.id = fm.farmer_id
       WHERE f.user_id = ?`,
            [userId]
        );
        const profile = profileRows[0] || {};
        const barangay = profile.farm_barangay || profile.home_barangay || 'Norala';
        const [statsRows] = await pool.execute(
            `SELECT COUNT(*) as active_count FROM reports 
       WHERE user_id = ? AND status != 'resolved'`,
            [userId]
        );
        const [activityRows] = await pool.execute(
            `SELECT type, status, created_at FROM reports 
       WHERE user_id = ? 
       ORDER BY created_at DESC LIMIT 3`,
            [userId]
        );
        const weather = { temp: 32, condition: "Sunny", location: "Norala" };
        const advisory = {
            title: "Pest Alert: Rice Black Bug",
            severity: "high",
            message: `Farmers in ${barangay} are advised to monitor fields.`
        };
        res.json({
            profile: {
                name: `${profile.first_name} ${profile.last_name}`,
                rsbsa: profile.rsbsa_id,
                barangay: barangay
            },
            stats: {
                active_reports: statsRows[0] ? parseInt(statsRows[0].active_count) : 0
            },
            recent_activity: activityRows,
            weather,
            latest_advisory: advisory
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
            `INSERT INTO reports (id, user_id, type, details, location)
         VALUES (?, ?, ?, ?, ?)`,
            [reportId, req.user.id, data.type, JSON.stringify(data.details || {}), data.location]
        );
        const [rows] = await pool.execute('SELECT * FROM reports WHERE id = ?', [reportId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit report' });
    }
});
app.get('/api/reports/history', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.sendStatus(403);
    }
};
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [farmerCount] = await pool.execute('SELECT COUNT(*) as count FROM farmers');
        const [reportStats] = await pool.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
            FROM reports
        `);
        res.json({
            totalFarmers: farmerCount[0].count,
            totalReports: reportStats[0].total,
            pendingReports: reportStats[0].pending,
            resolvedReports: reportStats[0].resolved
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/admin/farmers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                f.id, f.rsbsa_id, f.first_name, f.last_name, 
                f.address_barangay, 
                fm.location_sitio, fm.location_barangay, 
                u.email, u.username
            FROM farmers f
            JOIN users u ON f.user_id = u.id
            LEFT JOIN farms fm ON f.id = fm.farmer_id
            ORDER BY f.last_name ASC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/admin/reports', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                r.*, 
                f.first_name, f.last_name, f.rsbsa_id
            FROM reports r
            JOIN farmers f ON r.user_id = f.user_id
            ORDER BY r.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.patch('/api/admin/reports/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['pending', 'verified', 'resolved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        await pool.execute('UPDATE reports SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ message: 'Status updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
