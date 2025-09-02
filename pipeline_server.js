// SEES Pipeline Server with Podio Integration
// Pulls appointments from Podio Closer app and processes through pipeline logic

const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// ENVIRONMENT VARIABLE CONFIGURATION
// ============================================
const CONFIG = {
  // Core Quickbase Configuration
  QB_REALM: process.env.QUICKBASE_REALM || 'generationsolar.quickbase.com',
  QB_TOKEN: process.env.QUICKBASE_TOKEN || 'b6qaq4_pywt_0_d4jy93kcjrtektcgv59xvmwv7xp',
  QB_APP_ID: process.env.QUICKBASE_APP_ID || 'bvd8uwsd6',
  
  // Podio Configuration
  PODIO_CLIENT_ID: process.env.PODIO_CLIENT_ID || 'gpt-operator',
  PODIO_CLIENT_SECRET: process.env.PODIO_CLIENT_SECRET || 'yn58tFMJO0HR8JRnUgKOWKph5FEq1Fn3WgWA4NA7oS4pMSSHmAuXTpxcE6hHtwPB',
  PODIO_APP_ID: process.env.PODIO_APP_ID || '29175634',
  PODIO_APP_TOKEN: process.env.PODIO_APP_TOKEN || '117d3fca26a11d72e48dc62e07d2e793',
  PODIO_VIEW_ID: process.env.PODIO_VIEW_ID || '', // Will fetch "View for Zaps ALL for Future"
  
  // Google Maps API
  GOOGLE_MAPS_API: process.env.GOOGLE_MAPS_API || 'AIzaSyBVezgyoAm_oSwU2nd9XHLd-oS1kB7WWGI',
  
  // Server Configuration
  PORT: process.env.PORT || 3000,
  TIMEZONE: process.env.TIMEZONE || 'America/Los_Angeles',
  
  // Sync Settings
  SYNC_INTERVAL_MINUTES: parseInt(process.env.SYNC_INTERVAL_MINUTES || '5'),
  SYNC_ENABLED: process.env.SYNC_ENABLED !== 'false',
  
  // Business Rules
  MAX_DAILY_APPOINTMENTS: parseInt(process.env.MAX_DAILY_APPOINTMENTS || '100'),
  ESCALATION_MINUTES: parseInt(process.env.ESCALATION_MINUTES || '15'),
  ESCALATION_ROUNDS: parseInt(process.env.ESCALATION_ROUNDS || '3'),
  PREVIEW_WINDOW_MINUTES: parseInt(process.env.PREVIEW_WINDOW_MINUTES || '15'),
  
  // Table IDs
  TABLE_APPOINTMENTS: process.env.TABLE_APPOINTMENTS || 'bvd8uws2t',
  TABLE_CLAIMS: process.env.TABLE_CLAIMS || 'bvd8uwtki',
  TABLE_HUBS: process.env.TABLE_HUBS || 'bvd8uwsk4',
  TABLE_PARTNERS: process.env.TABLE_PARTNERS || 'bvd8uwst2',
  TABLE_PREVIEW_ROUNDS: process.env.TABLE_PREVIEW_ROUNDS || 'bvd8uwtau',
  TABLE_PARTNER_HUB_ASSIGNMENTS: process.env.TABLE_PARTNER_HUB_ASSIGNMENTS || 'bvd83xibr',
};

// ============================================
// PODIO AUTHENTICATION & CLIENT
// ============================================
let podioAccessToken = null;
let podioTokenExpiry = null;

async function authenticatePodio() {
  try {
    const response = await axios.post('https://podio.com/oauth/token', 
      new URLSearchParams({
        grant_type: 'app',
        app_id: CONFIG.PODIO_APP_ID,
        app_token: CONFIG.PODIO_APP_TOKEN,
        client_id: CONFIG.PODIO_CLIENT_ID,
        client_secret: CONFIG.PODIO_CLIENT_SECRET
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    podioAccessToken = response.data.access_token;
    podioTokenExpiry = Date.now() + (response.data.expires_in * 1000);
    console.log('✅ Podio authentication successful');
    return podioAccessToken;
  } catch (error) {
    console.error('❌ Podio authentication failed:', error.response?.data || error.message);
    throw error;
  }
}

async function ensurePodioAuth() {
  if (!podioAccessToken || Date.now() >= podioTokenExpiry - 60000) {
    await authenticatePodio();
  }
  return podioAccessToken;
}

// ============================================
// PODIO VIEW FETCHING
// ============================================
async function getPodioViewId() {
  const token = await ensurePodioAuth();
  
  try {
    // Get all views for the app
    const response = await axios.get(
      `https://api.podio.com/view/app/${CONFIG.PODIO_APP_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    // Find "View for Zaps ALL for Future"
    const targetView = response.data.find(view => 
      view.name === 'View for Zaps ALL for Future' ||
      view.name.includes('Zaps ALL for Future')
    );
    
    if (targetView) {
      console.log(`✅ Found view: ${targetView.name} (ID: ${targetView.view_id})`);
      return targetView.view_id;
    }
    
    // Fallback to first available view
    if (response.data.length > 0) {
      console.log(`⚠️ Using fallback view: ${response.data[0].name}`);
      return response.data[0].view_id;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error fetching Podio views:', error.message);
    return null;
  }
}

// ============================================
// FETCH APPOINTMENTS FROM PODIO
// ============================================
async function fetchPodioAppointments() {
  const token = await ensurePodioAuth();
  
  try {
    // Get view ID if not set
    let viewId = CONFIG.PODIO_VIEW_ID;
    if (!viewId) {
      viewId = await getPodioViewId();
      if (!viewId) {
        console.log('⚠️ No view found, fetching all items');
      }
    }
    
    // Fetch items from view or all items
    const endpoint = viewId 
      ? `https://api.podio.com/item/app/${CONFIG.PODIO_APP_ID}/filter/${viewId}`
      : `https://api.podio.com/item/app/${CONFIG.PODIO_APP_ID}/filter`;
    
    const response = await axios.post(endpoint, 
      {
        limit: 100,
        offset: 0,
        sort_by: 'created_on',
        sort_desc: true
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`📥 Fetched ${response.data.items.length} appointments from Podio`);
    return response.data.items;
  } catch (error) {
    console.error('❌ Error fetching Podio appointments:', error.response?.data || error.message);
    return [];
  }
}

// ============================================
// PROCESS PODIO APPOINTMENT
// ============================================
async function processPodioAppointment(podioItem) {
  try {
    // Extract fields from Podio item
    const fields = {};
    podioItem.fields.forEach(field => {
      fields[field.external_id] = field.values?.[0]?.value || field.values?.[0];
    });
    
    // Map Podio fields to Quickbase
    const appointmentData = {
      6: { value: fields['customer-name'] || fields['name'] || 'Unknown' },
      7: { value: fields['customer-address'] || fields['address'] || '' },
      8: { value: fields['notes'] || fields['comments'] || '' },
      9: { value: 'New' },
      10: { value: 'Podio' },
      11: { value: '' }, // Hub - will be assigned
      12: { value: '' }, // Partner - will be assigned
      13: { value: podioItem.item_id.toString() }, // Podio Item ID for tracking
      14: { value: fields['appointment-date'] || new Date().toISOString() }
    };
    
    // Check if already exists in Quickbase
    const existing = await searchRecords(CONFIG.TABLE_APPOINTMENTS, `{13.EX.'${podioItem.item_id}'}`);
    
    if (existing.length > 0) {
      console.log(`⏭️ Appointment ${podioItem.item_id} already exists, skipping`);
      return null;
    }
    
    // Create in Quickbase
    const result = await createRecord(CONFIG.TABLE_APPOINTMENTS, appointmentData);
    
    if (result.data && result.data[0]) {
      const appointmentId = result.data[0]['3'].value;
      console.log(`✅ Created appointment ${appointmentId} from Podio item ${podioItem.item_id}`);
      
      // Trigger hub and partner assignment
      await assignHubAndPartners(appointmentId, fields['customer-address'] || '');
      
      return appointmentId;
    }
  } catch (error) {
    console.error(`❌ Error processing Podio item ${podioItem.item_id}:`, error.message);
    return null;
  }
}

// ============================================
// SYNC PODIO TO QUICKBASE
// ============================================
async function syncPodioToQuickbase() {
  console.log('🔄 Starting Podio sync...');
  
  try {
    const appointments = await fetchPodioAppointments();
    let created = 0;
    
    for (const appointment of appointments) {
      const result = await processPodioAppointment(appointment);
      if (result) created++;
    }
    
    console.log(`✅ Sync complete: ${created} new appointments created`);
    return { total: appointments.length, created };
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    return { error: error.message };
  }
}

// ============================================
// PARTNER CONFIGURATION (same as before)
// ============================================
function loadPartnerConfig() {
  const partners = [];
  
  for (let i = 1; i <= 100; i++) {
    const name = process.env[`PARTNER_${i}_NAME`];
    if (!name) continue;
    
    partners.push({
      id: i,
      name: name,
      hubs: (process.env[`PARTNER_${i}_HUBS`] || '').split(',').map(h => h.trim()),
      capacity: parseInt(process.env[`PARTNER_${i}_CAPACITY`] || '20'),
      priority: parseInt(process.env[`PARTNER_${i}_PRIORITY`] || '5'),
      active: process.env[`PARTNER_${i}_ACTIVE`] !== 'false',
      currentLoad: 0
    });
  }
  
  partners.sort((a, b) => a.priority - b.priority);
  console.log(`📋 Loaded ${partners.length} partners from environment`);
  return partners;
}

function loadHubConfig() {
  const hubs = [];
  
  for (let i = 1; i <= 50; i++) {
    const name = process.env[`HUB_${i}_NAME`];
    if (!name) continue;
    
    hubs.push({
      id: i,
      name: name,
      address: process.env[`HUB_${i}_ADDRESS`] || '',
      partners: (process.env[`HUB_${i}_PARTNERS`] || '').split(',').map(p => p.trim()),
      active: process.env[`HUB_${i}_ACTIVE`] !== 'false',
      capacity: parseInt(process.env[`HUB_${i}_CAPACITY`] || '100'),
      currentLoad: 0
    });
  }
  
  console.log(`🏢 Loaded ${hubs.length} hubs from environment`);
  return hubs;
}

let PARTNERS = loadPartnerConfig();
let HUBS = loadHubConfig();

// ============================================
// QUICKBASE API CLIENT
// ============================================
const qbApi = axios.create({
  baseURL: 'https://api.quickbase.com/v1',
  headers: {
    'QB-Realm-Hostname': CONFIG.QB_REALM,
    'Authorization': `QB-USER-TOKEN ${CONFIG.QB_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function createRecord(tableId, data) {
  try {
    const response = await qbApi.post('/records', {
      to: tableId,
      data: [data]
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Error creating record:`, error.response?.data || error.message);
    throw error;
  }
}

async function searchRecords(tableId, query) {
  try {
    const response = await qbApi.post('/records/query', {
      from: tableId,
      where: query
    });
    return response.data.data;
  } catch (error) {
    console.error(`❌ Error searching records:`, error.response?.data || error.message);
    return [];
  }
}

async function updateRecord(tableId, recordId, data) {
  try {
    const response = await qbApi.post('/records', {
      to: tableId,
      data: [{
        ...data,
        3: { value: recordId }
      }]
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Error updating record:`, error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// HUB AND PARTNER ASSIGNMENT
// ============================================
async function assignHubAndPartners(appointmentId, address) {
  console.log(`🗺️ Assigning hub and partners for appointment ${appointmentId}`);
  
  let assignedHub = CONFIG.DEFAULT_HUB || 'STL_MO';
  
  // Illinois override
  if (address && (address.includes('IL') || address.includes('Illinois'))) {
    assignedHub = 'STL_IL';
  }
  
  // Get available partners
  const partners = getPartnersForHub(assignedHub);
  const availablePartners = partners.filter(p => 
    p.currentLoad < p.capacity
  ).slice(0, 3);
  
  // Update appointment with hub
  await updateRecord(CONFIG.TABLE_APPOINTMENTS, appointmentId, {
    11: { value: assignedHub },
    9: { value: 'Previewing' }
  });
  
  // Create preview rounds
  for (const partner of availablePartners) {
    await createRecord(CONFIG.TABLE_PREVIEW_ROUNDS, {
      6: { value: appointmentId },
      7: { value: partner.name },
      8: { value: 'Active' },
      9: { value: new Date().toISOString() },
      10: { value: new Date(Date.now() + CONFIG.PREVIEW_WINDOW_MINUTES * 60000).toISOString() },
      11: { value: 1 },
      12: { value: assignedHub }
    });
  }
}

function getPartnersForHub(hubName) {
  const hub = HUBS.find(h => h.name === hubName);
  if (hub && hub.partners.length > 0) {
    return PARTNERS.filter(p => hub.partners.includes(p.name) && p.active);
  }
  return PARTNERS.filter(p => p.hubs.includes(hubName) && p.active);
}

// ============================================
// ENDPOINTS
// ============================================

// Manual sync trigger
app.post('/sync/podio', async (req, res) => {
  const result = await syncPodioToQuickbase();
  res.json(result);
});

// Get sync status
app.get('/sync/status', async (req, res) => {
  res.json({
    podio: {
      authenticated: !!podioAccessToken,
      tokenExpiry: podioTokenExpiry ? new Date(podioTokenExpiry).toISOString() : null,
      appId: CONFIG.PODIO_APP_ID,
      syncEnabled: CONFIG.SYNC_ENABLED,
      syncInterval: `${CONFIG.SYNC_INTERVAL_MINUTES} minutes`
    },
    quickbase: {
      realm: CONFIG.QB_REALM,
      appId: CONFIG.QB_APP_ID
    },
    lastSync: lastSyncTime || 'Never'
  });
});

// Webhook for Slack (kept for compatibility)
app.post('/webhook/slack-intake', async (req, res) => {
  console.log('📥 Slack intake webhook triggered');
  
  try {
    const text = req.body.text || '';
    const parts = text.split('|').map(p => p.trim());
    
    const appointmentData = {
      6: { value: parts[0] || 'Unknown' },
      7: { value: parts[1] || '' },
      8: { value: parts[2] || '' },
      9: { value: 'New' },
      10: { value: 'Slack' },
      11: { value: '' },
      12: { value: '' }
    };
    
    const result = await createRecord(CONFIG.TABLE_APPOINTMENTS, appointmentData);
    
    if (result.data && result.data[0]) {
      const appointmentId = result.data[0]['3'].value;
      await assignHubAndPartners(appointmentId, parts[1]);
    }
    
    res.json({
      response_type: 'in_channel',
      text: `✅ Appointment created for ${parts[0]}`
    });
  } catch (error) {
    console.error('❌ Slack intake error:', error);
    res.status(500).json({ text: '❌ Failed to create appointment' });
  }
});

// Webhook for claims
app.post('/webhook/claim', async (req, res) => {
  console.log('🎯 Claim webhook triggered');
  
  try {
    const { appointment_id, partner_name } = req.body;
    
    // Check if already claimed
    const existingClaims = await searchRecords(
      CONFIG.TABLE_CLAIMS,
      `{6.EX.'${appointment_id}'}AND{8.EX.'Approved'}`
    );
    
    if (existingClaims.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Appointment already claimed'
      });
    }
    
    // Create claim
    await createRecord(CONFIG.TABLE_CLAIMS, {
      6: { value: appointment_id },
      7: { value: partner_name },
      8: { value: 'Approved' },
      9: { value: new Date().toISOString() }
    });
    
    // Update appointment
    await updateRecord(CONFIG.TABLE_APPOINTMENTS, appointment_id, {
      9: { value: 'Claimed' },
      12: { value: partner_name }
    });
    
    // Increment partner load
    const partner = PARTNERS.find(p => p.name === partner_name);
    if (partner) partner.currentLoad++;
    
    res.json({
      success: true,
      message: 'Claim approved'
    });
  } catch (error) {
    console.error('❌ Claim error:', error);
    res.status(500).json({ success: false, message: 'Claim failed' });
  }
});

// Configuration endpoint
app.get('/config', (req, res) => {
  res.json({
    podio: {
      appId: CONFIG.PODIO_APP_ID,
      syncEnabled: CONFIG.SYNC_ENABLED,
      syncInterval: CONFIG.SYNC_INTERVAL_MINUTES
    },
    quickbase: {
      realm: CONFIG.QB_REALM,
      appId: CONFIG.QB_APP_ID
    },
    partners: PARTNERS.map(p => ({
      name: p.name,
      hubs: p.hubs,
      capacity: p.capacity,
      currentLoad: p.currentLoad,
      available: p.capacity - p.currentLoad
    })),
    hubs: HUBS.map(h => ({
      name: h.name,
      capacity: h.capacity,
      currentLoad: h.currentLoad,
      active: h.active
    }))
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    podioConnected: !!podioAccessToken,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// SCHEDULED TASKS
// ============================================
let lastSyncTime = null;

// Sync from Podio every X minutes
if (CONFIG.SYNC_ENABLED) {
  cron.schedule(`*/${CONFIG.SYNC_INTERVAL_MINUTES} * * * *`, async () => {
    console.log('⏰ Running scheduled Podio sync');
    const result = await syncPodioToQuickbase();
    lastSyncTime = new Date().toISOString();
  });
}

// Escalation timer
cron.schedule('*/15 * * * *', async () => {
  console.log('⏰ Running escalation check');
  
  try {
    const activeRounds = await searchRecords(
      CONFIG.TABLE_PREVIEW_ROUNDS,
      `{8.EX.'Active'}`
    );
    
    for (const round of activeRounds) {
      const createdTime = new Date(round['9']?.value);
      const ageInMinutes = (Date.now() - createdTime) / 60000;
      
      if (ageInMinutes >= CONFIG.ESCALATION_MINUTES) {
        await updateRecord(CONFIG.TABLE_PREVIEW_ROUNDS, round['3'].value, {
          8: { value: 'Expired' }
        });
      }
    }
  } catch (error) {
    console.error('❌ Escalation error:', error);
  }
});

// Daily reset
cron.schedule('0 0 * * *', () => {
  console.log('🌅 Running daily reset');
  PARTNERS.forEach(p => p.currentLoad = 0);
  HUBS.forEach(h => h.currentLoad = 0);
});

// ============================================
// SERVER STARTUP
// ============================================
const server = app.listen(CONFIG.PORT, async () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   SEES PIPELINE SERVER WITH PODIO INTEGRATION             ║
║   Port: ${CONFIG.PORT}                                           ║
╠════════════════════════════════════════════════════════════╣
║   Podio Configuration:                                     ║
║   • App ID: ${CONFIG.PODIO_APP_ID}                                 ║
║   • Sync Enabled: ${CONFIG.SYNC_ENABLED}                             ║
║   • Sync Interval: ${CONFIG.SYNC_INTERVAL_MINUTES} minutes                    ║
║   • View: View for Zaps ALL for Future                    ║
╠════════════════════════════════════════════════════════════╣
║   Partners: ${PARTNERS.length} loaded                                 ║
║   Hubs: ${HUBS.length} loaded                                     ║
╠════════════════════════════════════════════════════════════╣
║   Endpoints:                                               ║
║   POST /sync/podio - Manual sync trigger                  ║
║   GET  /sync/status - Sync status                         ║
║   POST /webhook/slack-intake - Slack appointments         ║
║   POST /webhook/claim - Process claims                    ║
║   GET  /config - View configuration                       ║
║   GET  /health - Health check                             ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  // Initial Podio authentication
  try {
    await authenticatePodio();
    console.log('✅ Connected to Podio');
    
    // Run initial sync
    if (CONFIG.SYNC_ENABLED) {
      console.log('🔄 Running initial sync...');
      await syncPodioToQuickbase();
    }
  } catch (error) {
    console.error('⚠️ Failed to connect to Podio:', error.message);
  }
});

process.on('SIGTERM', () => {
  console.log('📛 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;