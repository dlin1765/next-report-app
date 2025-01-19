### Next Report App
This repo is a Next.js React app that was a part of a technical challnege for a Junior DevOps role. It contains a CI/CD pipeline that was implemented using Github Actions and deployed to an AWS EC2 instance.

## Getting Started | Setup Instructions

To run the project locally run these commands to clone the repo, install neccessary dependencies, and run the project in your local development environment.
```
git clone https://github.com/dlin1765/next-report-app.git
npm install --legacy-peer-deps
npm run dev
# in the project directory

```

```bash
npm install --legacy-peer-deps
 npx playwright install
```

In order to run the tests, it is critical that the development server is up
first:

```bash
npm run dev & npx wait-on http://localhost:3000
```

You may view and interact with the application at
[http://localhost:3000](http://localhost:3000) on your browser. To run the test
suites separately:

```bash
npm run test # This command runs the Vite unit tests, specified in package.json.
npx playwriight test
```
