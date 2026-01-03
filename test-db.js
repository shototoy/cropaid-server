import pool from './db.js';

console.log('Testing database connection...');
console.log('Environment variables:');
console.log('  DB_HOST:', process.env.DB_HOST || 'localhost');
console.log('  DB_USER:', process.env.DB_USER || 'root');
console.log('  DB_NAME:', process.env.DB_NAME || 'cropaid');
console.log('  DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : '(empty)');

try {
    const connection = await pool.getConnection();
    console.log('\n✅ Database connection successful!');

    const [rows] = await connection.execute('SELECT DATABASE() as db');
    console.log('✅ Connected to database:', rows[0].db);

    const [tables] = await connection.execute('SHOW TABLES');
    console.log('✅ Tables found:', tables.length);

    connection.release();
    process.exit(0);
} catch (err) {
    console.error('\n❌ Database connection failed!');
    console.error('Error:', err.message);
    console.error('\nPlease check:');
    console.error('  1. MySQL is running');
    console.error('  2. Database "cropaid" exists');
    console.error('  3. Credentials in .env are correct');
    process.exit(1);
}
