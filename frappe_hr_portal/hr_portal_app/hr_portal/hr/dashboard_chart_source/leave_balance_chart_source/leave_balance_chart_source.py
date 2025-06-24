import frappe

@frappe.whitelist()
def get(filters=None):
    labels = [
        "Sick Leave", "Casual Leave", "Earned Leave",
        "Maternity Leave", "Paternity Leave", "Compensatory Off", "Unpaid Leave"
    ]

    total_leave = [12, 15, 90, 15, 5, 3, 2]
    taken_leave = [4, 7, 60, 5, 2, 1, 2]
    available_leave = [t - tk for t, tk in zip(total_leave, taken_leave)]

    return {
        "labels": labels,
        "datasets": [
            {"name": "Total Leave", "values": total_leave},
            {"name": "Available Leave", "values": available_leave},
            {"name": "Taken Leave", "values": taken_leave}
        ],
        "type": "bar",  # VERY IMPORTANT: Must be 'bar'
        "barOptions": {
            "stacked": 0,
            "spaceRatio": 0.5
        },
        "valuesOverPoints": 1  # Show numbers on bars
    }
