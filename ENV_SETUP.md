# Environment Configuration for ESS System

This document explains how to set up environment variables for the ESS (Employee Self Service) System.

## Required Environment Variables

Create a `.env.local` file in the root directory of your project with the following variables:

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

# API Configuration
NEXT_PUBLIC_API_VERSION=v1
NEXT_PUBLIC_API_TIMEOUT=30000

# Security Configuration
NEXTAUTH_SECRET=your-super-secret-key-change-this-in-production
NEXTAUTH_URL=http://localhost:3000

# Development Configuration
NODE_ENV=development
NEXT_PUBLIC_DEBUG=true
```

## Configuration Details

### Frappe Backend Configuration

- **NEXT_PUBLIC_FRAPPE_URL**: The URL of your Frappe server (e.g., `http://localhost:8000`)
- **NEXT_PUBLIC_FRAPPE_SITE_NAME**: The site name configured in your Frappe installation

### Application Configuration

- **NEXT_PUBLIC_APP_NAME**: Display name for your application
- **NEXT_PUBLIC_APP_DESCRIPTION**: Description shown on the login page

### Authentication Configuration

- **NEXT_PUBLIC_SESSION_TIMEOUT**: Session timeout in milliseconds (default: 1 hour)
- **NEXT_PUBLIC_REMEMBER_ME_DAYS**: Number of days to remember the user when "Remember Me" is checked

### API Configuration

- **NEXT_PUBLIC_API_VERSION**: API version to use (default: v1)
- **NEXT_PUBLIC_API_TIMEOUT**: API request timeout in milliseconds

### Security Configuration

- **NEXTAUTH_SECRET**: Secret key for session encryption (change this in production!)
- **NEXTAUTH_URL**: The URL of your application

### Development Configuration

- **NODE_ENV**: Environment mode (`development`, `production`, `test`)
- **NEXT_PUBLIC_DEBUG**: Enable debug mode (`true` or `false`)

## Setup Instructions

1. Copy the environment variables above to a new file called `.env.local` in your project root
2. Update the values according to your Frappe setup:
   - Replace `http://localhost:8000` with your actual Frappe server URL
   - Replace `your-site-name` with your actual Frappe site name
   - Generate a strong secret key for `NEXTAUTH_SECRET`
3. Save the file and restart your development server

## Production Considerations

For production deployment:

1. **Security**: Generate a strong, unique value for `NEXTAUTH_SECRET`
2. **URLs**: Update all URLs to use HTTPS and your production domain
3. **Timeouts**: Adjust session timeout and API timeout values as needed
4. **Debug**: Set `NEXT_PUBLIC_DEBUG=false` in production

## Frappe Server Requirements

Your Frappe server should:

1. Be accessible from your Next.js application
2. Have CORS properly configured to allow requests from your Next.js domain
3. Have the necessary API endpoints enabled for authentication

## Testing the Configuration

After setting up the environment variables:

1. Start your development server: `npm run dev` or `pnpm dev`
2. Navigate to `http://localhost:3000`
3. You should be redirected to the login page
4. Try logging in with valid Frappe credentials

## Troubleshooting

If you encounter issues:

1. **Connection errors**: Check that `NEXT_PUBLIC_FRAPPE_URL` is correct and the server is running
2. **CORS errors**: Ensure your Frappe server allows requests from your Next.js domain
3. **Authentication failures**: Verify your Frappe site name and user credentials
4. **Session issues**: Check the `NEXTAUTH_SECRET` configuration

For more help, check the application logs or contact your system administrator. 