
# UK Sponsor Command Centre - Local Hosted

You have Perplexity Pro + ChatGPT Go - this project uses both.

## Structure
/frontend - React tracker, 200 sponsors, localStorage, command parsing
/backend - Express proxy for Perplexity API (keeps your API key secret)

## Quick start (2 terminals)

Terminal 1 - Backend:
cd backend
npm install
# Add your Perplexity API key to .env (get from perplexity.ai/settings/api)
echo "PERPLEXITY_API_KEY=pplx-xxxx
PORT=3001" > .env
npm run dev
# -> http://localhost:3001/api/health

Terminal 2 - Frontend:
cd frontend
npm install
npm run dev
# -> http://localhost:5173

## How it uses Perplexity
1. You type: "find React sponsors in London fintech salary >35000"
2. Frontend -> POST http://localhost:3001/api/search with your command
3. Backend -> calls https://api.perplexity.ai/chat/completions (sonar-pro) with system prompt to return JSON of A-rated sponsors
4. New companies are added to top of your tracker

Without API key, everything still works locally with 200 pre-loaded sponsors. You can import official Home Office CSV to get 100k+.

## For your visa timeline
- Filter: New Entrant OK badge = salary >= £33,400 eligible for you
- Track status: Not Applied -> Applied -> Screening -> Technical -> Final -> Offer -> CoS Received
- Days left counter is live until 10 Dec 2026

## Next steps
- Add your real applications from Gmail
- Use ChatGPT Go to generate tailored cover letters for each company card
- Deploy locally only - no cloud, private

Built for Raghav Mittal - MSc Southampton, React/Node stack.
