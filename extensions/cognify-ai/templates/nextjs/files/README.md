# {{projectName}}

A Next.js app created with Cognify IDE.

## In the Dev Container
The container installs the dependencies when it is created, with Next.js telemetry turned off. Then:
- Test: `npm test`
- Build: `npm run build`
- Run: `npm run dev -- --hostname 0.0.0.0`, then open http://localhost:3000

## On your machine
Requires Node.js 20.9 or later.

```sh
npm install
npm test
npm run dev
```

Next.js collects anonymous telemetry unless it is turned off: `npx next telemetry disable`.
