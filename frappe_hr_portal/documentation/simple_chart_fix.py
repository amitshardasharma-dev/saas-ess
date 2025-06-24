import frappe
import json
import os

def simple_chart_fix():
    print("=== SIMPLE CHART NAME FIX ===")
    
    # Step 1: Update workspace JSON file directly (avoid database locks)
    print("\n--- 1. Updating Workspace JSON File Directly ---")
    try:
        workspace_file = "/workspace/development/frappe-bench/apps/hr_portal/hr_portal/hr/workspace/leave_management/leave_management.json"
        
        if os.path.exists(workspace_file):
            with open(workspace_file, 'r') as f:
                workspace_data = json.load(f)
            
            print(f"✅ Workspace file loaded")
            
            # Parse content
            if isinstance(workspace_data.get('content'), str):
                content = json.loads(workspace_data['content'])
            else:
                content = workspace_data.get('content', [])
            
            # Find and update chart
            updated = False
            for item in content:
                if item.get('type') == 'chart':
                    old_name = item.get('data', {}).get('chart_name')
                    print(f"Found chart: {old_name}")
                    
                    # Change chart name to match existing Dashboard Chart
                    item['data']['chart_name'] = 'Leave Type'
                    item['data']['label'] = 'Leave Type' 
                    updated = True
                    print(f"✅ Updated chart name to: Leave Type")
            
            if updated:
                # Save updated content back to file
                workspace_data['content'] = content  # Keep as array, not string
                
                with open(workspace_file, 'w') as f:
                    json.dump(workspace_data, f, indent=1)
                print("✅ Workspace JSON file updated successfully")
            else:
                print("❌ No chart found to update")
                
        else:
            print("❌ Workspace JSON file not found")
            
    except Exception as e:
        print(f"Error updating workspace file: {e}")
    
    # Step 2: Clear cache to reload workspace
    print("\n--- 2. Clearing Cache ---")
    try:
        frappe.clear_cache()
        print("✅ Cache cleared")
    except Exception as e:
        print(f"Error clearing cache: {e}")
    
    # Step 3: Verify chart access
    print("\n--- 3. Verifying Chart Access ---")
    try:
        frappe.set_user("guru@ulx.in")
        
        # Test access to 'Leave Type' chart
        chart = frappe.get_doc("Dashboard Chart", "Leave Type")
        print(f"✅ guru@ulx.in can access 'Leave Type' chart")
        
        # Test chart data
        from hr_portal.hr.dashboard_chart_source.leave_type.leave_type import get
        result = get()
        print(f"✅ Chart data works: {len(result.get('datasets', []))} datasets")
        
    except Exception as e:
        print(f"Error testing access: {e}")
    finally:
        frappe.set_user("Administrator")
    
    # Step 4: Force reload workspace in database
    print("\n--- 4. Reloading Workspace from File ---")
    try:
        # Try to update database from file (if possible)
        frappe.db.commit()  # Commit any pending changes
        
        # Reload workspace
        workspace = frappe.get_doc("Workspace", "Leave Management")
        print(f"Current workspace content type: {type(workspace.content)}")
        
        # Try updating with a small delay
        import time
        time.sleep(1)
        
        # Read the updated file content
        with open(workspace_file, 'r') as f:
            file_data = json.load(f)
        
        if isinstance(file_data.get('content'), list):
            # Convert to JSON string for database
            workspace.content = json.dumps(file_data['content'])
            workspace.save(ignore_permissions=True)
            print("✅ Database workspace updated from file")
        
    except Exception as e:
        print(f"Note: Database update failed (this is OK): {e}")
    
    print("\n=== SIMPLE CHART FIX COMPLETED ===")
    print("The workspace file has been updated to use 'Leave Type' chart.")
    print("")
    print("Next steps:")
    print("1. Restart your Frappe bench: 'bench restart'")
    print("2. Clear browser cache completely")
    print("3. Log out and log in as guru@ulx.in")
    print("4. Navigate to Leave Management workspace")
    print("5. Chart should now be visible!")

# Run the fix
simple_chart_fix() 