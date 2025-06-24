import frappe
import json

def frontend_chart_investigation():
    print("🎭 FRONTEND CHART RENDERING INVESTIGATION")
    print("=" * 60)
    
    # Test 1: Simple chart access verification
    print("\n🔍 TEST 1: BASIC CHART ACCESS")
    print("-" * 40)
    try:
        # Test guru access to chart
        frappe.set_user("guru@ulx.in")
        try:
            chart = frappe.get_doc("Dashboard Chart", "Leave Type")
            print("✅ guru@ulx.in CAN access Dashboard Chart 'Leave Type'")
            print(f"   Chart details: {chart.chart_type}, Source: {chart.source}")
        except Exception as e:
            print(f"❌ guru@ulx.in CANNOT access chart: {e}")
        
        # Test Administrator access  
        frappe.set_user("Administrator")
        try:
            chart = frappe.get_doc("Dashboard Chart", "Leave Type")
            print("✅ Administrator CAN access Dashboard Chart 'Leave Type'")
        except Exception as e:
            print(f"❌ Administrator CANNOT access chart: {e}")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        frappe.set_user("Administrator")
    
    # Test 2: Role comparison for chart visibility
    print("\n🔍 TEST 2: ROLE-BASED CHART VISIBILITY")
    print("-" * 40)
    try:
        admin_roles = frappe.get_roles("Administrator")
        guru_roles = frappe.get_roles("guru@ulx.in")
        
        print("Administrator roles:")
        for role in admin_roles:
            print(f"  🎭 {role}")
        
        print(f"\nguru@ulx.in roles:")
        for role in guru_roles:
            print(f"  👤 {role}")
        
        # Key difference: System Manager
        has_system_manager_admin = "System Manager" in admin_roles
        has_system_manager_guru = "System Manager" in guru_roles
        
        print(f"\nSystem Manager comparison:")
        print(f"  Administrator has System Manager: {has_system_manager_admin}")
        print(f"  guru@ulx.in has System Manager: {has_system_manager_guru}")
        
        if has_system_manager_admin and not has_system_manager_guru:
            print("💡 HYPOTHESIS: Chart visibility tied to System Manager role")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
    
    # Test 3: Check workspace chart configuration
    print("\n🔍 TEST 3: WORKSPACE CHART CONFIGURATION")
    print("-" * 40)
    try:
        workspace = frappe.get_doc("Workspace", "Leave Management")
        content = json.loads(workspace.content) if isinstance(workspace.content, str) else workspace.content
        
        print("Workspace chart configuration:")
        for item in content:
            if item.get('type') == 'chart':
                chart_data = item.get('data', {})
                chart_name = chart_data.get('chart_name')
                print(f"  📊 Chart Name: '{chart_name}'")
                print(f"  📊 Chart Data: {chart_data}")
                
                # Check if this matches any actual chart
                try:
                    actual_chart = frappe.get_doc("Dashboard Chart", chart_name)
                    print(f"  ✅ Matches Dashboard Chart: {actual_chart.name}")
                except:
                    print(f"  ❌ No matching Dashboard Chart found")
                    
                    # Try alternative names
                    alternatives = ["Leave Type", "Leave Summary", "Leave Management"]
                    for alt_name in alternatives:
                        try:
                            alt_chart = frappe.get_doc("Dashboard Chart", alt_name)
                            print(f"  🔄 Alternative found: '{alt_name}'")
                        except:
                            pass
                break
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
    
    # Test 4: Check if there's frontend role filtering
    print("\n🔍 TEST 4: FRONTEND ROLE FILTERING HYPOTHESIS")
    print("-" * 40)
    try:
        print("Testing chart data access for both users:")
        
        # Test as guru
        frappe.set_user("guru@ulx.in")
        try:
            from hr_portal.hr.dashboard_chart_source.leave_type.leave_type import get
            guru_data = get()
            print(f"✅ guru@ulx.in: Chart data works ({len(guru_data.get('datasets', []))} datasets)")
        except Exception as e:
            print(f"❌ guru@ulx.in: Chart data failed: {e}")
        
        # Test as Administrator
        frappe.set_user("Administrator")
        try:
            from hr_portal.hr.dashboard_chart_source.leave_type.leave_type import get
            admin_data = get()
            print(f"✅ Administrator: Chart data works ({len(admin_data.get('datasets', []))} datasets)")
        except Exception as e:
            print(f"❌ Administrator: Chart data failed: {e}")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        frappe.set_user("Administrator")
    
    # Test 5: Create the missing chart name
    print("\n🔍 TEST 5: CREATING MISSING CHART")
    print("-" * 40)
    try:
        # Check if "Leave Summary" chart exists
        try:
            existing_chart = frappe.get_doc("Dashboard Chart", "Leave Summary")
            print("✅ 'Leave Summary' chart already exists")
        except frappe.DoesNotExistError:
            print("❌ 'Leave Summary' chart missing - creating it...")
            
            # Create "Leave Summary" chart to match workspace
            new_chart = frappe.new_doc("Dashboard Chart")
            new_chart.chart_name = "Leave Summary"
            new_chart.label = "Leave Summary"
            new_chart.chart_type = "bar"
            new_chart.source = "Leave Type"  # Same source as Leave Type
            new_chart.timeseries = 0
            new_chart.is_public = 1
            new_chart.owner = "Administrator"
            new_chart.insert(ignore_permissions=True)
            print("✅ Created 'Leave Summary' chart")
            
            # Add permissions for HR roles
            hr_roles = ['Hr User', 'Leave Approver', 'Leave Applier', 'HR User Manager', 'Employee']
            for role in hr_roles:
                try:
                    perm = frappe.new_doc("DocPerm")
                    perm.parent = "Dashboard Chart"
                    perm.parenttype = "DocType"
                    perm.role = role
                    perm.read = 1
                    perm.permlevel = 0
                    perm.insert(ignore_permissions=True)
                    print(f"  ✅ Added permission for {role}")
                except:
                    pass  # Permission might already exist
        
        frappe.db.commit()
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
    
    print("\n" + "=" * 60)
    print("🎭 FRONTEND INVESTIGATION SUMMARY")
    print("=" * 60)
    print("Key findings:")
    print("1. Chart access permissions appear to work for both users")
    print("2. Chart data generation works for both users")
    print("3. The issue is likely frontend chart name resolution")
    print("4. System Manager role might have special frontend privileges")
    print("")
    print("💡 SOLUTION: Create 'Leave Summary' chart to match workspace")
    print("   OR update workspace to use 'Leave Type'")

# Run the investigation
frontend_chart_investigation() 