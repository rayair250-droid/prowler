### E2E Tests: App Navigation

**Suite ID:** `NAV-E2E`
**Feature:** Responsive application sidebar.

---

## Test Case: `NAV-E2E-001` - Mobile sidebar fits viewport

**Priority:** `high`
**Tags:** @e2e, @navigation

**Preconditions:**

- Admin user authentication state exists
- Chromium mobile viewport is 390 x 844 CSS pixels

### Flow Steps

1. Navigate to Overview
2. Open mobile application menu
3. Wait for drawer animation to finish
4. Measure drawer, close control, viewport, and document width

### Expected Result

- Drawer stays inside viewport
- Close control stays visible inside viewport
- Open-menu control is hidden while drawer is open
- Page has no horizontal overflow

### Key Verification Points

- Drawer uses accessible name "App sidebar"
- Drawer and close control edges do not exceed viewport edges
- Body scroll width does not exceed client width

---

## Test Case: `NAV-E2E-002` - Feedback persists when Featurebase is blocked

**Priority:** `high`
**Tags:** @e2e, @navigation

**Preconditions:**

- Admin user authentication state exists
- Featurebase runtime config and signing fixture are enabled

### Flow Steps

1. Block Featurebase network requests
2. Verify one feedback trigger on Overview
3. Open the application sidebar, select Providers, and verify one trigger remains

### Expected Result

- Third-party failure does not block navigation
- Exactly one accessible product-owned trigger exists per authenticated route

---

## Test Case: `NAV-E2E-003` - Public routes omit feedback

**Priority:** `high`
**Tags:** @e2e, @navigation

**Preconditions:**

- Empty browser storage state

### Flow Steps

1. Load Sign in
2. Check for the feedback trigger

### Expected Result

- The public route loads and exposes no feedback trigger
