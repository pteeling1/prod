# AX Calculator with Configuration Save/Load

Complete production-ready implementation of user authentication, configuration persistence, and cloud backend for the AX Calculator sizing tool.

## 📋 What's New

This implementation adds:

✅ **User Authentication** (Auth0)  
✅ **Save Configurations** (Cloud-backed, per-user)  
✅ **Load Configurations** (Restore complete state)  
✅ **Delete Configurations** (Manage saved work)  
✅ **Backend API** (Node.js Express, production-ready)  
✅ **Database** (Azure Cosmos DB, free tier)  
✅ **Zero Additional Cost** ($0/month)

---

## 🚀 Quick Start

### Phase 1: Set Up Auth0 (30 minutes)

1. **Read** [`SETUP_AUTH0.md`](./SETUP_AUTH0.md) for detailed steps
2. **Summary:**
   - Create Auth0 account at https://auth0.com (free tier)
   - Create SPA application
   - Configure callback URLs (dev.teeling.ai, sizer.teeling.ai, localhost)
   - Copy credentials to `.env`

### Phase 2: Deploy Backend (1-2 hours)

1. **Read** [`DEPLOYMENT.md`](./DEPLOYMENT.md) for detailed steps
2. **Summary:**
   - Create Azure Resource Group
   - Deploy Cosmos DB (free tier)
   - Deploy Node.js backend to Azure App Service
   - Configure environment variables

### Phase 3: Test (15 minutes)

1. Start local dev: `python -m http.server 8000`
2. Login with Auth0
3. Save a configuration
4. Refresh page
5. Load saved configuration

---

## 📁 What's Included

### Frontend (Already in index.html)

```
/js/
├── auth.js                  # Auth0 integration
├── configSerializer.js      # Serialize/deserialize state
├── storageProvider.js       # API calls to backend
└── main.js                  # Updated with save/load handlers

/
├── index.html               # Updated with login + save/load UI
├── .env.example             # Configuration template
├── SETUP_AUTH0.md          # Auth0 setup guide
└── DEPLOYMENT.md           # Azure deployment guide
```

### Backend (New /backend folder)

```
/backend/
├── server.js               # Express.js API server
├── package.json            # Node.js dependencies
├── function_app.py         # Azure Functions wrapper
└── .env                    # Backend configuration (create from .env.example)
```

---

## 🔧 Configuration

### Frontend Environment (.env)

```bash
VITE_AUTH0_DOMAIN=your-app.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id
VITE_AUTH0_AUDIENCE=https://sizer.teeling.ai
VITE_API_URL=https://ax-calculator-api.azurewebsites.net/api
# For local dev:
# VITE_API_URL=http://localhost:3001/api
```

### Backend Environment (/backend/.env)

```bash
PORT=3001
AUTH0_DOMAIN=your-app.us.auth0.com
AUTH0_CLIENT_ID=your_spa_client_id
AUTH0_CLIENT_SECRET=your_backend_secret
AUTH0_AUDIENCE=https://sizer.teeling.ai

COSMOS_ENDPOINT=https://your-cosmosdb-name.documents.azure.com:443/
COSMOS_KEY=your_cosmos_primary_key
COSMOS_DATABASE=ax-calculator
COSMOS_CONTAINER=configurations

NODE_ENV=production
```

---

## 🌐 API Endpoints

All endpoints require `Authorization: Bearer {auth0_token}` header.

### Save Configuration
```
POST /api/configs
Body: { metadata, uiState, calculation, state }
Response: { configId, success: true }
```

### Load Configurations
```
GET /api/configs
Response: [ { id, metadata, uiState, ... }, ... ]
```

### Load Single Configuration
```
GET /api/configs/{configId}
Response: { id, metadata, uiState, ... }
```

### Update Configuration
```
PUT /api/configs/{configId}
Body: { metadata, uiState, calculation, ... }
Response: { configId, success: true }
```

### Delete Configuration
```
DELETE /api/configs/{configId}
Response: { success: true }
```

### Health Check
```
GET /api/health
Response: { status: "ok", database: "connected" }
```

---

## 💾 Data Structure

Each saved configuration includes:

```javascript
{
  metadata: {
    id: "config_1234567890_abc123",
    name: "Production Cluster v2",
    description: "50 users, AX 760",
    createdDate: "2026-03-10T14:30:00Z",
    lastModified: "2026-03-10T15:45:00Z"
  },
  uiState: {
    manual: {
      nodeCount: 4,
      nodeType: "AX 760",
      cpuChoice: "32 cores",
      memorySize: "256 GB",
      disksPerNode: 4,
      diskSize: "3.84",
      resiliency: "3-Way Mirror",
      clusterType: "Non-Converged",
      switchMode: "separate",
      connectionType: "Twinax",
      pptxTheme: "dark"
    },
    sizingMode: "vm",
    vmCount: 50,
    vCPUsPerVM: 2,
    vcpuRatio: 4,
    ramPerVM: 8,
    storagePerVM: 100,
    universal: {
      disconnectedOpsEnabled: false,
      haLevel: "n+1",
      growthFactorPercent: 0
    }
  },
  calculation: {
    input: {
      // window.originalRequirements captured at save time
      totalCPU: 25,
      totalRAM: 400,
      totalStorage: 4.88,
      growthPct: 0,
      haLevel: "n+1",
      chassisModel: "AX 760"
    },
    output: {
      // window.lastSizingResult captured at save time
      cpuModel: "Xeon Gold 6348",
      nodeCount: 4,
      totalCores: 128,
      // ... full sizing output
    },
    cableInfo: {
      cableSummaryText: "...",
      cableCount: 24,
      cableLabel: "..."
    }
  },
  state: {
    requirementslocked: false,
    isManualMode: false
  }
}
```

---

## 🔐 Security

- ✅ Passwords never stored or transmitted by you (Auth0 handles)
- ✅ All API calls use HTTPS
- ✅ JWT tokens validated on every API call
- ✅ Row-level security: Users can only access their own configurations
- ✅ Secrets stored in Azure Key Vault / App Service config (not in code)
- ✅ Cosmos DB encryption at rest

---

## 💰 Cost

| Component | Free Tier | Your Usage | Cost |
|-----------|-----------|-----------|------|
| **Static Web App** | ✅ Free | Unlimited | **$0/mo** |
| **App Service** | 1 free tier | 1 | **$0/mo** |
| **Cosmos DB** | 1,000 RU/s, 25GB | ~1 RU/s, 25MB | **$0/mo** |
| **Auth0** | 7,000 users/mo | ~1,000 | **$0/mo** |
| **Total** | | | **$0/mo** |

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed breakdown and scaling costs.

---

## 🐛 Troubleshooting

### "Login button doesn't appear"
- Check browser console for errors
- Verify `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` in `.env`
- Confirm `.env` is loaded (Vite must be restarted after changing)

### "Can't save configuration"
- Confirm you're logged in
- Check browser console for API errors
- Verify `VITE_API_URL` points to correct backend
- Test API health: `curl https://your-backend/api/health`

### "Saved configs don't appear after logout/login"
- Config loading is lazy (only loads when you login + click Load)
- Check browser console for API errors
- Verify Cosmos DB is connected: `az cosmosdb show --name ax-calculator-db --resource-group ax-calculator`

### "401 Unauthorized on API calls"
- Token might be expired (refresh token should handle this)
- Verify Auth0 domain matches in both frontend and backend `.env`
- Check `APPLICATION_AUDIENCE` matches in Auth0 API settings

### Backend won't start
```bash
# Check for errors
cd backend
npm install
npm run dev

# View Azure logs
az webapp log tail --resource-group ax-calculator --name ax-calculator-api
```

---

## 📚 Related Guides

| Step | Document |
|------|----------|
| Set up Auth0 | [SETUP_AUTH0.md](./SETUP_AUTH0.md) |
| Deploy to Azure | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| API Reference | See "API Endpoints" above |

---

## 🚢 Deployment Levels

### Development (dev.teeling.ai)
- Local backend: `npm run dev` in `/backend`
- Local frontend: `python -m http.server 8000`
- Or use Azure Static Web App on dev.teeling.ai + remote backend

### Staging
- Same as dev with production database connection
- Test with real Auth0 credentials

### Production (sizer.teeling.ai)
- Frontend deployed to Azure Static Web App
- Backend deployed to Azure App Service (or Azure Functions)
- Using production Auth0 app + Cosmos DB

---

## 🔄 Workflow for Users

1. **First Time:**
   - Click "Login"
   - Create Auth0 account
   - Configure sizing
   - Click "Save Configuration"
   - Enter name + description
   - ✅ Saved!

2. **Return Visit:**
   - Click "Login"
   - Click "Load Configuration"
   - Select saved config
   - ✅ All state restored!
   - Can modify and save as new version

3. **Delete Old Configs:**
   - In "Load Configuration" panel
   - Click 🗑️ on config
   - Confirm deletion
   - ✅ Deleted

---

## 📞 Support

- Auth0 docs: https://auth0.com/docs
- Azure docs: https://learn.microsoft.com/en-us/azure/
- This codebase: See comments in code files

---

## 📝 License

MIT — See LICENSE file

---

## ✅ Checklist for Launch

- [ ] Read SETUP_AUTH0.md
- [ ] Create Auth0 account + app
- [ ] Copy Auth0 credentials to `.env`
- [ ] Read DEPLOYMENT.md
- [ ] Create Azure Resource Group + Cosmos DB
- [ ] Deploy backend to App Service
- [ ] Update `VITE_API_URL` to point to backend
- [ ] Test login on dev.teeling.ai
- [ ] Test save configuration
- [ ] Test load configuration
- [ ] Test delete configuration
- [ ] Deploy to production (sizer.teeling.ai)
- [ ] Test production login + save/load
- [ ] Monitor logs for errors
- [ ] Done! 🎉
