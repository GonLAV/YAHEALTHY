# Quick Start Guide - Azure DevOps Test Case Tool

## 🚀 Setup (5 minutes)

### 1. Generate PAT Token (Azure DevOps)

**Cloud (dev.azure.com)**:
1. Go to https://dev.azure.com
2. Click your profile icon → Personal access tokens
3. Create new token
4. Select scopes:
   - ✔ Work Items: Read & Write
   - ✔ Test Management: Read & Write
5. Set expiration (e.g., 1 year)
6. Copy token

**TFS On-Premises**:
1. Open your TFS server URL
2. Click your profile icon → Personal access tokens
3. Follow same steps as above

### 2. Configure Connection

1. Open the tool
2. Go to Azure DevOps Setup
3. Select server type (Cloud or On-Premises)
4. Enter:
   - Organization URL (e.g., https://dev.azure.com/myorg)
   - Project Name (e.g., MyProject)
   - PAT Token (paste your token)
   - Collection Name (TFS only, e.g., BoltCollection)
5. Click "Test Connection" to verify
6. Click "Connect to Azure DevOps"

### 3. Start Creating Test Cases

✅ You're ready!

---

## 📝 Creating a Test Case (RAW Format)

### Simple Example

```
Title: Login Test Case
Description: Verify user login functionality
Priority: 2
Tags: smoke, critical, login

Steps:
Step 1:
  Action: Navigate to application login page
  Expected: Login form is displayed with username and password fields

Step 2:
  Action: Enter valid username and password
  Expected: Credentials are entered correctly

Step 3:
  Action: Click Login button
  Expected: User is authenticated and redirected to home page

Precondition: User account exists in system
Postcondition: User session is active
```

### Key Rules

✔️ **Required**:
- `Title:` - Test case name

✔️ **Optional but Recommended**:
- `Description:` - What the test does
- `Steps:` - Test steps
- `Priority:` - 1=Highest, 2=High, 3=Medium, 4=Low
- `Tags:` - Comma-separated (smoke, critical, etc.)

✔️ **Supported Keywords**:
- `Step N:`, `Step #N:` - Step definition
- `Action:`, `Given:`, `When:` - Step action
- `Expected:`, `Then:`, `Assert:`, `Verify:` - Expected result
- `Data:`, `TestData:` - Test data
- `Precondition:` - Prerequisites
- `Postcondition:` - Cleanup/verification after test

✔️ **Disable Lines**:
```
// This step is disabled
Step 1:
  Action: Skipped action
  Expected: Won't be included
```

---

## 🔍 Checking API Logs

### Enable Logging

Open browser DevTools → Console

All API calls are logged with:
- Request method and endpoint
- Request body (sanitized, no tokens shown)
- Response status and timing
- Validation results
- Errors with details

### View Summary

```javascript
// In browser console
import { apiLogger } from '@/lib/api-logger';
apiLogger.getSummary()
// Output: {
//   totalRequests: 10,
//   successfulRequests: 9,
//   failedRequests: 1,
//   averageResponseTime: 245,
//   errorRate: 10
// }
```

### Export Logs

```javascript
// Export as JSON
const json = apiLogger.exportAsJson();
console.log(json);

// Export as CSV
const csv = apiLogger.exportAsCsv();
```

---

## ✅ Verification Checklist

After creating a test case:

- [ ] Test case appears in Azure DevOps
- [ ] Title is populated
- [ ] Description is present
- [ ] Steps are displayed correctly
- [ ] Tags are showing
- [ ] Priority is correct
- [ ] No fields are blank

If any field is missing:
1. Check browser console for errors
2. Review API logs: `apiLogger.getLogs()`
3. Verify PAT token and permissions
4. Check API version compatibility

---

## 🎨 UI Features

### RawEditor Component
- **Paste/Copy buttons** - Transfer test cases
- **Download** - Save as .raw file
- **Upload** - Load from .raw file
- **Real-time validation** - Syntax checking as you type
- **Dark mode** - Automatic support

### AzureDevOpsConfig Component
- **Server type toggle** - Switch between Cloud/TFS
- **Connection test** - Verify connectivity
- **Secure token display** - Hide/show password toggle
- **Help section** - Steps to create PAT
- **Animated UI** - Smooth transitions

---

## 🛠️ Input Format Examples

### Format 1: Key:Value (Recommended)
```
Title: My Test Case
Priority: 2
Tags: smoke

Steps:
Step 1:
  Action: Do something
  Expected: Result appears
```

### Format 2: JSON
```json
{
  "title": "My Test Case",
  "priority": 2,
  "tags": ["smoke"],
  "testSteps": [
    {
      "action": "Do something",
      "expectedResult": "Result appears",
      "order": 1
    }
  ]
}
```

### Format 3: YAML
```yaml
title: My Test Case
priority: 2
tags:
  - smoke
testSteps:
  - action: Do something
    expectedResult: Result appears
    order: 1
```

All formats are auto-detected and converted!

---

## 🎯 Best Practices

1. **Always fill Title** - Required field
2. **Use clear action descriptions** - Make steps understandable
3. **Be specific with expected results** - Avoid ambiguous statements
4. **Add meaningful tags** - Help with filtering (smoke, critical, etc.)
5. **Set appropriate priority** - Reflects test importance
6. **Disable unused steps** - Use `//` comment prefix
7. **Test the connection first** - Verify before creating cases
8. **Check the logs** - Review API logs if issues occur

---

## ⚠️ Common Issues & Solutions

### Issue: "401 Unauthorized"
**Cause**: Invalid PAT token or expired
**Solution**: 
- Regenerate PAT token in Azure DevOps
- Ensure scopes include Work Items and Test Management
- Update token in connection form

### Issue: "404 Not Found"
**Cause**: Wrong organization URL or project name
**Solution**:
- Verify organization URL: https://dev.azure.com/yourorg
- Check project name exists
- Test connection to see detailed errors

### Issue: "Test Case Created But Blank"
**Cause**: Steps not in XML format (rare - fixed in update)
**Solution**:
- Check API logs: look for `<steps>` XML format
- Verify Steps field is populated
- Try with simple test case first
- Contact support if persists

### Issue: "Cannot Read Clipboard"
**Cause**: Browser security restrictions
**Solution**:
- Allow clipboard access in browser settings
- Use file upload instead of paste
- Try different browser

### Issue: "Styling Looks Wrong"
**Cause**: Tailwind CSS not loaded
**Solution**:
- Clear `.next` folder: `rm -rf .next`
- Rebuild: `npm run build`
- Restart dev server
- Hard refresh browser: Ctrl+Shift+R

---

## 📚 More Information

- **Full Guide**: See `IMPLEMENTATION_GUIDE.md`
- **Project Summary**: See `COMPLETION_SUMMARY.md`
- **Architecture**: See `ARCHITECTURE.md`
- **Features**: See `FEATURES_IMPLEMENTED.md`

---

## 🆘 Getting Help

1. **Check logs**: Browser DevTools → Console
2. **Review documentation**: IMPLEMENTATION_GUIDE.md
3. **Test connection**: Use "Test Connection" button
4. **Export logs**: Share with support team
5. **Clear cache**: Try incognito/private browsing

---

**Happy Testing! 🎉**
