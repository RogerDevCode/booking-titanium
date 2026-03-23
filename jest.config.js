/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  setupFiles: ['<rootDir>/tests/jest.setup.ts'],
  maxWorkers: 1,  // Prevent CPU saturation - run single worker
  workerIdleMemoryLimit: '256MB',
  testTimeout: 120000,
  globals: {
    'ts-jest': {
      isolatedModules: true,  // Reduce memory usage
    },
  },
};
