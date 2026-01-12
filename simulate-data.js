import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Default to localhost, can be overridden by env
const API_URL = process.env.API_URL || 'http://localhost:3000/api';

// Reference Coordinates (Matched to Map Configuration) - Saved for logic if needed, 
// though seed.sql already handles inserting Barangays into DB. 
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

async function simulate() {
    console.log(`🌱 Starting Data Simulation against ${API_URL}...`);

    // 1. Login as Admin (needed for verifications)
    let adminToken = null;
    try {
        const adminRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'admin', password: 'cropaid123' }) // Password from seed.sql comment? Check hash match.
            // Wait, seed.sql hash is $2b$10$wZ4L3COHDc4tic6TUd5yzeVV73.kuSff9B3p5NQGzpJ0lzbG7ZOqG
            // This hash usually corresponds to 'password123' or similar in generic examples.
            // But let's assume 'password123' if it fails.
        });

        // Actually, the seed said: -- Admin (password: cropaid123) ? 
        // No, in seed.sql from Step 892 it said: -- Admin (password: cropaid123)
        // Wait, line 5: "-- Admin (password: cropaid123)"
        // So I'll use 'cropaid123'.

        if (adminRes.ok) {
            const data = await adminRes.json();
            adminToken = data.token;
            console.log('✓ Admin Logged In');
        } else {
            console.warn('⚠️ Admin login failed (might use default password). Verification steps may fail.');
        }
    } catch (e) {
        console.warn('⚠️ Admin login error:', e.message);
    }

    // ==========================================
    // DATA DEFINITIONS
    // ==========================================

    // Farmer 1: Shara
    const sharaProfile = {
        username: 'shara.desamero', email: 'shara@gmail.com', password: 'password123',
        rsbsaId: '12-63-11-001', firstName: 'Shara Dane', middleName: 'V', lastName: 'Desamero',
        cellphone: '09171234567', sex: 'Female', dobYear: '1995', dobMonth: '05', dobDay: '15', civilStatus: 'Single',
        barangay: 'San Jose', streetSitio: 'Purok 1'
    };

    // Farm 1 is created via Register
    const sharaFarm1 = {
        farmBarangay: 'San Jose', farmSitio: 'Purok 1',
        farmSize: '2.5', farmLatitude: barangayCenters['San Jose'].lat, farmLongitude: barangayCenters['San Jose'].lng,
        plantingMethod: 'Transplanting', dateOfSowing: '2025-11-01', dateOfTransplanting: '2025-11-20', dateOfHarvest: '2026-03-15',
        landCategory: 'Irrigated', soilType: 'Clay Loam', topography: 'Flat', irrigationSource: 'NIA/CIS', tenuralStatus: 'Owner',
        boundaryNorth: 'Road', boundarySouth: 'River', boundaryEast: 'Machico Farm', boundaryWest: 'Canal',
        currentCrop: 'Rice', coverType: 'Multi-Risk', amountCover: '50000.00', insurancePremium: '2500.00',
        cltipSumInsured: '10000.00', cltipPremium: '500.00'
    };

    // Farm 2 is created via POST /farms
    const sharaFarm2 = {
        farmBarangay: 'San Jose', farmSitio: 'Purok 2',
        farmSize: '1.5', farmLatitude: barangayCenters['San Jose'].lat + 0.003, farmLongitude: barangayCenters['San Jose'].lng + 0.003,
        plantingMethod: 'Direct Seeding', dateOfSowing: '2025-12-01', dateOfHarvest: '2026-04-01',
        landCategory: 'Rainfed', soilType: 'Silty Loam', topography: 'Flat', irrigationSource: 'STW', tenuralStatus: 'Lessee',
        boundaryNorth: 'Desamero Farm 1', boundarySouth: 'Highway', boundaryEast: 'Vacant Lot', boundaryWest: 'Residential',
        currentCrop: 'Corn', coverType: 'Natural Disaster', amountCover: '30000.00', insurancePremium: '1500.00'
    };

    const sharaReports = [
        // Report for Farm 1
        {
            farmIndex: 0, // 0 = First farm (Registration)
            type: 'pest',
            details: { cropType: "Rice", pestType: "Rice Black Bug", severity: "High", affectedArea: "1.5", damageLevel: "Severe", description: "Black bug infestation observed in rice field mostly in the lower part." },
            location: 'San Jose', latitude: sharaFarm1.farmLatitude, longitude: sharaFarm1.farmLongitude,
            daysAgo: 2, status: 'pending'
        },
        // Report for Farm 2
        {
            farmIndex: 1, // 1 = Second farm
            type: 'drought',
            details: { cropType: "Corn", severity: "Medium", affectedArea: "1.0", damageLevel: "Moderate", description: "Leaves curling due to lack of water for 2 weeks on the second farm." },
            location: 'San Jose', latitude: sharaFarm2.farmLatitude, longitude: sharaFarm2.farmLongitude,
            daysAgo: 10, status: 'verified', adminNotes: "Verified during field inspection. Assistance recommended."
        }
    ];

    // Farmer 2: James
    const jamesProfile = {
        username: 'james.machico', email: 'james@gmail.com', password: 'password123',
        rsbsaId: '12-63-11-002', firstName: 'James', middleName: 'B', lastName: 'Machico',
        cellphone: '09181235555', sex: 'Male', dobYear: '1990', dobMonth: '08', dobDay: '20', civilStatus: 'Married',
        barangay: 'Liberty', streetSitio: 'Purok 3'
    };

    const jamesFarm1 = {
        farmBarangay: 'Liberty', farmSitio: 'Purok 3',
        farmSize: '1.8', farmLatitude: barangayCenters['Liberty'].lat, farmLongitude: barangayCenters['Liberty'].lng,
        plantingMethod: 'Direct Seeding', dateOfSowing: '2025-11-15', dateOfHarvest: '2026-02-28',
        landCategory: 'Rainfed', soilType: 'Sandy Loam', topography: 'Rolling', irrigationSource: 'Deep Well', tenuralStatus: 'Owner',
        boundaryNorth: 'Desamero Farm', boundarySouth: 'Hill', boundaryEast: 'Road', boundaryWest: 'Forest',
        currentCrop: 'Vegetables', coverType: 'Natural Disaster', amountCover: '20000.00', insurancePremium: '1000.00'
    };

    const jamesFarm2 = {
        farmBarangay: 'Esperanza', farmSitio: 'Riverside',
        farmSize: '3.0', farmLatitude: barangayCenters['Esperanza'].lat, farmLongitude: barangayCenters['Esperanza'].lng,
        plantingMethod: 'Transplanting', dateOfSowing: '2025-10-01', dateOfTransplanting: '2025-10-25', dateOfHarvest: '2026-02-15',
        landCategory: 'Irrigated', soilType: 'Clay Loam', topography: 'Flat', irrigationSource: 'SWIP', tenuralStatus: 'Tenant',
        boundaryNorth: 'River', boundarySouth: 'Access Road', boundaryEast: 'Corn Field', boundaryWest: 'Coconut Plantation',
        currentCrop: 'Rice', coverType: 'Multi-Risk', amountCover: '60000.00', insurancePremium: '3000.00'
    };

    const jamesReports = [
        {
            farmIndex: 0,
            type: 'flood',
            details: { cropType: "Vegetables", severity: "Critical", affectedArea: "0.5", damageLevel: "Total Loss", description: "River overflow washed away vegetable plots." },
            location: 'Liberty', latitude: jamesFarm1.farmLatitude, longitude: jamesFarm1.farmLongitude,
            daysAgo: 15, status: 'resolved', adminNotes: "Damage assessed and relief goods distributed."
        },
        {
            farmIndex: 1,
            type: 'pest',
            details: { cropType: "Corn", pestType: "Army Worm", severity: "Low", affectedArea: "0.2", damageLevel: "Minor", description: "Early signs of army worm on young corn in Esperanza farm." },
            location: 'Esperanza', latitude: jamesFarm2.farmLatitude, longitude: jamesFarm2.farmLongitude,
            daysAgo: 0, status: 'pending'
        }
    ];


    // ==========================================
    // EXECUTION LOGIC
    // ==========================================

    async function processFarmer(profile, extraFarms = [], reports = []) {
        console.log(`\nProcessing ${profile.firstName}...`);

        // 1. Register (Creates User + Farm 1)
        // Combine profile and farm1 data (usually farm1 is extraFarms[0]? No, structure above separates them)
        // Wait, for Shara, I separated sharaFarm1. I need to merge it into Register payload.
        // Let's assume the FIRST farm is passed in profile or merged.
        // Ah, I'll pass initialFarm as argument.
    }

    // Wrapper to run logic
    await runFarmerWorkflow(sharaProfile, sharaFarm1, [sharaFarm2], sharaReports);
    await runFarmerWorkflow(jamesProfile, jamesFarm1, [jamesFarm2], jamesReports);

    // Community Loop
    const existingBarangays = ['San Jose', 'Liberty', 'Esperanza'];
    const remaining = Object.keys(barangayCenters).filter(b => !existingBarangays.includes(b));
    let counter = 100;

    console.log(`\nSeeding ${remaining.length} community farmers...`);
    for (const b of remaining) {
        counter++;
        const center = barangayCenters[b];
        const prof = {
            username: `farmer.${b.toLowerCase().replace(/[^a-z]/g, '')}`,
            email: `farmer.${b.toLowerCase().replace(/[^a-z]/g, '')}@cropaid.com`,
            password: 'password123',
            rsbsaId: `12-63-11-${counter}`,
            firstName: 'Community', middleName: 'X', lastName: `Farmer ${b}`,
            cellphone: `09000000${counter}`,
            barangay: b
        };
        const farm = {
            farmBarangay: b, farmSitio: 'Central',
            farmSize: (Math.random() * 3 + 0.5).toFixed(1),
            farmLatitude: center.lat, farmLongitude: center.lng,
            plantingMethod: Math.random() > 0.5 ? 'Direct Seeding' : 'Transplanting',
            currentCrop: Math.random() > 0.5 ? 'Rice' : 'Corn',
            landCategory: 'Rainfed', topography: 'Flat'
        };

        await runFarmerWorkflow(prof, farm, [], []);
    }


    async function runFarmerWorkflow(profile, initialFarm, additionalFarms, reports) {
        try {
            // REGISTER
            const regPayload = { ...profile, ...initialFarm };
            let regRes = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(regPayload)
            });

            if (regRes.status === 409) {
                console.log(`  User ${profile.username} exists. Logging in...`);
            } else if (!regRes.ok) {
                console.error(`  Registration failed for ${profile.username}:`, await regRes.text());
                return; // Stop if registration failed and not just conflict
            } else {
                console.log(`  ✓ Registered`);
            }

            // LOGIN
            const loginRes = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: profile.username, password: profile.password })
            });

            if (!loginRes.ok) throw new Error('Login failed');
            const { token } = await loginRes.json();

            // ADD EXTRA FARMS
            const farmIds = [];
            // We need to fetch the first farm ID? Or just list all farms?
            // Let's list farms to get IDs.
            const farmsRes = await fetch(`${API_URL}/farmer/farms`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const existingFarms = await farmsRes.json();
            // Assuming the most recent one is the initial farm, or we can just use the list.
            // But we need to map reports to farms.
            // Let's Create extra farms first.

            for (const f of additionalFarms) {
                const addRes = await fetch(`${API_URL}/farmer/farms`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(f)
                });
                if (addRes.ok) console.log(`  ✓ Added extra farm`);
                else console.error(`  ✗ Failed to add farm:`, await addRes.text());
            }

            // Get updated list of farms (ordered by created_at DESC)
            // Initial farm is oldest (last in list usually, but code says ORDER BY created_at DESC)
            // So Initial = Last? No, Initial created first.
            // If DESC: Newest (Extra) is [0], Initial is [Last].
            const allFarmsRes = await fetch(`${API_URL}/farmer/farms`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const allFarms = await allFarmsRes.json();
            // Sort by created_at ASC to match our array logic [Initial, Extra1, Extra2...]
            allFarms.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // SUBMIT REPORTS
            for (const r of reports) {
                const farmId = allFarms[r.farmIndex]?.id;
                if (!farmId) {
                    console.warn(`  Skipping report (invalid farm index ${r.farmIndex})`);
                    continue;
                }

                const reportPayload = {
                    type: r.type,
                    details: r.details,
                    location: r.location,
                    latitude: r.latitude,
                    longitude: r.longitude,
                    farmId: farmId // Wait, does API accept farmId?
                };

                // My API endpoint for reports currently DOES NOT accept farmId explicitly in body?
                // Let's check index.js.

                // CODE REVIEW of index.js (Step 898):
                // ReportSchema: does NOT have farmId.
                // Insert: INSERT INTO reports (user_id, type...
                // It does NOT insert farm_id!

                // User requirement: "Refining Farm Data Seeding... Resolve conflicting report IDs... new farm details... correct index, ids, foreign keys"
                // If reports are not linked to farms, that's a missing feature in API!
                // The DB schema HAS farm_id in reports.
                // So I MUST update ReportSchema and Insert logic in index.js to accept farmId!

            }
        } catch (e) {
            console.error(`  Error: ${e.message}`);
        }
    }
}

simulate().catch(console.error);
