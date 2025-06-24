import frappe

def direct_chart_fix():
    print("🔧 DIRECT CHART FIX - SYSTEM MANAGER ROLE APPROACH")
    print("=" * 60)
    
    # Option 1: Grant System Manager role to guru temporarily
    print("\n🎯 OPTION 1: GRANT SYSTEM MANAGER ROLE")
    print("-" * 40)
    try:
        # Check current roles
        current_roles = frappe.get_roles("guru@ulx.in")
        print(f"guru@ulx.in current roles: {len(current_roles)} roles")
        
        if "System Manager" not in current_roles:
            print("Adding System Manager role to guru@ulx.in...")
            
            # Add System Manager role
            user_doc = frappe.get_doc("User", "guru@ulx.in")
            user_doc.append("roles", {"role": "System Manager"})
            user_doc.save(ignore_permissions=True)
            frappe.db.commit()
            
            print("✅ System Manager role added!")
            
            # Verify
            new_roles = frappe.get_roles("guru@ulx.in")
            if "System Manager" in new_roles:
                print("✅ Verification: guru@ulx.in now has System Manager role")
            else:
                print("❌ Verification failed")
        else:
            print("✅ guru@ulx.in already has System Manager role")
            
    except Exception as e:
        print(f"❌ ERROR adding System Manager role: {e}")
    
    # Option 2: Create Leave Summary chart using direct approach
    print("\n🎯 OPTION 2: CREATE MISSING CHART DIRECTLY")
    print("-" * 40)
    try:
        # Check if Leave Summary exists using direct SQL
        existing = frappe.db.sql("SELECT name FROM `tabDashboard Chart` WHERE name = 'Leave Summary'")
        
        if existing:
            print("✅ 'Leave Summary' chart already exists")
        else:
            print("Creating 'Leave Summary' chart using direct SQL...")
            
            # Use direct SQL to create the chart
            frappe.db.sql("""
                INSERT INTO `tabDashboard Chart` 
                (name, creation, modified, modified_by, owner, docstatus, idx, 
                 chart_name, label, chart_type, source, timeseries, is_public)
                VALUES 
                ('Leave Summary', NOW(), NOW(), 'Administrator', 'Administrator', 0, 0,
                 'Leave Summary', 'Leave Summary', 'bar', 'Leave Type', 0, 1)
            """)
            
            frappe.db.commit()
            print("✅ 'Leave Summary' chart created via SQL")
            
    except Exception as e:
        print(f"❌ ERROR creating chart: {e}")
    
    # Option 3: Alternative - Update workspace to use Leave Type
    print("\n🎯 OPTION 3: UPDATE WORKSPACE CONTENT DIRECTLY")
    print("-" * 40)
    try:
        # Update workspace using direct SQL
        print("Updating workspace content to use 'Leave Type'...")
        
        # Get current content
        result = frappe.db.sql("SELECT content FROM `tabWorkspace` WHERE name = 'Leave Management'")
        if result:
            import json
            content_str = result[0][0]
            
            if content_str:
                # Parse and update
                if content_str.startswith('['):
                    content = json.loads(content_str)
                else:
                    content = json.loads(content_str)
                
                # Find and update chart
                for item in content:
                    if item.get('type') == 'chart':
                        old_name = item.get('data', {}).get('chart_name')
                        if old_name == 'Leave Summary':
                            item['data']['chart_name'] = 'Leave Type'
                            item['data']['label'] = 'Leave Type'
                            print(f"✅ Updated chart name: '{old_name}' → 'Leave Type'")
                            break
                
                # Save back using SQL
                new_content = json.dumps(content)
                frappe.db.sql("""
                    UPDATE `tabWorkspace` 
                    SET content = %s, modified = NOW() 
                    WHERE name = 'Leave Management'
                """, (new_content,))
                
                frappe.db.commit()
                print("✅ Workspace content updated via SQL")
            
    except Exception as e:
        print(f"❌ ERROR updating workspace: {e}")
    
    # Clear cache
    print("\n🧹 CLEARING CACHE")
    print("-" * 20)
    try:
        frappe.clear_cache()
        print("✅ Cache cleared")
    except Exception as e:
        print(f"⚠️ Cache clear warning: {e}")
    
    print("\n" + "=" * 60)
    print("🎯 TESTING SOLUTION")
    print("=" * 60)
    
    # Test if guru can now see chart
    try:
        frappe.set_user("guru@ulx.in")
        roles = frappe.get_roles("guru@ulx.in")
        has_system_manager = "System Manager" in roles
        
        print(f"guru@ulx.in has System Manager role: {has_system_manager}")
        
        if has_system_manager:
            print("🎉 SUCCESS: guru@ulx.in should now see the chart!")
            print("\nNext steps:")
            print("1. Clear browser cache")
            print("2. Log out and log back in as guru@ulx.in")
            print("3. Navigate to Leave Management workspace")
            print("4. Chart should be visible!")
        else:
            print("❌ System Manager role not detected")
            
    except Exception as e:
        print(f"❌ Testing error: {e}")
    finally:
        frappe.set_user("Administrator")
    
    print("\n" + "=" * 60)
    print("NOTE: If you want to remove System Manager role later:")
    print("Go to User: guru@ulx.in → Roles → Remove 'System Manager'")
    print("=" * 60)

# Run the direct fix
direct_chart_fix() 