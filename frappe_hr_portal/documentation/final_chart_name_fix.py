import frappe
import json

def final_chart_name_fix():
    print("🎯 FINAL CHART NAME FIX")
    print("=" * 40)
    print("Fixing chart name mismatch: 'Leave Summary' → 'Leave Type'")
    
    try:
        # Get workspace
        workspace = frappe.get_doc("Workspace", "Leave Management")
        print(f"✅ Got workspace: {workspace.name}")
        
        # Parse current content
        if isinstance(workspace.content, str):
            content = json.loads(workspace.content)
        else:
            content = workspace.content or []
        
        print(f"✅ Parsed content: {len(content)} items")
        
        # Find and fix chart name
        fixed = False
        for item in content:
            if item.get('type') == 'chart':
                current_name = item.get('data', {}).get('chart_name')
                print(f"📊 Found chart: '{current_name}'")
                
                if current_name == 'Leave Summary':
                    # Fix the name
                    item['data']['chart_name'] = 'Leave Type'
                    item['data']['label'] = 'Leave Type'
                    fixed = True
                    print("✅ Updated chart name to 'Leave Type'")
                elif current_name == 'Leave Type':
                    print("✅ Chart name already correct")
                    fixed = True
                break
        
        if not fixed:
            print("❌ No chart found to fix")
            return
        
        # Save with retry mechanism
        max_retries = 3
        for attempt in range(max_retries):
            try:
                print(f"💾 Saving workspace (attempt {attempt + 1}/{max_retries})...")
                
                # Convert content back to JSON string
                workspace.content = json.dumps(content)
                
                # Use flags to avoid hooks and validations
                workspace.flags.ignore_permissions = True
                workspace.flags.ignore_validate = True
                
                # Save and commit immediately
                workspace.save()
                frappe.db.commit()
                
                print("✅ Workspace saved successfully!")
                break
                
            except Exception as e:
                print(f"⚠️ Attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    print("🔄 Retrying...")
                    frappe.db.rollback()
                    import time
                    time.sleep(1)
                else:
                    print("❌ All save attempts failed")
                    return
        
        # Verify the fix
        print("\n🔍 VERIFYING FIX...")
        workspace_verify = frappe.get_doc("Workspace", "Leave Management")
        verify_content = json.loads(workspace_verify.content)
        
        for item in verify_content:
            if item.get('type') == 'chart':
                final_name = item.get('data', {}).get('chart_name')
                print(f"✅ Verified chart name: '{final_name}'")
                if final_name == 'Leave Type':
                    print("🎉 SUCCESS! Chart name is now correct!")
                else:
                    print(f"❌ Still wrong: {final_name}")
                break
        
        # Clear cache
        frappe.clear_cache()
        print("✅ Cache cleared")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        frappe.db.rollback()

# Run the fix
final_chart_name_fix()

print("\n" + "=" * 50)
print("🎯 FINAL STEPS:")
print("1. Clear browser cache (Ctrl+Shift+Delete)")
print("2. Log out and log back in as guru@ulx.in")
print("3. Navigate to Leave Management workspace")
print("4. Chart should now be visible! 📊")
print("=" * 50) 