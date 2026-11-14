const chromePath = process.env.CHROME_PATH;

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start -- --port 3000',
      startServerReadyPattern: 'Ready',
      url: [
        'http://127.0.0.1:3000/',
        'http://127.0.0.1:3000/chat',
        'http://127.0.0.1:3000/dashboard',
        'http://127.0.0.1:3000/simulator',
        'http://127.0.0.1:3000/metrics',
        'http://127.0.0.1:3000/voice',
      ],
      numberOfRuns: 1,
      chromePath,
      settings: {
        chromeFlags: '--no-sandbox --headless=new',
        formFactor: 'mobile',
        screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2 },
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
