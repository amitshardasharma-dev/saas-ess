# 🔗 **User-Employee Linking Guide for Frontend**

## 🎯 **The Challenge**
When a user logs in and submits a leave application, the system needs to automatically link it to their Employee ID. The `link_lmbb` field in Leave Application must be populated with the correct Employee ID.

## 🏗️ **Architecture Solution**

### **Data Flow:**
```
Frontend Login (guru) → Username Mapping → Employee Record (EMP000001) → Leave Application
```

### **Step-by-Step Implementation:**

### **1. User Authentication & Employee ID Resolution**

```javascript
// Option A: Get Employee ID by User Email
const getCurrentEmployeeId = async (userEmail) => {
  const response = await fetch('/api/resource/Employee', {
    method: 'GET',
    headers: {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    }
  });
  
  const employees = await response.json();
  const currentEmployee = employees.data.find(emp => {
    // Get full employee details to check user_id
    return getEmployeeDetails(emp.name).user_id === userEmail;
  });
  
  return currentEmployee?.name; // Returns EMP000001, EMP000002, etc.
};

// Helper function to get employee details
const getEmployeeDetails = async (employeeId) => {
  const response = await fetch(`/api/resource/Employee/${employeeId}`, {
    method: 'GET',
    headers: {
      'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return data.data;
};
```

### **2. Username-Based Mapping (Recommended)**

```javascript
// Create a static mapping for your test environment
const USERNAME_EMPLOYEE_MAPPING = {
  'guru': 'EMP000001',      // Employee
  'Jnanesh': 'EMP000002',   // Manager
  'sahil': 'EMP000013'      // Senior Manager
};

// Get current user's employee ID
const getCurrentEmployeeId = (username) => {
  return USERNAME_EMPLOYEE_MAPPING[username];
};
```

### **3. Authentication Flow Implementation**

```javascript
class AuthService {
  constructor() {
    this.currentUser = null;
    this.currentEmployeeId = null;
  }
  
  async login(username, password) {
    // Step 1: Authenticate with Frappe
    const loginResponse = await fetch('/api/method/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usr: username,
        pwd: password
      })
    });
    
    if (loginResponse.ok) {
      // Step 2: Map username directly to Employee ID
      this.currentEmployeeId = USERNAME_EMPLOYEE_MAPPING[username];
      this.currentUser = username;
      
      if (!this.currentEmployeeId) {
        throw new Error(`Employee not found for username: ${username}`);
      }
      
      // Store in localStorage for persistence
      localStorage.setItem('currentEmployeeId', this.currentEmployeeId);
      localStorage.setItem('currentUser', this.currentUser);
      
      return {
        success: true,
        user: this.currentUser,
        employeeId: this.currentEmployeeId
      };
    }
    
    throw new Error('Login failed');
  }
  
  getCurrentEmployeeId() {
    return this.currentEmployeeId || localStorage.getItem('currentEmployeeId');
  }
  
  getCurrentUser() {
    return this.currentUser || localStorage.getItem('currentUser');
  }
}
```

### **4. Leave Application Submission with Auto-Linking**

```javascript
class LeaveService {
  constructor(authService) {
    this.authService = authService;
  }
  
  async submitLeaveApplication(leaveData) {
    // Auto-populate the employee ID
    const currentEmployeeId = this.authService.getCurrentEmployeeId();
    
    if (!currentEmployeeId) {
      throw new Error('Employee ID not found. Please login again.');
    }
    
    const applicationData = {
      doctype: 'Leave Application',
      link_lmbb: currentEmployeeId,        // ← AUTO-POPULATED
      leave_type: leaveData.leave_type,
      from_date: leaveData.from_date,
      till_date: leaveData.till_date,
      leave_reason: leaveData.leave_reason,
      half_day: leaveData.half_day || 0,
      leave_approver: 'EMP000002'          // Will be auto-set by backend
    };
    
    const response = await fetch('/api/resource/Leave Application', {
      method: 'POST',
      headers: {
        'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(applicationData)
    });
    
    return response.json();
  }
  
  async getMyLeaveApplications() {
    const currentEmployeeId = this.authService.getCurrentEmployeeId();
    
    const response = await fetch('/api/resource/Leave Application', {
      method: 'GET',
      headers: {
        'Authorization': 'token 8206c949960b40f:5d34bafe1726d73',
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    // Filter applications for current employee
    return data.data.filter(app => app.link_lmbb === currentEmployeeId);
  }
}
```

### **5. React/Next.js Context Implementation**

```javascript
// AuthContext.js
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  useEffect(() => {
    // Check for existing session
    const savedEmployeeId = localStorage.getItem('currentEmployeeId');
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedEmployeeId && savedUser) {
      setCurrentEmployeeId(savedEmployeeId);
      setCurrentUser(savedUser);
      setIsAuthenticated(true);
    }
  }, []);
  
  const login = async (username, password) => {
    try {
      // Direct username to Employee ID mapping
      const employeeId = USERNAME_EMPLOYEE_MAPPING[username];
      
      if (!employeeId) {
        throw new Error(`Employee not found for username: ${username}`);
      }
      
      // Authenticate with backend (if needed)
      // const authResponse = await authenticateUser(username, password);
      
      // Store session
      localStorage.setItem('currentEmployeeId', employeeId);
      localStorage.setItem('currentUser', username);
      
      setCurrentEmployeeId(employeeId);
      setCurrentUser(username);
      setIsAuthenticated(true);
      
      return { success: true };
    } catch (error) {
      throw error;
    }
  };
  
  const logout = () => {
    localStorage.removeItem('currentEmployeeId');
    localStorage.removeItem('currentUser');
    setCurrentEmployeeId(null);
    setCurrentUser(null);
    setIsAuthenticated(false);
  };
  
  return (
    <AuthContext.Provider value={{
      currentUser,
      currentEmployeeId,
      isAuthenticated,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

### **6. Usage in Components**

```javascript
// LeaveApplicationForm.js
import { useAuth } from './AuthContext';

const LeaveApplicationForm = () => {
  const { currentEmployeeId, currentUser } = useAuth();
  
  const handleSubmit = async (formData) => {
    const leaveApplication = {
      doctype: 'Leave Application',
      link_lmbb: currentEmployeeId,     // ← Automatically linked
      leave_type: formData.leaveType,
      from_date: formData.fromDate,
      till_date: formData.tillDate,
      leave_reason: formData.reason,
      half_day: formData.isHalfDay ? 1 : 0
    };
    
    // Submit to API...
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <p>Submitting leave for: {currentUser} (Employee: {currentEmployeeId})</p>
      {/* Form fields */}
    </form>
  );
};
```

## 🔍 **Verification & Testing**

### **Test the Linking:**
```javascript
// Test script to verify linking works
const testUserEmployeeLinking = () => {
  console.log('Testing username-employee linking:');
  
  Object.entries(USERNAME_EMPLOYEE_MAPPING).forEach(([username, employeeId]) => {
    console.log(`Username: ${username} → Employee: ${employeeId}`);
  });
  
  // Test current user
  const currentEmployeeId = authService.getCurrentEmployeeId();
  console.log(`Current logged-in employee: ${currentEmployeeId}`);
  
  // Test all login scenarios
  console.log('\nTesting login scenarios:');
  ['guru', 'Jnanesh', 'sahil'].forEach(username => {
    const employeeId = USERNAME_EMPLOYEE_MAPPING[username];
    console.log(`Login "${username}" → Employee "${employeeId}"`);
  });
};
```

## 🚨 **Security Considerations**

1. **Never expose Employee IDs in URLs** - Use session-based identification
2. **Validate permissions** - Ensure users can only access their own data
3. **Session management** - Implement proper logout and session expiry
4. **API security** - Use proper authentication tokens

## 📋 **Summary for Frontend Developer**

**✅ SOLUTION:**
1. **Map login username to Employee ID** using the static mapping table
2. **Store Employee ID in session** after successful login
3. **Auto-populate `link_lmbb`** field in all leave applications
4. **Filter data by Employee ID** for user-specific views
5. **Implement proper session management** for security

**🎯 KEY TAKEAWAY:**
The frontend is responsible for maintaining the user-employee relationship and automatically linking leave applications to the correct Employee ID. The backend will then handle the approval workflow based on that Employee ID. 