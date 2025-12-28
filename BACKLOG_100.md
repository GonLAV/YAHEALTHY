# YAHEALTHY Backlog (100 items)

This is a **proposed** 100‑item implementation backlog to drive “keep implementing” work in a predictable way.

Notes:
- Each item is intentionally small and testable.
- Backend-first, with the existing pattern: implement → OpenAPI → `test-system.sh` → keep `npm test` green.

## A. Food Logs & Nutrition (1–30)
1. Add `GET /api/food-logs/:id` (single log fetch)
2. Add `PATCH /api/food-logs/:id` (partial update variant)
3. Add `GET /api/food-logs?start&end` pagination (limit/offset)
4. Add validation for `mealType` enum values
5. Add server-side normalization for macro fields (null vs 0)
6. Add `GET /api/food-days?start&end` (list dates with logs)
7. Add `GET /api/food-summary/range?start&end` (per-day totals)
8. Add `GET /api/food-summary/week?weekStart=YYYY-MM-DD`
9. Add `GET /api/food-summary/month?month=YYYY-MM`
10. Add `POST /api/food-logs/import` (CSV-ish JSON payload)
11. Add `POST /api/food-logs/copy` (copy a day to another date)
12. Add `POST /api/food-logs/template` (save a reusable meal)
13. Add `GET /api/food-logs/templates`
14. Add `DELETE /api/food-logs/templates/:id`
15. Add `GET /api/nutrition-score/range?start&end`
16. Add `GET /api/macro-balance/range?start&end`
17. Add `GET /api/calorie-balance/range?start&end`
18. Add unit tests for nutrition scoring edge cases
19. Add server-side rounding rules (consistent 0.1 increments)
20. Add `GET /api/targets` (resolved calorie/macro targets)
21. Add `PUT /api/targets` (set calorie target override)
22. Add macro target bounds validation
23. Add calorie target bounds validation
24. Add `GET /api/insights/daily?date=`
25. Add `GET /api/insights/weekly?start&end`
26. Add `GET /api/insights/monthly?month=`
27. Add per-meal-type summary (`breakfast/lunch/dinner/snack`)
28. Add `GET /api/food-logs/search?q=` (name search)
29. Add `GET /api/food-logs/stats` (top foods)
30. Add `GET /api/food-logs/macros-distribution?date=`

## B. Streaks, Goals, and Gamification (31–45)
31. Add `GET /api/streaks` default `asOf` behavior test
32. Add “log streak” vs “meeting-target streak” modes
33. Add “calorie-under-target streak” mode
34. Add “macro-hit streak” mode
35. Add `GET /api/badges` (earned badges)
36. Add badge: first food log
37. Add badge: 7-day streak
38. Add badge: 30-day streak
39. Add badge: 7 perfect nutrition scores
40. Add `GET /api/progress/overview` (high-level dashboard)
41. Add `GET /api/progress/weight-vs-calories?start&end`
42. Add `GET /api/progress/weight-vs-macros?start&end`
43. Add `GET /api/progress/hydration-vs-weight?start&end`
44. Add `GET /api/progress/sleep-vs-readiness?start&end`
45. Add `GET /api/progress/consistency?start&end`

## C. Supabase Persistence & Data Integrity (46–70)
46. Add `food_logs` table schema (Supabase)
47. Wire food log CRUD to Supabase with memory fallback
48. Add indexes for `food_logs(user_id, date)`
49. Add `updated_at` write on updates
50. Add migration notes to production docs
51. Add `NOT NULL` constraints where safe
52. Add `CHECK` constraints for non-negative numeric fields
53. Add `ON DELETE CASCADE` verification for food logs
54. Add optional soft-delete (`deleted_at`) design
55. Add DB-side default values for macro columns
56. Add DB-side trimming / length constraints for `name`
57. Add DB-side length constraints for `notes`
58. Add error translation for common Supabase errors
59. Add retry/backoff for transient Supabase failures
60. Add feature flag for forcing memory mode
61. Add `db.ping()` to system tests
62. Add a “Supabase configured” smoke-test doc section
63. Add `GET /api/debug/db-mode` for environment diagnosis
64. Add data export endpoint (`/api/export`) JSON
65. Add data import endpoint (`/api/import`) JSON
66. Add per-user data wipe endpoint (`/api/me/delete-data`) guarded
67. Add audit log table design (optional)
68. Add basic request logging to DB (optional)
69. Add rate limiting on auth endpoints
70. Add rate limiting on food log writes

## D. Meal Plans & Grocery (71–85)
71. Add `GET /api/meal-plans/:id`
72. Add `PUT /api/meal-plans/:id` validation
73. Add `DELETE /api/meal-plans/:id` ownership enforcement
74. Persist meal plans to Supabase (optional)
75. Add `GET /api/grocery-list/:id` saved lists
76. Add `POST /api/grocery-list` save list
77. Add `PUT /api/grocery-list/:id` update list
78. Add `DELETE /api/grocery-list/:id` delete list
79. Add `GET /api/grocery-list/items/top` analytics
80. Add `GET /api/grocery-list/items/missing` from meal plans
81. Add `POST /api/meal-plans/copy-week`
82. Add `POST /api/meal-plans/complete`
83. Add `POST /api/meal-plans/uncomplete`
84. Add meal plan “notes” validation
85. Add meal plan overlap prevention

## E. Quality, Observability, and Security (86–100)
86. Add consistent error envelope across endpoints
87. Add requestId to all successful responses (optional)
88. Add OpenAPI schema components for shared objects
89. Add OpenAPI security scheme definitions
90. Add endpoint list in README aligned with OpenAPI
91. Add CI script to run `npm test`
92. Add lint step (if repo uses it)
93. Add input size limits (body size)
94. Add helmet configuration hardening (if used)
95. Add CORS configuration documentation
96. Add `/api/health` to report db mode + version
97. Add `/api/metrics` basic counters (optional)
98. Add regression tests for date boundary handling
99. Add regression tests for empty-range weekly endpoints
100. Add a changelog file tracking implemented items
