import frappe
import json

def investigate_admin_chart():
    print("🕵️ INVESTIGATING WHY CHART WORKS FOR ADMINISTRATOR")
    print("=" * 60)
    
    # Test 1: Check if multiple Dashboard Charts exist
    print("\n🔍 TEST 1: SEARCHING FOR ALL DASHBOARD CHARTS")
    print("-" * 50)
    try:
        # Search for charts with similar names
        search_terms = ["Leave", "Summary", "Type"]
        all_charts = frappe.get_all("Dashboard Chart", fields=["name", "chart_name", "label", "source", "owner"])
        
        print("All Dashboard Charts in system:")
        for chart in all_charts:
            print(f"  📊 Name: '{chart.name}' | Chart Name: '{chart.chart_name}' | Label: '{chart.label}' | Source: '{chart.source}' | Owner: {chart.owner}")
        
        # Look for charts with "Leave" in the name
        leave_charts = [c for c in all_charts if any(term.lower() in c.name.lower() for term in search_terms)]
        print(f"\nCharts related to 'Leave': {len(leave_charts)}")
        for chart in leave_charts:
            print(f"  🎯 '{chart.name}' -> Source: '{chart.source}'")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
    
    # Test 2: Check what Administrator actually sees
    print("\n🔍 TEST 2: TESTING ADMINISTRATOR ACCESS")
    print("-" * 50)
    try:
        frappe.set_user("Administrator")
        
        # Try to access both chart names
        charts_to_test = ["Leave Summary", "Leave Type", "Leave Management"]
        
        for chart_name in charts_to_test:
            try:
                chart = frappe.get_doc("Dashboard Chart", chart_name)
                print(f"✅ Administrator CAN access '{chart_name}'")
                print(f"   Details: Type={chart.chart_type}, Source={chart.source}, Owner={chart.owner}")
            except frappe.DoesNotExistError:
                print(f"❌ Chart '{chart_name}' does NOT exist")
            except Exception as e:
                print(f"⚠️ Error accessing '{chart_name}': {e}")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        frappe.set_user("Administrator")
    
    # Test 3: Check Chart Sources
    print("\n🔍 TEST 3: CHECKING DASHBOARD CHART SOURCES")
    print("-" * 50)
    try:
        all_sources = frappe.get_all("Dashboard Chart Source", fields=["name", "source_name"])
        print("All Dashboard Chart Sources:")
        for source in all_sources:
            print(f"  📈 Name: '{source.name}' | Source Name: '{source.source_name}'")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
    
    # Test 4: Check workspace content as Administrator
    print("\n🔍 TEST 4: ADMINISTRATOR WORKSPACE VIEW")
    print("-" * 50)
    try:
        frappe.set_user("Administrator")
        
        # Check what workspace content Administrator sees
        workspace = frappe.get_doc("Workspace", "Leave Management")
        content = json.loads(workspace.content) if isinstance(workspace.content, str) else workspace.content
        
        print("Workspace content as Administrator:")
        for i, item in enumerate(content):
            if item.get('type') == 'chart':
                chart_name = item.get('data', {}).get('chart_name')
                print(f"  📊 Chart #{i}: '{chart_name}'")
                
                # Try to resolve this chart name
                try:
                    resolved_chart = frappe.get_doc("Dashboard Chart", chart_name)
                    print(f"     ✅ Resolves to: {resolved_chart.name} (Source: {resolved_chart.source})")
                except:
                    print(f"     ❌ Cannot resolve chart '{chart_name}'")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        frappe.set_user("Administrator")
    
    # Test 5: Compare permissions between Administrator and guru
    print("\n🔍 TEST 5: PERMISSION COMPARISON")
    print("-" * 50)
    try:
        # Test as Administrator
        print("As Administrator:")
        frappe.set_user("Administrator")
        admin_charts = []
        for chart_name in ["Leave Summary", "Leave Type"]:
            try:
                chart = frappe.get_doc("Dashboard Chart", chart_name)
                admin_charts.append(chart_name)
                print(f"  ✅ Can access '{chart_name}'")
            except:
                print(f"  ❌ Cannot access '{chart_name}'")
        
        # Test as guru
        print("\nAs guru@ulx.in:")
        frappe.set_user("guru@ulx.in")
        guru_charts = []
        for chart_name in ["Leave Summary", "Leave Type"]:
            try:
                chart = frappe.get_doc("Dashboard Chart", chart_name)
                guru_charts.append(chart_name)
                print(f"  ✅ Can access '{chart_name}'")
            except:
                print(f"  ❌ Cannot access '{chart_name}'")
        
        print(f"\nSummary:")
        print(f"  Administrator can access: {admin_charts}")
        print(f"  guru@ulx.in can access: {guru_charts}")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        frappe.set_user("Administrator")
    
    # Test 6: Check if there's a fallback mechanism
    print("\n🔍 TEST 6: CHART RESOLUTION LOGIC")
    print("-" * 50)
    try:
        # Check if Frappe has any fallback logic for chart names
        frappe.set_user("Administrator")
        
        # Try to simulate what the frontend does
        workspace_chart_name = "Leave Summary"  # What workspace wants
        available_chart_name = "Leave Type"     # What actually exists
        
        print(f"Workspace requests: '{workspace_chart_name}'")
        print(f"Available chart: '{available_chart_name}'")
        
        # Check if Administrator has some special logic
        admin_roles = frappe.get_roles("Administrator")
        print(f"Administrator roles: {admin_roles}")
        
        if "System Manager" in admin_roles:
            print("💡 HYPOTHESIS: Administrator might have System Manager privileges")
            print("   System Managers might have chart resolution fallbacks")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        frappe.set_user("Administrator")
    
    print("\n" + "=" * 60)
    print("🔍 INVESTIGATION SUMMARY")
    print("=" * 60)
    print("This will help us understand why Administrator sees the chart")
    print("despite the apparent name mismatch.")

# Run the investigation
investigate_admin_chart() 