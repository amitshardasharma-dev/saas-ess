# New API: Get Approved by User

## Overview
I've added a new REST API endpoint that allows frontend users to fetch all leave applications they have approved.

## API Details

### Endpoint
```
GET /api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_approved_by_user
```

### Authentication
- **Method**: Cookie-based authentication
- **Required**: User must be logged in

### Parameters
- **user** (optional): Specific user email. If not provided, defaults to current logged-in user

### Response Format
```json
{
  "message": [
    {
      "name": "LEAVE000027",
      "employee": "EMP000013",
      "employee_name": "Sahil Kumar", 
      "leave_type": "LEAVETYPE08",
      "from_date": "2025-11-01",
      "till_date": "2025-11-03",
      "total_days": 3,
      "reason": "Complete workflow testing",
      "workflow_state": "Approved",
      "leave_status": "Approved",
      "approved_level": 2,
      "approval_time": "2025-06-13 18:21:03.354587",
      "approval_remarks": "Level 2 approved by Team Lead",
      "creation": "2025-06-13 18:21:02.977526",
      "modified": "2025-06-13 18:21:03.354587"
    }
  ]
}
```

## Key Features

1. **User-Specific**: Returns only leave applications approved by the current user
2. **Complete Details**: Includes employee info, leave details, and approval metadata
3. **Approval Context**: Shows which level the user approved and when
4. **Sorted**: Results sorted by approval time (most recent first)
5. **Error Handling**: Gracefully handles deleted/inaccessible leave applications

## Frontend Usage

### JavaScript/Fetch API
```javascript
const getApprovedByMe = async () => {
  const response = await fetch('http://hr.portal:8000/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_approved_by_user', {
    credentials: 'include'
  });
  return await response.json();
};

// Usage
const approvedLeaves = await getApprovedByMe();
console.log(`I have approved ${approvedLeaves.message.length} leave applications`);
```

### cURL Example
```bash
# Login first
curl -X POST "http://hr.portal:8000/api/method/login" \
  -d "usr=guru@ulx.in&pwd=Phagwara@14" \
  -c cookies.txt

# Get approved leaves
curl -X GET "http://hr.portal:8000/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_approved_by_user" \
  -b cookies.txt
```

## Use Cases

1. **Approval History Dashboard**: Show users their approval history
2. **Performance Metrics**: Track how many approvals a user has processed
3. **Audit Trail**: Provide visibility into past approval decisions
4. **Workload Analysis**: Understand approval patterns and volumes

## Integration with Existing System

- **File Location**: `apps/hr_portal/hr_portal/hr/doctype/leave_application/leave_application_api.py`
- **Function Name**: `get_approved_by_user(user=None)`
- **Permissions**: Uses current user's permissions (no special privileges required)
- **Database**: Queries `Leave Approval Entry` table for approved entries

## Testing

The API has been added and is ready for testing. You can test it with any of the existing users:
- **guru** (HR Head) - should have approved leaves at Level 3
- **jnanesh** (Manager) - should have approved leaves at Level 1  
- **sahil** (Team Lead) - should have approved leaves at Level 2

## Documentation Updated

The new API has been added to the main documentation file:
- **REST API Reference section**: Added curl example and response format
- **Frontend Integration Guide**: Added JavaScript usage examples and React component
- **Dashboard Implementation**: Added approval history section example

This completes your request for an API that allows frontend users to fetch all leave applications they have approved! 🎉 