import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cropaid',
    multipleStatements: true
};

async function simulate() {
    console.log('🌱 Starting Data Simulation...');
    let connection;

    try {
        connection = await mysql.createConnection(dbConfig);
        const hashedPassword = await bcrypt.hash('password', 10);

        // Reference Coordinates (Matched to Map Configuration)
        const barangayCenters = {
            'Benigno Aquino, Jr.': { lat: 6.5282, lng: 124.6848 },
            'Dumaguil': { lat: 6.5583, lng: 124.6842 },
            'Esperanza': { lat: 6.4984, lng: 124.6685 },
            'Kibid': { lat: 6.5383, lng: 124.6769 },
            'Lapuz': { lat: 6.5213, lng: 124.6317 },
            'Liberty': { lat: 6.5364, lng: 124.6317 },
            'Lopez Jaena': { lat: 6.5092, lng: 124.6866 },
            'Matapol': { lat: 6.5761, lng: 124.6411 },
            'Poblacion': { lat: 6.5206, lng: 124.6623 },
            'Puti': { lat: 6.5164, lng: 124.7095 },
            'San Jose': { lat: 6.5507, lng: 124.6417 },
            'San Miguel': { lat: 6.4944, lng: 124.7187 },
            'Simsiman': { lat: 6.5592, lng: 124.6527 },
            'Tinago': { lat: 6.5523, lng: 124.7054 }
        };

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
            // 3. Barangays (Dynamic from S.S.O.T)
            const barangayValues = Object.entries(barangayCenters)
                .map(([name, coords]) => `('${name}', ${coords.lat}, ${coords.lng})`)
                .join(', ');

            await connection.execute(`
                INSERT INTO barangays (name, latitude, longitude) VALUES ${barangayValues}
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

        async function registerFarmer(user, profile, farmsData) {
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

            // 3. Create Farms (Handle Array)
            const farms = Array.isArray(farmsData) ? farmsData : [farmsData];

            const createdFarmIds = [];
            for (const farm of farms) {
                if (farm) {
                    const [fRes] = await connection.execute(
                        `INSERT INTO farms (
                            farmer_id, location_barangay, location_sitio,
                            latitude, longitude, farm_size_hectares,
                            planting_method, date_of_sowing, date_of_transplanting, date_of_harvest,
                            land_category, soil_type, topography, irrigation_source, tenural_status,
                            boundary_north, boundary_south, boundary_east, boundary_west,
                            current_crop, cover_type, amount_cover, insurance_premium,
                            cltip_sum_insured, cltip_premium
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            farmerId, farm.location_barangay, farm.location_sitio,
                            farm.latitude, farm.longitude, farm.farm_size_hectares,
                            farm.planting_method || null, farm.date_of_sowing || null, farm.date_of_transplanting || null, farm.date_of_harvest || null,
                            farm.land_category || null, farm.soil_type || null, farm.topography || null, farm.irrigation_source || null, farm.tenural_status || null,
                            farm.boundary_north || null, farm.boundary_south || null, farm.boundary_east || null, farm.boundary_west || null,
                            farm.current_crop || null, farm.cover_type || null, farm.amount_cover || null, farm.insurance_premium || null,
                            farm.cltip_sum_insured || null, farm.cltip_premium || null
                        ]
                    );
                    createdFarmIds.push(fRes.insertId);
                }
            }

            return { userId, farmerId, farmIds: createdFarmIds, name: `${profile.first_name} ${profile.last_name}` };
        }

        async function submitReport(user, farmId, type, details, location, lat, lon, daysAgo) {
            console.log(`   > Submitting ${type} report for ${user.name}...`);

            const [res] = await connection.execute(
                `INSERT INTO reports (user_id, farm_id, type, status, details, location, latitude, longitude, created_at) 
                 VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))`,
                [user.userId, farmId, type, JSON.stringify(details), location, lat, lon, daysAgo]
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

        await initStaticData();

        // --- Farmer 1: Shara ---
        const sharaFarms = [
            {
                location_barangay: 'San Jose', location_sitio: 'Purok 1',
                latitude: barangayCenters['San Jose'].lat, longitude: barangayCenters['San Jose'].lng, // Exact Center
                farm_size_hectares: 2.5,
                planting_method: 'Transplanting', date_of_sowing: '2025-11-01', date_of_transplanting: '2025-11-20', date_of_harvest: '2026-03-15',
                land_category: 'Irrigated', soil_type: 'Clay Loam', topography: 'Flat', irrigation_source: 'NIA/CIS', tenural_status: 'Owner',
                boundary_north: 'Road', boundary_south: 'River', boundary_east: 'Machico Farm', boundary_west: 'Canal',
                current_crop: 'Rice', cover_type: 'Multi-Risk', amount_cover: 50000.00, insurance_premium: 2500.00,
                cltip_sum_insured: 10000.00, cltip_premium: 500.00
            },
            {
                location_barangay: 'San Jose', location_sitio: 'Purok 2',
                latitude: barangayCenters['San Jose'].lat + 0.003, longitude: barangayCenters['San Jose'].lng + 0.003, // Slight Offset
                farm_size_hectares: 1.5,
                planting_method: 'Direct Seeding', date_of_sowing: '2025-12-01', date_of_harvest: '2026-04-01',
                land_category: 'Rainfed', soil_type: 'Silty Loam', topography: 'Flat', irrigation_source: 'STW', tenural_status: 'Lessee',
                boundary_north: 'Desamero Farm 1', boundary_south: 'Highway', boundary_east: 'Vacant Lot', boundary_west: 'Residential',
                current_crop: 'Corn', cover_type: 'Natural Disaster', amount_cover: 30000.00, insurance_premium: 1500.00
            }
        ];

        const shara = await registerFarmer(
            { username: 'shara.desamero', email: 'shara@gmail.com' },
            {
                rsbsa_id: '12-63-11-001', first_name: 'Shara Dane', middle_name: 'V', last_name: 'Desamero',
                address_sitio: 'Purok 1', address_barangay: 'San Jose', cellphone: '09171234567',
                sex: 'Female', date_of_birth: '1995-05-15', civil_status: 'Single'
            },
            sharaFarms
        );

        // Shara Report 1: Pest (Pending) - Linked to Farm 1
        await submitReport(shara, shara.farmIds[0], 'pest',
            { cropType: "Rice", pestType: "Rice Black Bug", severity: "High", affectedArea: "1.5", damageLevel: "Severe", description: "Black bug infestation observed in rice field mostly in the lower part." },
            'San Jose', sharaFarms[0].latitude, sharaFarms[0].longitude, 2
        );

        // Shara Report 2: Drought (Verified) - Linked to Farm 2
        const sharaId2 = await submitReport(shara, shara.farmIds[1], 'drought',
            { cropType: "Corn", severity: "Medium", affectedArea: "1.0", damageLevel: "Moderate", description: "Leaves curling due to lack of water for 2 weeks on the second farm." },
            'San Jose', sharaFarms[1].latitude, sharaFarms[1].longitude, 10
        );
        await verifyReport(sharaId2, "Verified during field inspection. Assistance recommended.", 9);


        // --- Farmer 2: James ---
        const jamesFarms = [
            {
                location_barangay: 'Liberty', location_sitio: 'Purok 3',
                latitude: barangayCenters['Liberty'].lat, longitude: barangayCenters['Liberty'].lng,
                farm_size_hectares: 1.8,
                planting_method: 'Direct Seeding', date_of_sowing: '2025-11-15', date_of_harvest: '2026-02-28',
                land_category: 'Rainfed', soil_type: 'Sandy Loam', topography: 'Rolling', irrigation_source: 'Deep Well', tenural_status: 'Owner',
                boundary_north: 'Desamero Farm', boundary_south: 'Hill', boundary_east: 'Road', boundary_west: 'Forest',
                current_crop: 'Vegetables', cover_type: 'Natural Disaster', amount_cover: 20000.00, insurance_premium: 1000.00
            },
            {
                location_barangay: 'Esperanza', location_sitio: 'Riverside',
                latitude: barangayCenters['Esperanza'].lat, longitude: barangayCenters['Esperanza'].lng,
                farm_size_hectares: 3.0,
                planting_method: 'Transplanting', date_of_sowing: '2025-10-01', date_of_transplanting: '2025-10-25', date_of_harvest: '2026-02-15',
                land_category: 'Irrigated', soil_type: 'Clay Loam', topography: 'Flat', irrigation_source: 'SWIP', tenural_status: 'Tenant',
                boundary_north: 'River', boundary_south: 'Access Road', boundary_east: 'Corn Field', boundary_west: 'Coconut Plantation',
                current_crop: 'Rice', cover_type: 'Multi-Risk', amount_cover: 60000.00, insurance_premium: 3000.00
            }
        ];

        const james = await registerFarmer(
            { username: 'james.machico', email: 'james@gmail.com' },
            {
                rsbsa_id: '12-63-11-002', first_name: 'James', middle_name: 'B', last_name: 'Machico',
                address_sitio: 'Purok 3', address_barangay: 'Liberty', cellphone: '09181235555',
                sex: 'Male', date_of_birth: '1990-08-20', civil_status: 'Married'
            },
            jamesFarms
        );

        // James Report 1: Flood (Resolved) - Linked to Farm 1 (Liberty)
        const jamesId1 = await submitReport(james, james.farmIds[0], 'flood',
            { cropType: "Vegetables", severity: "Critical", affectedArea: "0.5", damageLevel: "Total Loss", description: "River overflow washed away vegetable plots." },
            'Liberty', jamesFarms[0].latitude, jamesFarms[0].longitude, 15
        );
        await resolveReport(jamesId1, "Damage assessed and relief goods distributed.", 14);

        // James Report 2: Pest (Pending - Recent) - Linked to Farm 2 (Esperanza)
        await submitReport(james, james.farmIds[1], 'pest',
            { cropType: "Corn", pestType: "Army Worm", severity: "Low", affectedArea: "0.2", damageLevel: "Minor", description: "Early signs of army worm on young corn in Esperanza farm." },
            'Esperanza', jamesFarms[1].latitude, jamesFarms[1].longitude, 0 // Today
        );

        // --- 3. Fill Remaning Barangays (Community Population) ---
        const existingBarangays = ['San Jose', 'Liberty', 'Esperanza'];
        const remainingBarangays = Object.keys(barangayCenters).filter(b => !existingBarangays.includes(b));

        console.log(`\nSeeeding remaining ${remainingBarangays.length} barangays...`);

        let counter = 1;
        for (const barangay of remainingBarangays) {
            const center = barangayCenters[barangay];
            // Create a generic farmer for this barangay
            const farmerName = `Farmer ${barangay.replace(/[^a-zA-Z]/g, '')}`;
            const username = `farmer.${barangay.toLowerCase().replace(/[^a-z]/g, '')}`;

            const communityFarms = [{
                location_barangay: barangay,
                location_sitio: 'Central',
                latitude: center.lat, // Exact center for visibility
                longitude: center.lng,
                farm_size_hectares: (Math.random() * 3 + 0.5).toFixed(1), // Random size 0.5 - 3.5 ha
                planting_method: Math.random() > 0.5 ? 'Direct Seeding' : 'Transplanting',
                date_of_sowing: '2025-11-01',
                land_category: 'Rainfed',
                soil_type: 'Clay Loam',
                topography: 'Flat',
                irrigation_source: 'Rainfall',
                tenural_status: 'Owner',
                boundary_north: 'N/A', boundary_south: 'N/A', boundary_east: 'N/A', boundary_west: 'N/A',
                current_crop: Math.random() > 0.5 ? 'Rice' : 'Corn',
                cover_type: 'None', amount_cover: 0, insurance_premium: 0
            }];

            await registerFarmer(
                { username: username, email: `${username}@cropaid.com` },
                {
                    rsbsa_id: `12-63-11-${100 + counter}`,
                    first_name: 'Community', middle_name: 'X', last_name: `Farmer ${barangay}`,
                    address_sitio: 'Purok 1', address_barangay: barangay, cellphone: `09000000${100 + counter}`,
                    sex: 'Male', date_of_birth: '1980-01-01', civil_status: 'Married'
                },
                communityFarms
            );
            counter++;
        }

        console.log('✅ Simulation Complete!');

    } catch (err) {
        console.error('❌ Simulation Failed:', err);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

simulate();
