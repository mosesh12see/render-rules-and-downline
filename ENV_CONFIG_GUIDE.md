# 🎛️ SEES Pipeline Server - Environment Configuration Guide

## Overview
This server is **100% configurable via environment variables** - no code changes needed!
All partner routing, hub assignments, and business rules are managed through Render's dashboard.

## 🚀 Quick Deploy

1. **Deploy to Render:**
   ```bash
   cd /Users/mosesherrera/zapier/sees-base44
   git add .
   git commit -m "Environment-configurable pipeline server"
   git push
   ```

2. **Add Environment Variables in Render:**
   - Go to your service in Render Dashboard
   - Click "Environment" tab
   - Copy variables from `RENDER_ENV_TEMPLATE.env`
   - Paste and save

3. **Test Configuration:**
   ```
   GET https://your-app.onrender.com/config
   ```

## 📋 Environment Variables Reference

### Core Configuration
| Variable | Description | Default |
|----------|-------------|---------|
| `QUICKBASE_REALM` | Your Quickbase realm | generationsolar.quickbase.com |
| `QUICKBASE_TOKEN` | API token | (required) |
| `QUICKBASE_APP_ID` | App ID | bvd8uwsd6 |
| `GOOGLE_MAPS_API` | Google Maps API key | (required) |

### Business Rules
| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_DAILY_APPOINTMENTS` | Max appointments per day | 100 |
| `ESCALATION_MINUTES` | Minutes before escalation | 15 |
| `ESCALATION_ROUNDS` | Number of escalation rounds | 3 |
| `PREVIEW_WINDOW_MINUTES` | Preview window duration | 15 |
| `CLAIM_EXPIRY_HOURS` | Hours before claim expires | 24 |

### Routing Rules
| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_ILLINOIS_OVERRIDE` | IL addresses go to STL_IL | true |
| `DEFAULT_HUB` | Default hub assignment | STL_MO |
| `FALLBACK_HUB` | Backup hub if default full | KC_MO |

## 👥 Adding Partners

Partners are added via numbered environment variables:

```env
# Partner format: PARTNER_[NUMBER]_[PROPERTY]

PARTNER_5_NAME=New Partner Name
PARTNER_5_HUBS=STL_MO,KC_MO       # Comma-separated hub list
PARTNER_5_CAPACITY=50              # Daily appointment limit
PARTNER_5_PRIORITY=1               # 1=highest priority
PARTNER_5_SPECIALTIES=solar,residential
PARTNER_5_ACTIVE=true
PARTNER_5_PHONE=+13145551234
PARTNER_5_EMAIL=partner@example.com
PARTNER_5_MAX_DISTANCE=50          # Max miles from hub
```

### Partner Properties
- `NAME` - Partner's display name (required)
- `HUBS` - Comma-separated list of hub assignments
- `CAPACITY` - Daily appointment limit (default: 20)
- `PRIORITY` - Lower number = higher priority (default: 5)
- `SPECIALTIES` - Comma-separated specialties
- `ACTIVE` - true/false (default: true)
- `PHONE` - Phone number for SMS notifications
- `EMAIL` - Email for notifications
- `MAX_DISTANCE` - Maximum distance in miles

## 🏢 Adding Hubs

Hubs are added via numbered environment variables:

```env
# Hub format: HUB_[NUMBER]_[PROPERTY]

HUB_5_NAME=CHI_IL
HUB_5_ADDRESS=123 Michigan Ave, Chicago, IL 60601
HUB_5_PARTNERS=Partner1,Partner2,Partner3
HUB_5_ACTIVE=true
HUB_5_CAPACITY=100
HUB_5_TIMEZONE=America/Chicago
HUB_5_MANAGER=Manager Name
HUB_5_MANAGER_EMAIL=manager@example.com
```

### Hub Properties
- `NAME` - Hub identifier (required)
- `ADDRESS` - Full address for distance calculations
- `PARTNERS` - Comma-separated partner list
- `ACTIVE` - true/false (default: true)
- `CAPACITY` - Daily appointment capacity (default: 100)
- `TIMEZONE` - Hub timezone
- `MANAGER` - Hub manager name
- `MANAGER_EMAIL` - Manager email for escalations

## 🔧 Helper Functions Available

The server provides these helper functions internally:

### `getPartnersForHub(hubName)`
Returns all active partners assigned to a hub, sorted by priority.

### `getPartnerCapacity(partnerName)`
Returns remaining daily capacity for a partner.

### `shouldEscalate(appointmentAge)`
Checks if appointment should be escalated based on age.

### `getNextAvailablePartner(hubName, roundNumber)`
Returns next 3 available partners for preview round.

## 📊 Monitoring Endpoints

### GET /config
Shows current configuration (without sensitive data):
```json
{
  "rules": {
    "maxDailyAppointments": 100,
    "escalationMinutes": 15
  },
  "partners": [...],
  "hubs": [...]
}
```

### GET /status
Shows system status and capacity:
```json
{
  "capacity": {
    "total": 200,
    "used": 45,
    "available": 155,
    "percentage": "22.5%"
  },
  "partners": [
    {
      "name": "John Smith",
      "load": "12/30",
      "available": 18
    }
  ]
}
```

### POST /config/reload
Reloads configuration from environment without restart:
```bash
curl -X POST https://your-app.onrender.com/config/reload
```

## 🔄 Dynamic Updates

### Add New Partner Without Code Changes:
1. Go to Render Dashboard → Environment
2. Add new partner variables:
   ```
   PARTNER_6_NAME=New Partner
   PARTNER_6_HUBS=STL_MO
   PARTNER_6_CAPACITY=40
   ```
3. Save and Render will auto-restart
4. Or call `/config/reload` to reload without restart

### Adjust Business Rules:
1. Change environment variable:
   ```
   ESCALATION_MINUTES=20
   MAX_DAILY_APPOINTMENTS=150
   ```
2. Save and changes apply immediately

### Disable/Enable Partners:
```
PARTNER_3_ACTIVE=false
```

## 📅 Scheduled Tasks

Configured via cron expressions:

```env
# Every 15 minutes
ESCALATION_CRON=*/15 * * * *

# Daily at midnight
DAILY_RESET_CRON=0 0 * * *

# Every 5 minutes
HEALTH_CHECK_CRON=*/5 * * * *
```

## 🚨 Important Notes

1. **Partner Priority:** Lower numbers = higher priority (1 is highest)
2. **Hub Assignment:** Partners can be in multiple hubs
3. **Capacity Tracking:** Resets daily at midnight
4. **Escalation:** Automatic after ESCALATION_MINUTES
5. **Configuration Reload:** No restart needed with `/config/reload`

## 💡 Examples

### High-Volume Partner
```env
PARTNER_10_NAME=Super Partner
PARTNER_10_CAPACITY=100
PARTNER_10_PRIORITY=1
PARTNER_10_HUBS=STL_MO,KC_MO,STL_IL
```

### Specialized Partner
```env
PARTNER_11_NAME=Commercial Expert
PARTNER_11_SPECIALTIES=commercial,industrial
PARTNER_11_CAPACITY=20
PARTNER_11_MAX_DISTANCE=100
```

### Inactive Hub (Maintenance)
```env
HUB_2_ACTIVE=false
```

## 🔍 Debugging

Check configuration:
```bash
curl https://your-app.onrender.com/config
```

Check partner loads:
```bash
curl https://your-app.onrender.com/status
```

Reload after env changes:
```bash
curl -X POST https://your-app.onrender.com/config/reload
```

---

**Everything is controlled via environment variables - no code changes needed!**