import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cropaid_db',
    multipleStatements: true
};

async function simulate() {
    console.log('🌱 Starting Data Simulation...');
    let connection;

    try {
        connection = await mysql.createConnection(dbConfig);
        const hashedPassword = await bcrypt.hash('password', 10);

        // ==========================================
        // STATIC DATA INITIALIZATION
        // ==========================================
        async function initStaticData() {
            console.log('   > Initializing Reference Data (Ref Data)...');

            // 1. Pest Categories
            // Note: We use INSERT IGNORE or ON DUPLICATE UPDATE to avoid errors on re-run
            // But simple INSERT with cleanup (setup-db drops db) is fine.
            await connection.execute(`
                INSERT INTO pest_categories (name, description, severity_level, affected_crops) VALUES
                ('Rice Black Bug', 'Saps the plant of its nutrients causing it to turn reddish brown or yellow.', 'high', '["Rice"]'),
                ('Army Worm', 'Larvae feed on leaves and stems, causing massive defoliation.', 'high', '["Rice", "Corn", "Vegetables"]'),
                ('Rodents', 'Rats that eat crops and grains.', 'medium', '["Rice", "Corn"]')
            `);

            // 2. Crop Types
            await connection.execute(`
                INSERT INTO crop_types (name, description, season) VALUES
                ('Rice', 'Staple food crop', 'Wet/Dry'),
                ('Corn', 'Cereal grain', 'Dry'),
                ('Vegetables', 'Various garden crops', 'Year-round')
            `);

            // 3. Barangays
            await connection.execute(`
                INSERT INTO barangays (name, latitude, longitude) VALUES 
                ('San Jose', 6.5250, 124.6750),
                ('Liberty', 6.5050, 124.6550),
                ('Esperanza', 6.5500, 124.6900),
                ('Poblacion', 6.5180, 124.6660)
            `);

            // 4. News & Advisories
            // Ensure Admin UUID exists (created by seed.sql). 
            // In case seed.sql failed, we create admin here? No, assuming seed.sql ran.
            await connection.execute(`
                INSERT INTO news (title, content, type, priority, created_at, is_active, author_id) VALUES
                ('Pest Alert: Black Bug Infestation Warning', 'The Municipal Agriculture Office has detected increased black bug activity in several barangays including Poblacion, San Miguel, and Benigno Aquino. Farmers are advised to monitor their rice fields closely and report any signs of infestation immediately.', 'alert', 'high', DATE_SUB(NOW(), INTERVAL 1 DAY), TRUE, 'admin-uuid'),
                ('Weather Advisory: Dry Season Preparations', 'The Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA) forecasts below-normal rainfall in the coming months. Farmers are encouraged to implement water-saving irrigation techniques and consider drought-resistant crop varieties.', 'advisory', 'medium', DATE_SUB(NOW(), INTERVAL 2 DAY), TRUE, 'admin-uuid'),
                ('New Seed Distribution Program', 'The Department of Agriculture, in partnership with the local government, will be distributing free certified high-yield rice seeds to all RSBSA-registered farmers. Distribution will be at the Municipal Agriculture Office starting Monday.', 'news', 'low', DATE_SUB(NOW(), INTERVAL 3 DAY), TRUE, 'admin-uuid'),
                ('Flood Warning: Low-lying Areas', 'PAGASA has issued a flood warning for low-lying areas due to continuous rainfall. Farmers are advised to harvest mature crops if possible and move equipment to higher ground. The CropAid system is ready to receive flood damage reports.', 'alert', 'high', DATE_SUB(NOW(), INTERVAL 4 DAY), TRUE, 'admin-uuid'),
                ('Free Pest Control Training', 'The Municipal Agriculture Office is conducting a free Integrated Pest Management (IPM) training for farmers. Topics include biological pest control, proper pesticide application, and early detection methods. Register at the MAO office.', 'news', 'low', DATE_SUB(NOW(), INTERVAL 5 DAY), TRUE, 'admin-uuid'),
                ('Fertilizer Subsidy Application Open', 'The Fertilizer Subsidy Program is now accepting applications. Eligible farmers can receive up to 50% discount on fertilizers. Bring your RSBSA card and valid ID to the Municipal Agriculture Office to apply.', 'news', 'medium', DATE_SUB(NOW(), INTERVAL 6 DAY), TRUE, 'admin-uuid')
            `);
        }

        // ==========================================
        // HELPER FUNCTIONS
        // ==========================================

        async function registerFarmer(user, profile, farm) {
            console.log(`   > Registering Farmer: ${profile.first_name} ${profile.last_name}...`);
            const userId = crypto.randomUUID();

            // 1. Create User
            await connection.execute(
                `INSERT INTO users (id, username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 'farmer', TRUE)`,
                [userId, user.username, user.email, hashedPassword]
            );

            // 2. Create Farmer Profile
            const [farmerResult] = await connection.execute(
                `INSERT INTO farmers (
                    user_id, rsbsa_id, first_name, middle_name, last_name, 
                    address_sitio, address_barangay, address_municipality, address_province, 
                    cellphone, sex, date_of_birth, civil_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, profile.rsbsa_id, profile.first_name, profile.middle_name, profile.last_name,
                    profile.address_sitio, profile.address_barangay, 'Norala', 'South Cotabato',
                    profile.cellphone, profile.sex, profile.date_of_birth, profile.civil_status
                ]
            );
            const farmerId = farmerResult.insertId;

            // 3. Create Farm
            if (farm) {
                await connection.execute(
                    `INSERT INTO farms (
                        farmer_id, location_barangay, location_sitio,
                        latitude, longitude, farm_size_hectares
                    ) VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        farmerId, farm.location_barangay, farm.location_sitio,
                        farm.latitude, farm.longitude, farm.farm_size_hectares
                    ]
                );
            }

            return { userId, farmerId, name: `${profile.first_name} ${profile.last_name}` };
        }

        async function submitReport(user, type, details, location, lat, lon, daysAgo) {
            console.log(`   > Submitting ${type} report for ${user.name}...`);

            const [res] = await connection.execute(
                `INSERT INTO reports (user_id, type, status, details, location, latitude, longitude, created_at) 
                 VALUES (?, ?, 'pending', ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
                [user.userId, type, JSON.stringify(details), location, lat, lon, daysAgo]
            );
            const reportId = res.insertId;

            await connection.execute(
                `INSERT INTO notifications (user_id, type, title, message, reference_id, is_read, created_at)
                 VALUES (
                    (SELECT id FROM users WHERE role = 'admin' LIMIT 1), 
                    'new_report', 
                    CONCAT(?, ' filed a ', ?, ' report'), 
                    CONCAT('A new ', ?, ' report has been submitted in ', ?), 
                    ?, FALSE, DATE_SUB(NOW(), INTERVAL ? DAY)
                 )`,
                [user.name, type, type, location, reportId, daysAgo]
            );

            return reportId;
        }

        async function verifyReport(reportId, adminNotes, daysAgo) {
            console.log(`   > Verifying report #${reportId}...`);

            await connection.execute(
                `UPDATE reports SET status = 'verified', admin_notes = ? WHERE id = ?`,
                [adminNotes, reportId]
            );

            const [rows] = await connection.execute('SELECT user_id, type FROM reports WHERE id = ?', [reportId]);
            if (rows.length > 0) {
                const { user_id, type } = rows[0];
                await connection.execute(
                    `INSERT INTO notifications (user_id, type, title, message, reference_id, is_read, created_at)
                     VALUES (?, 'status_change', 'Report Verified', 'Your report has been verified by the admin.', ?, FALSE, DATE_SUB(NOW(), INTERVAL ? DAY))`,
                    [user_id, reportId, daysAgo]
                );
            }
        }

        async function resolveReport(reportId, adminNotes, daysAgo) {
            console.log(`   > Resolving report #${reportId}...`);
            await connection.execute(
                `UPDATE reports SET status = 'resolved', admin_notes = ? WHERE id = ?`,
                [adminNotes, reportId]
            );

            const [rows] = await connection.execute('SELECT user_id FROM reports WHERE id = ?', [reportId]);
            if (rows.length > 0) {
                const { user_id } = rows[0];
                await connection.execute(
                    `INSERT INTO notifications (user_id, type, title, message, reference_id, is_read, created_at)
                     VALUES (?, 'status_change', 'Report Resolved', 'Your report has been resolved.', ?, TRUE, DATE_SUB(NOW(), INTERVAL ? DAY))`,
                    [user_id, reportId, daysAgo]
                );
            }
        }


        // ==========================================
        // EXECUTION
        // ==========================================

        await initStaticData();

        // --- Farmer 1: Shara ---
        const shara = await registerFarmer(
            { username: 'shara.desamero', email: 'shara@gmail.com' },
            {
                rsbsa_id: '12-63-11-001', first_name: 'Shara Dane', middle_name: 'A', last_name: 'Desamero',
                address_sitio: 'Purok 1', address_barangay: 'San Jose', cellphone: '09171234444',
                sex: 'Female', date_of_birth: '1995-05-15', civil_status: 'Single'
            },
            { location_barangay: 'San Jose', location_sitio: 'Purok 1', latitude: 6.5250, longitude: 124.6750, farm_size_hectares: 2.5 }
        );

        // Shara Report 1: Pest (Pending)
        await submitReport(shara, 'pest',
            { cropType: "Rice", pestType: "Rice Black Bug", severity: "High", affectedArea: "1.5", damageLevel: "Severe", description: "Black bug infestation observed in rice field mostly in the lower part." },
            'San Jose', 6.5250, 124.6750, 2
        );

        // Shara Report 2: Drought (Verified)
        const sharaId2 = await submitReport(shara, 'drought',
            { cropType: "Corn", severity: "Medium", affectedArea: "2.0", damageLevel: "Moderate", description: "Leaves curling due to lack of water for 2 weeks." },
            'San Jose', 6.5255, 124.6755, 10
        );
        await verifyReport(sharaId2, "Verified during field inspection. Assistance recommended.", 9);


        // --- Farmer 2: James ---
        const james = await registerFarmer(
            { username: 'james.machico', email: 'james@gmail.com' },
            {
                rsbsa_id: '12-63-11-002', first_name: 'James', middle_name: 'B', last_name: 'Machico',
                address_sitio: 'Purok 3', address_barangay: 'Liberty', cellphone: '09181235555',
                sex: 'Male', date_of_birth: '1990-08-20', civil_status: 'Married'
            },
            { location_barangay: 'Liberty', location_sitio: 'Purok 3', latitude: 6.5050, longitude: 124.6550, farm_size_hectares: 1.8 }
        );

        // James Report 1: Flood (Resolved)
        const jamesId1 = await submitReport(james, 'flood',
            { cropType: "Vegetables", severity: "Critical", affectedArea: "0.5", damageLevel: "Total Loss", description: "River overflow washed away vegetable plots." },
            'Liberty', 6.5050, 124.6550, 15
        );
        await resolveReport(jamesId1, "Damage assessed and relief goods distributed.", 14);

        // James Report 2: Pest (Pending - Recent)
        await submitReport(james, 'pest',
            { cropType: "Corn", pestType: "Army Worm", severity: "Low", affectedArea: "0.2", damageLevel: "Minor", description: "Early signs of army worm on young corn." },
            'Liberty', 6.5055, 124.6555, 0 // Today
        );

        console.log('✅ Simulation Complete!');

    } catch (err) {
        console.error('❌ Simulation Failed:', err);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

simulate();
