import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootEnv = join(__dirname, '..', '.env');
const serverEnv = join(__dirname, '.env');

// Try server .env first, then root .env
dotenv.config({ path: fs.existsSync(serverEnv) ? serverEnv : rootEnv });

async function setupDatabase() {
    const dbName = process.env.DB_NAME || 'cropaid';

    // Connect without specifying database
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
    });

    console.log('Connected to MySQL');

    // Drop and create database
    await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await connection.query(`CREATE DATABASE \`${dbName}\``);
    await connection.query(`USE \`${dbName}\``);
    console.log(`Database '${dbName}' created`);

    // Read and execute schema
    console.log('📄 Reading and executing schema.sql...');
    const schema = fs.readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    const statements = schema.split(';').filter(s => s.trim());
    console.log(`   > Found ${statements.length} statements in schema.sql`);

    let schemaCount = 0;
    for (const statement of statements) {
        if (statement.trim()) {
            try {
                await connection.query(statement);
                schemaCount++;
            } catch (err) {
                console.error('Error executing schema statement:', err.message);
            }
        }
    }
    console.log(`✅ Schema created successfully (${schemaCount} statements executed)`);

    // Read and execute seed data
    console.log('🌱 Reading and executing seed.sql...');
    const seed = fs.readFileSync(join(__dirname, 'seed.sql'), 'utf8');
    const seedStatements = seed.split(';').filter(s => s.trim());
    console.log(`   > Found ${seedStatements.length} statements in seed.sql`);

    let seedCount = 0;
    for (const statement of seedStatements) {
        if (statement.trim()) {
            try {
                await connection.query(statement);
                seedCount++;
            } catch (err) {
                console.error('Error executing seed statement:', err.message);
            }
        }
    }
    console.log(`✅ Seed data inserted successfully (${seedCount} statements executed)`);

    await connection.end();
    console.log('🎉 Database setup complete!');
}

setupDatabase().catch(console.error);
