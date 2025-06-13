# Quick CORS Fix for ESS System

You're encountering CORS errors because your Next.js app (localhost:3000) is trying to access your Frappe server (hr.portal:8000) directly, which is blocked by browser security policies.

## ✅ **IMMEDIATE FIX - Use Proxy Mode**

I've already created a proxy solution for you! The system now uses Next.js API routes to proxy requests to Frappe, avoiding CORS entirely.

### What's Been Done:

1. **Fixed double slash URLs** in the auth service
2. **Created API proxy routes** at:
   - `/api/auth/login` - Proxies login requests
   - `/api/auth/logout` - Proxies logout requests  
   - `/api/auth/user` - Proxies user info requests
3. **Updated auth store** to use proxy service instead of direct calls

### Update Your Environment:

Create/update your `.env.local` file:

```env
# Frappe Backend Configuration
NEXT_PUBLIC_FRAPPE_URL=http://hr.portal:8000
NEXT_PUBLIC_FRAPPE_SITE_NAME=your-site-name

# Application Configuration
NEXT_PUBLIC_APP_NAME=ESS System
NEXT_PUBLIC_APP_DESCRIPTION=Employee Self Service System

# Authentication Configuration
NEXT_PUBLIC_SESSION_TIMEOUT=3600000
NEXT_PUBLIC_REMEMBER_ME_DAYS=30

# Security Configuration
NEXTAUTH_SECRET=your-super-secret-key-change-this-in-production
NEXTAUTH_URL=http://localhost:3000

# Development Configuration
NODE_ENV=development
NEXT_PUBLIC_DEBUG=true
```

### Restart Your App:

```bash
# Stop your development server (Ctrl+C)
# Then restart:
pnpm dev
```

## 🚀 **How It Works Now:**

Instead of:
```
Frontend → Frappe Server (BLOCKED by CORS)
```

Now it's:
```
Frontend → Next.js API Routes → Frappe Server (NO CORS issues!)
```

## 📝 **Long-term Solution (Optional)**

If you want to configure CORS directly on your Frappe server for production, see the detailed guide in [FRAPPE_CORS_SETUP.md](./FRAPPE_CORS_SETUP.md).

## 🧪 **Test the Fix:**

1. Make sure your `.env.local` file is set up correctly
2. Restart your development server: `pnpm dev`
3. Go to `http://localhost:3000`
4. Try logging in with your Frappe credentials
5. Check browser console - CORS errors should be gone!

## 🔍 **Troubleshooting:**

If you still see issues:

1. **Check your Frappe server is running:**
   ```bash
   curl http://hr.portal:8000/api/method/ping
   ```

2. **Verify environment variables are loaded:**
   - Check that `.env.local` exists in your project root
   - Make sure `NEXT_PUBLIC_FRAPPE_URL=http://hr.portal:8000`

3. **Check Next.js API routes:**
   - Visit `http://localhost:3000/api/auth/user` directly
   - Should return `{"user":null,"authenticated":false}` if not logged in

4. **Browser DevTools:**
   - Network tab should show requests going to `/api/auth/*` instead of `hr.portal:8000`

## ✨ **Benefits of This Approach:**

- ✅ **No CORS issues** - Requests stay within same origin
- ✅ **No Frappe server changes needed** - Works with existing setup
- ✅ **Cookie handling** - Sessions work properly
- ✅ **Production ready** - Scales well for deployment
- ✅ **Security** - Server-side proxy handles sensitive requests

The proxy approach is actually a best practice for production applications as it keeps your backend URLs hidden from the client! 