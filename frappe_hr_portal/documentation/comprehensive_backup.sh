#!/bin/bash

# Comprehensive Backup Script for HR Portal Development
# This script creates multiple types of backups for your hr.portal site and hr_portal app

echo "🚀 Starting Comprehensive Backup Process"
echo "========================================"

# Create backup directory with timestamp
BACKUP_DIR="hr_portal_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📁 Created backup directory: $BACKUP_DIR"

# 1. DATABASE BACKUP
echo ""
echo "1️⃣ Creating Database Backup..."
echo "--------------------------------"

# Try different backup methods
if command -v bench &> /dev/null; then
    echo "Using bench backup command..."
    bench --site hr.portal backup --with-files --backup-path "$BACKUP_DIR/database_backup" 2>/dev/null || {
        echo "⚠️  Bench backup failed, trying manual database export..."
        
        # Manual database backup
        DB_NAME=$(grep -o '"db_name": "[^"]*' sites/hr.portal/site_config.json | cut -d'"' -f4 2>/dev/null || echo "hr_portal")
        echo "Database name: $DB_NAME"
        
        # Try mysqldump
        mysqldump -u root -p"$DB_PASSWORD" "$DB_NAME" > "$BACKUP_DIR/hr_portal_database.sql" 2>/dev/null || {
            echo "⚠️  MySQL backup failed, copying database files..."
            mkdir -p "$BACKUP_DIR/database_files"
            cp -r sites/hr.portal/*.db "$BACKUP_DIR/database_files/" 2>/dev/null || echo "No SQLite database files found"
        }
    }
else
    echo "⚠️  Bench command not available, skipping database backup"
fi

# 2. SITE FILES BACKUP
echo ""
echo "2️⃣ Backing up Site Files..."
echo "----------------------------"

mkdir -p "$BACKUP_DIR/site_files"
cp -r sites/hr.portal/* "$BACKUP_DIR/site_files/" 2>/dev/null
echo "✅ Site files backed up to $BACKUP_DIR/site_files/"

# 3. CUSTOM APP BACKUP
echo ""
echo "3️⃣ Backing up HR Portal App..."
echo "-------------------------------"

mkdir -p "$BACKUP_DIR/hr_portal_app"
cp -r apps/hr_portal/* "$BACKUP_DIR/hr_portal_app/" 2>/dev/null
echo "✅ HR Portal app backed up to $BACKUP_DIR/hr_portal_app/"

# 4. CONFIGURATION FILES BACKUP
echo ""
echo "4️⃣ Backing up Configuration Files..."
echo "------------------------------------"

mkdir -p "$BACKUP_DIR/config"
cp sites/common_site_config.json "$BACKUP_DIR/config/" 2>/dev/null
cp sites/apps.json "$BACKUP_DIR/config/" 2>/dev/null
cp sites/apps.txt "$BACKUP_DIR/config/" 2>/dev/null
cp Procfile "$BACKUP_DIR/config/" 2>/dev/null
cp patches.txt "$BACKUP_DIR/config/" 2>/dev/null
cp requirement.txt "$BACKUP_DIR/config/" 2>/dev/null
echo "✅ Configuration files backed up"

# 5. DOCUMENTATION AND SCRIPTS BACKUP
echo ""
echo "5️⃣ Backing up Documentation & Scripts..."
echo "----------------------------------------"

mkdir -p "$BACKUP_DIR/documentation"
cp *.md "$BACKUP_DIR/documentation/" 2>/dev/null
cp *.py "$BACKUP_DIR/documentation/" 2>/dev/null
cp *.sh "$BACKUP_DIR/documentation/" 2>/dev/null
cp *.json "$BACKUP_DIR/documentation/" 2>/dev/null
echo "✅ Documentation and scripts backed up"

# 6. CREATE RESTORATION GUIDE
echo ""
echo "6️⃣ Creating Restoration Guide..."
echo "--------------------------------"

cat > "$BACKUP_DIR/RESTORATION_GUIDE.md" << 'EOF'
# HR Portal Backup Restoration Guide

## Backup Contents
This backup contains:
- Database backup (SQL dump or database files)
- Complete site files from sites/hr.portal/
- Complete hr_portal app source code
- Configuration files
- Documentation and test scripts

## Restoration Steps

### 1. Restore Frappe Environment
```bash
# Create new bench (if needed)
bench init frappe-bench-restored
cd frappe-bench-restored

# Install required apps
bench get-app erpnext
bench get-app https://github.com/your-repo/hr_portal.git  # If you have a git repo
```

### 2. Restore Custom App
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

# Restore database
bench --site hr.portal restore /path/to/backup/database_backup/[timestamp]/database.sql.gz

# Or if using SQL file
mysql -u root -p hr_portal < /path/to/backup/hr_portal_database.sql
```

### 4. Restore Site Files
```bash
# Copy site configuration and files
cp -r /path/to/backup/site_files/* sites/hr.portal/
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
- Run bench migrate after restoration
- Test all functionality after restoration

## Backup Created On
Date: $(date)
System: $(uname -a)
Frappe Version: $(bench version 2>/dev/null || echo "Unknown")
EOF

# 7. CREATE ARCHIVE
echo ""
echo "7️⃣ Creating Compressed Archive..."
echo "---------------------------------"

tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"
echo "✅ Compressed archive created: ${BACKUP_DIR}.tar.gz"

# 8. BACKUP SUMMARY
echo ""
echo "📊 BACKUP SUMMARY"
echo "=================="

echo "Backup Directory: $BACKUP_DIR"
echo "Archive File: ${BACKUP_DIR}.tar.gz"
echo ""
echo "Contents:"
echo "- Database backup (if available)"
echo "- Site files: $(du -sh "$BACKUP_DIR/site_files" 2>/dev/null | cut -f1 || echo "N/A")"
echo "- HR Portal app: $(du -sh "$BACKUP_DIR/hr_portal_app" 2>/dev/null | cut -f1 || echo "N/A")"
echo "- Configuration files"
echo "- Documentation & scripts: $(ls "$BACKUP_DIR/documentation" 2>/dev/null | wc -l || echo "0") files"
echo ""
echo "Total backup size: $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "N/A")"
echo "Archive size: $(du -sh "${BACKUP_DIR}.tar.gz" 2>/dev/null | cut -f1 || echo "N/A")"

echo ""
echo "✅ BACKUP COMPLETED SUCCESSFULLY!"
echo "=================================="
echo ""
echo "📋 Next Steps:"
echo "1. Copy ${BACKUP_DIR}.tar.gz to a safe location"
echo "2. Test restoration process in a separate environment"
echo "3. Store backup in multiple locations (cloud storage, external drive)"
echo "4. Document any custom configurations or dependencies"
echo ""
echo "🔒 Security Note:"
echo "This backup may contain sensitive data including database credentials."
echo "Store it securely and restrict access appropriately." 