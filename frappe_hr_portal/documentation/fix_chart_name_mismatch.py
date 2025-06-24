import frappe
import json

def fix_chart_name_mismatch():
    print("=== FIXING CHART NAME MISMATCH ===")
    
    # Step 1: Check if 'Leave Summary' dashboard chart exists
    print("\n--- 1. Checking Dashboard Chart Names ---")
    try:
        # Check if 'Leave Summary' chart exists
        try:
            summary_chart = frappe.get_doc("Dashboard Chart", "Leave Summary")
            print(f"✅ 'Leave Summary' chart exists: {summary_chart.name}")
        except frappe.DoesNotExistError:
            print("❌ 'Leave Summary' chart does NOT exist")
            
        # Check if 'Leave Type' chart exists  
        try:
            type_chart = frappe.get_doc("Dashboard Chart", "Leave Type")
            print(f"✅ 'Leave Type' chart exists: {type_chart.name}")
        except frappe.DoesNotExistError:
            print("❌ 'Leave Type' chart does NOT exist")
            
    except Exception as e:
        print(f"Error checking charts: {e}")
    
    # Step 2: Create 'Leave Summary' chart OR rename workspace content
    print("\n--- 2. Fixing Chart Name Mismatch ---")
    
    # Option 1: Create a 'Leave Summary' chart that matches workspace content
    try:
        # Check if we need to create 'Leave Summary' chart
        try:
            frappe.get_doc("Dashboard Chart", "Leave Summary")
            print("'Leave Summary' chart already exists")
        except frappe.DoesNotExistError:
            # Create 'Leave Summary' chart based on 'Leave Type' chart
            print("Creating 'Leave Summary' chart...")
            
            # Get the existing 'Leave Type' chart as template
            template_chart = frappe.get_doc("Dashboard Chart", "Leave Type")
            
            # Create new chart
            new_chart = frappe.new_doc("Dashboard Chart")
            new_chart.chart_name = "Leave Summary" 
            new_chart.label = "Leave Summary"
            new_chart.chart_type = "bar"
            new_chart.source = "Leave Type"  # Same source
            new_chart.timeseries = 0
            new_chart.owner = "Administrator"
            new_chart.insert(ignore_permissions=True)
            
            print("✅ Created 'Leave Summary' Dashboard Chart")
            
    except Exception as e:
        print(f"Error creating chart: {e}")
    
    # Step 3: Update workspace content to use correct chart name
    print("\n--- 3. Updating Workspace Content ---")
    try:
        workspace = frappe.get_doc("Workspace", "Leave Management")
        content = json.loads(workspace.content)
        
        # Find and update chart item
        for item in content:
            if item.get('type') == 'chart':
                old_name = item.get('data', {}).get('chart_name')
                print(f"Found chart in workspace: {old_name}")
                
                # Update to match our Dashboard Chart
                item['data']['chart_name'] = 'Leave Summary'
                item['data']['label'] = 'Leave Summary'
                print(f"Updated chart name to: Leave Summary")
        
        # Save updated content
        workspace.content = json.dumps(content)
        workspace.save(ignore_permissions=True)
        print("✅ Updated workspace content")
        
    except Exception as e:
        print(f"Error updating workspace: {e}")
    
    # Step 4: Ensure permissions for new chart
    print("\n--- 4. Setting Permissions for Leave Summary Chart ---")
    try:
        target_roles = ['Hr User', 'Leave Approver', 'Leave Applier', 'HR User Manager', 'Employee']
        
        for role in target_roles:
            # Check if DocPerm exists for 'Leave Summary' chart access
            existing_perm = frappe.get_all("DocPerm", 
                                         filters={
                                             "parent": "Dashboard Chart",
                                             "role": role
                                         })
            
            if existing_perm:
                print(f"✅ {role} already has Dashboard Chart permissions")
            else:
                # Add new DocPerm
                new_perm = frappe.new_doc("DocPerm")
                new_perm.parent = "Dashboard Chart"
                new_perm.parenttype = "DocType"
                new_perm.role = role
                new_perm.read = 1
                new_perm.permlevel = 0
                new_perm.insert(ignore_permissions=True)
                print(f"✅ Added permissions for {role}")
                
    except Exception as e:
        print(f"Error setting permissions: {e}")
    
    # Step 5: Test access
    print("\n--- 5. Testing Chart Access ---")
    try:
        frappe.set_user("guru@ulx.in")
        
        # Test access to 'Leave Summary' chart
        chart = frappe.get_doc("Dashboard Chart", "Leave Summary")
        print(f"✅ guru@ulx.in can access 'Leave Summary' chart")
        
        # Test chart data generation
        from hr_portal.hr.dashboard_chart_source.leave_type.leave_type import get
        result = get()
        print(f"✅ Chart data generation works: {len(result.get('datasets', []))} datasets")
        
    except Exception as e:
        print(f"❌ Error testing access: {e}")
    finally:
        frappe.set_user("Administrator")
    
    # Step 6: Clear cache
    print("\n--- 6. Clearing Cache ---")
    frappe.clear_cache()
    print("✅ Cache cleared")
    
    print("\n=== CHART NAME MISMATCH FIX COMPLETED ===")
    print("Now:")
    print("1. Clear browser cache")
    print("2. Log out and log in as guru@ulx.in") 
    print("3. Navigate to Leave Management workspace")
    print("4. The chart should now be visible!")

# Run the fix
fix_chart_name_mismatch() 