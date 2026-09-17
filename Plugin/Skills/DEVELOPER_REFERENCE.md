# YAHealthy - Developer Quick Reference

## 🚀 Running the Application

### Start Both Servers (in separate terminals)

**Terminal 1 - Backend:**
```bash
cd /workspaces/YAHEALTHY/YAHEALTHYbackend
npm start
# Output: 🚀 YAHEALTHY server running on port 5000
```

**Terminal 2 - Frontend:**
```bash
cd /workspaces/YAHEALTHY/YAHEALTHYFrontend
npm run dev
# Output: ➜  Local:   http://localhost:5173/
```

### Access Points
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **API Documentation**: http://localhost:5000/api/docs
- **VS Code Workspace**: Open `YAHEALTHY.code-workspace`

---

## 📝 Common Development Tasks

### Adding a New Page
1. Create file in `YAHEALTHYFrontend/src/pages/MyNewPage.tsx`
2. Add route in `App.tsx`
3. Add navigation link in `Navigation` component

### Adding an API Endpoint
1. Add function to API service in `YAHEALTHYFrontend/src/services/api.ts`
2. Create corresponding endpoint in `YAHEALTHYbackend/index.js`
3. Use in component via the API service

### Form Validation
Frontend uses TypeScript types. Backend uses Zod for validation.

Example in backend:
```javascript
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});
const data = schema.parse(req.body);
```

### Adding Authentication
- Backend: Uses JWT tokens (generated on signup/login)
- Frontend: Stores token in localStorage, sends via `Authorization` header
- See `useAuth` hook for implementation

---

## 🔧 File Locations Reference

| Task | File Location |
|------|---------------|
| Change frontend port | `YAHEALTHYFrontend/vite.config.ts` |
| Change backend port | `YAHEALTHYbackend/index.js` (line with `PORT`) |
| Add environment variables | `.env` file in backend root |
| Update Tailwind styles | `YAHEALTHYFrontend/tailwind.config.js` |
| Add API routes | `YAHEALTHYbackend/index.js` |
| Update routes/pages | `YAHEALTHYFrontend/src/App.tsx` |
| Database models | `YAHEALTHYbackend/index.js` (db object) |
| Authentication config | `YAHEALTHYbackend/index.js` (auth section) |

---

## 🧪 Testing Commands

### Backend Tests
```bash
cd YAHEALTHYbackend
npm test              # Run unit tests
npm run test:system   # Run system tests
```

### Frontend Lint
```bash
cd YAHEALTHYFrontend
npm run lint          # Run ESLint
npm run build         # Build for production
```

### Integration Tests
```bash
bash /workspaces/YAHEALTHY/test-integration.sh
```

---

## 🔌 API Request Examples

### Authentication Endpoints

**Signup**
```javascript
const response = await axios.post('http://localhost:5000/api/auth/signup', {
  email: 'user@example.com',
  password: 'password123'
});
// Returns: { id, email, name, token }
```

**Login**
```javascript
const response = await axios.post('http://localhost:5000/api/auth/login', {
  email: 'user@example.com',
  password: 'password123'
});
// Returns: { id, email, name, token }
```

**Get Current User**
```javascript
const response = await axios.get('http://localhost:5000/api/auth/me', {
  headers: { Authorization: `Bearer ${token}` }
});
// Returns: { id, email, name, ... }
```

### Food Log Endpoints

**Create Food Log**
```javascript
const response = await axios.post('http://localhost:5000/api/food-logs', {
  date: '2025-12-28',
  name: 'Grilled Chicken',
  calories: 350,
  mealType: 'lunch',
  proteinGrams: 45,
  carbsGrams: 0,
  fatGrams: 15
}, {
  headers: { Authorization: `Bearer ${token}` }
});
```

**Get All Food Logs**
```javascript
const response = await axios.get('http://localhost:5000/api/food-logs', {
  headers: { Authorization: `Bearer ${token}` },
  params: { date: '2025-12-28' }
});
// Returns: Array of food logs
```

**Get Statistics**
```javascript
const response = await axios.get('http://localhost:5000/api/food-logs/stats', {
  headers: { Authorization: `Bearer ${token}` },
  params: { 
    startDate: '2025-12-01',
    endDate: '2025-12-31'
  }
});
// Returns: { total_calories, total_protein, ... }
```

**Delete Food Log**
```javascript
await axios.delete(`http://localhost:5000/api/food-logs/${foodId}`, {
  headers: { Authorization: `Bearer ${token}` }
});
```

---

## 🎨 Frontend Component Patterns

### Creating a New Component
```typescript
import React from 'react';

interface MyComponentProps {
  title: string;
  onClick?: () => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ title, onClick }) => {
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-lg font-bold">{title}</h2>
      {onClick && <button onClick={onClick}>Click me</button>}
    </div>
  );
};
```

### Using the API Service
```typescript
import { foodLogApi } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

export const MyPage = () => {
  const { isAuthenticated } = useAuth();
  
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await foodLogApi.getAll({ date: '2025-12-28' });
        console.log(response.data);
      } catch (error) {
        console.error('Failed to load:', error);
      }
    };
    
    if (isAuthenticated) {
      fetchLogs();
    }
  }, [isAuthenticated]);
};
```

### Protected Routes
```typescript
<Route
  path="/dashboard"
  element={
    <PrivateRoute>
      <DashboardPage />
    </PrivateRoute>
  }
/>
```

---

## 🐛 Debugging Tips

### Check Backend Logs
```bash
# Terminal running backend will show all requests and errors
# Look for: [timestamp] Route/Error messages
```

### Check Frontend Console
```javascript
// Open DevTools (F12) and check Console tab
// Check Network tab for API requests
// Look for red errors in console
```

### Test API Directly
```bash
# Test signup
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test with token
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Monitor Processes
```bash
# Check what's running on ports
lsof -i :5000 -i :5173

# Kill a process
kill -9 <PID>

# Check Node processes
ps aux | grep node
```

---

## 📚 Documentation Files

- `INTEGRATION_COMPLETE.md` - Full system documentation
- `README_COMPLETE.md` - Complete setup guide
- `PROJECT_STATUS.md` - Project overview
- `BACKLOG_100.md` - Features and improvements
- `API_DOCUMENTATION.md` - API reference
- `QUICKSTART.md` - Quick reference

---

## 🚢 Deployment Checklist

- [ ] Set production environment variables
- [ ] Update API base URL in frontend config
- [ ] Set up database (PostgreSQL recommended)
- [ ] Configure CORS for production domain
- [ ] Set up SSL/HTTPS
- [ ] Run full test suite
- [ ] Build frontend: `npm run build`
- [ ] Deploy to hosting (Vercel for frontend, Heroku for backend)
- [ ] Set up monitoring and error tracking
- [ ] Configure backups and logging

---

## 💡 Pro Tips

1. **Use the API docs** - Always reference http://localhost:5000/api/docs for endpoints
2. **Check the backlog** - BACKLOG_100.md has prioritized features to build
3. **Leverage TypeScript** - Use types to catch errors early
4. **Test as you build** - Use curl or Postman to test API changes
5. **Keep components small** - Break complex UIs into smaller reusable components
6. **Use the useAuth hook** - For checking authentication status anywhere
7. **Handle errors gracefully** - Always have try/catch and error messages
8. **Style with Tailwind** - Use utility classes, no need for separate CSS files

---

## 🆘 Getting Help

1. **API doesn't respond** → Check backend is running (port 5000)
2. **Frontend won't load** → Check network tab in DevTools
3. **Authentication fails** → Check token in localStorage
4. **Styling issues** → Check Tailwind CSS imports and config
5. **TypeScript errors** → Run `npm install` and `npm run build`

---

**Last Updated**: December 28, 2025  
**Version**: 1.0 - Full Stack Complete  
**Status**: ✅ Production Ready for Development
