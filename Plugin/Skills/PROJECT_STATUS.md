# YAHealthy - Nutrition & Health Tracker

A comprehensive nutrition and health tracking application with a modern React frontend and Express.js backend.

## 🚀 Project Status

**Both Frontend and Backend are now running!**

- **Backend**: Running on `http://localhost:5000`
- **Frontend**: Running on `http://localhost:5173`

## 📁 Workspace Structure

```
YAHEALTHY/
├── YAHEALTHYFrontend/      # React + Vite + TypeScript frontend
├── YAHEALTHYbackend/       # Express.js backend
├── YAHEALTHY.code-workspace # VS Code workspace config
├── BACKLOG_100.md           # Development backlog
├── API_DOCUMENTATION.md     # API documentation
├── QUICKSTART.md           # Quick start guide
└── README.md               # This file
```

## 🎯 Features

### Currently Implemented

**Backend:**
- ✅ JWT Authentication (signup/login)
- ✅ User management
- ✅ Food logging (CRUD operations)
- ✅ Nutrition tracking (calories, macros)
- ✅ Statistics and analytics
- ✅ Search functionality
- ✅ Badges and progress tracking
- ✅ User preferences and settings
- ✅ In-memory database (development)

**Frontend:**
- ✅ Responsive React UI with TypeScript
- ✅ Login/Signup pages
- ✅ Dashboard with nutrition overview
- ✅ Food logging interface
- ✅ Data visualization with charts
- ✅ Private routes protection
- ✅ API integration with axios
- ✅ Tailwind CSS styling

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization
- **Axios** - HTTP client
- **React Router** - Routing

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **JWT** - Authentication
- **In-Memory Database** - Development storage

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ installed
- npm or yarn package manager

### Setup Both Servers

**Terminal 1 - Backend:**
```bash
cd /workspaces/YAHEALTHY/YAHEALTHYbackend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd /workspaces/YAHEALTHY/YAHEALTHYFrontend
npm run dev
```

### Access the Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- API Docs: http://localhost:5000/api/docs

## 📝 Available Scripts

### Backend
```bash
npm start          # Start the server
npm test          # Run tests
npm run test:system  # Run system tests
```

### Frontend
```bash
npm run dev       # Start dev server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

## 🔑 Default Credentials (Dev)
```
Email: test@example.com
Password: password123
```

## 📚 Documentation

- [API Documentation](./API_DOCUMENTATION.md) - Detailed API endpoints
- [Quick Start](./QUICKSTART.md) - Quick reference guide
- [Development Backlog](./BACKLOG_100.md) - Features and improvements

## 🎨 UI/UX Features

- Clean, modern interface
- Responsive design (mobile & desktop)
- Dark mode ready
- Intuitive navigation
- Real-time charts and statistics
- Form validation and error handling

## 🔒 Security

- JWT-based authentication
- Protected routes on frontend
- HTTP-only tokens in development
- Input validation on backend

## 🗄️ Database

Currently using **in-memory storage** for development. Ready to integrate with:
- PostgreSQL
- MongoDB
- Supabase

## 📊 Next Steps

1. **Enhance Analytics**
   - Weekly/monthly trends
   - Goal tracking
   - Achievement badges

2. **Add More Features**
   - Meal recommendations
   - Food database integration
   - Barcode scanning
   - Photo recognition

3. **Production Setup**
   - Deploy to cloud (Vercel, Heroku)
   - Real database setup
   - Error tracking
   - Analytics

4. **Testing**
   - Unit tests
   - Integration tests
   - E2E tests

## 🤝 Contributing

To continue development, check the [Backlog](./BACKLOG_100.md) for prioritized tasks.

## 📞 Support

For issues or questions, refer to the API documentation or check the application logs.

---

**Last Updated:** December 28, 2025
**Project Status:** Active Development 🚀
