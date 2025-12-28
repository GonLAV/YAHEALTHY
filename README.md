# YAHEALTHY

This repository currently contains a **backend API** (Node.js + Express) for a healthy-eating app concept.

- Folder: `YAHEALTHYbackend/`
- Server: Express
- Data: **in-memory** (no database persistence yet)
- Language/content: recipes are in **Hebrew** (RTL-friendly UI recommended)

## What the app does (current features)

### 1) Recipes (read-only)
- Provides a list of sample healthy recipes.
- Each recipe includes:
  - Basic info: `name`, `nutritionist`, `difficulty`, `time`, `calories`, `category`, `rating`, `image`
  - Ingredients list with grouping metadata: `ingredients[]` where each item has `item`, `amount`, `category`
  - Step-by-step instructions: `steps[]` where each step has `step`, `text`, `video` (a tag/identifier)
  - Extra info: `tips`, `nutritionistNote`

### 2) Meal plans (CRUD)
- Lets a client create, read, update, and delete meal plans.
- **Important:** Meal plans are stored in server memory, so they reset when the server restarts.

## API Endpoints

Base URL (local): `http://localhost:5000`

### UI
- `GET /`
  - Serves the Sign In / Sign Up UI.

- `GET /login`
  - Serves the Sign In / Sign Up UI.

- `GET /dashboard`
  - Serves the dashboard UI.

### Health
- `GET /api/health`
  - Returns JSON confirming the API is running.

### Recipes
- `GET /api/recipes`
  - Returns an array of recipes.

Example:
```bash
curl http://localhost:5000/api/recipes
```

### Meal plans
- `GET /api/meal-plans`
  - Returns all meal plans currently stored in memory.

- `POST /api/meal-plans`
  - Creates a new plan.
  - The server auto-adds an `id` (string) using the current timestamp.

Example:
```bash
curl -X POST http://localhost:5000/api/meal-plans \
  -H 'Content-Type: application/json' \
  -d '{"title":"My plan","days":7,"notes":"High protein"}'
```

- `PUT /api/meal-plans/:id`
  - Updates a plan by `id`.
  - Returns `404` if the plan is not found.

Example:
```bash
curl -X PUT http://localhost:5000/api/meal-plans/123456 \
  -H 'Content-Type: application/json' \
  -d '{"notes":"Updated notes"}'
```

- `DELETE /api/meal-plans/:id`
  - Deletes a plan by `id`.
  - Returns `204 No Content` on success.

Example:
```bash
curl -X DELETE http://localhost:5000/api/meal-plans/123456
```

## Run locally

```bash
cd YAHEALTHYbackend
npm install
npm run start
```

Dev (auto-reload):
```bash
cd YAHEALTHYbackend
npm install
npm run dev
```

The server listens on:
- `PORT` from `.env`, otherwise `5000`

## What’s not implemented yet (but hinted by dependencies)

- Database persistence (you have `mongoose` installed, but there is no MongoDB connection/models yet)
- Authentication/users (meal plans are not per-user)
- Input validation for meal plan payloads
- Recipe creation/editing endpoints (recipes are hardcoded)
