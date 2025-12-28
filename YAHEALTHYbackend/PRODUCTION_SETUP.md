# YAHEALTHY 2.0 - Production Setup Guide

## 🚀 Quick Start

This is a production-ready health app backend with JWT authentication and Supabase database integration.

### Prerequisites
- Node.js 16+ and npm
- Supabase account (free tier available)
- GitHub account (optional, for CI/CD)

---

## 📋 Step 1: Set Up Supabase Database

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up/login
3. Click "New Project"
4. Enter project name: `yahealthy`
5. Choose region closest to you
6. Click "Create new project"
7. Wait for initialization (~2 min)

### 1.2 Run Database Migrations
1. Go to "SQL Editor" in your Supabase dashboard
2. Click "New Query"
3. Copy the entire content of [supabase.sql](./supabase.sql)
4. Paste into the editor
5. Click "Run"
6. You should see 13 successful CREATE statements

### 1.3 Get API Keys
1. Go to "Settings" → "API"
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_KEY`

### 1.4 Enable Row Level Security (Optional but recommended)
In SQL Editor, run:
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_goals ENABLE ROW LEVEL SECURITY;
-- Repeat for other tables...

-- Create policies for user isolation
CREATE POLICY "Users can view own data" ON surveys
  FOR SELECT USING (auth.uid() = user_id);
```

---

## 🔑 Step 2: Configure Backend

### 2.1 Install Dependencies
```bash
cd YAHEALTHYbackend
npm install
```

### 2.2 Create .env File
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your-super-secret-key-change-this-in-production!
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key-from-supabase
```

### 2.3 Test Connection
```bash
npm start
# Should output:
# 🚀 YAHEALTHY server running on port 5000
# 📚 API docs: http://localhost:5000/api/health
# 🔐 Authentication enabled with JWT
# 💾 Database: Supabase
```

---

## 🧪 Step 3: Test Authentication

### 3.1 Sign Up
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

**Response:**
```json
{
  "id": "uuid-here",
  "email": "test@example.com",
  "name": "Test User",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### 3.2 Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Save the token!** You'll need it for protected routes.

### 3.3 Test Protected Route
```bash
TOKEN="eyJhbGciOiJIUzI1NiIs..."

curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📊 Step 4: Test Core Features

### Create Survey (With Authentication)
```bash
TOKEN="your-token-here"

curl -X POST http://localhost:5000/api/surveys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "gender": "male",
    "age": 32,
    "heightCm": 180,
    "weightKg": 85,
    "targetWeightKg": 75,
    "targetDays": 120,
    "lifestyle": "moderate"
  }'
```

**Response includes calculated metrics:**
```json
{
  "id": "survey_xxx",
  "bmi": 26.2,
  "body_fat_percent": 23.4,
  "bmr": 1742,
  "tdee": 2088,
  "daily_calories": 1388,
  "water_target_liters": 2.6,
  "sleep_target_hours": 7.5
}
```

### Create Weight Goal
```bash
curl -X POST http://localhost:5000/api/weight-goals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "startWeightKg": 85,
    "targetWeightKg": 75,
    "weighInDays": ["Mon", "Fri"]
  }'
```

### Log Weight (With Celebration)
```bash
GOAL_ID="goal_xxx"

curl -X POST http://localhost:5000/api/weight-logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "goalId": "'$GOAL_ID'",
    "weightKg": 83,
    "waterLiters": 2.5,
    "sleepHours": 8
  }'
```

---

## 🌐 Step 5: Deploy to Production

### Option A: Deploy to Vercel (Recommended)

#### 5A.1 Connect GitHub
```bash
git add .
git commit -m "feat: Supabase + JWT auth integration"
git push origin main
```

#### 5A.2 Deploy on Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Import Project"
3. Select your GitHub repo
4. Configure environment variables:
   - Copy all `.env` values to Vercel
5. Click "Deploy"

**Your API is now live at:** `https://your-project.vercel.app`

### Option B: Deploy to Railway

#### 5B.1 Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

#### 5B.2 Deploy
```bash
railway init
railway add nodejs
railway up
```

### Option C: Deploy to Heroku (Deprecated but still works)
```bash
heroku create yahealthy-api
heroku config:set JWT_SECRET=...
heroku config:set SUPABASE_URL=...
heroku config:set SUPABASE_KEY=...
git push heroku main
```

---

## 🔒 Step 6: Security Hardening

### 6.1 Change JWT Secret
**NEVER use the default!**
```bash
openssl rand -hex 32  # Generate a random secret
# Copy the output to .env JWT_SECRET
```

### 6.2 Enable HTTPS
All production deployments should have SSL/TLS enabled (Vercel/Railway do this by default).

### 6.3 Set CORS Properly
Edit `index.js` line 38:
```javascript
app.use(cors({
  origin: ['https://yourdomain.com', 'https://app.yourdomain.com'],
  credentials: true
}));
```

### 6.4 Rate Limiting (Optional but recommended)
```bash
npm install express-rate-limit
```

Add to `index.js` before routes:
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/auth', limiter);
```

### 6.5 Input Validation
All endpoints validate input. Invalid data returns 400 with error details.

---

## 📱 Step 7: Frontend Integration

### 7.1 React Setup (Recommended)
```bash
npm create vite@latest yahealthy-frontend -- --template react
cd yahealthy-frontend
npm install axios zustand
```

### 7.2 API Service
Create `src/services/api.js`:
```javascript
import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

// Add token to all requests
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;
```

### 7.3 Login Component
```jsx
import API from '../services/api';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    const { data } = await API.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    window.location.href = '/dashboard';
  };

  return (
    <form onSubmit={handleLogin}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
      <button type="submit">Login</button>
    </form>
  );
}
```

---

## 🚨 Troubleshooting

### Supabase connection error?
- Verify `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
- Check your internet connection
- Ensure tables were created: Go to Supabase Dashboard → Tables

### JWT token invalid?
- Token expires in 7 days
- Regenerate: POST `/api/auth/login` again
- Store securely (localStorage or secure cookie)

### Cors error?
- Update CORS origin in `index.js` line 38
- Allow your frontend domain

### Database timeout?
- Check Supabase status at [status.supabase.com](https://status.supabase.com)
- Verify connection pool not exhausted
- Increase `DB_TIMEOUT` in `.env`

---

## 📊 Monitoring & Analytics

### 7.1 Set Up Sentry (Error Tracking)
```bash
npm install @sentry/node
```

Add to `index.js`:
```javascript
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });
```

### 7.2 Monitor with Datadog (Logs)
Check Vercel/Railway dashboards for built-in monitoring.

### 7.3 Database Monitoring
- Supabase has built-in analytics
- Monitor slow queries in SQL Editor → Explain

---

## ✅ Production Checklist

- [ ] JWT_SECRET changed to secure value
- [ ] Supabase Row Level Security enabled
- [ ] CORS configured for your domain
- [ ] HTTPS enabled (automatic on Vercel)
- [ ] Error logging configured (Sentry)
- [ ] Rate limiting added
- [ ] Database backups enabled (Supabase handles)
- [ ] Environment variables not in git (.env in .gitignore)
- [ ] Frontend deployed
- [ ] Domain/SSL certificate configured

---

## 📚 API Documentation

Full docs: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

Quick endpoints:
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/surveys` - Create health survey
- `POST /api/weight-goals` - Create weight goal
- `POST /api/weight-logs` - Log weight
- Plus 20+ more endpoints for tracking, recipes, etc.

---

## 🎯 Next Steps

1. **Frontend**: Build React UI consuming these endpoints
2. **Mobile**: Create React Native app using same API
3. **Advanced**: Add real AI provider integration
4. **Growth**: Set up analytics and user acquisition

---

**Questions?** Check API_DOCUMENTATION.md or create an issue on GitHub.
