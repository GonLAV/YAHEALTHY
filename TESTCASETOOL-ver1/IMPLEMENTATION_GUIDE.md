# Implementation Guide: Azure DevOps Blank Test Cases Fix & Bolttech Design System

## Overview
This guide documents the fixes implemented to resolve the issue of blank test cases in Azure DevOps/TFS and the new Bolttech design system.

---

## Part 1: Azure DevOps API Fixes

### Problem
Test cases created via the tool appeared blank in Azure DevOps/TFS because:
1. Steps were being sent as **JSON** instead of required **XML format**
2. API request body wasn't using proper JSON Patch format
3. No logging to detect field malformations
4. PAT permissions weren't validated

### Solutions Implemented

#### 1. XML Format for Steps (CRITICAL FIX)

**File**: `lib/azure-devops.ts`

The `formatStepsAsXml()` method now creates proper XML:

```xml
<steps>
  <step id="1">
    <parameterizedProperties><new /></parameterizedProperties>
    <description>Action text</description>
    <expectedResult>Expected result text</expectedResult>
  </step>
</steps>
```

**Before (WRONG)**:
```json
{
  "steps": [
    { "action": "...", "expected": "..." }
  ]
}
```

**After (CORRECT)**:
```xml
<steps>
  <step id="1">
    <description>Action text</description>
    <expectedResult>Expected text</expectedResult>
  </step>
</steps>
```

#### 2. JSON Patch Builder

**File**: `lib/json-patch-builder.ts`

Validates and builds correct JSON Patch operations:

```typescript
import { JsonPatchBuilder } from '@/lib/json-patch-builder';

const builder = new JsonPatchBuilder();
builder.setTitle("Test Case Title")
       .setDescription("Description")
       .setSteps(xmlStepsString)  // Must be XML!
       .setPriority(2)
       .setTags(['smoke', 'critical']);

const operations = builder.build();
// Operations are validated and ready for Azure DevOps API
```

**Required Fields:**
- `op`: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
- `path`: `/fields/System.Title`, `/fields/Microsoft.VSTS.TCM.Steps`, etc.
- `value`: The actual value (XML for Steps, string for Title, etc.)

**Available Methods:**
- `setTitle(title)` - Required, System.Title
- `setDescription(desc)` - System.Description
- `setSteps(xmlString)` - Microsoft.VSTS.TCM.Steps (MUST be XML!)
- `setPriority(1-4)` - Microsoft.VSTS.Common.Priority
- `setTags(tags[])` - System.Tags
- `setAutomationStatus(status)` - Microsoft.VSTS.TCM.AutomationStatus
- `addCustomField(name, value)` - Any custom field

#### 3. API Logging

**File**: `lib/api-logger.ts`

Captures all API interactions for debugging:

```typescript
import { apiLogger } from '@/lib/api-logger';

// Automatic logging when creating test cases
// Check browser console under "API Request", "API Response", "API Error"

// Get logs programmatically
const logs = apiLogger.getLogs();
const summary = apiLogger.getSummary();

// Export for analysis
const json = apiLogger.exportAsJson();
const csv = apiLogger.exportAsCsv();

// Clear old logs
apiLogger.clear();
```

**Logged Information:**
- Raw request method, endpoint, headers
- Request body (JSON)
- Response status and data
- Response time (ms)
- Errors with full stack traces
- JSON Patch validation results

#### 4. Updated createTestCase Method

**File**: `lib/azure-devops.ts` - `createTestCase()` method

Now uses:
1. JSON Patch Builder for proper operations
2. XML formatting for steps
3. Comprehensive logging
4. Validation before sending

```typescript
async createTestCase(testCase: TestCase): Promise<TestCase> {
  const builder = new JsonPatchBuilder();
  
  // Build operations with validation
  builder.setTitle(testCase.title)
         .setDescription(testCase.description)
         .setSteps(this.formatStepsAsXml(testCase.testSteps))
         .setPriority(testCase.priority);
  
  // Validate before sending
  const validation = builder.validate();
  if (!validation.valid) {
    throw new Error(`Invalid patch: ${validation.errors.join(', ')}`);
  }
  
  // Send with proper headers and logging
  const operations = builder.build();
  const response = await this.client.post(
    `/wit/workitems/$Test Case?api-version=${this.apiVersion}`,
    operations,
    { headers: { 'Content-Type': 'application/json-patch+json' } }
  );
  
  return this.parseWorkItemToTestCase(response.data);
}
```

### PAT Permissions Validation

Ensure your PAT token includes:
- ✔ **Work Items**: Read & Write
- ✔ **Test Management**: Read & Write

To create/update PAT in Azure DevOps:
1. User Settings → Personal Access Tokens
2. New Token
3. Select scopes: "Work Items (Read & Write)", "Test Management (Read & Write)"
4. Use in `AzureDevOpsConfig`

### Testing the Fix

1. **Enable logging**:
```typescript
import { apiLogger } from '@/lib/api-logger';
apiLogger.setEnabled(true);
```

2. **Create a test case** via the UI

3. **Check logs** in browser DevTools → Console

4. **Look for**:
   - `[API Request]` - Should have steps as XML in `<steps>...</steps>` format
   - `[API Response]` - Should return status 200/201
   - `[JSON Patch Validation]` - Should show "Valid: true"

5. **Verify in Azure DevOps**:
   - Test case should appear with all fields populated
   - Steps should display correctly

---

## Part 2: Bolttech Design System

### Brand Colors

```typescript
// Primary brand color (vibrant blue)
Primary: #3335FF
Primary Light: #6B6DFF
Primary Dark: #1F20CC

// Gradient (blue to cyan)
Gradient Start: #3335FF
Gradient End: #1CE1D5

// Accent (cyan)
Accent: #00C2CC

// Neutrals
Background: #F4F7FB
Border: #E0E6F2
Text Dark: #1A1A1A
Text Light: #4A5568
Text Lighter: #8892B0

// Semantic
Success: #10B981
Error: #EF4444
Warning: #F59E0B
Info: #3B82F6
```

### Configuration Files

**tailwind.config.js**:
- Extended colors with Bolttech palette
- Custom shadows: `shadow-bolttech-card`, `shadow-bolttech-hover`
- Border radius: `rounded-bolttech`, `rounded-bolttech-lg`, `rounded-bolttech-xl`
- Gradients: `bg-bolttech-gradient`

**lib/theme.ts**:
- Centralized color constants
- Typography settings
- Spacing scale
- Shadow definitions

**lib/bolttech-styles.ts**:
- Reusable className sets
- Helper functions for buttons, inputs, sections
- Consistent styling across components

### Component Styling

#### Using Bolttech Styles

```typescript
import { BolttechStyles, getButtonClass } from '@/lib/bolttech-styles';

// Direct class usage
<button className={BolttechStyles.buttons.primary}>Save</button>
<div className={BolttechStyles.cards.elevated}>Card content</div>

// Helper functions
<input className={getInputClass(hasError)} />
<div className={getSectionClass('info')}>Info section</div>
<span className={getBadgeClass('success')}>Success</span>
```

#### Available Utilities

**Buttons**:
- `primary` - Main action button with gradient
- `secondary` - Bordered button with primary color
- `ghost` - Transparent button
- `danger` - Red/error button
- `icon` - Small icon button

**Cards**:
- `base` - Basic card with border
- `elevated` - Card with shadow and hover effect
- `outlined` - Card with primary color border

**Inputs**:
- `base` - Standard input with focus ring
- `textarea` - Multi-line input
- Supports `error` and `success` variants

**Sections**:
- `header` - With gradient background
- `footer` - Subtle background
- `info`, `success`, `error`, `warning` - Colored sections

**Badges**:
- `primary`, `success`, `error`, `warning`, `info`

### Animation & Transitions

Using Framer Motion for smooth micro-interactions:

```typescript
import { motion } from 'framer-motion';

<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  className={BolttechStyles.buttons.primary}
>
  Click me
</motion.button>
```

Standard transition durations:
- Fast: 150ms
- Normal: 250ms (default)
- Slow: 350ms

### Updated Components

**RawEditor.tsx**:
- Bolttech gradient header
- Large rounded borders (16-20px)
- Smooth transitions
- Icon badges for sections
- Enhanced validation display
- Hover shadows

**Components to Update Next**:
- AzureDevOpsConfig.tsx
- ApiRequestExecutor.tsx
- BulkEditor.tsx
- BulkImportExport.tsx
- DuplicateDetection.tsx
- EnhancedBulkEditor.tsx

---

## Part 3: RAW Editor Parser Improvements

### Supported Input Formats

The parser now supports multiple formats and automatically converts them:

#### Format 1: Key: Value
```
Title: My Test Case
Description: Testing login functionality
Priority: 2
Tags: smoke, critical

Steps:
Step 1:
  Action: Navigate to login page
  Expected: Login form displays

Step 2:
  Action: Enter credentials
  Expected: User logged in
```

#### Format 2: JSON
```
{
  "title": "My Test Case",
  "description": "Testing login",
  "priority": 2,
  "tags": ["smoke", "critical"]
}
```

#### Format 3: YAML-style
```
title: My Test Case
description: Testing login
priority: 2
tags:
  - smoke
  - critical
```

#### Disabled Lines (Comments)
```
// This step is disabled and won't be included
Step 1:
  Action: Old step
  Expected: Old result

Step 2:
  Action: Current step
  Expected: Current result
```

### Parser Features

1. **Auto-detection**: Recognizes format automatically
2. **Flexible keywords**: Supports multiple keyword variations
   - `Title` / `Name`
   - `Priority` / `Priority`
   - `Tags` / `Tag`
   - `Steps` / `STEPS`
3. **Disabled lines**: Lines starting with `//` are skipped
4. **Step parsing**: Multiple step definition styles:
   - `Step 1:`, `Step 1`, `Step #1`
   - `Action:`, `Given:`, `When:`
   - `Expected:`, `Then:`, `Assert:`, `Verify:`
5. **Validation**: Checks for required fields and errors
6. **Syntax highlighting**: Shows line types and issues

### Usage

```typescript
import { RawEditorParser } from '@/lib/raw-editor-parser';

// Parse raw text
const testCase = RawEditorParser.parseRawText(rawText);

// Validate input
const validation = RawEditorParser.validateRawText(rawText);
if (validation.valid) {
  // Safe to use testCase
} else {
  console.log('Errors:', validation.errors);
}

// Format TestCase back to raw text
const formatted = RawEditorParser.formatRawText(testCase);

// Get syntax highlighting info
const highlights = RawEditorParser.getSyntaxHighlighting(rawText);
```

---

## Testing Checklist

- [ ] Create test case via RAW editor
- [ ] Verify XML format in API logs
- [ ] Check test case appears in Azure DevOps with all fields
- [ ] Test with disabled lines (`//` comments)
- [ ] Test with different input formats (Key:Value, JSON, YAML)
- [ ] Verify Bolttech design rendering
- [ ] Test dark mode support
- [ ] Check micro-interactions (hover, focus, click)
- [ ] Verify button and input styling
- [ ] Test on different screen sizes

---

## Troubleshooting

### Test Cases Still Blank?

1. **Check API logs**:
   ```typescript
   import { apiLogger } from '@/lib/api-logger';
   console.log(apiLogger.getSummary());
   ```

2. **Verify XML format**:
   - Look for `<steps>` tags in API request
   - Should have `<step id="1">`, `<description>`, `<expectedResult>`

3. **Check PAT permissions**:
   - Go to Azure DevOps → User Settings → Personal Access Tokens
   - Verify "Test Management: Read & Write" is selected

4. **Check API version**:
   - TFS on-prem: Use `5.0` or `4.1`
   - Azure DevOps Cloud: Use `7.0` or `7.1-preview.3`

### Styling Issues?

1. **Tailwind not loading**:
   - Clear `.next` folder
   - Run `npm run build`

2. **Colors not applying**:
   - Check `tailwind.config.js` has been updated
   - Verify custom color names are spelled correctly
   - Use browser DevTools to inspect classes

3. **Rounded borders not working**:
   - Use `rounded-bolttech`, `rounded-bolttech-lg`, `rounded-bolttech-xl`
   - Older Tailwind versions may not support custom values

---

## Files Modified/Created

### New Files Created
- `lib/json-patch-builder.ts` - JSON Patch validator and builder
- `lib/api-logger.ts` - API request/response logging
- `lib/theme.ts` - Bolttech theme constants
- `lib/bolttech-styles.ts` - Reusable component styles

### Files Modified
- `lib/azure-devops.ts` - Fixed createTestCase, added XML formatting
- `lib/raw-editor-parser.ts` - Already supports required formats
- `tailwind.config.js` - Added Bolttech colors and utilities
- `components/RawEditor.tsx` - Complete redesign with Bolttech

### Files to Update
- `components/AzureDevOpsConfig.tsx`
- `components/ApiRequestExecutor.tsx`
- `components/BulkEditor.tsx`
- `components/BulkImportExport.tsx`
- `components/DuplicateDetection.tsx`
- `components/EnhancedBulkEditor.tsx`

---

## Next Steps

1. **Update remaining components** with Bolttech design
2. **Add PAT permissions validator** in AzureDevOpsConfig
3. **Create test suite** for XML step formatting
4. **Add dark mode toggle** (optional)
5. **Create user documentation** for RAW editor syntax
6. **Set up analytics** to track test case creation success rate

---

## References

- Azure DevOps REST API: https://learn.microsoft.com/en-us/rest/api/azure/devops/
- JSON Patch RFC: https://tools.ietf.org/html/rfc6902
- Tailwind CSS: https://tailwindcss.com/
- Framer Motion: https://www.framer.com/motion/
