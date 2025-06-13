# Frappe CORS Configuration for ESS System

This document explains how to configure CORS (Cross-Origin Resource Sharing) in your Frappe server to allow requests from your Next.js ESS frontend.

## Method 1: Using Frappe Hooks (Recommended)

### Step 1: Create a Custom App Hook

1. **Navigate to your Frappe app directory:**
   ```bash
   cd frappe-bench/apps/your-app
   ```

2. **Edit the hooks.py file** (or create it if it doesn't exist):
   ```python
   # apps/your-app/your_app/hooks.py
   
   # Add CORS headers for API requests
   after_install = ["your_app.setup.after_install"]
   
   # Add CORS middleware
   before_request = ["your_app.utils.cors.handle_cors"]
   ```

3. **Create the CORS utility file:**
   ```python
   # apps/your-app/your_app/utils/cors.py
   
   import frappe
   from frappe import _
   
   def handle_cors():
       if frappe.request.method == "OPTIONS":
           # Handle preflight requests
           frappe.local.response = frappe._dict({
               "type": "page",
               "page_name": "cors_preflight"
           })
           add_cors_headers()
           return
       
       # Add CORS headers to all responses
       add_cors_headers()
   
   def add_cors_headers():
       # Allow requests from your Next.js app
       allowed_origins = [
           "http://localhost:3000",
           "https://your-production-domain.com"  # Add your production domain
       ]
       
       origin = frappe.get_request_header("Origin")
       if origin in allowed_origins:
           frappe.local.response.headers["Access-Control-Allow-Origin"] = origin
       
       frappe.local.response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
       frappe.local.response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Frappe-CSRF-Token"
       frappe.local.response.headers["Access-Control-Allow-Credentials"] = "true"
       frappe.local.response.headers["Access-Control-Max-Age"] = "86400"
   ```

### Step 2: Restart Frappe

After making these changes, restart your Frappe server:

```bash
cd frappe-bench
bench restart
```

## Method 2: Using site_config.json

### Step 1: Edit site_config.json

1. **Navigate to your site directory:**
   ```bash
   cd frappe-bench/sites/your-site-name
   ```

2. **Edit site_config.json:**
   ```json
   {
     "db_name": "your_db_name",
     "db_password": "your_password",
     "allow_cors": "*",
     "cors": {
       "allow_origin": [
         "http://localhost:3000",
         "https://your-production-domain.com"
       ],
       "allow_credentials": true,
       "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
       "allow_headers": ["Content-Type", "Authorization", "X-Frappe-CSRF-Token"]
     }
   }
   ```

### Step 2: Restart Frappe

```bash
cd frappe-bench
bench restart
```

## Method 3: Using Nginx Configuration (If using Nginx)

If you're using Nginx as a reverse proxy, you can add CORS headers in your Nginx configuration:

```nginx
# /etc/nginx/sites-available/your-site

server {
    listen 80;
    server_name hr.portal;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' 'http://localhost:3000' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Frappe-CSRF-Token' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        
        # Handle preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' 'http://localhost:3000';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Frappe-CSRF-Token';
            add_header 'Access-Control-Allow-Credentials' 'true';
            add_header 'Access-Control-Max-Age' 86400;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
}
```

Then restart Nginx:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

## Testing CORS Configuration

After configuring CORS, test it by:

1. **Open your browser's developer console** while on `http://localhost:3000`

2. **Run this test in the console:**
   ```javascript
   fetch('http://hr.portal:8000/api/method/frappe.auth.get_logged_user', {
     credentials: 'include'
   })
   .then(response => response.json())
   .then(data => console.log('CORS working!', data))
   .catch(error => console.error('CORS still blocked:', error));
   ```

3. **Check for CORS errors** - if configured correctly, you shouldn't see CORS-related errors.

## Production Considerations

For production deployment:

1. **Replace localhost with your actual domain:**
   ```json
   "allow_origin": [
     "https://your-production-domain.com"
   ]
   ```

2. **Use HTTPS in production** for security

3. **Be specific with allowed origins** - avoid using `*` in production

4. **Consider using environment variables** for dynamic origin configuration

## Troubleshooting

### Common Issues:

1. **Still getting CORS errors after configuration:**
   - Make sure you restarted the Frappe server
   - Check that the origin matches exactly (including protocol and port)
   - Verify the configuration file syntax is correct

2. **CORS working but authentication failing:**
   - Ensure `credentials: 'include'` is set in your fetch requests
   - Check that cookies are being sent and received properly

3. **Preflight requests failing:**
   - Make sure OPTIONS method is allowed
   - Check that all required headers are included in Access-Control-Allow-Headers

### Debugging Commands:

```bash
# Check if Frappe is running
bench status

# View Frappe logs
bench logs

# Test API endpoint directly
curl -X GET "http://hr.portal:8000/api/method/frappe.auth.get_logged_user" \
     -H "Origin: http://localhost:3000" \
     -v
```

## Security Notes

- Only allow origins that you trust
- Use HTTPS in production
- Be cautious with `Access-Control-Allow-Credentials: true`
- Regularly review and update your CORS configuration
- Consider implementing additional security measures like CSRF tokens 