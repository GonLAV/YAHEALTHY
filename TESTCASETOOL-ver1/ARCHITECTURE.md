# 🏗️ Project Architecture & Documentation

## Project Structure

```
TESTCASETOOL/
├── app/
│   ├── layout.tsx              # Root layout wrapper
│   ├── page.tsx                # Main dashboard & routing
│   └── globals.css             # Global styles (Tailwind)
│
├── components/
│   ├── RawEditor.tsx           # RAW text editor component
│   ├── BulkEditor.tsx          # Spreadsheet-style editor
│   ├── ApiRequestExecutor.tsx  # Postman-style API tester
│   └── AzureDevOpsConfig.tsx   # Configuration wizard
│
├── lib/
│   ├── azure-devops.ts         # Azure DevOps API client
│   ├── raw-editor-parser.ts    # Text parsing logic
│   ├── import-export.ts        # Import/Export service
│   ├── test-case-utils.ts      # Test case utilities
│   └── template-service.ts     # Template management
│
├── types/
│   └── index.ts                # TypeScript type definitions
│
├── public/                      # Static assets
├── QUICKSTART.md               # Quick start guide
├── README.md                   # Full documentation
├── tsconfig.json               # TypeScript config
├── next.config.js              # Next.js config
├── tailwind.config.js          # Tailwind CSS config
├── postcss.config.js           # PostCSS config
└── package.json                # Dependencies & scripts
```

## Core Components

### 1. RawEditor.tsx
**Purpose**: Text-based test case editor with auto-parsing

**Features**:
- Paste & auto-parse test cases
- Real-time syntax validation
- Copy/Paste/Download functionality
- Syntax highlighting
- Error reporting

**Key Methods**:
```typescript
RawEditorParser.parseRawText(text)     // Parse text → TestCase
RawEditorParser.formatRawText(tc)      // Format TestCase → text
RawEditorParser.validateRawText(text)  // Validate syntax
RawEditorParser.getSyntaxHighlighting(text) // Get highlights
```

### 2. BulkEditor.tsx
**Purpose**: Spreadsheet-style test case editing

**Features**:
- Grid-based step editing
- Drag-and-drop reordering
- Inline field editing
- Add/Delete/Move operations
- Real-time sync

**Interactions**:
- Mouse drag to reorder
- Click to edit fields
- Arrow buttons for reordering
- Delete icon to remove

### 3. ApiRequestExecutor.tsx
**Purpose**: Debug Azure DevOps REST API calls

**Features**:
- Method selection (GET, POST, PUT, PATCH, DELETE)
- Custom headers (JSON)
- Request body (JSON)
- Real-time responses
- Copy/Download responses

**Supported Methods**:
- GET: Fetch resources
- POST: Create resources
- PUT: Replace resources
- PATCH: Update resources
- DELETE: Remove resources

### 4. AzureDevOpsConfig.tsx
**Purpose**: Initial setup wizard

**Fields**:
- Organization URL (format: https://dev.azure.com/orgname)
- Project Name
- Personal Access Token (PAT)

**Validation**:
- URL format check
- PAT token required
- Connection test

## Service Layer

### AzureDevOpsClient
**Location**: `lib/azure-devops.ts`

**Methods**:
```typescript
// Test Plans
getTestPlans(): Promise<TestPlan[]>
getTestPlan(id): Promise<TestPlan>
createTestPlan(plan): Promise<TestPlan>
updateTestPlan(id, plan): Promise<TestPlan>
deleteTestPlan(id): Promise<void>

// Test Suites
getTestSuites(planId): Promise<TestSuite[]>
getTestSuite(planId, suiteId): Promise<TestSuite>
createTestSuite(planId, suite): Promise<TestSuite>

// Test Cases
getTestCases(planId, suiteId): Promise<TestCase[]>
getTestCase(id): Promise<TestCase>
createTestCase(testCase): Promise<TestCase>
updateTestCase(id, testCase): Promise<TestCase>
deleteTestCase(id): Promise<void>

// Test Runs
getTestRuns(planId): Promise<TestRun[]>
createTestRun(run): Promise<TestRun>
getTestResults(runId): Promise<TestResult[]>
updateTestResult(runId, resultId, result): Promise<TestResult>
```

### RawEditorParser
**Location**: `lib/raw-editor-parser.ts`

**Key Functions**:
```typescript
parseRawText(text): TestCase           // Parse text → object
formatRawText(testCase): string        // Format object → text
validateRawText(text): ValidationResult // Check syntax
getSyntaxHighlighting(text): Highlight[] // Get UI hints
```

**Supported Formats**:
- Key: Value (simple metadata)
- JSON objects (structured data)
- YAML-style (nested data)
- Comments with // prefix

### ImportExportService
**Location**: `lib/import-export.ts`

**Methods**:
```typescript
exportToJSON(testCases): string
exportToCSV(testCases): string
exportToRAW(testCases): string
importFromJSON(jsonText): TestCase[]
importFromCSV(csvText): TestCase[]
downloadFile(content, filename, type): void
```

### TestCaseUtils
**Location**: `lib/test-case-utils.ts`

**Utilities**:
```typescript
validate(testCase): ValidationResult   // Check validity
clone(testCase): TestCase              // Deep copy
fromTemplate(template, overrides): TestCase
getStats(testCases): Statistics        // Calculate metrics
sort(testCases, sortBy): TestCase[]    // Sort cases
filter(testCases, criteria): TestCase[] // Filter cases
compare(oldCase, newCase): Changes     // Diff comparison
```

### TemplateService
**Location**: `lib/template-service.ts`

**Methods**:
```typescript
getTemplates(): TemplateLibrary[]
getByCategory(category): TemplateLibrary[]
getTemplate(id): TemplateLibrary
createTestCaseFromTemplate(id, overrides): TestCase
addTemplate(template): void
removeTemplate(id): boolean
getMostUsed(limit): TemplateLibrary[]
search(query): TemplateLibrary[]
getCategories(): string[]
```

**Default Templates**:
- API Test Case
- UI/Functional Test Case
- Login Test Case
- Form Submission Test
- Smoke Test Case

## Type Definitions

**Location**: `types/index.ts`

### Core Types

#### TestCase
```typescript
interface TestCase {
  id?: number
  title: string
  description?: string
  state?: string
  priority?: number           // 0-4 (0=critical, 4=low)
  automation?: AutomationStatus
  owner?: string
  tags?: string[]
  testSteps: TestStep[]
  precondition?: string
  postCondition?: string
  attachments?: Attachment[]
  customFields?: Record<string, any>
  createdDate?: string
  modifiedDate?: string
  createdBy?: string
  modifiedBy?: string
  areaPath?: string
  iterationPath?: string
}
```

#### TestStep
```typescript
interface TestStep {
  id?: string
  action: string
  expectedResult: string
  testData?: string
  stepType?: 'ActionStep' | 'ValidateStep' | 'SharedStepReference'
  order: number
}
```

#### TestPlan
```typescript
interface TestPlan {
  id: number
  name: string
  area: string
  iteration: string
  owner: string
  description: string
}
```

#### TestRun & TestResult
```typescript
interface TestRun {
  id: number
  name: string
  testPlanId: number
  testSuiteId: number
  state: 'NotStarted' | 'InProgress' | 'Completed' | 'Aborted'
  owner: string
  runStatistics?: RunStatistics
}

interface TestResult {
  id: number
  testCaseId: number
  testRunId: number
  outcome: 'Passed' | 'Failed' | 'Inconclusive' | 'Blocked'
  state: 'Pending' | 'Queued' | 'InProgress' | 'Completed'
  comment?: string
  failureMessage?: string
}
```

## Data Flow

### Create Test Case Flow
```
User Input (RAW or Form)
    ↓
Parser (if RAW) / Direct (if Form)
    ↓
TestCase Object
    ↓
Validation Check
    ↓
API Client
    ↓
Azure DevOps API
    ↓
Response Parsing
    ↓
Display Success/Error
```

### API Request Flow
```
User Sets: Method, Endpoint, Headers, Body
    ↓
API Executor Builds Request
    ↓
Axios Sends HTTP Request
    ↓
Response Received
    ↓
Parse & Display Response
    ↓
Allow Copy/Download
```

### Parse RAW Text Flow
```
Paste Raw Text
    ↓
Split into Lines
    ↓
Detect Sections (Metadata, Steps, etc)
    ↓
Parse Key:Value Pairs
    ↓
Extract Test Steps
    ↓
Create TestCase Object
    ↓
Validate Structure
    ↓
Display Errors (if any)
    ↓
Save/Return TestCase
```

## State Management

**Component-level**: React hooks (useState, useCallback, useEffect)

**Global State Pattern**:
```typescript
// App-level state
const [config, setConfig] = useState<ADOConfig>()
const [client, setClient] = useState<AzureDevOpsClient>()
const [currentTestCase, setCurrentTestCase] = useState<TestCase>()
const [mode, setMode] = useState<'config' | 'dashboard' | ...>()
```

**No external state manager** (simple app, keep it lean)

## Authentication

**Method**: Azure DevOps Personal Access Token (PAT)

**Flow**:
1. User provides PAT token
2. Encode as Base64: `base64(":pattoken")`
3. Add header: `Authorization: Basic <base64>`
4. All subsequent requests use this header

**Security Notes**:
- PAT sent over HTTPS only (recommended)
- Token visible in UI (user should use throwaway PAT)
- For production: use environment variables

## Styling System

**Framework**: Tailwind CSS v4 with @tailwindcss/postcss

**Color Palette**:
- Primary: Blue (#0052CC)
- Secondary: Slate (#44546F)
- Success: Green (#22c55e)
- Error: Red (#ef4444)
- Dark mode: Slate-900 to Slate-950

**Components Pattern**:
```typescript
// Use Tailwind classes directly
className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"

// Dark mode support
className="dark:bg-slate-800 dark:text-white"

// Responsive design
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
```

## Animation System

**Framework**: Framer Motion

**Common Patterns**:
```typescript
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, x: -20 }}
  transition={{ duration: 0.3 }}
>
  Content
</motion.div>
```

**Used For**:
- Page transitions
- Component entrance/exit
- Loading spinners
- Success notifications
- Error alerts

## Testing Checklist

- [ ] Connection to Azure DevOps
- [ ] Create test case via RAW editor
- [ ] Create test case via Bulk editor
- [ ] Validate RAW text parsing
- [ ] API executor GET request
- [ ] API executor POST request
- [ ] Export to JSON
- [ ] Export to CSV
- [ ] Export to RAW
- [ ] Dark mode toggle
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Error handling (invalid inputs)
- [ ] Success notifications
- [ ] Navigation between modes

## Performance Notes

- **Build Size**: ~173KB (First Load JS)
- **Optimizations**:
  - Framer Motion: optimizePackageImports
  - Next.js: Static generation where possible
  - React 19: Automatic batching
  - Tailwind CSS: JIT compilation

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Modern browsers with ES2020 support required.

## Future Enhancements

1. **Offline Support**: Service Workers for offline editing
2. **Real-time Collaboration**: WebSocket for team editing
3. **Advanced Analytics**: Dashboard with charts
4. **AI Suggestions**: OpenAI integration for test suggestions
5. **CI/CD Integration**: GitHub Actions, Azure Pipelines
6. **Database**: Store templates and test case history
7. **Versioning**: Full version control for test cases
8. **Team Management**: Multi-user support with roles
9. **Mobile App**: React Native companion app
10. **Webhooks**: Integration with external services

---

**Last Updated**: December 9, 2025
**Version**: 1.0.0
**Status**: Production Ready ✓
