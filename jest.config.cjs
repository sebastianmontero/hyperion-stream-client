// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true, // Automatically clear mock calls and instances between every test
  moduleNameMapper: {
    '^socket.io-client$': '<rootDir>/__mocks__/socket.io-client.ts',
    '^cross-fetch$': '<rootDir>/__mocks__/cross-fetch.ts',
  },
  setupFiles: ['<rootDir>/setup.js'],
};