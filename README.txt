Replace these three files in the root of the GitHub repository:
- package-lock.json
- render.yaml
- .npmrc

Then in Render service Settings, set Build Command to:
npm ci --include=dev --no-audit --no-fund && npm run build

Then use Manual Deploy > Clear build cache & deploy.
