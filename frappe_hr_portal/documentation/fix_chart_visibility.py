import frappe
import json

def fix_chart_visibility():
    print("=== FIXING CHART VISIBILITY FOR HR USERS ===")
    
    # Target roles that should have access
    target_roles = ['Hr User', 'Leave Approver', 'Leave Applier', 'HR User Manager', 'Employee']
    
    # Step 1: Check and fix Dashboard Chart document
    print("\n--- 1. Checking Dashboard Chart Document ---")
    try:
        chart_doc = frappe.get_doc("Dashboard Chart", "Leave Type")
        print(f"Dashboard Chart 'Leave Type' found: {chart_doc.name}")
        print(f"Owner: {chart_doc.owner}")
        print(f"Is Standard: {getattr(chart_doc, 'is_standard', 'N/A')}")
        
        # Make it public/accessible by setting owner to Administrator
        if chart_doc.owner != 'Administrator':
            chart_doc.owner = 'Administrator'
            chart_doc.save(ignore_permissions=True)
            print("Updated chart owner to Administrator")
            
    except frappe.DoesNotExistError:
        print("Dashboard Chart 'Leave Type' not found. Creating it...")
        chart_doc = frappe.new_doc("Dashboard Chart")
        chart_doc.chart_name = "Leave Type"
        chart_doc.label = "Leave Type"
        chart_doc.chart_type = "bar"
        chart_doc.source = "Leave Type"
        chart_doc.timeseries = 0
        chart_doc.owner = 'Administrator'
        chart_doc.insert(ignore_permissions=True)
        print("Created Dashboard Chart 'Leave Type'")
    
    # Step 2: Clear any restrictive User Permissions
    print("\n--- 2. Clearing Restrictive User Permissions ---")
    try:
        # Remove any User Permissions that might restrict Dashboard Chart access
        user_perms = frappe.get_all("User Permission", 
                                   filters={"document_type": "Dashboard Chart"},
                                   fields=["name", "user", "for_value"])
        
        for perm in user_perms:
            if perm.for_value == "Leave Type":
                frappe.delete_doc("User Permission", perm.name, ignore_permissions=True)
                print(f"Removed restrictive User Permission: {perm.name}")
                
    except Exception as e:
        print(f"Error clearing User Permissions: {e}")
    
    # Step 3: Add User Permissions for HR users to access the chart
    print("\n--- 3. Adding User Permissions for HR Users ---")
    hr_users = frappe.get_all("Has Role", 
                              filters={"role": ["in", target_roles]}, 
                              fields=["parent"], 
                              distinct=True)
    
    for user_doc in hr_users:
        username = user_doc.parent
        if username == 'Administrator':
            continue
            
        try:
            # Check if User Permission already exists
            existing = frappe.get_all("User Permission", 
                                    filters={
                                        "user": username,
                                        "document_type": "Dashboard Chart",
                                        "for_value": "Leave Type"
                                    })
            
            if not existing:
                user_perm = frappe.new_doc("User Permission")
                user_perm.user = username
                user_perm.document_type = "Dashboard Chart"
                user_perm.for_value = "Leave Type"
                user_perm.read = 1
                user_perm.insert(ignore_permissions=True)
                print(f"Added User Permission for {username}")
            else:
                print(f"User Permission already exists for {username}")
                
        except Exception as e:
            print(f"Error adding User Permission for {username}: {e}")
    
    # Step 4: Update DocPerm for Dashboard Chart to ensure HR roles have access
    print("\n--- 4. Updating DocPerm for Dashboard Chart ---")
    try:
        for role in target_roles:
            # Check if DocPerm exists
            existing_perm = frappe.get_all("DocPerm", 
                                         filters={
                                             "parent": "Dashboard Chart",
                                             "role": role
                                         })
            
            if not existing_perm:
                # Add new DocPerm
                doctype_meta = frappe.get_meta("Dashboard Chart")
                new_perm = frappe.new_doc("DocPerm")
                new_perm.parent = "Dashboard Chart"
                new_perm.parenttype = "DocType"
                new_perm.role = role
                new_perm.read = 1
                new_perm.permlevel = 0
                new_perm.insert(ignore_permissions=True)
                print(f"Added DocPerm for role: {role}")
            else:
                print(f"DocPerm already exists for role: {role}")
                
    except Exception as e:
        print(f"Error updating DocPerm: {e}")
    
    # Step 5: Create a simple Dashboard Chart if it doesn't have proper source
    print("\n--- 5. Ensuring Dashboard Chart Source Configuration ---")
    try:
        chart_source = frappe.get_doc("Dashboard Chart Source", "Leave Type")
        print(f"Dashboard Chart Source 'Leave Type' exists: {chart_source.name}")
    except frappe.DoesNotExistError:
        print("Dashboard Chart Source 'Leave Type' not found. This might be the issue.")
        # You may need to create this via the UI or check the actual source name
    
    # Step 6: Rebuild permissions and clear cache
    print("\n--- 6. Rebuilding Permissions and Clearing Cache ---")
    try:
        frappe.clear_cache()
        # Rebuild permissions for the Dashboard Chart doctype
        frappe.reload_doctype("Dashboard Chart")
        frappe.reload_doctype("Dashboard Chart Source")
        print("Permissions rebuilt and cache cleared")
    except Exception as e:
        print(f"Error rebuilding permissions: {e}")
    
    # Step 7: Final verification
    print("\n--- 7. Final Verification ---")
    test_user = "guru@ulx.in"
    frappe.set_user(test_user)
    
    try:
        # Test if user can now read the specific Dashboard Chart
        chart = frappe.get_doc("Dashboard Chart", "Leave Type")
        print(f"✅ SUCCESS: {test_user} can now read Dashboard Chart 'Leave Type'")
    except frappe.PermissionError:
        print(f"❌ FAILED: {test_user} still cannot read Dashboard Chart 'Leave Type'")
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        frappe.set_user("Administrator")
    
    print("\n=== CHART VISIBILITY FIX COMPLETED ===")
    print("Please:")
    print("1. Clear browser cache")
    print("2. Log out and log back in as guru@ulx.in") 
    print("3. Navigate to Leave Management workspace")
    print("4. Check if the chart is now visible")

# Run the fix
fix_chart_visibility() 