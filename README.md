# Energy Optimization Agent

An SDG 13 — Climate Action web project that analyzes household energy consumption, identifies major loads, ranks energy-saving recommendations, builds a reduction plan, and monitors monthly electricity bills.

## Tech stack

- HTML5
- CSS3
- Vanilla JavaScript
- Vercel Serverless Functions
- Node.js runtime
- Browser `localStorage` for client-side persistence

## Project structure

```text
energy-optimization-agent/
├── api/
│   └── analyze.js          # Vercel serverless backend
├── public/
│   ├── index.html          # Frontend page
│   ├── style.css           # Frontend styles
│   └── app.js              # Frontend logic
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

## Run locally

Install Vercel CLI:

```bash
npm install
npm install -g vercel
```

Then:

```bash
vercel dev
```

Open the local URL shown by Vercel, normally:

```text
http://localhost:3000
```

The frontend calls:

```text
POST /api/analyze
```

## Deploy to Vercel

### Option 1 — GitHub + Vercel

1. Create a new GitHub repository.
2. Upload all files from this folder.
3. Go to Vercel and import the GitHub repository.
4. Framework preset: **Other**.
5. Build command: leave empty.
6. Output directory: `public`.
7. Deploy.

The included `vercel.json` also configures the static frontend and serverless API.

### Option 2 — Vercel CLI

From this project folder:

```bash
vercel
```

For production:

```bash
vercel --prod
```

## Backend API example

Request:

```json
{
  "items": [
    {
      "id": "ac1",
      "kind": "ac",
      "name": "Living room AC",
      "qty": 1,
      "watts": 1500,
      "hours": 6
    }
  ],
  "tariff": 7,
  "ef": 0.71,
  "setpoint": 22,
  "bill": 690,
  "target": 20
}
```

Response includes:

- Monthly kWh
- Estimated monthly cost
- Monthly CO₂
- Daily kWh
- Ranked recommendations
- Findings
- Target reduction

## Important note

The original project is a browser-based, rule-based energy planner. The backend in this version exposes the same analysis as a Vercel serverless API. It does not require a database or external AI API.

User-entered data remains in browser `localStorage` unless the user explicitly clicks **Run backend analysis**, which sends the current analysis payload to `/api/analyze`.

## Git commands

```bash
git init
git add .
git commit -m "Create Energy Optimization Agent"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

Replace `YOUR_GITHUB_REPOSITORY_URL` with your GitHub repository URL.

## License

For academic/project demonstration use. Update this section if you add your own license.
