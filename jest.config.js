/**
 * Root Jest config.
 *
 * This is deliberately a plain config rather than Nx's `getJestProjects()`.
 * The repository is NOT an Nx workspace — there is no `nx.json`, no
 * `project.json`, and `@nx/jest` was never a declared dependency. The old
 * `jest.config.ts` and `jest.preset.js` were vestigial from the upstream
 * Postiz fork, and because they imported a package that does not exist, the
 * ENTIRE suite failed to load: `pnpm test` died at config parse, before running
 * a single test.
 *
 * ts-jest with `isolatedModules` because these are pure TypeScript modules with
 * no decorators to reflect over; the Nest specs under `security/` read source
 * files as text rather than instantiating the framework.
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: false,
        tsconfig: { jsx: 'react-jsx' },
      },
    ],
  },
  moduleNameMapper: {
    '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
    '^@gitroom/react/(.*)$':
      '<rootDir>/libraries/react-shared-libraries/src/$1',
  },
  testMatch: [
    '<rootDir>/libraries/**/*.spec.ts?(x)',
    '<rootDir>/apps/**/*.spec.ts?(x)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.next/'],
};
