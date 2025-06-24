import frappe

@frappe.whitelist()
def leave_type_query(doctype, txt, searchfield, start, page_len, filters):
    return frappe.db.sql("""
        SELECT name, CONCAT(bc_leave_code, ' - ', name) AS label
        FROM `tabLeave Type`
        WHERE bc_leave_code IS NOT NULL AND bc_leave_code != ''
          AND (bc_leave_code LIKE %(txt)s OR name LIKE %(txt)s)
        ORDER BY bc_leave_code ASC
        LIMIT %(start)s, %(page_len)s
    """, {
        "txt": f"%{txt}%",
        "start": start,
        "page_len": page_len
    })