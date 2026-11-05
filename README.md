# CP Analyzer - Backend API & Sync Service

Modular competitive programming profile analyzer engine built with **Node.js**, **Express**, and **MongoDB Atlas** supporting **LeetCode, Codeforces, CodeChef, GeeksforGeeks, and HackerRank**.

---

## Deploying on Render

### Step 1: Create a New Web Service
1. In your [Render Dashboard](https://dashboard.render.com), click **New +** ➔ **Web Service**.
2. Connect your GitHub repository: `CP_ANALYSER_BACKEND`.
3. Configure the service:
   * **Name**: `cp-analyzer-backend` (or your choice)
   * **Language**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start` *(runs `node src/all.js`, which starts both the Express API and the background sync worker)*

### Step 2: Environment Variables
Add the following in the **Environment** section in Render:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Web service port | `5000` (or leave default, Render sets `PORT` automatically) |
| `MONGODB_URI` | MongoDB Atlas URI | `mongodb+srv://user:pass@cluster.mongodb.net/competitive_analyzer?retryWrites=true&w=majority` |
| `JWT_ACCESS_SECRET` | Strong secret for JWT tokens | `generate_a_random_secure_secret_here` |
| `JWT_REFRESH_SECRET`| Strong secret for Refresh tokens | `generate_a_random_secure_secret_here` |
| `CLIENT_ORIGIN` | Allowed Frontend URL (CORS) | `https://your-frontend.vercel.app` |

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy and set environment variables
cp .env.example .env

# 3. Run API server & background sync worker together
npm start
```
