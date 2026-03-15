/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  maxWorkers: 1,  // Prevent CPU saturation - run single worker
  workerIdleMemoryLimit: '512MB',
  testTimeout: 90000,
};
