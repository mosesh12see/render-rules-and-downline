// SEES Pipeline Server - Fully Configurable via Environment Variables
// All partner routing, hub assignments, and business rules are controlled through env vars
// Deploy on Render and manage everything from the dashboard

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
// All configuration is read from environment variables
// This allows complete control from Render dashboard without code changes

const CONFIG = {
  // Core Quickbase Configuration
  QB_REALM: process.env.QUICKBASE_REALM || 'generationsolar.quickbase.com',
  QB_TOKEN: process.env.QUICKBASE_TOKEN || 'b6qaq4_pywt_0_d4jy93kcjrtektcgv59xvmwv7xp',
  QB_APP_ID: process.env.QUICKBASE_APP_ID || 'bvd8uwsd6',
  
  // Google Maps API
  GOOGLE_MAPS_API: process.env.GOOGLE_MAPS_API || 'AIzaSyBVezgyoAm_oSwU2nd9XHLd-oS1kB7WWGI',
  
  // Server Configuration
  PORT: process.env.PORT || 3000,
  TIMEZONE: process.env.TIMEZONE || 'America/Los_Angeles',
  
  // Business Rules - Thresholds and Limits
  MAX_DAILY_APPOINTMENTS: parseInt(process.env.MAX_DAILY_APPOINTMENTS || '100'),
  ESCALATION_MINUTES: parseInt(process.env.ESCALATION_MINUTES || '15'),
  ESCALATION_ROUNDS: parseInt(process.env.ESCALATION_ROUNDS || '3'),
  PREVIEW_WINDOW_MINUTES: parseInt(process.env.PREVIEW_WINDOW_MINUTES || '15'),
  CLAIM_EXPIRY_HOURS: parseInt(process.env.CLAIM_EXPIRY_HOURS || '24'),
  
  // Notification Settings
  SEND_SMS_NOTIFICATIONS: process.env.SEND_SMS_NOTIFICATIONS === 'true',
  SEND_EMAIL_NOTIFICATIONS: process.env.SEND_EMAIL_NOTIFICATIONS === 'true',
  NOTIFICATION_DELAY_SECONDS: parseInt(process.env.NOTIFICATION_DELAY_SECONDS || '0'),
  
  // Routing Rules
  ENABLE_ILLINOIS_OVERRIDE: process.env.ENABLE_ILLINOIS_OVERRIDE !== 'false', // Default true
  DEFAULT_HUB: process.env.DEFAULT_HUB || 'STL_MO',
  FALLBACK_HUB: process.env.FALLBACK_HUB || 'KC_MO',
  
  // Table IDs (can be overridden if needed)
  TABLE_APPOINTMENTS: process.env.TABLE_APPOINTMENTS || 'bvd8uws2t',
  TABLE_CLAIMS: process.env.TABLE_CLAIMS || 'bvd8uwtki',
  TABLE_HUBS: process.env.TABLE_HUBS || 'bvd8uwsk4',
  TABLE_PARTNERS: process.env.TABLE_PARTNERS || 'bvd8uwst2',
  TABLE_PREVIEW_ROUNDS: process.env.TABLE_PREVIEW_ROUNDS || 'bvd8uwtau',
  TABLE_PARTNER_HUB_ASSIGNMENTS: process.env.TABLE_PARTNER_HUB_ASSIGNMENTS || 'bvd83xibr',
  
  // Cron Schedule (can be customized)
  ESCALATION_CRON: process.env.ESCALATION_CRON || '*/15 * * * *', // Every 15 minutes
  DAILY_RESET_CRON: process.env.DAILY_RESET_CRON || '0 0 * * *',  // Midnight daily
  HEALTH_CHECK_CRON: process.env.HEALTH_CHECK_CRON || '*/5 * * * *', // Every 5 minutes
};

// ============================================
// DYNAMIC PARTNER CONFIGURATION
// ============================================
// Partners are configured via environment variables:
// PARTNER_1_NAME=PartnerName
// PARTNER_1_HUBS=STL_MO,KC_MO
// PARTNER_1_CAPACITY=50
// PARTNER_1_PRIORITY=1
// PARTNER_1_SPECIALTIES=solar,residential
// PARTNER_1_ACTIVE=true

function loadPartnerConfig() {
  const partners = [];
  
  // Load up to 100 partners from environment variables
  for (let i = 1; i <= 100; i++) {
    const name = process.env[`PARTNER_${i}_NAME`];
    if (!name) continue; // Skip if partner doesn't exist
    
    partners.push({
      id: i,
      name: name,
      hubs: (process.env[`PARTNER_${i}_HUBS`] || '').split(',').map(h => h.trim()),
      capacity: parseInt(process.env[`PARTNER_${i}_CAPACITY`] || '20'),
      priority: parseInt(process.env[`PARTNER_${i}_PRIORITY`] || '5'),
      specialties: (process.env[`PARTNER_${i}_SPECIALTIES`] || '').split(',').map(s => s.trim()),
      active: process.env[`PARTNER_${i}_ACTIVE`] !== 'false',
      phone: process.env[`PARTNER_${i}_PHONE`] || '',
      email: process.env[`PARTNER_${i}_EMAIL`] || '',
      maxDistance: parseInt(process.env[`PARTNER_${i}_MAX_DISTANCE`] || '50'),
      currentLoad: 0 // Track daily appointments
    });
  }
  
  // Sort by priority (lower number = higher priority)
  partners.sort((a, b) => a.priority - b.priority);
  
  console.log(`📋 Loaded ${partners.length} partners from environment`);
  return partners;
}

// ============================================
// DYNAMIC HUB CONFIGURATION
// ============================================
// Hubs are configured via environment variables:
// HUB_1_NAME=STL_MO
// HUB_1_ADDRESS=123 Main St, St Louis, MO
// HUB_1_PARTNERS=Partner1,Partner2,Partner3
// HUB_1_ACTIVE=true
// HUB_1_CAPACITY=100

function loadHubConfig() {
  const hubs = [];
  
  // Load up to 50 hubs from environment variables
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
      timezone: process.env[`HUB_${i}_TIMEZONE`] || CONFIG.TIMEZONE,
      manager: process.env[`HUB_${i}_MANAGER`] || '',
      managerEmail: process.env[`HUB_${i}_MANAGER_EMAIL`] || '',
      currentLoad: 0
    });
  }
  
  console.log(`🏢 Loaded ${hubs.length} hubs from environment`);
  return hubs;
}

// Load configurations
let PARTNERS = loadPartnerConfig();
let HUBS = loadHubConfig();

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get partners assigned to a specific hub
function getPartnersForHub(hubName) {
  // First check hub-specific partner list
  const hub = HUBS.find(h => h.name === hubName);
  if (hub && hub.partners.length > 0) {
    return PARTNERS.filter(p => hub.partners.includes(p.name) && p.active);
  }
  
  // Fall back to partners that list this hub
  return PARTNERS.filter(p => p.hubs.includes(hubName) && p.active);
}

// Get partner capacity remaining for today
function getPartnerCapacity(partnerName) {
  const partner = PARTNERS.find(p => p.name === partnerName);
  if (!partner) return 0;
  return Math.max(0, partner.capacity - partner.currentLoad);
}

// Check if appointment should be escalated
function shouldEscalate(appointmentCreatedTime) {
  const ageInMinutes = (Date.now() - new Date(appointmentCreatedTime).getTime()) / 60000;
  return ageInMinutes >= CONFIG.ESCALATION_MINUTES;
}

// Get next available partner for a hub
function getNextAvailablePartner(hubName, roundNumber = 1) {
  const partners = getPartnersForHub(hubName);
  
  // Filter by capacity
  const availablePartners = partners.filter(p => getPartnerCapacity(p.name) > 0);
  
  // Return partners for the current round (3 per round)
  const startIndex = (roundNumber - 1) * 3;
  return availablePartners.slice(startIndex, startIndex + 3);
}

// Increment partner load
function incrementPartnerLoad(partnerName) {
  const partner = PARTNERS.find(p => p.name === partnerName);
  if (partner) {
    partner.currentLoad++;
    console.log(`📈 ${partnerName} load: ${partner.currentLoad}/${partner.capacity}`);
  }
}

// Reset daily loads (called at midnight)
function resetDailyLoads() {
  PARTNERS.forEach(p => p.currentLoad = 0);
  HUBS.forEach(h => h.currentLoad = 0);
  console.log('🔄 Daily loads reset');
}

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

// Create record in Quickbase
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

// Update record in Quickbase
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

// Search records in Quickbase
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

// ============================================
// CONFIGURATION ENDPOINT
// ============================================
app.get('/config', (req, res) => {
  // Show current configuration (sanitized - no tokens)
  const safeConfig = {
    realm: CONFIG.QB_REALM,
    appId: CONFIG.QB_APP_ID,
    timezone: CONFIG.TIMEZONE,
    rules: {
      maxDailyAppointments: CONFIG.MAX_DAILY_APPOINTMENTS,
      escalationMinutes: CONFIG.ESCALATION_MINUTES,
      escalationRounds: CONFIG.ESCALATION_ROUNDS,
      previewWindowMinutes: CONFIG.PREVIEW_WINDOW_MINUTES,
      claimExpiryHours: CONFIG.CLAIM_EXPIRY_HOURS,
      illinoisOverride: CONFIG.ENABLE_ILLINOIS_OVERRIDE,
      defaultHub: CONFIG.DEFAULT_HUB
    },
    partners: PARTNERS.map(p => ({
      name: p.name,
      hubs: p.hubs,
      capacity: p.capacity,
      currentLoad: p.currentLoad,
      available: p.capacity - p.currentLoad,
      priority: p.priority,
      active: p.active
    })),
    hubs: HUBS.map(h => ({
      name: h.name,
      partners: h.partners,
      capacity: h.capacity,
      currentLoad: h.currentLoad,
      active: h.active
    })),
    schedules: {
      escalation: CONFIG.ESCALATION_CRON,
      dailyReset: CONFIG.DAILY_RESET_CRON,
      healthCheck: CONFIG.HEALTH_CHECK_CRON
    }
  };
  
  res.json(safeConfig);
});

// ============================================
// RELOAD CONFIGURATION ENDPOINT
// ============================================
app.post('/config/reload', (req, res) => {
  // Reload partner and hub configurations from environment
  PARTNERS = loadPartnerConfig();
  HUBS = loadHubConfig();
  
  res.json({
    success: true,
    message: 'Configuration reloaded',
    partners: PARTNERS.length,
    hubs: HUBS.length
  });
});

// ============================================
// WEBHOOK: SLACK INTAKE
// ============================================
app.post('/webhook/slack-intake', async (req, res) => {
  console.log('📥 Slack intake webhook triggered');
  
  try {
    const text = req.body.text || '';
    const parts = text.split('|').map(p => p.trim());
    
    // Check daily limit
    const totalAppointmentsToday = HUBS.reduce((sum, h) => sum + h.currentLoad, 0);
    if (totalAppointmentsToday >= CONFIG.MAX_DAILY_APPOINTMENTS) {
      return res.json({
        response_type: 'ephemeral',
        text: `⚠️ Daily appointment limit reached (${CONFIG.MAX_DAILY_APPOINTMENTS})`
      });
    }
    
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

// ============================================
// HUB AND PARTNER ASSIGNMENT
// ============================================
async function assignHubAndPartners(appointmentId, address) {
  console.log(`🗺️ Assigning hub and partners for appointment ${appointmentId}`);
  
  // Determine hub based on address
  let assignedHub = CONFIG.DEFAULT_HUB;
  
  // Illinois override
  if (CONFIG.ENABLE_ILLINOIS_OVERRIDE && address) {
    if (address.includes('IL') || address.includes('Illinois')) {
      assignedHub = 'STL_IL';
    }
  }
  
  // Get available partners for this hub
  const availablePartners = getNextAvailablePartner(assignedHub, 1);
  
  if (availablePartners.length === 0) {
    console.log(`⚠️ No available partners for hub ${assignedHub}`);
    assignedHub = CONFIG.FALLBACK_HUB;
  }
  
  // Update appointment with hub
  await updateRecord(CONFIG.TABLE_APPOINTMENTS, appointmentId, {
    11: { value: assignedHub },
    9: { value: 'Previewing' }
  });
  
  // Create preview rounds for available partners
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
  
  // Increment hub load
  const hub = HUBS.find(h => h.name === assignedHub);
  if (hub) hub.currentLoad++;
}

// ============================================
// WEBHOOK: PROCESS CLAIM
// ============================================
app.post('/webhook/claim', async (req, res) => {
  console.log('🎯 Claim webhook triggered');
  
  try {
    const { appointment_id, partner_name, preview_round_id } = req.body;
    
    // Check partner capacity
    const capacity = getPartnerCapacity(partner_name);
    if (capacity <= 0) {
      return res.status(400).json({
        success: false,
        message: `Partner ${partner_name} has reached daily capacity`
      });
    }
    
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
    incrementPartnerLoad(partner_name);
    
    res.json({
      success: true,
      message: 'Claim approved',
      partnerCapacityRemaining: getPartnerCapacity(partner_name)
    });
  } catch (error) {
    console.error('❌ Claim error:', error);
    res.status(500).json({ success: false, message: 'Claim failed' });
  }
});

// ============================================
// SCHEDULED TASKS
// ============================================

// Escalation timer
cron.schedule(CONFIG.ESCALATION_CRON, async () => {
  console.log('⏰ Running escalation check');
  
  try {
    const activeRounds = await searchRecords(
      CONFIG.TABLE_PREVIEW_ROUNDS,
      `{8.EX.'Active'}`
    );
    
    for (const round of activeRounds) {
      if (shouldEscalate(round['9']?.value)) {
        // Mark as expired
        await updateRecord(CONFIG.TABLE_PREVIEW_ROUNDS, round['3'].value, {
          8: { value: 'Expired' }
        });
        
        // Create next round if under max rounds
        const roundNumber = parseInt(round['11']?.value || '1');
        if (roundNumber < CONFIG.ESCALATION_ROUNDS) {
          const nextPartners = getNextAvailablePartner(
            round['12']?.value,
            roundNumber + 1
          );
          
          for (const partner of nextPartners) {
            await createRecord(CONFIG.TABLE_PREVIEW_ROUNDS, {
              6: { value: round['6']?.value },
              7: { value: partner.name },
              8: { value: 'Active' },
              9: { value: new Date().toISOString() },
              10: { value: new Date(Date.now() + CONFIG.PREVIEW_WINDOW_MINUTES * 60000).toISOString() },
              11: { value: roundNumber + 1 },
              12: { value: round['12']?.value }
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Escalation error:', error);
  }
});

// Daily reset
cron.schedule(CONFIG.DAILY_RESET_CRON, () => {
  console.log('🌅 Running daily reset');
  resetDailyLoads();
});

// Health check
cron.schedule(CONFIG.HEALTH_CHECK_CRON, async () => {
  try {
    // Simple query to verify Quickbase connection
    await searchRecords(CONFIG.TABLE_APPOINTMENTS, "{3.GT.0}");
    console.log('💚 Health check passed');
  } catch (error) {
    console.error('💔 Health check failed:', error.message);
  }
});

// ============================================
// MONITORING ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    partners: PARTNERS.length,
    hubs: HUBS.length
  });
});

app.get('/status', (req, res) => {
  const totalCapacity = PARTNERS.reduce((sum, p) => sum + p.capacity, 0);
  const totalLoad = PARTNERS.reduce((sum, p) => sum + p.currentLoad, 0);
  
  res.json({
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    },
    capacity: {
      total: totalCapacity,
      used: totalLoad,
      available: totalCapacity - totalLoad,
      percentage: ((totalLoad / totalCapacity) * 100).toFixed(2) + '%'
    },
    partners: PARTNERS.map(p => ({
      name: p.name,
      load: `${p.currentLoad}/${p.capacity}`,
      available: p.capacity - p.currentLoad
    })),
    hubs: HUBS.map(h => ({
      name: h.name,
      load: h.currentLoad,
      active: h.active
    }))
  });
});

// ============================================
// SERVER STARTUP
// ============================================
const server = app.listen(CONFIG.PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   SEES PIPELINE SERVER - ENVIRONMENT CONFIGURED           ║
║   Port: ${CONFIG.PORT}                                           ║
╠════════════════════════════════════════════════════════════╣
║   Configuration:                                           ║
║   • Partners: ${PARTNERS.length} loaded                              ║
║   • Hubs: ${HUBS.length} loaded                                  ║
║   • Max Daily: ${CONFIG.MAX_DAILY_APPOINTMENTS}                            ║
║   • Escalation: ${CONFIG.ESCALATION_MINUTES} minutes                      ║
║   • Rounds: ${CONFIG.ESCALATION_ROUNDS}                                   ║
╠════════════════════════════════════════════════════════════╣
║   Endpoints:                                               ║
║   GET  /config - View current configuration               ║
║   POST /config/reload - Reload from environment           ║
║   POST /webhook/slack-intake - New appointments           ║
║   POST /webhook/claim - Process claims                    ║
║   GET  /health - Health check                             ║
║   GET  /status - System status                            ║
╠════════════════════════════════════════════════════════════╣
║   Scheduled Tasks:                                        ║
║   • Escalation: ${CONFIG.ESCALATION_CRON}                         ║
║   • Daily Reset: ${CONFIG.DAILY_RESET_CRON}                          ║
║   • Health Check: ${CONFIG.HEALTH_CHECK_CRON}                        ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  // Show loaded partners
  console.log('\n📋 LOADED PARTNERS:');
  PARTNERS.forEach(p => {
    console.log(`   • ${p.name}: Capacity ${p.capacity}, Hubs: ${p.hubs.join(', ')}`);
  });
  
  console.log('\n🏢 LOADED HUBS:');
  HUBS.forEach(h => {
    console.log(`   • ${h.name}: ${h.partners.length} partners, Capacity: ${h.capacity}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📛 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;