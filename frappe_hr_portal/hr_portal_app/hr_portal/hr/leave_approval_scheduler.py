# Copyright (c) 2025, ULX and contributors
# SLA Escalation and Delegation Scheduler

import frappe
from frappe.utils import now_datetime, add_days, getdate
from frappe import _


def escalate_pending_approvals():
    """
    Check for SLA breaches and escalate/delegate approvals
    This function is called by the scheduler (daily/hourly)
    """
    print("🔍 Checking for SLA breaches...")
    
    try:
        # Get all pending approval entries with SLA deadlines
        now = now_datetime()
        
        pending_entries = frappe.get_all("Leave Approval Entry",
            filters={
                "status": "Pending",
                "sla_deadline": ["<", now],
                "sla_deadline": ["!=", None]
            },
            fields=["name", "parent", "level_no", "approver", "sla_deadline"]
        )
        
        escalated_count = 0
        
        for entry_data in pending_entries:
            try:
                # Get the full approval entry document
                entry = frappe.get_doc("Leave Approval Entry", entry_data.name)
                leave_app = frappe.get_doc("Leave Application", entry.parent)
                
                # Find the corresponding rule level for delegation settings
                rule_level = _get_rule_level_for_entry(leave_app, entry)
                
                if rule_level:
                    _escalate_approval_entry(entry, leave_app, rule_level)
                    escalated_count += 1
                    print(f"✅ Escalated approval for {entry.parent} at level {entry.level_no}")
                else:
                    print(f"⚠️ No rule level found for {entry.parent} level {entry.level_no}")
                    
            except Exception as e:
                frappe.log_error(f"Failed to escalate entry {entry_data.name}: {str(e)}")
                print(f"❌ Failed to escalate {entry_data.name}: {str(e)}")
        
        if escalated_count > 0:
            print(f"🎉 Successfully escalated {escalated_count} approval(s)")
            frappe.db.commit()
        else:
            print("📭 No approvals needed escalation")
            
    except Exception as e:
        frappe.log_error(f"Escalation scheduler error: {str(e)}")
        print(f"❌ Scheduler error: {str(e)}")


def _get_rule_level_for_entry(leave_app, entry):
    """Get the rule level configuration for an approval entry"""
    try:
        # Find the applicable rule for this leave application
        rule = _find_applicable_rule(leave_app)
        
        if not rule:
            return None
        
        # Find the specific level in the rule
        for level in rule.approval_levels:
            if level.level_no == entry.level_no:
                return level
        
        return None
        
    except Exception as e:
        frappe.log_error(f"Error finding rule level: {str(e)}")
        return None


def _find_applicable_rule(leave_app):
    """Find the applicable rule for a leave application (replicates logic from leave_application.py)"""
    filters_list = [
        # Team-specific rule (highest priority)
        {
            "leave_type": leave_app.leave_type,
            "team": leave_app.team,
            "min_days": ("<=", leave_app.total_leave_days),
            "max_days": (">=", leave_app.total_leave_days),
            "active": 1
        } if leave_app.team else None,
        # Department-specific rule
        {
            "leave_type": leave_app.leave_type,
            "department": leave_app.department,
            "team": ["in", ["", None]],
            "min_days": ("<=", leave_app.total_leave_days),
            "max_days": (">=", leave_app.total_leave_days),
            "active": 1
        } if leave_app.department else None,
        # Global rule (lowest priority)
        {
            "leave_type": leave_app.leave_type,
            "department": ["in", ["", None]],
            "team": ["in", ["", None]],
            "min_days": ("<=", leave_app.total_leave_days),
            "max_days": (">=", leave_app.total_leave_days),
            "active": 1
        }
    ]
    
    # Remove None entries
    filters_list = [f for f in filters_list if f is not None]
    
    for filters in filters_list:
        rules = frappe.get_all("Leave Approval Rule",
                              filters=filters,
                              order_by="modified desc",
                              limit=1)
        if rules:
            return frappe.get_doc("Leave Approval Rule", rules[0].name)
    
    return None


def _escalate_approval_entry(entry, leave_app, rule_level):
    """Escalate/delegate an approval entry based on rule configuration"""
    # Mark current entry as escalated
    entry.status = "Escalated"
    entry.save()
    
    # Determine delegation target
    delegate_user = _resolve_delegate_user(rule_level, leave_app)
    
    if not delegate_user:
        # Fallback to system default or skip
        frappe.log_error(f"No delegate found for {entry.parent} level {entry.level_no}")
        return
    
    # Create new approval entry for delegate
    new_entry = leave_app.append("leave_approval_entry", {
        "level_no": entry.level_no,  # Same level, different approver
        "approver": delegate_user,
        "status": "Pending",
        "sla_deadline": add_days(now_datetime(), rule_level.sla_days) if rule_level.sla_days else None
    })
    
    # Log the escalation
    leave_app.append("leave_escalation_log", {
        "from_approver": entry.approver,
        "to_approver": delegate_user,
        "escalated_on": now_datetime(),
        "escalation_reason": "SLA Breach",
        "remarks": f"SLA of {rule_level.sla_days} days breached"
    })
    
    # Update workflow state if this was the current pending level
    current_pending_level = _get_current_pending_level(leave_app)
    if current_pending_level == entry.level_no:
        leave_app.workflow_state = f"Pending-L{entry.level_no} (Escalated)"
    
    # Save the leave application
    leave_app.save()
    
    # Create ToDo for new approver
    _create_escalation_todo(leave_app, delegate_user, entry.approver)


def _resolve_delegate_user(rule_level, leave_app):
    """Resolve the delegate user based on rule level configuration"""
    # Priority order: Employee > Role > Level Jump > Default
    
    if rule_level.delegate_to_employee:
        employee_doc = frappe.get_doc("Employee", rule_level.delegate_to_employee)
        if employee_doc.user_id:
            return employee_doc.user_id
    
    if rule_level.delegate_to_role:
        users = frappe.get_all("Has Role",
                               filters={"role": rule_level.delegate_to_role, "parenttype": "User"},
                               fields=["parent"])
        if users:
            return users[0].parent
    
    if rule_level.delegate_level_no:
        # Jump to another level in the same application
        for entry in leave_app.leave_approval_entry:
            if entry.level_no == rule_level.delegate_level_no and entry.status == "Pending":
                return entry.approver
    
    # Fallback to HR Manager or System Manager
    hr_managers = frappe.get_all("Has Role",
                                 filters={"role": "HR Manager", "parenttype": "User"},
                                 fields=["parent"])
    if hr_managers:
        return hr_managers[0].parent
    
    # Final fallback to Administrator
    return "Administrator"


def _get_current_pending_level(leave_app):
    """Get the current pending approval level"""
    for entry in leave_app.leave_approval_entry:
        if entry.status == "Pending":
            return entry.level_no
    return None


def _create_escalation_todo(leave_app, delegate_user, original_approver):
    """Create ToDo for escalated approval"""
    try:
        original_approver_name = frappe.get_value("User", original_approver, "full_name")
        
        todo = frappe.get_doc({
            "doctype": "ToDo",
            "description": f"ESCALATED: Leave application {leave_app.name} requires your approval (escalated from {original_approver_name})",
            "owner": delegate_user,
            "reference_type": "Leave Application",
            "reference_name": leave_app.name,
            "priority": "High",  # Escalated items get high priority
            "status": "Open"
        })
        todo.insert(ignore_permissions=True)
        
    except Exception as e:
        frappe.log_error(f"Failed to create escalation ToDo: {str(e)}")


# Manual escalation method (can be called via UI)
@frappe.whitelist()
def manual_escalate_approval(leave_id, level_no, delegate_user, reason="Manual Delegation"):
    """Manually escalate an approval to a different user"""
    leave_app = frappe.get_doc("Leave Application", leave_id)
    
    # Find the specific approval entry
    target_entry = None
    for entry in leave_app.leave_approval_entry:
        if entry.level_no == level_no and entry.status == "Pending":
            target_entry = entry
            break
    
    if not target_entry:
        frappe.throw(_("No pending approval found at level {0}").format(level_no))
    
    # Validate delegate user
    if not frappe.db.exists("User", delegate_user):
        frappe.throw(_("Invalid delegate user"))
    
    # Mark current entry as escalated
    target_entry.status = "Escalated"
    target_entry.save()
    
    # Create new entry for delegate
    new_entry = leave_app.append("leave_approval_entry", {
        "level_no": level_no,
        "approver": delegate_user,
        "status": "Pending"
    })
    
    # Log the escalation
    leave_app.append("leave_escalation_log", {
        "from_approver": target_entry.approver,
        "to_approver": delegate_user,
        "escalated_on": now_datetime(),
        "escalation_reason": "Manual Delegation",
        "remarks": reason
    })
    
    leave_app.save()
    
    # Create ToDo for delegate
    _create_escalation_todo(leave_app, delegate_user, target_entry.approver)
    
    return {"message": f"Approval escalated to {delegate_user} successfully"}


# Test function for scheduler
def test_escalation_system():
    """Test function to verify escalation system is working"""
    print("🧪 Testing Escalation System...")
    
    try:
        # Check if we can find any test data
        test_entries = frappe.get_all("Leave Approval Entry",
            filters={"status": "Pending"},
            limit=5,
            fields=["name", "parent", "sla_deadline"]
        )
        
        print(f"📊 Found {len(test_entries)} pending approval entries")
        
        for entry in test_entries:
            print(f"  - {entry.parent}: SLA Deadline = {entry.sla_deadline}")
        
        # Test rule finding
        test_apps = frappe.get_all("Leave Application",
            filters={"docstatus": 0},
            limit=3,
            fields=["name", "leave_type", "total_leave_days"]
        )
        
        for app in test_apps:
            leave_doc = frappe.get_doc("Leave Application", app.name)
            rule = _find_applicable_rule(leave_doc)
            print(f"  - {app.name}: Rule found = {rule.name if rule else 'None'}")
        
        print("✅ Escalation system test completed")
        
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        frappe.log_error(f"Escalation test error: {str(e)}") 