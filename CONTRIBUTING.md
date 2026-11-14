# Contributing

Node.js 22. Copy `.env.example` to `.env.local`. You do not need provider accounts.

```bash
npm install
npm run lint
npm run typecheck
npm run test:coverage
npm run eval
npm test
npm run build && npm run e2e
```

`npm run eval` must pass every YAML conversation offline. Do not lower the threshold to hide a broken case. `npm run eval:openai` is optional and exits 0 when `OPENAI_API_KEY` is unset.

Keep slot, refusal, and booking behavior in `src/domain`. Channel code should parse and render, not invent a second qualification flow. Do not commit `.env` files or real tokens.

Pull requests should leave lint, typecheck, tests, evals, and the build green.
