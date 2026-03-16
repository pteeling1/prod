# AZURE DEPLOYMENT GUIDE

This guide walks you through deploying the AX Calculator backend to Azure.

## Prerequisites

- Azure subscription (free tier works)
- Azure CLI installed: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
- Node.js 18+ installed
- GitHub repo with your code (for SWA deployment)

## Architecture

```
Your Domain (GoDaddy DNS)
    ↓ CNAME
Azure Static Web App (Frontend)
    ↓ HTTPS to backend
Azure App Service OR Azure Functions (Backend API)
    ↓
Azure Cosmos DB (Database)
```

---

## PART 1: Create Azure Resources

### 1.1 Login to Azure

```bash
az login
```

This opens a browser to authenticate. After login, close the browser.

### 1.2 Create Resource Group

```bash
az group create \
  --name ax-calculator \
  --location eastus
```

Choose location nearest to you: `eastus`, `westus`, `northeurope`, `southeastasia`

### 1.3 Create Cosmos DB Account

```bash
az cosmosdb create \
  --name ax-calculator-db \
  --resource-group ax-calculator \
  --kind MongoDB \
  --locations regionName=eastus \
  --enable-free-tier
```

This creates a **free-tier Cosmos DB** account.

Wait for it to complete (~5 minutes).

### 1.4 Get Cosmos DB Connection String

```bash
az cosmosdb keys list \
  --name ax-calculator-db \
  --resource-group ax-calculator \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv
```

Copy this value — you'll need it for `.env`

### 1.5 Create App Service Plan

```bash
az appservice plan create \
  --name ax-calculator-plan \
  --resource-group ax-calculator \
  --sku FREE
```

### 1.6 Create App Service (Backend)

```bash
az webapp create \
  --resource-group ax-calculator \
  --plan ax-calculator-plan \
  --name ax-calculator-api \
  --runtime "node|18"
```

Your backend URL will be: `https://ax-calculator-api.azurewebsites.net`

---

## PART 2: Configure Environment Variables

### 2.1 Create `.env` in `/backend`

Copy from `.env.example` and fill in real values:

```
PORT=3001
AUTH0_DOMAIN=your_auth0_domain.auth0.com
AUTH0_CLIENT_ID=your_spa_client_id
AUTH0_AUDIENCE=https://sizer.teeling.ai
AUTH0_CLIENT_SECRET=your_backend_secret_here

COSMOS_ENDPOINT=https://ax-calculator-db.documents.azure.com:443/
COSMOS_KEY=your_cosmos_master_key_here
COSMOS_DATABASE=ax-calculator
COSMOS_CONTAINER=configurations

NODE_ENV=production
```

### 2.2 Upload Secrets to Azure App Service

```bash
az webapp config appsettings set \
  --resource-group ax-calculator \
  --name ax-calculator-api \
  --settings AUTH0_DOMAIN=your_auth0_domain.auth0.com \
  AUTH0_CLIENT_ID=your_spa_client_id \
  AUTH0_CLIENT_SECRET=your_backend_secret \
  COSMOS_ENDPOINT=https://ax-calculator-db.documents.azure.com:443/ \
  COSMOS_KEY=your_cosmos_key \
  NODE_ENV=production
```

Or use Azure Portal:
1. Open `ax-calculator-api` in Azure Portal
2. Settings → Configuration
3. Click "New application setting"
4. Add each key-value pair

---

## PART 3: Deploy Backend Code

### 3.1 Deploy from Git (Recommended)

If you have your code on GitHub:

```bash
az webapp deployment source config-zip \
  --resource-group ax-calculator \
  --name ax-calculator-api \
  --src ./backend.zip
```

Or use GitHub Actions (Azure provides a template).

### 3.2 Deploy Manually

```bash
# From /backend directory
cd backend

# Install dependencies
npm install

# Create deployment package
zip -r ../backend.zip . -x "node_modules/*"

# Deploy
az webapp deployment source config-zip \
  --resource-group ax-calculator \
  --name ax-calculator-api \
  --src ../backend.zip
```

### 3.3 Verify Deployment

```bash
curl https://ax-calculator-api.azurewebsites.net/api/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "...",
  "database": "connected"
}
```

---

## PART 4: Update Frontend Configuration

### 4.1 Update `.env` for Frontend

In your /dev directory, update `.env`:

```
VITE_AUTH0_DOMAIN=your_auth0_domain.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id
VITE_AUTH0_AUDIENCE=https://sizer.teeling.ai
VITE_API_URL=https://ax-calculator-api.azurewebsites.net/api
```

### 4.2 Push to GitHub

```bash
git add .
git commit -m "Add Auth0 integration and save/load functionality"
git push origin main
```

Azure Static Web App auto-deploys on push.

---

## PART 5: Connect Domain to Backend

Your frontend on Static Web App needs to call the backend API.

### Option A: Via Azure Static Web App Settings (Recommended)

1. Open your Static Web App in Azure Portal
2. Settings → Configuration
3. Add Routing Rule:
   ```
   Route: /api/*
   Allowed roles: *
   Rewrite path: 
   Backend address: https://ax-calculator-api.azurewebsites.net
   ```

This proxies `/api/*` calls to your backend.

### Option B: Direct API Calls (Already Configured)

Your frontend JS already calls:
```javascript
const API_BASE = import.meta.env.VITE_API_URL || 'https://dev.teeling.ai/api';
```

Just make sure `VITE_API_URL` is set correctly.

---

## PART 6: Test End-to-End

1. **Login Test:**
   - Go to https://sizer.teeling.ai
   - Click "Login"
   - Create test account in Auth0
   - Should return to app logged in

2. **Save Test:**
   - Configure a sizing
   - Click "Save Configuration"
   - Enter name + description
   - Should see success message

3. **Load Test:**
   - Refresh page
   - Click "Load Configuration"
   - Should see your saved config in dropdown
   - Click to restore

4. **API Test:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://ax-calculator-api.azurewebsites.net/api/configs
   ```

   Should return your configurations

---

## Troubleshooting

### Backend won't start
```bash
az webapp log tail --resource-group ax-calculator --name ax-calculator-api
```

### CORS errors
- Check `CORS` origins in backend server.js
- Make sure `sizer.teeling.ai` is in allowed origins

### 401 Unauthorized on API calls
- Check Auth0 tokens are valid
- Verify `AUTH0_DOMAIN` matches in backend
- Check `JWT_AUDIENCE` is correct

### Cosmos DB connection fails
- Verify `COSMOS_ENDPOINT` and `COSMOS_KEY` are correct
- Check IP whitelist (free tier has more restrictive rules)
- Run: `az cosmosdb show --name ax-calculator-db --resource-group ax-calculator`

---

## Monitoring & Logs

### View Backend Logs

```bash
az webapp log tail \
  --resource-group ax-calculator \
  --name ax-calculator-api \
  --tail
```

### View Application Insights

1. Open ax-calculator-api in Azure Portal
2. Settings → Application Insights
3. Click the link to view metrics

### Monitor Cosmos DB

```bash
az monitor metrics list \
  --resource ax-calculator-db \
  --resource-group ax-calculator
```

---

## Cost Estimate

For production with free tiers:

| Resource | Free Tier | Cost |
|----------|-----------|------|
| App Service | 1 free per subscription | $0 |
| Cosmos DB | 1,000 RU/s, 25 GB | $0 |
| Static Web App | Included | $0 |
| **Total** | | **$0/month** |

If you exceed free tiers:
- App Service: $14–250/month (depending on instance)
- Cosmos DB: $1.25 per 100 RU/s

---

## Next Steps

1. ✅ Auth0 configured (see SETUP_AUTH0.md)
2. ✅ Cosmos DB created
3. ✅ Backend deployed to App Service
4. ✅ Frontend updated with Auth0 + save/load
5. 🔄 Test end-to-end
6. 🔄 Monitor logs and errors
7. 🔄 Add SSL certificate (optional, Azure provides free)

Once everything works and you're happy with it in Dev, repeat the same steps for production (`sizer.teeling.ai`).
