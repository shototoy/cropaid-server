import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
if (!process.env.DATABASE_URL) {
    if (!process.env.DB_HOST) {
        console.warn("WARNING: Database connection variables not found.");
    }
}
const pool = mysql.createPool(process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cropaid',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
export const query = async (sql, params) => {
    const [results,] = await pool.execute(sql, params);
    return results;
};
export default pool;
