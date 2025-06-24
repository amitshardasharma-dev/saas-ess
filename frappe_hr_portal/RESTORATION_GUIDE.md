# HR Portal Backup Restoration Guide

## Backup Contents
This backup contains:
- Complete hr_portal app source code
- Complete hr.portal site files and configuration
- System configuration files
- Documentation and test scripts
- Database backup (if available)

## Restoration Steps

### 1. Setup New Frappe Environment
```bash
# Create new bench
bench init frappe-bench-restored
cd frappe-bench-restored

# Install required apps
bench get-app erpnext
```

### 2. Restore HR Portal App
```bash
# Copy the hr_portal app
cp -r /path/to/backup/hr_portal_app/* apps/hr_portal/

# Install the app
bench install-app hr_portal
```

### 3. Create and Restore Site
```bash
# Create new site
bench new-site hr.portal

# If database backup exists, restore it
bench --site hr.portal restore /path/to/backup/database/[backup-file]

# Or restore from SQL dump
mysql -u root -p hr_portal < /path/to/backup/database/hr_portal_database.sql
```

### 4. Restore Site Configuration
```bash
# Copy site files (be careful with existing config)
cp -r /path/to/backup/site_files/* sites/hr.portal/

# Copy system configuration
cp /path/to/backup/config/common_site_config.json sites/
cp /path/to/backup/config/apps.json sites/
```

### 5. Final Setup
```bash
# Migrate database
bench --site hr.portal migrate

# Build assets
bench build

# Start server
bench start
```

## Important Notes
- Update database credentials in site_config.json if needed
- Ensure all dependencies are installed
- Test all functionality after restoration
- The backup includes sensitive data - store securely

## Test Users After Restoration
- guru@ulx.in / Phagwara@14 (HR Head)
- jnanesh@ulx.in / Phagwara@13 (Manager)
- sahil@ulx.in / Phagwara@13 (Team Lead)

## Key Features to Test
- Leave application creation
- Multi-level approval workflow
- REST API endpoints
- User authentication
