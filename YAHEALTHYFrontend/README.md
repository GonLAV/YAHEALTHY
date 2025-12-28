# YAHealthy Frontend

A modern, responsive React + Vite frontend for the YAHealthy nutrition and health tracking application.

## Features

- **Authentication**: User signup and login with JWT tokens
- **Dashboard**: Overview of daily nutrition stats with charts
- **Food Logging**: Log meals with detailed nutritional information
- **Analytics**: Track progress and insights over time
- **Responsive Design**: Works great on desktop and mobile devices

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first CSS framework
- **Recharts** - Charts and visualizations
- **Axios** - HTTP client
- **React Router** - Client-side routing

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update `.env` with your backend URL and Supabase credentials

4. Start development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
```

## Project Structure

```
src/
├── pages/           # Page components
├── components/      # Reusable components
├── services/        # API client and services
├── hooks/          # Custom React hooks
├── App.tsx         # Main app component
├── main.tsx        # Entry point
└── App.css         # Global styles
```

## Development

- Use `npm run dev` to start the development server
- Use `npm run build` to create an optimized production build
- Use `npm run preview` to preview the production build

## Notes

- The frontend connects to the backend API at `http://localhost:5000` by default
- Authentication tokens are stored in localStorage
- All API requests are authenticated with JWT tokens
