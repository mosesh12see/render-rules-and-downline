# 🚀 Render Rules and Downline

## Environment-Configurable Pipeline Server for SEES

A fully configurable Node.js server that handles appointment routing, partner assignments, and pipeline workflows - all controlled via environment variables in Render dashboard.

## ✨ Features

- **100% Environment Variable Configuration** - No code changes needed
- **Dynamic Partner Management** - Add/remove partners via env vars
- **Dynamic Hub Configuration** - Configure hubs without touching code
- **Business Rules Engine** - All thresholds and limits configurable
- **Automatic Escalation** - Timer-based preview round escalation
- **Capacity Management** - Daily limits and load balancing
- **Real-time Configuration** - Reload config without restart

## 🎯 Quick Start

### 1. Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### 2. Configure Environment Variables

Copy variables from `RENDER_ENV_TEMPLATE.env` to Render Dashboard:

```env
# Core Configuration
QUICKBASE_REALM=generationsolar.quickbase.com
QUICKBASE_TOKEN=your_token_here
QUICKBASE_APP_ID=bvd8uwsd6

# Add Partners
PARTNER_1_NAME=John Smith
PARTNER_1_HUBS=STL_MO,KC_MO
PARTNER_1_CAPACITY=30

# Add Hubs
HUB_1_NAME=STL_MO
HUB_1_ADDRESS=123 Main St, St Louis, MO
HUB_1_CAPACITY=100
```

### 3. Test Your Setup

```bash
# Check configuration
curl https://your-app.onrender.com/config

# View status
curl https://your-app.onrender.com/status

# Health check
curl https://your-app.onrender.com/health
```

## 📋 Environment Variables

### Core Settings
- `QUICKBASE_REALM` - Your Quickbase realm
- `QUICKBASE_TOKEN` - API token
- `QUICKBASE_APP_ID` - Application ID
- `GOOGLE_MAPS_API` - Google Maps API key

### Business Rules
- `MAX_DAILY_APPOINTMENTS` - Daily appointment limit (default: 100)
- `ESCALATION_MINUTES` - Minutes before escalation (default: 15)
- `ESCALATION_ROUNDS` - Number of rounds (default: 3)
- `PREVIEW_WINDOW_MINUTES` - Preview duration (default: 15)

### Partner Configuration
```env
PARTNER_[NUMBER]_NAME=Partner Name
PARTNER_[NUMBER]_HUBS=HUB1,HUB2
PARTNER_[NUMBER]_CAPACITY=50
PARTNER_[NUMBER]_PRIORITY=1
PARTNER_[NUMBER]_ACTIVE=true
```

### Hub Configuration
```env
HUB_[NUMBER]_NAME=Hub Name
HUB_[NUMBER]_ADDRESS=Full Address
HUB_[NUMBER]_PARTNERS=Partner1,Partner2
HUB_[NUMBER]_CAPACITY=100
HUB_[NUMBER]_ACTIVE=true
```

## 🔧 API Endpoints

### Webhooks
- `POST /webhook/slack-intake` - Receive appointments from Slack
- `POST /webhook/claim` - Process partner claims

### Configuration
- `GET /config` - View current configuration
- `POST /config/reload` - Reload from environment

### Monitoring
- `GET /health` - Health check
- `GET /status` - System status and capacity

## 📊 Helper Functions

The server provides these internal helper functions:

- `getPartnersForHub(hubName)` - Get partners for a specific hub
- `getPartnerCapacity(partnerName)` - Check remaining capacity
- `shouldEscalate(appointmentAge)` - Determine if escalation needed
- `getNextAvailablePartner(hubName, round)` - Get next available partners

## 🔄 Dynamic Updates

### Add New Partner
1. Go to Render Dashboard → Environment
2. Add partner variables:
   ```
   PARTNER_5_NAME=New Partner
   PARTNER_5_HUBS=STL_MO
   PARTNER_5_CAPACITY=40
   ```
3. Save (auto-restarts) or call `/config/reload`

### Adjust Business Rules
```env
ESCALATION_MINUTES=20
MAX_DAILY_APPOINTMENTS=150
```

### Disable Partner
```env
PARTNER_3_ACTIVE=false
```

## 📅 Scheduled Tasks

Configured via cron expressions:

- **Escalation:** `*/15 * * * *` (every 15 minutes)
- **Daily Reset:** `0 0 * * *` (midnight)
- **Health Check:** `*/5 * * * *` (every 5 minutes)

## 🏗️ Architecture

```
┌─────────────────┐
│   Slack/Web    │
│    Webhooks    │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Server  │◄──── Environment Variables
    │  Logic  │      (Partners, Hubs, Rules)
    └────┬────┘
         │
   ┌─────▼─────┐
   │ Quickbase │
   │    API    │
   └───────────┘
```

## 📝 Configuration Files

- `pipeline_server.js` - Main server application
- `package.json` - Dependencies
- `RENDER_ENV_TEMPLATE.env` - Environment variable template
- `ENV_CONFIG_GUIDE.md` - Detailed configuration guide

## 🚨 Important Notes

1. **Priority:** Lower numbers = higher priority (1 is highest)
2. **Capacity:** Resets daily at midnight
3. **Escalation:** Automatic after configured minutes
4. **No Code Changes:** Everything via environment variables

## 📦 Dependencies

- `express` - Web framework
- `axios` - HTTP client
- `node-cron` - Task scheduler
- `dotenv` - Environment variables

## 🤝 Support

For issues or questions:
1. Check `/config` endpoint for current settings
2. View `/status` for system state
3. Review `ENV_CONFIG_GUIDE.md` for detailed help

## 📄 License

MIT

---

**Built for SEES - Solar Energy Evaluation System**  
*Manage everything from Render Dashboard - No code changes needed!*