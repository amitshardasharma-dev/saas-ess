# 🚀 **Complete REST API Reference - Leave Management System**

## 🔑 **API Configuration**

```javascript
const API_CONFIG = {
  baseURL: 'http://hr.portal:8000',
  apiKey: '8206c949960b40f',
  apiSecret: '5d34bafe1726d73',
  authorization: 'token 8206c949960b40f:5d34bafe1726d73'
};
```

---

## 📋 **1. EMPLOYEE MANAGEMENT APIs**

### **1.1 Get All Employees**
```http
GET /api/resource/Employee
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "data": [
    {"name": "EMP000001"},
    {"name": "EMP000002"},
    {"name": "EMP000013"}
  ]
}
```

### **1.2 Get Specific Employee Details**
```http
GET /api/resource/Employee/EMP000001
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "data": {
    "name": "EMP000001",
    "first_name": "Guru",
    "middle_name": "A",
    "last_name": "A",
    "full_name": "Guru A A",
    "user_id": "guru@ulx.in",
    "mobile_phone_no": "+91-1234567892",
    "employment_type": "",
    "status": "",
    "bc_employee_id": "EMP01",
    "doctype": "Employee"
  }
}
```

### **1.3 Get Employee by User ID (for authentication mapping)**
```http
GET /api/resource/Employee?filters=[["user_id","=","guru@ulx.in"]]
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

---

## 🎯 **2. LEAVE APPLICATION APIs**

### **2.1 Get All Leave Applications**
```http
GET /api/resource/Leave Application
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "data": [
    {"name": "LEAVE000001"},
    {"name": "LEAVE000003"},
    {"name": "LEAVE000006"},
    {"name": "LEAVE000009"},
    {"name": "LEAVE000010"},
    {"name": "LEAVE000011"}
  ]
}
```

### **2.2 Get Specific Leave Application**
```http
GET /api/resource/Leave Application/LEAVE000001
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "data": {
    "name": "LEAVE000001",
    "owner": "guru@ulx.in",
    "creation": "2025-05-31 12:27:07.553941",
    "modified": "2025-05-31 12:27:07.553941",
    "workflow_state": "Draft",
    "leave_type": "sick leave",
    "from_date": "2025-05-02",
    "till_date": "2025-05-03",
    "leave_reason": "not well",
    "half_day": 0,
    "total_leave_days": 0.0,
    "link_lmbb": "EMP000001",
    "leave_status": "Open",
    "leave_approver": "EMP000011",
    "doctype": "Leave Application",
    "leave_escalation_log": [],
    "leave_approval_entry": []
  }
}
```

### **2.3 Get Employee's Leave Applications**
```http
GET /api/resource/Leave Application?filters=[["link_lmbb","=","EMP000001"]]
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Frontend Filter (Recommended):**
```javascript
// Get all applications and filter client-side
const getMyLeaveApplications = async (employeeId) => {
  const response = await fetch('/api/resource/Leave Application', {
    headers: { 'Authorization': 'token 8206c949960b40f:5d34bafe1726d73' }
  });
  const data = await response.json();
  return data.data.filter(app => app.link_lmbb === employeeId);
};
```

### **2.4 Submit New Leave Application**
```http
POST /api/resource/Leave Application
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json

{
  "doctype": "Leave Application",
  "link_lmbb": "EMP000001",
  "leave_type": "LEAVETYPE02",
  "from_date": "2024-12-21",
  "till_date": "2024-12-21",
  "leave_reason": "Personal work",
  "half_day": 0,
  "leave_approver": "EMP000002"
}
```

**Expected Response (when working):**
```json
{
  "data": {
    "name": "LEAVE000012",
    "docstatus": 0,
    "workflow_state": "Pending",
    "link_lmbb": "EMP000001",
    "leave_type": "LEAVETYPE02",
    "from_date": "2024-12-21",
    "till_date": "2024-12-21",
    "leave_reason": "Personal work",
    "leave_approver": "EMP000002",
    "total_leave_days": 1
  }
}
```

---

## 📝 **3. LEAVE TYPE APIs**

### **3.1 Get All Leave Types**
```http
GET /api/resource/Leave Type
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "data": [
    {"name": "LEAVETYPE06"},
    {"name": "LEAVETYPE02"},
    {"name": "LEAVETYPE01"},
    {"name": "LEAVETYPE07"},
    {"name": "LEAVETYPE05"},
    {"name": "LEAVETYPE04"},
    {"name": "LEAVETYPE03"},
    {"name": "LEAVETYPE08"},
    {"name": "LEAVETYPE09"}
  ]
}
```

### **3.2 Get Specific Leave Type Details**
```http
GET /api/resource/Leave Type/LEAVETYPE01
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "data": {
    "name": "LEAVETYPE01",
    "bc_leave_code": "AL",
    "leave_mapping_code": "Annual Leave",
    "eligible_days": 5.0,
    "once_in_service": 0,
    "only_for_local": 0,
    "min_period_of_service": 0,
    "approve_one_time": 0,
    "leave_applicable_to_gender": "Both",
    "exceed_eligibility_check": 0,
    "supporting_documents_required": 0,
    "max_no_of_times_in_service": 0,
    "allow_date_type": "Allow Past and Future Date",
    "calculated_on": "Calendar Days",
    "applicable_to": "Both",
    "deduct_lop_days": 0,
    "without_pay": 0,
    "doctype": "Leave Type"
  }
}
```

### **3.3 Frontend Leave Types Service**
```javascript
const getLeaveTypesForDropdown = async () => {
  const response = await fetch('/api/resource/Leave Type', {
    headers: { 'Authorization': 'token 8206c949960b40f:5d34bafe1726d73' }
  });
  const data = await response.json();
  
  // Get details for each leave type
  const leaveTypesWithDetails = await Promise.all(
    data.data.map(async (type) => {
      const detailResponse = await fetch(`/api/resource/Leave Type/${type.name}`, {
        headers: { 'Authorization': 'token 8206c949960b40f:5d34bafe1726d73' }
      });
      const detail = await detailResponse.json();
      return {
        value: type.name,
        label: detail.data.leave_mapping_code || type.name,
        eligible_days: detail.data.eligible_days,
        allow_date_type: detail.data.allow_date_type
      };
    })
  );
  
  return leaveTypesWithDetails;
};
```

---

## ⚖️ **4. APPROVAL RULE APIs**

### **4.1 Get All Approval Rules**
```http
GET /api/resource/Leave Approval Rule
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "data": [
    {"name": "3insl0dmva"},
    {"name": "fkdrpsvcsj"},
    {"name": "fncq2hj8i4"}
  ]
}
```

### **4.2 Get Specific Approval Rule**
```http
GET /api/resource/Leave Approval Rule/fkdrpsvcsj
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "data": {
    "name": "fkdrpsvcsj",
    "leave_type": "LEAVETYPE02",
    "min_days": 0,
    "max_days": 999,
    "active": 1,
    "doctype": "Leave Approval Rule",
    "approval_levels": [
      {
        "name": "fkdk7jbb95",
        "level_no": 1,
        "approver_type": "Employee",
        "approver_employee": "EMP000002",
        "sla_days": 1,
        "delegate_to_employee": "EMP000013",
        "mandatory": 1,
        "doctype": "Leave Approval Level"
      }
    ]
  }
}
```

### **4.3 Create New Approval Rule**
```http
POST /api/resource/Leave Approval Rule
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json

{
  "doctype": "Leave Approval Rule",
  "leave_type": "LEAVETYPE02",
  "min_days": 0,
  "max_days": 999,
  "active": 1,
  "approval_levels": [
    {
      "doctype": "Leave Approval Level",
      "level_no": 1,
      "approver_type": "Employee",
      "approver_employee": "EMP000002",
      "sla_days": 1,
      "delegate_to_employee": "EMP000013",
      "mandatory": 1
    }
  ]
}
```

---

## 👨‍💼 **5. MANAGER/APPROVER APIs**

### **5.1 Get Pending Approvals for Manager**
```javascript
// Custom function to get pending approvals
const getPendingApprovals = async (approverEmployeeId) => {
  // Get all leave applications
  const response = await fetch('/api/resource/Leave Application', {
    headers: { 'Authorization': 'token 8206c949960b40f:5d34bafe1726d73' }
  });
  const data = await response.json();
  
  // Filter applications where the manager is the approver and status is pending
  const pendingApprovals = data.data.filter(app => 
    app.leave_approver === approverEmployeeId && 
    (app.workflow_state === 'Pending' || app.workflow_state === 'Draft')
  );
  
  return pendingApprovals;
};
```

### **5.2 Approve/Reject Leave Application**
```http
PUT /api/resource/Leave Application/LEAVE000001
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json

{
  "workflow_state": "Approved",
  "leave_status": "Approved"
}
```

---

## 🔍 **6. CUSTOM API ENDPOINTS**

### **6.1 Preview Approval Chain (Custom Endpoint)**
```http
POST /api/method/hr_portal.hr.doctype.leave_application.leave_application_api.preview_approval_chain
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json

{
  "employee": "EMP000001",
  "leave_type": "LEAVETYPE01",
  "total_leave_days": 1,
  "from_date": "2024-12-21",
  "till_date": "2024-12-21"
}
```

**Expected Response:**
```json
{
  "message": {
    "approval_chain": [
      {
        "level_no": 1,
        "approver": "EMP000002",
        "approver_name": "Jnanesh",
        "sla_days": 2
      },
      {
        "level_no": 2,
        "approver": "EMP000013",
        "approver_name": "Sahil",
        "sla_days": 3
      }
    ]
  }
}
```

### **6.2 Get Current User Info**
```http
GET /api/method/frappe.auth.get_logged_user
Authorization: token 8206c949960b40f:5d34bafe1726d73
Content-Type: application/json
```

**Response:**
```json
{
  "message": "Administrator"
}
```

---

## 🎯 **7. FRONTEND SERVICE IMPLEMENTATIONS**

### **7.1 Complete Employee Service**
```javascript
class EmployeeService {
  constructor() {
    this.baseURL = 'http://hr.portal:8000';
    this.headers = {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    };
  }
  
  async getEmployeeById(employeeId) {
    const response = await fetch(`${this.baseURL}/api/resource/Employee/${employeeId}`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data;
  }
  
  async getAllEmployees() {
    const response = await fetch(`${this.baseURL}/api/resource/Employee`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data;
  }
}
```

### **7.2 Complete Leave Application Service**
```javascript
class LeaveApplicationService {
  constructor() {
    this.baseURL = 'http://hr.portal:8000';
    this.headers = {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    };
  }
  
  async getMyApplications(employeeId) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave Application`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data.filter(app => app.link_lmbb === employeeId);
  }
  
  async getApplicationById(applicationId) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave Application/${applicationId}`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data;
  }
  
  async submitApplication(applicationData) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave Application`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        doctype: 'Leave Application',
        ...applicationData
      })
    });
    return response.json();
  }
  
  async updateApplication(applicationId, updateData) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave Application/${applicationId}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(updateData)
    });
    return response.json();
  }
}
```

### **7.3 Complete Leave Type Service**
```javascript
class LeaveTypeService {
  constructor() {
    this.baseURL = 'http://hr.portal:8000';
    this.headers = {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    };
  }
  
  async getAllLeaveTypes() {
    const response = await fetch(`${this.baseURL}/api/resource/Leave Type`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data;
  }
  
  async getLeaveTypeDetails(leaveTypeId) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave Type/${leaveTypeId}`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data;
  }
  
  async getLeaveTypesWithDetails() {
    const leaveTypes = await this.getAllLeaveTypes();
    const detailedTypes = await Promise.all(
      leaveTypes.map(async (type) => {
        const details = await this.getLeaveTypeDetails(type.name);
        return {
          id: type.name,
          name: details.leave_mapping_code || type.name,
          eligible_days: details.eligible_days,
          allow_date_type: details.allow_date_type,
          calculated_on: details.calculated_on,
          applicable_to: details.applicable_to
        };
      })
    );
    return detailedTypes;
  }
}
```

### **7.4 Complete Manager Service**
```javascript
class ManagerService {
  constructor() {
    this.baseURL = 'http://hr.portal:8000';
    this.headers = {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    };
    this.leaveService = new LeaveApplicationService();
  }
  
  async getPendingApprovals(managerEmployeeId) {
    const allApplications = await this.leaveService.getMyApplications(''); // Get all
    const response = await fetch(`${this.baseURL}/api/resource/Leave Application`, {
      headers: this.headers
    });
    const data = await response.json();
    
    return data.data.filter(app => 
      app.leave_approver === managerEmployeeId && 
      (app.workflow_state === 'Pending' || app.workflow_state === 'Draft')
    );
  }
  
  async approveApplication(applicationId) {
    return this.leaveService.updateApplication(applicationId, {
      workflow_state: 'Approved',
      leave_status: 'Approved'
    });
  }
  
  async rejectApplication(applicationId, reason) {
    return this.leaveService.updateApplication(applicationId, {
      workflow_state: 'Rejected',
      leave_status: 'Rejected',
      rejection_reason: reason
    });
  }
}
```

---

## 🧪 **8. TEST DATA MAPPING**

### **8.1 User-Employee Mapping**
```javascript
const USERNAME_EMPLOYEE_MAPPING = {
  'guru': 'EMP000001',      // Employee
  'Jnanesh': 'EMP000002',   // Manager
  'sahil': 'EMP000013'      // Senior Manager
};

const EMPLOYEE_DETAILS = {
  'EMP000001': {
    name: 'Guru A A',
    role: 'Employee',
    email: 'guru@ulx.in',
    mobile: '+91-1234567892'
  },
  'EMP000002': {
    name: 'Jnanesh A B',
    role: 'Manager',
    email: 'jnanesh@ulx.in',
    mobile: ''
  },
  'EMP000013': {
    name: 'Sahil c g',
    role: 'Senior Manager',
    email: 'sahil@ulx.in',
    mobile: '756435432'
  }
};
```

### **8.2 Leave Type Mapping**
```javascript
const LEAVE_TYPE_MAPPING = {
  'LEAVETYPE01': 'Annual Leave',
  'LEAVETYPE02': 'Casual Leave',
  'LEAVETYPE03': 'Sick Leave',
  'LEAVETYPE04': 'Emergency Leave',
  'LEAVETYPE05': 'Maternity Leave',
  'LEAVETYPE06': 'Paternity Leave',
  'LEAVETYPE07': 'Study Leave',
  'LEAVETYPE08': 'Medical Leave',
  'LEAVETYPE09': 'Compensatory Leave'
};
```

### **8.3 Approval Workflow Mapping**
```javascript
const APPROVAL_WORKFLOWS = {
  'LEAVETYPE01': {
    name: 'Annual Leave',
    levels: 2,
    approvers: ['EMP000002', 'EMP000013'],
    sla: [2, 3],
    flow: 'Employee → Jnanesh → Sahil → Approved'
  },
  'LEAVETYPE02': {
    name: 'Casual Leave',
    levels: 1,
    approvers: ['EMP000002'],
    sla: [1],
    flow: 'Employee → Jnanesh → Approved'
  },
  'LEAVETYPE08': {
    name: 'Medical Leave',
    levels: 1,
    approvers: ['EMP000002'],
    sla: [1],
    flow: 'Employee → Jnanesh → Approved'
  }
};
```

---

## 📞 **9. ERROR HANDLING**

### **9.1 Common Error Responses**
```javascript
// Authentication Error
{
  "exception": "frappe.exceptions.AuthenticationError",
  "exc_type": "AuthenticationError",
  "exc": "Authentication failed"
}

// Validation Error
{
  "exception": "frappe.exceptions.ValidationError",
  "exc_type": "ValidationError",
  "message": "Leave approver is required"
}

// Not Found Error
{
  "exception": "frappe.exceptions.DoesNotExistError",
  "exc_type": "DoesNotExistError",
  "message": "Document not found"
}
```

### **9.2 Error Handling Service**
```javascript
class APIErrorHandler {
  static handle(error, response) {
    if (response.exception) {
      switch (response.exc_type) {
        case 'AuthenticationError':
          throw new Error('Authentication failed. Please login again.');
        case 'ValidationError':
          throw new Error(`Validation error: ${response.message || 'Invalid data'}`);
        case 'DoesNotExistError':
          throw new Error('Requested data not found.');
        default:
          throw new Error(`API Error: ${response.message || 'Unknown error'}`);
      }
    }
    return response;
  }
}
```

---

## 🎯 **10. COMPLETE USAGE EXAMPLE**

```javascript
// Initialize services
const employeeService = new EmployeeService();
const leaveService = new LeaveApplicationService();
const leaveTypeService = new LeaveTypeService();
const managerService = new ManagerService();

// Employee workflow
async function employeeWorkflow() {
  // 1. Get current employee details
  const employee = await employeeService.getEmployeeById('EMP000001');
  
  // 2. Get leave types for dropdown
  const leaveTypes = await leaveTypeService.getLeaveTypesWithDetails();
  
  // 3. Get employee's existing applications
  const myApplications = await leaveService.getMyApplications('EMP000001');
  
  // 4. Submit new application
  const newApplication = await leaveService.submitApplication({
    link_lmbb: 'EMP000001',
    leave_type: 'LEAVETYPE02',
    from_date: '2024-12-21',
    till_date: '2024-12-21',
    leave_reason: 'Personal work',
    half_day: 0,
    leave_approver: 'EMP000002'
  });
  
  console.log('Employee workflow completed');
}

// Manager workflow
async function managerWorkflow() {
  // 1. Get pending approvals
  const pendingApprovals = await managerService.getPendingApprovals('EMP000002');
  
  // 2. Review and approve/reject
  for (const application of pendingApprovals) {
    if (application.leave_reason.includes('emergency')) {
      await managerService.approveApplication(application.name);
    }
  }
  
  console.log('Manager workflow completed');
}
```

---

## 🎉 **FINAL API SUMMARY**

**✅ Employee APIs:** Get employee details and manage profiles  
**✅ Leave Application APIs:** CRUD operations for leave applications  
**✅ Leave Type APIs:** Get available leave types with details  
**✅ Approval Rule APIs:** Manage approval workflows  
**✅ Manager APIs:** Handle approvals and rejections  
**✅ Custom APIs:** Preview approval chains and workflows  
**✅ Error Handling:** Comprehensive error management  
**✅ Test Data:** Complete mapping and test scenarios  

**🚀 This document provides everything needed for complete frontend implementation!** 