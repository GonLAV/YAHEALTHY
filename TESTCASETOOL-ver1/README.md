# Test Management Platform

Made by Gon Shaul Lavan

This project is a next-generation Test Management Platform integrating with Azure DevOps and TFS.
# Azure DevOps Test Case Tool 🚀

The ultimate next-generation Test Management Tool for Azure DevOps with a Postman-style interface, RAW/Bulk-Edit editors, and comprehensive test case management.

## 🎯 Features

### Core Features
- **Azure DevOps REST API Integration** - Full CRUD operations for Test Plans, Suites, Cases, Steps, and Runs
- **Dual-Mode Test Case Editor**
  - RAW Mode: Paste structured text (Key:Value, JSON, YAML) with auto-parsing
  - Bulk Editor: Spreadsheet-like grid with drag-and-drop reordering
- **Real-time Syntax Validation** - Instant feedback on test case structure
- **PAT-based Authentication** - Secure Azure DevOps connection
- **API Request Executor** - Postman-style API testing for Azure DevOps endpoints
- **Import/Export** - JSON, CSV, and RAW text formats
- **Modern 2025-style UI** - Clean design with Tailwind CSS and Framer Motion
- **Dark Mode Support** - Complete dark theme implementation

### Advanced Features
- Drag-and-drop test step reordering
- Copy/Paste compatible fields
- Multiple syntax support (Key:Value, JSON, YAML)
- Disabled lines with `//` prefix
- Test step validation
- Real-time sync between editors
- Anonymous statistics and telemetry

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS, Framer Motion
- **API**: Axios for HTTP requests
- **Azure Integration**: Azure DevOps REST API v7.0
- **Build**: Next.js with SWC compiler

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/GONS217/TESTCASETOOL
cd TESTCASETOOL

# Install dependencies
npm install

# Build the project
npm run build

# Start the development server
npm run dev
```

The application will be available at `http://localhost:3000`

## 🚀 Getting Started

### 1. Setup Azure DevOps Connection
- Get your Azure DevOps Organization URL (e.g., `https://dev.azure.com/yourorg`)
- Create a Personal Access Token (PAT) with Test and Work Items scopes:
  - Navigate to https://dev.azure.com
  - Click Profile icon → Personal access tokens
  - Create new token with Test (read, write) and Work Items (read, write) scopes
- Enter credentials in the config form

### 2. Create Test Cases
**Option A: RAW Editor**
```
Title: Login Test Case
Description: Verify user can login successfully
Priority: 2
Tags: smoke, critical

Steps:
Step 1:
  Action: Navigate to login page
  Expected: Login form appears

Step 2:
  Action: Enter valid credentials
  Expected: Submit button is enabled

Step 3:
  Action: Click Submit
  Expected: Dashboard loads
```

**Option B: Bulk Editor**
- Use the spreadsheet-style editor
- Add steps with drag-and-drop reordering
- Edit fields inline

### 3. API Executor
- Test Azure DevOps API endpoints
- View responses with syntax highlighting
- Debug REST calls before implementing

## 📚 RAW Editor Syntax

### Metadata Section
```
Title: Test Case Title
Description: Optional description
Priority: 1-4 (default: 2)
Automation: Not Automated | Planned | In Progress | Automated
AssignedTo: User Name
Tags: tag1, tag2
Area: Area/Path
Iteration: Sprint/Path
Precondition: Setup required
PostCondition: Cleanup required
```

### Steps Section
```
Steps:
Step 1:
  Action: What the user does
  Expected: What should happen
  Data: Optional test data

// Disabled steps with // prefix
// Step 2:
//   Action: This step is disabled
```

### Parsing Support
- **Key: Value** format
- **JSON** objects
- **YAML-style** formatting
- **Disabled lines** with `//` prefix
- **Section headers**: Steps, Precondition, Postcondition

## 🎨 UI Components

### RawEditor.tsx
Postman-style raw text editor with:
- Auto-parsing of structured text
- Real-time validation
- Syntax highlighting
- Copy/Paste/Download actions
- Error reporting

### BulkEditor.tsx
Spreadsheet-like grid with:
- Inline editing
- Drag-and-drop reordering
- Move up/down buttons
- Add/Delete step actions
- Real-time sync

### ApiRequestExecutor.tsx
API testing interface with:
- Method selection (GET, POST, PUT, PATCH, DELETE)
- Custom headers (JSON)
- Request body (JSON)
- Response viewing
- Copy/Download response

### AzureDevOpsConfig.tsx
Configuration wizard with:
- Organization URL input
- Project name input
- PAT token management
- Connection validation

## 🔌 API Integration

The `AzureDevOpsClient` class provides methods for:

```typescript
// Test Plans
getTestPlans()
getTestPlan(id)
createTestPlan(plan)
updateTestPlan(id, plan)
deleteTestPlan(id)

// Test Cases
getTestCases(planId, suiteId)
getTestCase(id)
createTestCase(testCase)
updateTestCase(id, testCase)
deleteTestCase(id)

// Test Runs & Results
getTestRuns(planId)
createTestRun(run)
getTestResults(runId)
updateTestResult(runId, resultId, result)
```

## 📤 Import/Export

Use the `ImportExportService` for:

```typescript
// Export
ImportExportService.exportToJSON(testCases)
ImportExportService.exportToCSV(testCases)
ImportExportService.exportToRAW(testCases)

// Import
ImportExportService.importFromJSON(jsonText)
ImportExportService.importFromCSV(csvText)

// File Download
ImportExportService.downloadFile(content, filename, type)
```

## 🔒 Security

- PAT tokens are sent to Azure DevOps API only
- No token storage in browser (use environment variables in production)
- HTTPS recommended for production
- Authentication uses Basic Auth via PAT

## 📊 Architecture

```
app/
├── page.tsx          # Main dashboard and layout
├── layout.tsx        # Root layout
└── globals.css       # Global styles

components/
├── RawEditor.tsx     # RAW text editor
├── BulkEditor.tsx    # Spreadsheet grid editor
├── ApiRequestExecutor.tsx  # API testing tool
└── AzureDevOpsConfig.tsx   # Config form

lib/
├── azure-devops.ts   # Azure DevOps API client
├── raw-editor-parser.ts    # Text parsing logic
└── import-export.ts  # Import/Export service

types/
└── index.ts          # TypeScript types
```

## 🚦 Environment Variables

For production deployment, consider adding:
```
NEXT_PUBLIC_AZURE_DEVOPS_BASE_URL=your_base_url
NEXT_PUBLIC_API_TIMEOUT=30000
```

## 🎓 Example Usage

```typescript
import { AzureDevOpsClient } from '@/lib/azure-devops';

const client = new AzureDevOpsClient({
  organizationUrl: 'https://dev.azure.com/myorg',
  projectName: 'MyProject',
  patToken: 'your_pat_token'
});

// Create a test case
const testCase = await client.createTestCase({
  title: 'Login Test',
  description: 'Verify login functionality',
  testSteps: [
    {
      action: 'Navigate to login',
      expectedResult: 'Login form appears',
      order: 1
    }
  ]
});
```

## 🐛 Troubleshooting

### Connection Failed
- Verify Organization URL format: `https://dev.azure.com/yourorgname`
- Ensure PAT token has Test and Work Items scopes
- Check PAT token expiration date

### Build Errors
```bash
# Clear cache and rebuild
rm -rf .next
npm run build
```

### Styling Issues
- Tailwind CSS cache: `npm install` then `npm run build`
- Dark mode: Ensure `dark` class is applied to html element

## 📈 Performance

- Build size: ~173KB (First Load JS)
- Optimized package imports for Framer Motion
- Static page generation where possible
- Efficient re-renders with React 19

## 🎯 Future Features

- Template library with reusable test case patterns
- Version control and diff viewer for test cases
- Analytics dashboard with test coverage metrics
- Inline AI suggestions for test steps
- Automated test result ingestion
- Attachment support (screenshots, videos, logs)
- Bulk operations (import multiple cases)
- Test case cloning and duplication
- Advanced filtering and search
- Integration with CI/CD pipelines

## 📝 License

ISC License

## 🤝 Contributing

Contributions are welcome! Please submit pull requests or open issues for bugs and features.

## 📞 Support

For issues and support:
- Check existing GitHub issues
- Create a new issue with detailed steps to reproduce
- Include environment details (Node.js version, OS, browser)

---

Built with ❤️ for QA/Test Engineers who demand excellence
