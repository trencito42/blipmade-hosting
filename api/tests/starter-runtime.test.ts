import { describe, expect, it } from 'vitest';
import {
  looksLikeStarter,
  starterFiles,
  usesStarterApplication,
} from '../src/services/starter-apps.js';

/**
 * The applications of the runtimes that are written in another language.
 *
 * Elixir, Go, .NET, Java, Rust, Dart and Deno are bare runtimes: the customer
 * brings the code, and the egg of the product starts it with the tool of its
 * language. Without an application the start-up command of the egg has nothing
 * to run. `mix run` answers "Could not find a Mix.Project", `dotnet run`
 * answers "The project file could not be found", and the container is alive
 * but serves nobody.
 *
 * Every one of these applications is the same small server: it listens on the
 * port of the allocation and answers on the health path of the product with a
 * body the platform recognises. The port of the panel is read first, because
 * the node publishes the port of the allocation and the route of the domain
 * of the customer points at that same port.
 */

interface RuntimeCase {
  /** The slug of the product. */
  slug: string;
  /** The name of the product, as it is shown to the customer. */
  name: string;
  /** The files the container has to hold for the start-up command to run. */
  paths: string[];
  /** The file that holds the application itself. */
  code: string;
  /** The file that holds the project of the application. */
  project?: string;
}

const cases: RuntimeCase[] = [
  {
    slug: 'elixir',
    name: 'Elixir',
    paths: [
      'mix.exs',
      'lib/blipmade_starter.ex',
      'lib/blipmade_starter/application.ex',
      'lib/blipmade_starter/server.ex',
    ],
    code: 'lib/blipmade_starter/server.ex',
    project: 'mix.exs',
  },
  {
    slug: 'rust-runtime',
    name: 'Rust',
    paths: ['Cargo.toml', 'src/main.rs'],
    code: 'src/main.rs',
    project: 'Cargo.toml',
  },
  {
    slug: 'golang',
    name: 'Golang',
    paths: ['go.mod', 'main.go'],
    code: 'main.go',
    project: 'go.mod',
  },
  {
    slug: 'dotnet',
    name: 'Dotnet',
    paths: ['Blipmade.csproj', 'Program.cs'],
    code: 'Program.cs',
    project: 'Blipmade.csproj',
  },
  { slug: 'java', name: 'Java', paths: ['Starter.java'], code: 'Starter.java' },
  {
    slug: 'dart',
    name: 'Dart',
    paths: ['pubspec.yaml', 'bin/blipmade_starter.dart'],
    code: 'bin/blipmade_starter.dart',
    project: 'pubspec.yaml',
  },
  { slug: 'deno', name: 'Deno', paths: ['main.ts'], code: 'main.ts' },
];

describe('the applications of the runtimes', () => {
  for (const testCase of cases) {
    describe(testCase.slug, () => {
      const files = starterFiles({
        slug: testCase.slug,
        name: testCase.name,
        healthPath: '/health',
        port: 30007,
      });

      it('is a runtime that the platform gives an application to', () => {
        expect(usesStarterApplication(testCase.slug)).toBe(true);
      });

      it('writes the files the start-up command of the egg needs', () => {
        expect(files.map((file) => file.path)).toEqual(testCase.paths);
      });

      it('holds an application and not only a project', () => {
        const code = files.find((file) => file.path === testCase.code);
        expect(code).toBeDefined();
        expect(code!.content.length).toBeGreaterThan(200);
      });

      it('reads the port of the panel first, so it listens where the node publishes', () => {
        const all = files.map((file) => file.content).join('\n');
        expect(all).toContain('SERVER_PORT');
        expect(all).toContain('PORT');
      });

      it('falls back to the port of the allocation and to no other', () => {
        const all = files.map((file) => file.content).join('\n');
        expect(all).toContain('30007');
        // The port of 3000 was the bug of the JavaScript application: the node
        // publishes the port of the allocation, and the application listened on
        // another one.
        expect(all).not.toContain('3000)');
        expect(all).not.toContain('3000;');
      });

      it('answers on the health path of the product with a body the platform knows', () => {
        const all = files.map((file) => file.content).join('\n');
        expect(all).toContain('/health');
        expect(all).toContain(testCase.slug);
        // The body of the health path is the one the platform recognises as the
        // application of the platform, and not the answer of the product.
        expect(looksLikeStarter('{"status":"ok","app":"' + testCase.slug + '"}')).toBe(true);
      });

      it('says on every other path that the service is running', () => {
        const all = files.map((file) => file.content).join('\n');
        expect(all).toContain('is running on Blipmade.');
      });

      if (testCase.project) {
        it('holds a project that builds without a download', () => {
          const project = files.find((file) => file.path === testCase.project!)!.content;
          // A project that asks for a package is a project that needs the
          // network of the container to be built.
          expect(project).not.toContain('PackageReference');
          expect(project).not.toMatch(/dependencies\s*[:=]\s*\[?\s*["']/);
        });
      }
    });
  }
});

describe('the applications of the runtimes in a container', () => {
  it('never writes over the code of a customer', async () => {
    const { planStarterFiles } = await import('../src/services/starter-apps.js');
    const files = starterFiles({
      slug: 'golang',
      name: 'Golang',
      healthPath: '/',
      port: 30007,
    });
    const customer = 'package main\n\nfunc main() {}\n';
    const existing = new Map([['main.go', customer]]);

    const plan = planStarterFiles(files, existing);
    const code = plan.find((entry) => entry.path === 'main.go')!;
    expect(code.action).toBe('keep');
    expect(code.content).toBeNull();
    expect(code.platform).toBe(false);
  });
});
