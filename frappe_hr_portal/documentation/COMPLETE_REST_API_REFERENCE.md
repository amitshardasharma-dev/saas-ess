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
```bash
curl -X GET "http://hr.portal:8000/api/resource/Employee" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73" \
  -H "Content-Type: application/json"
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
```bash
curl -X GET "http://hr.portal:8000/api/resource/Employee/EMP000001" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73"
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

---

## 🎯 **2. LEAVE APPLICATION APIs**

### **2.1 Get All Leave Applications**
```bash
curl -X GET "http://hr.portal:8000/api/resource/Leave%20Application" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73"
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
```bash
curl -X GET "http://hr.portal:8000/api/resource/Leave%20Application/LEAVE000001" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73"
```

**Response:**
```json
{
  "data": {
    "name": "LEAVE000001",
    "owner": "guru@ulx.in",
    "creation": "2025-05-31 12:27:07.553941",
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
    "doctype": "Leave Application"
  }
}
```

### **2.3 Submit New Leave Application**
```bash
curl -X POST "http://hr.portal:8000/api/resource/Leave%20Application" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73" \
  -H "Content-Type: application/json" \
  -d '{
    "doctype": "Leave Application",
    "link_lmbb": "EMP000001",
    "leave_type": "LEAVETYPE02",
    "from_date": "2024-12-21",
    "till_date": "2024-12-21",
    "leave_reason": "Personal work",
    "half_day": 0,
    "leave_approver": "EMP000002"
  }'
```

---

## 📝 **3. LEAVE TYPE APIs**

### **3.1 Get All Leave Types**
```bash
curl -X GET "http://hr.portal:8000/api/resource/Leave%20Type" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73"
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
```bash
curl -X GET "http://hr.portal:8000/api/resource/Leave%20Type/LEAVETYPE01" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73"
```

**Response:**
```json
{
  "data": {
    "name": "LEAVETYPE01",
    "bc_leave_code": "AL",
    "leave_mapping_code": "Annual Leave",
    "eligible_days": 5.0,
    "leave_applicable_to_gender": "Both",
    "allow_date_type": "Allow Past and Future Date",
    "calculated_on": "Calendar Days",
    "applicable_to": "Both",
    "doctype": "Leave Type"
  }
}
```

---

## ⚖️ **4. APPROVAL RULE APIs**

### **4.1 Get All Approval Rules**
```bash
curl -X GET "http://hr.portal:8000/api/resource/Leave%20Approval%20Rule" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73"
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
```bash
curl -X GET "http://hr.portal:8000/api/resource/Leave%20Approval%20Rule/fkdrpsvcsj" \
  -H "Authorization: token 8206c949960b40f:5d34bafe1726d73"
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
    "approval_levels": [
      {
        "level_no": 1,
        "approver_type": "Employee",
        "approver_employee": "EMP000002",
        "sla_days": 1,
        "delegate_to_employee": "EMP000013",
        "mandatory": 1
      }
    ]
  }
}
```

---

## 🛠️ **5. JAVASCRIPT SERVICE IMPLEMENTATIONS**

### **5.1 Employee Service**
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

### **5.2 Leave Application Service**
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
    const response = await fetch(`${this.baseURL}/api/resource/Leave%20Application`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data.filter(app => app.link_lmbb === employeeId);
  }
  
  async getApplicationById(applicationId) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave%20Application/${applicationId}`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data;
  }
  
  async submitApplication(applicationData) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave%20Application`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        doctype: 'Leave Application',
        ...applicationData
      })
    });
    return response.json();
  }
}
```

### **5.3 Leave Type Service**
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
    const response = await fetch(`${this.baseURL}/api/resource/Leave%20Type`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data;
  }
  
  async getLeaveTypeDetails(leaveTypeId) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave%20Type/${leaveTypeId}`, {
      headers: this.headers
    });
    const data = await response.json();
    return data.data;
  }
  
  async getLeaveTypesForDropdown() {
    const leaveTypes = await this.getAllLeaveTypes();
    const detailedTypes = await Promise.all(
      leaveTypes.map(async (type) => {
        const details = await this.getLeaveTypeDetails(type.name);
        return {
          value: type.name,
          label: details.leave_mapping_code || type.name,
          eligible_days: details.eligible_days
        };
      })
    );
    return detailedTypes;
  }
}
```

### **5.4 Manager Service**
```javascript
class ManagerService {
  constructor() {
    this.baseURL = 'http://hr.portal:8000';
    this.headers = {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    };
  }
  
  async getPendingApprovals(managerEmployeeId) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave%20Application`, {
      headers: this.headers
    });
    const data = await response.json();
    
    return data.data.filter(app => 
      app.leave_approver === managerEmployeeId && 
      (app.workflow_state === 'Pending' || app.workflow_state === 'Draft')
    );
  }
  
  async approveApplication(applicationId) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave%20Application/${applicationId}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({
        workflow_state: 'Approved',
        leave_status: 'Approved'
      })
    });
    return response.json();
  }
  
  async rejectApplication(applicationId, reason) {
    const response = await fetch(`${this.baseURL}/api/resource/Leave%20Application/${applicationId}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({
        workflow_state: 'Rejected',
        leave_status: 'Rejected',
        rejection_reason: reason
      })
    });
    return response.json();
  }
}
```

---

## 🎯 **6. AUTHENTICATION & USER MAPPING**

### **6.1 Username-Employee Mapping**
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
    email: 'jnanesh@ulx.in'
  },
  'EMP000013': {
    name: 'Sahil c g',
    role: 'Senior Manager',
    email: 'sahil@ulx.in',
    mobile: '756435432'
  }
};
```

### **6.2 Authentication Service**
```javascript
class AuthService {
  constructor() {
    this.currentUser = null;
    this.currentEmployeeId = null;
  }
  
  login(username, password) {
    // Map username to Employee ID
    const employeeId = USERNAME_EMPLOYEE_MAPPING[username];
    
    if (!employeeId) {
      throw new Error(`Employee not found for username: ${username}`);
    }
    
    // Store in session
    sessionStorage.setItem('currentUser', username);
    sessionStorage.setItem('currentEmployeeId', employeeId);
    
    this.currentUser = username;
    this.currentEmployeeId = employeeId;
    
    return { success: true, username, employeeId };
  }
  
  getCurrentEmployeeId() {
    return this.currentEmployeeId || sessionStorage.getItem('currentEmployeeId');
  }
  
  getCurrentUser() {
    return this.currentUser || sessionStorage.getItem('currentUser');
  }
  
  logout() {
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentEmployeeId');
    this.currentUser = null;
    this.currentEmployeeId = null;
  }
}
```

---

## 🧪 **7. COMPLETE USAGE EXAMPLES**

### **7.1 Employee Dashboard Flow**
```javascript
async function loadEmployeeDashboard() {
  const authService = new AuthService();
  const leaveService = new LeaveApplicationService();
  const leaveTypeService = new LeaveTypeService();
  
  // Get current employee ID
  const currentEmployeeId = authService.getCurrentEmployeeId();
  
  // Load employee's leave applications
  const myApplications = await leaveService.getMyApplications(currentEmployeeId);
  console.log('My Applications:', myApplications);
  
  // Load available leave types
  const leaveTypes = await leaveTypeService.getLeaveTypesForDropdown();
  console.log('Available Leave Types:', leaveTypes);
  
  return { myApplications, leaveTypes };
}
```

### **7.2 Submit Leave Application**
```javascript
async function submitLeaveApplication(formData) {
  const authService = new AuthService();
  const leaveService = new LeaveApplicationService();
  
  const currentEmployeeId = authService.getCurrentEmployeeId();
  
  const applicationData = {
    link_lmbb: currentEmployeeId,           // Auto-linked
    leave_type: formData.leaveType,
    from_date: formData.fromDate,
    till_date: formData.tillDate,
    leave_reason: formData.reason,
    half_day: formData.isHalfDay ? 1 : 0,
    leave_approver: 'EMP000002'             // Will be auto-set
  };
  
  try {
    const result = await leaveService.submitApplication(applicationData);
    console.log('Application submitted:', result);
    return result;
  } catch (error) {
    console.error('Submission failed:', error);
    throw error;
  }
}
```

### **7.3 Manager Approval Flow**
```javascript
async function loadManagerDashboard() {
  const authService = new AuthService();
  const managerService = new ManagerService();
  
  const currentEmployeeId = authService.getCurrentEmployeeId();
  
  // Get pending approvals
  const pendingApprovals = await managerService.getPendingApprovals(currentEmployeeId);
  console.log('Pending Approvals:', pendingApprovals);
  
  return { pendingApprovals };
}

async function processApproval(applicationId, action, reason = '') {
  const managerService = new ManagerService();
  
  try {
    if (action === 'approve') {
      const result = await managerService.approveApplication(applicationId);
      console.log('Application approved:', result);
      return result;
    } else if (action === 'reject') {
      const result = await managerService.rejectApplication(applicationId, reason);
      console.log('Application rejected:', result);
      return result;
    }
  } catch (error) {
    console.error('Action failed:', error);
    throw error;
  }
}
```

---

## 📋 **8. TEST DATA REFERENCE**

### **8.1 Test Credentials**
```javascript
const TEST_CREDENTIALS = {
  'guru': { password: 'Phagwara@14', employeeId: 'EMP000001', role: 'Employee' },
  'Jnanesh': { password: 'Phagwara@13', employeeId: 'EMP000002', role: 'Manager' },
  'sahil': { password: 'Phagwara@13', employeeId: 'EMP000013', role: 'Senior Manager' }
};
```

### **8.2 Leave Type Reference**
```javascript
const LEAVE_TYPES = {
  'LEAVETYPE01': 'Annual Leave',
  'LEAVETYPE02': 'Casual Leave',
  'LEAVETYPE03': 'Sick Leave',
  'LEAVETYPE08': 'Medical Leave'
};
```

### **8.3 Approval Workflows**
```javascript
const APPROVAL_WORKFLOWS = {
  'LEAVETYPE01': { // Annual Leave
    levels: 2,
    approvers: ['EMP000002', 'EMP000013'],
    flow: 'Employee → Jnanesh → Sahil → Approved'
  },
  'LEAVETYPE02': { // Casual Leave
    levels: 1,
    approvers: ['EMP000002'],
    flow: 'Employee → Jnanesh → Approved'
  },
  'LEAVETYPE08': { // Medical Leave
    levels: 1,
    approvers: ['EMP000002'],
    flow: 'Employee → Jnanesh → Approved'
  }
};
```

---

## 🚨 **9. ERROR HANDLING**

### **9.1 Common Errors**
```javascript
// Authentication Error
{
  "exception": "frappe.exceptions.AuthenticationError",
  "exc_type": "AuthenticationError"
}

// Validation Error  
{
  "exception": "frappe.exceptions.ValidationError",
  "message": "Leave approver is required"
}

// Module Loading Error (Known Issue)
{
  "exception": "AttributeError",
  "message": "module 'hr_portal.hr.doctype.leave_application.leave_application' has no attribute 'validate'"
}
```

### **9.2 Error Handler**
```javascript
function handleAPIError(response) {
  if (response.exception) {
    switch (response.exc_type) {
      case 'AuthenticationError':
        throw new Error('Authentication failed. Please login again.');
      case 'ValidationError':
        throw new Error(`Validation error: ${response.message}`);
      default:
        throw new Error(`API Error: ${response.message || 'Unknown error'}`);
    }
  }
  return response;
}
```

---

## 🎉 **10. QUICK START CHECKLIST**

### **Frontend Developer Tasks:**
- [ ] **Implement Authentication Service** with username-employee mapping
- [ ] **Create Employee Dashboard** using getMyApplications()
- [ ] **Build Leave Application Form** with auto-linking
- [ ] **Implement Manager Dashboard** with pending approvals
- [ ] **Add Leave Type Dropdown** using getLeaveTypesForDropdown()
- [ ] **Handle Error States** for all API calls
- [ ] **Test with Real Credentials** (guru, Jnanesh, sahil)

### **Working API Endpoints:**
- ✅ **GET Employee data** - Fully functional
- ✅ **GET Leave Applications** - 6 existing records available
- ✅ **GET Leave Types** - 9 types with full details
- ✅ **GET Approval Rules** - 3 configured workflows
- ⚠️ **POST Leave Application** - Validation issue (technical)

### **Development Priority:**
1. **Phase 1:** Employee dashboard with read-only data
2. **Phase 2:** Manager approval interface
3. **Phase 3:** Leave submission form (once validation is fixed)

**🚀 Everything needed for complete frontend development is documented above!** 