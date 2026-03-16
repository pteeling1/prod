# AUTH0 SETUP GUIDE

This guide walks you through setting up Auth0 for the AX Calculator sizing tool.

## Step 1: Create Auth0 Account

1. Go to [auth0.com](https://auth0.com)
2. Sign up for a free account
3. Confirm your email

## Step 2: Create an Auth0 Application

1. In the Auth0 Dashboard, navigate to **Applications** → **Applications**
2. Click **Create Application**
3. Enter name: `AX Calculator`
4. Select application type: **Single Page Application**
5. Click **Create**

You'll be taken to the application settings page.

## Step 3: Configure Application Settings

### Application URIs

Update these fields:

- **Allowed Callback URLs:**
  ```
  https://sizer.teeling.ai
  https://sizer.teeling.ai/index.html
  https://dev.teeling.ai
  https://dev.teeling.ai/index.html
  http://localhost:8000
  http://localhost:3000
  ```

- **Allowed Logout URLs:**
  ```
  https://sizer.teeling.ai
  https://dev.teeling.ai
  http://localhost:8000
  ```

- **Allowed Web Origins:**
  ```
  https://sizer.teeling.ai
  https://dev.teeling.ai
  http://localhost:8000
  http://localhost:3000
  ```

Click **Save Changes**

## Step 4: Get Your Credentials

On the **Settings** tab, find and copy:

- **Domain** (e.g., `yourapp.us.auth0.com`)
- **Client ID** (long alphanumeric string)

⚠️ **Do NOT share these values!** Treat them like passwords.

## Step 5: Create API (Audience)

This tells Auth0 what API your app uses.

1. Navigate to **Applications** → **APIs**
2. Click **Create API**
3. Fill in:
   - **Name:** `AX Calculator API`
   - **Identifier:** `https://sizer.teeling.ai`
   - **Signing Algorithm:** `RS256` (default)
4. Click **Create**

## Step 6: Create Machine-to-Machine Application (For Backend)

Your backend needs to trust Auth0 tokens. Create an M2M app:

1. Navigate to **Applications** → **Applications**
2. Click **Create Application**
3. Enter name: `AX Calculator Backend`
4. Select application type: **Machine to Machine Applications**
5. Click **Create**
6. On the next screen, under "Authorized Applications", select your SPA app
7. Click **Authorize**

On the **Settings** tab, copy:
- **Client ID**
- **Client Secret** (for backend use only)

⚠️ **Never share the Client Secret!**

## Step 7: Store Credentials

Create a `.env` file in your dev root:

```
VITE_AUTH0_DOMAIN=yourapp.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id_here
VITE_AUTH0_AUDIENCE=https://sizer.teeling.ai
```

For backend (in `/backend/.env`):

```
AUTH0_DOMAIN=yourapp.us.auth0.com
AUTH0_CLIENT_ID=your_spa_client_id_here
AUTH0_AUDIENCE=https://sizer.teeling.ai
AUTH0_CLIENT_SECRET=your_backend_client_secret_here
```

## Step 8: Test Auth0 Login

1. Start your dev server: `python -m http.server 8000`
2. Open http://localhost:8000
3. Click "Login"
4. You should be redirected to Auth0
5. Create a test account or use an existing one
6. You should return to your app authenticated

## Troubleshooting

### "Invalid client"
- Check `VITE_AUTH0_CLIENT_ID` matches your SPA app

### "Invalid audience"
- Check `VITE_AUTH0_AUDIENCE` is correct (should be `https://sizer.teeling.ai`)

### "Redirect URI mismatch"
- Make sure your dev/prod URLs are in "Allowed Callback URLs"

### Token validation fails
- Verify `AUTH0_DOMAIN` is correct in backend `.env`
- Check `AUTH0_AUDIENCE` matches

## Next Steps

Once Auth0 is configured:
1. Deploy backend to Azure
2. Update `VITE_API_URL` to point to your backend
3. Test save/load functionality

See `DEPLOYMENT.md` for full deployment guide.
