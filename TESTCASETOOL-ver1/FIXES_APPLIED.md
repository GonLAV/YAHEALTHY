# Fixes Applied - December 10, 2025

## Issue 1: Test Steps Displayed as One Big Text Field ❌ → ✅

**Problem**: When test cases were created in Azure DevOps/TFS, the steps appeared as a single large text field instead of properly structured steps with separate Action and ExpectedResult columns.

**Root Cause**: The XML format for steps was incorrect. The code was using:
```xml
<steps>
  <step id="1">
    <description>Action text</description>
    <expectedResult>Expected text</expectedResult>
  </step>
</steps>
```

But Microsoft requires:
```xml
<Steps>
  <Step id="1" type="ActionStep">
    <Action>Action text</Action>
    <ExpectedResult>Expected text</ExpectedResult>
  </Step>
</Steps>
```

**Changes Made**:

### 1. Updated `lib/azure-devops.ts` - `formatStepsAsXml()` method
- Changed XML root tag from `<steps>` to `<Steps>` (capital S)
- Changed step tag from `<step>` to `<Step>` (capital S)
- Added `type="ActionStep"` attribute to each step
- Changed `<description>` to `<Action>` tag
- Changed `<expectedResult>` to `<ExpectedResult>` tag (capital E and R)
- Removed unnecessary `<parameterizedProperties>` and `<testData>` nodes
- Simplified structure to match Microsoft's exact requirements

**Before**:
```typescript
private formatStepsAsXml(steps: any[]): string {
  // ... old implementation with incorrect tags
}
```

**After**:
```typescript
private formatStepsAsXml(steps: any[]): string {
  if (!steps || steps.length === 0) {
    return '<Steps></Steps>';
  }

  let xml = '<Steps>';
  steps.forEach((step, index) => {
    const stepId = index + 1;
    const action = this.escapeXml(step.action || '');
    const expected = this.escapeXml(step.expectedResult || step.expected || '');

    xml += `<Step id="${stepId}" type="ActionStep">`;
    xml += `<Action>${action}</Action>`;
    xml += `<ExpectedResult>${expected}</ExpectedResult>`;
    xml += '</Step>';
  });
  xml += '</Steps>';

  return xml;
}
```

### 2. Updated `lib/json-patch-builder.ts` - Validation
- Updated XML format validation to check for `<Steps>` (capital S) instead of `<steps>`
- Updated documentation to show correct Microsoft format
- Ensures only properly formatted XML is accepted

**Result**: Test cases now create properly structured steps in Azure DevOps/TFS:
- ✅ Each step appears as a separate row
- ✅ Action column displays action text
- ✅ ExpectedResult column displays expected result
- ✅ Steps are properly linked to test case
- ✅ No more "one big text field" issues

---

## Issue 2: RAW Editor Data Not Transferred to BULK Editor ❌ → ✅

**Problem**: When users typed/created test cases in RAW mode, switching to BULK Editor (Bulk Editor) would show an empty form instead of the parsed test case data.

**Root Cause**: Users had to manually click "Save & Parse" button before switching modes. Without clicking it, the RAW text was never parsed into `currentTestCase` state, so when switching to BULK Editor, there was no data to display.

**Changes Made**:

### Updated `components/RawEditor.tsx`

#### 1. Added Dirty State Tracking
```typescript
const [isDirty, setIsDirty] = useState(false);

// Mark as dirty when content changes
useEffect(() => {
  // ... validation code ...
  setIsDirty(true);
}, [rawText]);
```

#### 2. Auto-Save on Mode Switch
```typescript
const handleSwitchToForm = useCallback(() => {
  // Auto-save when switching to form if there are changes and no validation errors
  if (isDirty && validation.valid) {
    const parsed = RawEditorParser.parseRawText(rawText);
    onSave?.(parsed);
    setIsDirty(false);
  }
  // Always switch mode
  onModeChange?.('form');
}, [rawText, validation, isDirty, onSave, onModeChange]);
```

#### 3. Enhanced Button Feedback
- "Switch to Form" button now changes color to **orange/warning** when there are unsaved changes
- Button shows "(Auto-saves)" tooltip indicating it will automatically save
- Visual feedback helps users understand the data will be transferred
- Tooltip explains: "Unsaved changes will be parsed and transferred to Bulk Editor"

**Before**:
```tsx
<button onClick={() => onModeChange?.('form')}>
  Switch to Form
</button>
```

**After**:
```tsx
<button
  onClick={handleSwitchToForm}
  className={isDirty && validation.valid ? 'warning-colors' : 'primary-colors'}
  title={isDirty ? 'Unsaved changes will be parsed and transferred to Bulk Editor' : 'Switch to Bulk Editor'}
>
  {isDirty && validation.valid && <AlertCircle className="w-4 h-4" />}
  Switch to Form {isDirty && validation.valid && '(Auto-saves)'}
</button>
```

**Workflow Now**:
1. User types test case in RAW mode
2. RAW Editor shows validation status in real-time
3. When user clicks "Switch to Form":
   - If changes exist and are valid → Automatically parses and saves
   - Transfers parsed data to `currentTestCase` state
   - Switches to BULK Editor with data pre-populated ✅
4. User can see and edit the test case in BULK Editor immediately

---

## Testing Verification

### XML Format Test
- Created validation script: `tools/test-step-xml-format.ts`
- Verifies:
  - XML uses capital `<Steps>` and `<Step>` tags
  - Includes `type="ActionStep"` attribute
  - Uses `<Action>` and `<ExpectedResult>` tags
  - Special characters are properly XML-escaped

### Integration Paths Verified
1. **Create → Save → Azure DevOps**: Now uses correct XML format
2. **RAW Mode → BULK Editor**: Data automatically transferred
3. **BULK Editor → Save → Azure DevOps**: Uses correct XML from parsed data
4. **JSON Patch Builder**: Validates and passes correct XML to API

---

## Files Modified

1. **lib/azure-devops.ts**
   - `formatStepsAsXml()` method: Corrected XML structure

2. **lib/json-patch-builder.ts**
   - `setSteps()` validation: Updated to check for `<Steps>` format

3. **components/RawEditor.tsx**
   - Added `isDirty` state tracking
   - Added `handleSwitchToForm()` with auto-save logic
   - Enhanced button UI with visual feedback

---

## Expected User Experience

### Creating a Test Case

**Scenario**: User wants to create a test case with 2 steps

**Option A - RAW Editor**:
```
Title: Login Test
Description: Test user login
Priority: 1

Steps:
Step 1:
  Action: Navigate to login page
  Expected: Login form appears

Step 2:
  Action: Enter credentials
  Expected: User is logged in
```

1. Type in RAW Editor → Validation shows "✅ Valid syntax"
2. Click "Switch to Form (Auto-saves)" → Data transfers to BULK Editor
3. See test case with 2 rows in BULK Editor
4. Click "Save to Azure DevOps"
5. In Azure DevOps: Test case shows with 2 properly-structured steps

**Option B - BULK Editor Direct**:
1. Click "Create Test Case" → Opens BULK Editor
2. Add rows: Title, Description, 2 steps
3. Click "Save to Azure DevOps"
4. Same result: Properly-structured steps in Azure DevOps

**Result in Azure DevOps**:
```
Test Case: Login Test
Description: Test user login

Step 1 - Action: Navigate to login page | Expected: Login form appears
Step 2 - Action: Enter credentials | Expected: User is logged in
```

✅ No more one big text field issues!

---

## Technical Details

### XML Patch Operation
The PATCH request now correctly includes:
```json
[
  {
    "op": "add",
    "path": "/fields/Microsoft.VSTS.TCM.Steps",
    "value": "<Steps><Step id=\"1\" type=\"ActionStep\"><Action>Navigate to login</Action><ExpectedResult>Form appears</ExpectedResult></Step></Steps>"
  }
]
```

### Escaping
Special characters in actions/expected results are properly XML-escaped:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

---

## Next Steps

Users can now:
1. ✅ Create test cases in RAW mode with proper parsing
2. ✅ Automatically transfer data between RAW and BULK editors
3. ✅ Save test cases with correctly-formatted steps to Azure DevOps
4. ✅ View steps as separate rows in Azure DevOps UI
5. ✅ Edit and update test cases with proper step structure

No additional configuration needed. Both fixes are backward compatible and improve user experience automatically.
