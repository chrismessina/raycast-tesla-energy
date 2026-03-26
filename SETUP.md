# Tesla Fleet API — Raycast Extension Setup

Complete procedure for registering a Tesla Fleet API application and connecting it to a Raycast extension via OAuth.

---

## Prerequisites

- A [Tesla Developer account](https://developer.tesla.com)
- A domain you control (used for app origin and public key hosting)
- A GitHub account (for hosting the public key via GitHub Pages)
- [Raycast](https://raycast.com) installed with the extension scaffolded

---

## Part 1: Register a Tesla Fleet API Application

1. Go to [developer.tesla.com](https://developer.tesla.com) and sign in
2. Create a new application — work through the multi-step form:

### Registration

- Fill in app name, description, and contact details

### Application Details

- Set intended use, client type, etc.

### Client Details

- **OAuth Grant Type**: Authorization Code and Machine-to-Machine
- **Allowed Origin URL(s)**: `https://oauth.raycast.com` _(temporary — update after partner registration)_
- **Allowed Redirect URI(s)**: `https://oauth.raycast.com/redirect`
- Leave "Allowed Returned URL(s)" blank

### API & Scopes

- Select **`energy_device_data`** — covers solar generation, Powerwall status, grid usage, energy history
- Skip `energy_cmds` for read-only access
- Skip Profile Information unless needed

### Billing Details (Optional)

- Skip unless required

1. Complete registration — you'll receive a **Client ID** and **Client Secret**. Store these securely.

---

## Part 2: Generate an EC Key Pair

Tesla requires an EC public key hosted on your domain for partner registration.

```bash
# Generate private key (keep this secret — never commit to git)
openssl ecparam -name prime256v1 -genkey -noout -out private-key.pem

# Extract public key (this gets hosted publicly)
openssl ec -in private-key.pem -pubout -out public-key.pem
```

Store `private-key.pem` securely (e.g. in 1Password or a local secrets folder). Only `public-key.pem` is shared.

---

## Part 3: Host the Public Key via GitHub Pages

Tesla requires the public key to be served at:

```
https://<your-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem
```

### 3a. Create a GitHub repo for key hosting

Create a new **public** repo (e.g. `tesla-signing`) — keep it separate from your extension repo.

### 3b. Push the required files

```
.nojekyll                                          ← disables Jekyll (required for dotfile paths)
CNAME                                              ← your custom domain, one line
.well-known/
  appspecific/
    com.tesla.3p.public-key.pem                    ← your public key
README.md                                          ← optional documentation
```

`.nojekyll` must be an empty file — without it, GitHub Pages (Jekyll) will ignore `.well-known/`.

`CNAME` content (one line, no trailing slash):

```
tesla-api.yourdomain.com
```

### 3c. Enable GitHub Pages

In the repo: **Settings → Pages → Source: Deploy from branch `main` / `/ (root)`**

### 3d. Add a DNS CNAME record

At your domain registrar, add:

| Type | Name | Value |
|------|------|-------|
| `CNAME` | `tesla-api` | `youruser.github.io` |

Wait for DNS propagation (typically 5–30 minutes). Verify with:

```bash
dig tesla-api.yourdomain.com CNAME +short
# Should return: youruser.github.io.
```

Verify the key is accessible:

```bash
curl -sI https://tesla-api.yourdomain.com/.well-known/appspecific/com.tesla.3p.public-key.pem
# Should return: HTTP/2 200
```

---

## Part 4: Register the App in the Tesla Fleet API Region

This one-time step registers your client ID to make API calls in a specific region (e.g. North America). Without it, all API calls return `412 Precondition Failed`.

### 4a. Get a partner token (app-level, not user-level)

```bash
PARTNER_TOKEN=$(curl -s --request POST \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode 'client_id=YOUR_CLIENT_ID' \
  --data-urlencode 'client_secret=YOUR_CLIENT_SECRET' \
  --data-urlencode 'scope=openid' \
  --data-urlencode 'audience=https://fleet-api.prd.na.vn.cloud.tesla.com' \
  'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token' | jq -r '.access_token')
```

### 4b. Register the domain

```bash
curl -s --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $PARTNER_TOKEN" \
  --data '{"domain": "tesla-api.yourdomain.com"}' \
  'https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/partner_accounts'
```

A successful response looks like:

```json
{
  "response": {
    "client_id": "...",
    "domain": "tesla-api.yourdomain.com",
    "public_key": "...",
    "public_key_hash": "..."
  }
}
```

> **Note:** If you need to support users in other regions (Europe, Asia-Pacific), repeat Step 4 with the appropriate `audience` and API base URL for each region.

---

## Part 5: Set Up the Raycast PKCE Proxy

Because the Tesla OAuth server validates redirect URIs strictly, and Raycast generates `https://raycast.com/redirect?packageName=Extension` (which Tesla may reject), use Raycast's PKCE proxy as a middleware.

1. Go to [oauth.raycast.com](https://oauth.raycast.com)
2. Create a new proxy configuration with:
   - **Authorize URL**: `https://auth.tesla.com/oauth2/v3/authorize`
   - **Token URL**: `https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token`
   - **Refresh Token URL**: `https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token`
   - **Client ID**: your Tesla client ID
   - **Client Secret**: your Tesla client secret
   - **Audience**: `https://fleet-api.prd.na.vn.cloud.tesla.com`
3. Save — you'll receive unique proxied `authorizeUrl`, `tokenUrl`, and `refreshTokenUrl` values

### Update Tesla app redirect URI

In developer.tesla.com, set:

- **Allowed Origin**: `https://oauth.raycast.com`
- **Allowed Redirect URI**: `https://oauth.raycast.com/redirect`

---

## Part 6: Configure the Extension

In `src/tesla.ts`, use the proxied URLs from Step 5:

```typescript
export const provider = new OAuthService({
  client,
  clientId: "YOUR_CLIENT_ID",
  authorizeUrl: "https://oauth.raycast.com/v1/authorize/...",
  tokenUrl: "https://oauth.raycast.com/v1/token/...",
  refreshTokenUrl: "https://oauth.raycast.com/v1/refresh-token/...",
  scope: "openid offline_access energy_device_data",
  extraParameters: { audience: "https://fleet-api.prd.na.vn.cloud.tesla.com" },
});
```

---

## OAuth Flow Summary

```
Raycast extension
  → oauth.raycast.com/v1/authorize/... (proxy)
    → auth.tesla.com/oauth2/v3/authorize (Tesla login & consent)
      → oauth.raycast.com/redirect (proxy callback)
        → raycast.com/redirect?packageName=Extension (back to Raycast)
  → oauth.raycast.com/v1/token/... (proxy exchanges code for tokens)
    → fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token
```

---

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/1/products` | List all Tesla products — use to find `energy_site_id` |
| `GET /api/1/energy_sites/{id}/live_status` | Real-time solar, Powerwall, grid data |
| `GET /api/1/energy_sites/{id}/site_info` | Site configuration and capabilities |
| `GET /api/1/energy_sites/{id}/calendar_history?kind=energy` | Historical energy data |

**Base URL (North America):** `https://fleet-api.prd.na.vn.cloud.tesla.com`

**Token URL:** `https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token`

**Authorize URL:** `https://auth.tesla.com/oauth2/v3/authorize`

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `redirect_uri not registered` | Mismatch between Tesla app and what Raycast sends | Use Raycast PKCE proxy; register `https://oauth.raycast.com/redirect` |
| `412 Precondition Failed` | App not registered in region | Complete Part 4 (partner registration) |
| `403` / `partner_not_registered` | Same as 412 | Complete Part 4 |
| Key not serving | Jekyll blocking `.well-known` | Add `.nojekyll` empty file to repo root |
| DNS not resolving | CNAME not propagated | Wait 5–30 min; verify with `dig` |
