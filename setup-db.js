import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

async function setupDatabase() {
    // Connect without specifying database
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
    });

    console.log('Connected to MySQL');

    // Drop and create database
    await connection.query('DROP DATABASE IF EXISTS cropaid');
    await connection.query('CREATE DATABASE cropaid');
    await connection.query('USE cropaid');
    console.log('Database created');

    // Read and execute schema
    const schema = fs.readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    const statements = schema.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
        if (statement.trim()) {
            try {
                await connection.query(statement);
            } catch (err) {
                console.error('Error executing schema statement:', err.message);
            }
        }
    }
    console.log('Schema created');

    // Read and execute seed data
    const seed = fs.readFileSync(join(__dirname, 'seed.sql'), 'utf8');
    const seedStatements = seed.split(';').filter(s => s.trim());
    
    for (const statement of seedStatements) {
        if (statement.trim()) {
            try {
                await connection.query(statement);
            } catch (err) {
                console.error('Error executing seed statement:', err.message);
            }
        }
    }
    console.log('Seed data inserted');

    await connection.end();
    console.log('Database setup complete!');
}

setupDatabase().catch(console.error);
