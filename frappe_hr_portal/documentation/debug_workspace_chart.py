import frappe
import json

def debug_and_fix_workspace_chart():
    print("=== DEBUGGING WORKSPACE CHART CONFIGURATION ===")
    
    # Step 1: Check current workspace content
    print("\n--- 1. Checking Current Workspace Content ---")
    try:
        workspace = frappe.get_doc("Workspace", "Leave Management")
        print(f"Workspace found: {workspace.name}")
        print(f"Is Public: {workspace.public}")
        print(f"Content type: {type(workspace.content)}")
        
        if isinstance(workspace.content, str):
            try:
                content = json.loads(workspace.content)
                print("✅ Content is valid JSON string")
            except:
                print("❌ Content is string but not valid JSON")
                content = []
        else:
            content = workspace.content or []
            print("✅ Content is already a list/array")
        
        print(f"Number of items in content: {len(content)}")
        
        # Check if chart exists in content
        chart_found = False
        for i, item in enumerate(content):
            print(f"Item {i}: Type = {item.get('type')}, Data = {item.get('data', {}).keys()}")
            if item.get('type') == 'chart' or item.get('type') == 'Chart':
                chart_found = True
                print(f"  📊 CHART FOUND: {item}")
        
        if not chart_found:
            print("❌ NO CHART FOUND in workspace content")
        
    except Exception as e:
        print(f"Error checking workspace: {e}")
        return
    
    # Step 2: Fix workspace content with proper chart configuration
    print("\n--- 2. Fixing Workspace Content ---")
    try:
        # Create a clean workspace content with the chart
        new_content = [
            {
                "id": "welcome_block",
                "type": "custom_block",
                "data": {
                    "custom_block_name": "Leave Management HTML Block",
                    "col": 12
                }
            },
            {
                "id": "leave_chart",
                "type": "chart",
                "data": {
                    "chart_name": "Leave Type",
                    "label": "Leave Summary",
                    "col": 12
                }
            },
            {
                "id": "recent_applications",
                "type": "quick_list",
                "data": {
                    "quick_list_name": "Recent Leave Applications",
                    "col": 12
                }
            },
            {
                "id": "shortcuts",
                "type": "shortcut",
                "data": {
                    "shortcut_name": "Leave Shortcuts",
                    "col": 12
                }
            }
        ]
        
        # Update workspace with new content
        workspace.content = json.dumps(new_content)
        workspace.save(ignore_permissions=True)
        print("✅ Updated workspace content with proper chart configuration")
        
    except Exception as e:
        print(f"Error updating workspace: {e}")
    
    # Step 3: Verify Dashboard Chart exists and is properly configured
    print("\n--- 3. Verifying Dashboard Chart Configuration ---")
    try:
        chart = frappe.get_doc("Dashboard Chart", "Leave Type")
        print(f"Chart Name: {chart.chart_name}")
        print(f"Chart Type: {chart.chart_type}")
        print(f"Source: {chart.source}")
        print(f"Owner: {chart.owner}")
        print(f"Is Standard: {getattr(chart, 'is_standard', 'N/A')}")
        
        # Ensure chart is properly configured
        chart.chart_type = "bar"
        chart.source = "Leave Type"
        chart.timeseries = 0
        chart.save(ignore_permissions=True)
        print("✅ Dashboard Chart configuration verified and updated")
        
    except Exception as e:
        print(f"Error checking Dashboard Chart: {e}")
    
    # Step 4: Check Dashboard Chart Source
    print("\n--- 4. Checking Dashboard Chart Source ---")
    try:
        source = frappe.get_doc("Dashboard Chart Source", "Leave Type")
        print(f"Source Name: {source.name}")
        print(f"Source Type: {getattr(source, 'source_type', 'N/A')}")
        
        # Test the source method
        frappe.set_user("guru@ulx.in")
        from hr_portal.hr.dashboard_chart_source.leave_type.leave_type import get
        result = get()
        print(f"✅ Chart data generation successful for guru@ulx.in")
        print(f"Labels: {result.get('labels', [])}")
        print(f"Datasets: {len(result.get('datasets', []))}")
        frappe.set_user("Administrator")
        
    except Exception as e:
        print(f"Error checking Dashboard Chart Source: {e}")
        frappe.set_user("Administrator")
    
    # Step 5: Clear all caches
    print("\n--- 5. Clearing All Caches ---")
    try:
        frappe.clear_cache()
        frappe.clear_website_cache()
        print("✅ All caches cleared")
    except Exception as e:
        print(f"Error clearing caches: {e}")
    
    # Step 6: Verify workspace file
    print("\n--- 6. Checking Workspace JSON File ---")
    try:
        import os
        workspace_file = "/workspace/development/frappe-bench/apps/hr_portal/hr_portal/hr/workspace/leave_management/leave_management.json"
        if os.path.exists(workspace_file):
            with open(workspace_file, 'r') as f:
                file_content = json.load(f)
            
            print(f"✅ Workspace file exists")
            print(f"File content type: {type(file_content.get('content'))}")
            
            # Ensure file content matches database
            if isinstance(file_content.get('content'), str):
                file_content['content'] = new_content
                with open(workspace_file, 'w') as f:
                    json.dump(file_content, f, indent=1)
                print("✅ Updated workspace JSON file")
            
        else:
            print("❌ Workspace JSON file not found")
            
    except Exception as e:
        print(f"Error checking workspace file: {e}")
    
    print("\n=== WORKSPACE CHART DEBUG COMPLETED ===")
    print("Next steps:")
    print("1. Clear browser cache completely")
    print("2. Log out and log back in as guru@ulx.in")
    print("3. Navigate to Leave Management workspace")
    print("4. Check browser developer console for any JavaScript errors")
    print("5. If still not working, try refreshing the page (F5)")

# Run the debug and fix
debug_and_fix_workspace_chart() 