# 🚀 Quick Start Guide — Test Management Platform

Made by Gon Shaul Lavan

---

## 🗺️ Roadmap & Advanced Features

This tool is evolving to deliver the most advanced test management experience. Planned and in-progress features include:

### Test Case Creation & Management
- One-click test creation from requirements, user stories, or work items
- Reusable steps & templates
- Dynamic parameters for data-driven testing
- Bulk import/export (Excel, CSV, JSON)
- Versioning & history

### Intelligent Test Suggestions
- AI-assisted test case generation
- Coverage analysis
- Duplicate detection
- Priority recommendations

### Automation Integration
- Auto-map manual steps to automation scripts (Selenium, Cypress, etc.)
- CI/CD integration (Azure Pipelines)
- Smart test scheduling
- Failure prediction

### Test Execution & Reporting
- Single-click execution (manual/automated)
- Real-time dashboards
- Smart defect reporting
- Customizable reports

### Collaboration & Workflow
- Live commenting & review
- Role-based access
- Notifications & reminders
- Integration with Teams/Slack

### Advanced Smarts / AI Features
- Natural language parsing
- Test impact analysis
- Flaky test detection
- Predictive insights

### UX / Developer Experience
- Drag-and-drop UI for test steps
- Fast search & filter
- Dark mode & customization
- Keyboard-first workflow

### “Wow” Features
- Auto-suggest edge cases
- Gamification
- Cross-project intelligence
- Voice commands & AI assistant

---

## Installation (5 minutes)

```bash
# Navigate to project directory
cd TESTCASETOOL

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

## First Steps

### 1️⃣ Get Your Credentials

#### For Azure DevOps Cloud:
1. Go to https://dev.azure.com
2. Click your profile icon in top-right
3. Select "Personal access tokens"
4. Click "+ New Token"
5. Fill in:
   - Name: `Test Case Tool PAT`
   - Expiration: 1 year
   - Scopes: 
     - ✓ Test (read, write)
     - ✓ Work Items (read, write)
6. Click "Create" and copy the token

Get your Organization URL:
- Format: `https://dev.azure.com/yourorgname`

#### For TFS On-Premises:
1. Open your TFS Server URL in browser (e.g., `https://tlvtfs03.ciosus.com/tfs`)
2. Click your profile icon
3. Select "Personal access tokens"
4. Click "+ New Token"
5. Fill in:
   - Name: `Test Case Tool PAT`
   - Expiration: 1 year
   - Scopes: 
     - ✓ Test (read, write)
     - ✓ Work Items (read, write)
6. Click "Create" and copy the token

Get your TFS Server URL and Collection:
- Format: `https://server.com/tfs` (without collection)
- Collection Name: The collection containing your project (e.g., `BoltCollection`)

### 2️⃣ Connect the Tool

1. Launch the application at `http://localhost:3000`
2. Select your **Server Type**: ☁️ Azure DevOps Cloud or 🖥️ TFS On-Premises

#### Azure DevOps Cloud:
- Server URL: `https://dev.azure.com/yourorgname`
- Project Name: Your Azure DevOps project name
- PAT Token: (the token you created)
- Click "Connect to Azure DevOps"

#### TFS On-Premises:
- TFS Server URL: `https://tlvtfs03.ciosus.com/tfs`
- Collection Name: `BoltCollection`
- Project Name: `EPOS` (or your project name)
- PAT Token: (the token you created)
- Click "Test Connection" first to verify (tries multiple API versions)
- Click "Connect to TFS Server"

### 3️⃣ Create Your First Test Case

**Unified Editor (RAW & Bulk on one page)**

- Click "Create Test Case" in the sidebar
- Use the tabs at the top to switch between RAW Mode and Bulk Editor
- Enter your test case title and description at the top
- Add steps using either editor:
  - **RAW Mode:** Paste or type structured text (Key:Value, JSON, etc.)
  - **Bulk Editor:** Spreadsheet-style grid with drag-and-drop, attachments, and smart paste
- Use the "Fields" menu to set Priority and Automation Status (required for TFS)
- Click "Save to Azure DevOps" when ready

### 4️⃣ Test Azure DevOps API

1. Click "API Request Executor" in sidebar
2. Select method: GET
3. Enter endpoint: `/test/plans?api-version=7.0`
4. Click "Send"
5. See your test plans in the response!

## 📊 Dynamic Parameters for Data-Driven Testing

Define placeholders in test cases for data-driven testing scenarios.

### How to Use
- Use `${parameterName}` syntax in test step actions and expected results
- Example: "Login with user `${username}` and password `${password}`"
- When executing tests, provide parameter values or link to data files
- Supports CSV, JSON, or Excel data sources for batch test runs

### Parameter Syntax
- `${username}` - Simple parameter
- `${user.email}` - Nested object parameter
- `${users[0].name}` - Array access

### Example Workflow
1. Create a test case with parameters: "Login with `${username}` and `${password}`"
2. Click "Add Data" to upload CSV or JSON with test data
3. Run test case with different data sets automatically
4. Results show which data combinations passed/failed

## 📥 Bulk Import/Export

Import and export test cases in bulk for easy integration with other tools.

### Supported Formats
- **JSON**: Full test case structure with all fields
- **CSV**: Simplified format (Title, Description, Steps, Tags, Priority)
- **Excel**: Multi-sheet workbooks with test cases and data

### How to Use
- Click "Import" in the Create Test Case page to upload a file
- Select format (JSON, CSV, or Excel)
- Preview imported test cases before confirmation
- Click "Export" to download all test cases in your preferred format

### Import/Export Workflow
1. Create 10+ test cases in your project
2. Click "Export All" and download as JSON
3. Share with team or backup to version control
4. Other team members can import the same file

## ⏮️ Versioning & History

Keep track of test case changes and rollback to previous versions if needed.

### Features
- Auto-save versions when test case is updated
- View change history (who changed what, when)
- Compare two versions side-by-side
- Rollback to any previous version with one click
- Comments on versions for team communication

### How to Use
- Click "History" on any test case to view all versions
- Select two versions to compare differences
- Click "Rollback" to restore a previous version
- Add comments explaining why you reverted

## 🔍 Duplicate Detection

Automatically warn when creating a test case that's similar to existing ones.

### Features
- Real-time similarity check as you type test case title
- Suggests similar test cases (by title, description, or steps)
- Shows similarity percentage (e.g., 85% similar)
- Prevents accidental duplicate creation

### How to Use
- When creating a new test case, the tool checks existing test cases
- If a similar test is found, a warning appears
- Review suggested duplicates before saving
- Optionally merge or link related test cases

## 🔎 Fast Search & Filter

Find test cases quickly by module, feature, priority, or keyword.

### Filter Options
- **Keyword Search**: Search by title, description, or tags
- **Priority**: Filter by priority level (1-4)
- **Automation Status**: Show only automated, manual, or mixed test cases
- **Tags**: Filter by one or more tags
- **Automation Mapping**: Filter by mapped automation scripts

### Search Syntax
- `title:"Login Test"` - Exact phrase search
- `tag:smoke` - Filter by tag
- `priority:1` - Filter by priority
- `automated` - Show only automated tests
- `manual` - Show only manual tests

### Keyboard Shortcuts
- `Ctrl+K` (or `Cmd+K` on Mac) - Open search
- `Ctrl+/` - Focus search box
- `Escape` - Close search

## 📊 Real-Time Dashboards & Analytics

Monitor test health, coverage, and trends at a glance.

### Dashboard Metrics
- **Test Case Count**: Total, by status, by automation level
- **Pass/Fail Trends**: Historical pass rates and trend analysis
- **Coverage**: By feature, by module, by requirement
- **Automation Status**: Percentage of automated vs manual tests
- **Recent Changes**: New, updated, or deleted test cases
- **Team Activity**: Who created/modified test cases recently

### Charts & Visualizations
- Pass/Fail pie charts
- Trend line charts (pass rate over time)
- Heatmaps by feature/module
- Coverage bar charts
- Activity timeline

### Example Workflow
1. Open Dashboard from sidebar
2. View top metrics: total tests, pass rate, automation coverage
3. Click on any metric to drill down
4. Export reports as PDF or CSV

## ⚡ One-Click Test Creation

Quickly generate test cases from requirements, user stories, or work items.

### How to Use
- In the Create Test Case page, click "Generate from Work Item"
- Enter a work item ID (Azure DevOps/Jira) or paste requirement text
- The tool will fetch details and auto-generate a draft test case (title, description, steps)
- Review and edit the generated test case before saving

### Example Workflow
1. Click "Generate from Work Item"
2. Enter work item ID (e.g., 12345) or paste requirement text
3. The tool fetches and parses the work item
4. A draft test case is created with suggested title, description, and steps
5. Edit as needed and save to Azure DevOps

## 🧩 Reusable Steps & Templates

Speed up test case creation by saving and reusing common steps or entire templates.

### How to Use Templates
- In the Create Test Case page, use the "Templates" section to:
  - Save a set of steps as a template
  - Select a template to insert into your new test case
  - Edit or delete existing templates
- Templates can be inserted into either RAW or Bulk editor modes.
- Initial version stores templates locally in your browser; future updates will support cloud sync.

### Example Workflow
1. Create a test case with common login steps
2. Click "Save as Template" and name it (e.g., "Login Steps")
3. Next time, select "Login Steps" from Templates to instantly add those steps to a new test case

## 📚 Syntax Examples

### RAW Editor - Key:Value Format
```
Title: Login Test
Description: User can login
Priority: 1
Tags: smoke, critical
Automation: Automated

Steps:
Step 1:
  Action: Go to login page
  Expected: Form displays
  Data: user@example.com

Step 2:
  Action: Enter password
  Expected: Submit button enabled
```

### RAW Editor - JSON Format
```json
{
  "title": "Login Test",
  "description": "User authentication",
  "priority": 1,
  "tags": ["smoke"],
  "testSteps": [
    {
      "action": "Navigate to login",
      "expectedResult": "Form appears"
    }
  ]
}
```

### Disable Steps with Comments
```
// Step 1:
//   Action: This step is disabled
//   Expected: Won't be executed
```

## 🎨 Features Tour

### Navigation Sidebar
- **Dashboard** - Overview and quick stats
- **Create Test Case** - New test case wizard
- **RAW Editor** - Postman-style text editor
- **Bulk Editor** - Spreadsheet grid view
- **API Executor** - Debug Azure DevOps API
- **Disconnect** - Logout and switch projects

### RAW Editor Features
- ✏️ Copy/Paste support
- 📥 Download as .raw file
- 📤 Upload existing .raw files
- ✓ Real-time validation
- 🎨 Syntax highlighting

### Bulk Editor Features
- 🎯 Inline editing
- ↕️ Drag-and-drop reordering
- ➕ Add new steps
- 🗑️ Delete steps
- ⬆️⬇️ Move up/down

### API Executor Features
- 📨 All HTTP methods (GET, POST, PUT, PATCH, DELETE)
- 📋 Custom headers (JSON format)
- 📤 Request body support
- 💾 Copy responses
- 📥 Download response JSON

## ⚙️ Configuration

### Build for Production
```bash
npm run build
npm start
```

### Environment Variables (Optional)
Create `.env.local`:
```
NEXT_PUBLIC_AZURE_DEVOPS_TIMEOUT=30000
```

## 🐛 Troubleshooting

**Connection fails with TF200016 error**
- ✓ Ensure you selected **TFS On-Premises** server type
- ✓ Verify Collection Name is correct (e.g., `BoltCollection`)
- ✓ Use "Test Connection" button to diagnose — it auto-detects the correct API version
- ✓ Common issue: Don't include collection name in Server URL; put it in the Collection Name field

**Connection fails**
- ✓ Check Server URL format (no trailing slash)
- ✓ Verify PAT token has correct scopes
- ✓ Ensure PAT hasn't expired
- ✓ Run "Test Connection" to see detailed error messages and API version compatibility

**Test case save fails**
- ✓ Verify all required fields are filled
- ✓ Check title is not empty
- ✓ Ensure at least one step exists

**API Executor returns 401**
- ✓ PAT token expired - create a new one
- ✓ Check scopes include Test and Work Items

**UI looks broken**
- ✓ Hard refresh browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- ✓ Clear browser cache
- ✓ Run: `npm run build` and restart

## 📞 Support

Need help?
1. Check the main README.md for detailed documentation
2. Review example usage in components/
3. Check TypeScript types in types/index.ts

## 🎯 Best Practices

1. **Use RAW Editor for speed** - Paste and auto-parse
2. **Use Bulk Editor for detail** - Fine-tune steps
3. **Test API calls first** - Use API Executor to validate
4. **Organize with tags** - Makes filtering easier
5. **Set priorities** - Help with test planning

## 🚀 Next Steps

1. Create 5-10 test cases
2. Organize them with tags
3. Use the API Executor to test endpoints
4. Export test cases (JSON/CSV format)
5. Integrate with your CI/CD pipeline

---

Happy Testing! 🎉
