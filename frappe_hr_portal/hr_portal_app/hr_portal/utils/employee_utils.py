import frappe

@frappe.whitelist()
def get_employee_for_user(user=None):
    user = user or frappe.session.user
    emp = frappe.db.get_value(
        "Employee",
        {"user_id": user},
        ["name", "full_name", "job_title", "e_mail", "reporting_manager_id"],
        as_dict=True
    )
    return emp