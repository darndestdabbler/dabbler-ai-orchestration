_Task prompt templates — one section per routed task type._

This file contains the user-message template applied by `prompting.py`
for each routed task type. `config.py` parses the `#` (H1) headers; the
slug of each header becomes the key in `config["_task_templates"]` that
`prompting.py` looks up. H1 is used rather than H2 because the template
content itself begins with H2 headers that would otherwise collide with
the section-boundary parser.

Placeholder contract — every template uses these two tokens and only
these two:

- `{content}` — the primary input for the task (the code under review,
  the subject to analyze, the objective to plan, etc.).
- `{context}` — any supporting material (surrounding files, existing
  patterns, specific questions). If the caller provides no context,
  `prompting.py` substitutes the literal string `(no additional context)`.

`prompting.py` does the substitution. Do not add other placeholders
here without updating the loader.

# analysis

## Analysis Task

Analyze the following and provide a structured assessment:

### Subject

{content}

### Specific Questions

{context}

### Response Format

Provide your analysis with clear sections, concrete recommendations, and supporting reasoning.

# code-review

## Code Review Task

Review the following code for:
1. Bugs and logic errors
2. Security vulnerabilities
3. Performance issues
4. Style and maintainability

For each issue found, provide:
- **Severity:** Critical / Major / Minor / Suggestion
- **Location:** File and line reference
- **Issue:** What's wrong
- **Fix:** Specific code change

### Code to Review

{content}

### Context

{context}

# documentation

## Documentation Task

Write documentation for the following code. Include:
1. Purpose and overview
2. Public API (classes, methods, parameters, return values)
3. Usage examples
4. Important notes or caveats

### Code

{content}

### Additional Context

{context}

# planning

## Planning Task

Break down the following into a sequenced implementation plan.

For each step, provide:
1. **What:** Specific deliverable
2. **Files:** Which files are created or modified
3. **Dependencies:** Which prior steps must complete first
4. **Complexity:** Simple / Medium / Complex
5. **Notes:** Any risks, decisions, or alternatives

### Objective

{content}

### Current State

{context}

# test-generation

## Test Generation Task

Generate tests for the following code. Requirements:
1. Cover all public methods
2. Include edge cases and error paths
3. Use the testing framework and patterns shown in the context
4. Each test should be independent

### Code Under Test

{content}

### Existing Test Patterns and Framework

{context}
