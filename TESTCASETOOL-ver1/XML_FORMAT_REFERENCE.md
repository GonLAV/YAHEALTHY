# Test Steps XML Format Reference

This document shows the exact XML format required by Microsoft Azure DevOps for test steps.

## Required Format

### Single Step
```xml
<Steps>
  <Step id="1" type="ActionStep">
    <Action>Click login button</Action>
    <ExpectedResult>Login form appears</ExpectedResult>
  </Step>
</Steps>
```

### Multiple Steps
```xml
<Steps>
  <Step id="1" type="ActionStep">
    <Action>Navigate to login page</Action>
    <ExpectedResult>Login form loads</ExpectedResult>
  </Step>
  <Step id="2" type="ActionStep">
    <Action>Enter username: testuser</Action>
    <ExpectedResult>Username field is populated</ExpectedResult>
  </Step>
  <Step id="3" type="ActionStep">
    <Action>Enter password</Action>
    <ExpectedResult>Password field shows masked characters</ExpectedResult>
  </Step>
  <Step id="4" type="ActionStep">
    <Action>Click Submit button</Action>
    <ExpectedResult>User is logged in and redirected to dashboard</ExpectedResult>
  </Step>
</Steps>
```

## Key Requirements

✅ **Root Tag**: Must be `<Steps>` (capital S)
✅ **Step Tag**: Must be `<Step>` (capital S)
✅ **Attributes**: Each step must have `id` and `type="ActionStep"` attributes
✅ **Action Tag**: Contains the action/instruction text (capital A)
✅ **ExpectedResult Tag**: Contains expected outcome (capital E and R)
✅ **XML Escaping**: Special characters must be escaped

## Special Characters Escaping

| Character | Escaped Form |
|-----------|-------------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&apos;` |

### Example with Special Characters
```xml
<Step id="1" type="ActionStep">
  <Action>Enter text: &quot;Hello &amp; Goodbye&quot;</Action>
  <ExpectedResult>Field shows: &quot;Hello &amp; Goodbye&quot;</ExpectedResult>
</Step>
```

## JSON Patch Operation

When sending to Azure DevOps API, the XML is included in a JSON Patch operation:

```json
[
  {
    "op": "add",
    "path": "/fields/Microsoft.VSTS.TCM.Steps",
    "value": "<Steps><Step id=\"1\" type=\"ActionStep\"><Action>Navigate to login</Action><ExpectedResult>Form appears</ExpectedResult></Step></Steps>"
  }
]
```

Note: The XML string value must have:
- Escaped quotes: `\"` instead of `"`
- No newlines (unless you use `\n` for explicit line breaks)
- Valid XML structure

## How It Appears in Azure DevOps

When created with this format, each step appears as:

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Navigate to login | Form appears |
| 2 | Enter credentials | User is logged in |

Instead of appearing as a single text field!

## Troubleshooting

**Problem**: Steps show as one big text field
- **Solution**: Ensure XML uses proper tags and structure (check format above)

**Problem**: Special characters show incorrectly
- **Solution**: Use XML escaping (see table above)

**Problem**: Steps don't appear at all
- **Solution**: Ensure field name is exactly `Microsoft.VSTS.TCM.Steps`

**Problem**: Validation error on save
- **Solution**: Check that all tags are properly closed and capitalized

## Implementation Status

✅ **Test Case Tool** now generates this exact format
✅ **RawEditor** properly parses and transfers to BulkEditor
✅ **Azure DevOps Integration** sends correct XML structure
✅ **Backward Compatible** with existing test cases
