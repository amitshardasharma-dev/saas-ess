#!/bin/bash

# HR Portal Comprehensive Backup Script
# Run this script from /workspace/development/frappe-bench directory

echo "🚀 Starting HR Portal Backup Process"
echo "====================================="

# Define base paths
BASE_PATH="/workspace/development/frappe-bench"
BACKUP_PATH="/workspace/development/frappe-bench/backup_hr_portal"

echo "📁 Base Path: $BASE_PATH"
echo "📁 Backup Path: $BACKUP_PATH"

# Create backup directory structure
echo ""
echo "1️⃣ Creating backup directory structure..."
mkdir -p "$BACKUP_PATH/hr_portal_app"
mkdir -p "$BACKUP_PATH/site_files"
mkdir -p "$BACKUP_PATH/config"
mkdir -p "$BACKUP_PATH/documentation"
mkdir -p "$BACKUP_PATH/database"
echo "✅ Directory structure created"

# Backup HR Portal App
echo ""
echo "2️⃣ Backing up HR Portal App..."
cp -r "$BASE_PATH/apps/hr_portal/"* "$BACKUP_PATH/hr_portal_app/"
echo "✅ HR Portal app backed up"

# Backup Site Files
echo ""
echo "3️⃣ Backing up Site Files..."
cp -r "$BASE_PATH/sites/hr.portal/"* "$BACKUP_PATH/site_files/"
echo "✅ Site files backed up"

# Backup Configuration Files
echo ""
echo "4️⃣ Backing up Configuration Files..."
cp "$BASE_PATH/sites/common_site_config.json" "$BACKUP_PATH/config/"
cp "$BASE_PATH/sites/apps.json" "$BACKUP_PATH/config/"
cp "$BASE_PATH/sites/apps.txt" "$BACKUP_PATH/config/"
cp "$BASE_PATH/Procfile" "$BACKUP_PATH/config/"
cp "$BASE_PATH/patches.txt" "$BACKUP_PATH/config/"
cp "$BASE_PATH/requirement.txt" "$BACKUP_PATH/config/"
echo "✅ Configuration files backed up"

# Backup Documentation and Scripts
echo ""
echo "5️⃣ Backing up Documentation and Scripts..."
cp "$BASE_PATH/"*.md "$BACKUP_PATH/documentation/" 2>/dev/null || echo "No .md files found"
cp "$BASE_PATH/"*.py "$BACKUP_PATH/documentation/" 2>/dev/null || echo "No .py files found"
cp "$BASE_PATH/"*.sh "$BACKUP_PATH/documentation/" 2>/dev/null || echo "No .sh files found"
cp "$BASE_PATH/"*.json "$BACKUP_PATH/documentation/" 2>/dev/null || echo "No .json files found"
cp "$BASE_PATH/"*.txt "$BACKUP_PATH/documentation/" 2>/dev/null || echo "No .txt files found"
echo "✅ Documentation and scripts backed up"

# Try Database Backup
echo ""
echo "6️⃣ Attempting Database Backup..."
if command -v bench &> /dev/null; then
    echo "Using bench backup command..."
    cd "$BASE_PATH"
    bench --site hr.portal backup --with-files --backup-path "$BACKUP_PATH/database/" 2>/dev/null && echo "✅ Database backup successful" || echo "⚠️ Bench backup failed"
else
    echo "⚠️ Bench command not available"
fi

# Try manual database backup
echo "Attempting manual database backup..."
DB_NAME=$(grep -o '"db_name": "[^"]*' "$BASE_PATH/sites/hr.portal/site_config.json" | cut -d'"' -f4 2>/dev/null || echo "hr_portal")
echo "Database name: $DB_NAME"

# Try mysqldump
if command -v mysqldump &> /dev/null; then
    echo "Attempting mysqldump..."
    mysqldump -u root "$DB_NAME" > "$BACKUP_PATH/database/hr_portal_database.sql" 2>/dev/null && echo "✅ MySQL dump successful" || echo "⚠️ MySQL dump failed"
else
    echo "⚠️ mysqldump not available"
fi

# Copy any SQLite database files
echo "Copying SQLite database files..."
cp "$BASE_PATH/sites/hr.portal/"*.db "$BACKUP_PATH/database/" 2>/dev/null && echo "✅ SQLite files copied" || echo "ℹ️ No SQLite database files found"

# Create restoration guide
echo ""
echo "7️⃣ Creating Restoration Guide..."
cat > "$BACKUP_PATH/RESTORATION_GUIDE.md" << 'EOF'
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
EOF

# Create archive
echo ""
echo "8️⃣ Creating Compressed Archive..."
cd "$BASE_PATH"
tar -czf "hr_portal_backup_$(date +%Y%m%d_%H%M%S).tar.gz" backup_hr_portal/
echo "✅ Compressed archive created"

# Display summary
echo ""
echo "📊 BACKUP SUMMARY"
echo "=================="
echo "Backup Location: $BACKUP_PATH"
echo "Archive: hr_portal_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
echo ""
echo "Contents backed up:"
echo "- HR Portal App: $(du -sh "$BACKUP_PATH/hr_portal_app" 2>/dev/null | cut -f1 || echo "N/A")"
echo "- Site Files: $(du -sh "$BACKUP_PATH/site_files" 2>/dev/null | cut -f1 || echo "N/A")"
echo "- Configuration: $(ls "$BACKUP_PATH/config" 2>/dev/null | wc -l || echo "0") files"
echo "- Documentation: $(ls "$BACKUP_PATH/documentation" 2>/dev/null | wc -l || echo "0") files"
echo "- Database: $(ls "$BACKUP_PATH/database" 2>/dev/null | wc -l || echo "0") files"
echo ""
echo "Total backup size: $(du -sh "$BACKUP_PATH" 2>/dev/null | cut -f1 || echo "N/A")"

echo ""
echo "✅ BACKUP COMPLETED SUCCESSFULLY!"
echo "=================================="
echo ""
echo "📋 Next Steps:"
echo "1. The backup is ready at: $BACKUP_PATH"
echo "2. Compressed archive: hr_portal_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
echo "3. Copy the archive to a safe location"
echo "4. Test restoration in a separate environment"
echo ""
echo "🔒 Security Note:"
echo "This backup contains sensitive data including database credentials."
echo "Store it securely and restrict access appropriately." 
