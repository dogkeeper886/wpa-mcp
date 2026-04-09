/**
 * Test executor - orchestrates test execution with log collection
 * and pattern matching.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { TestCase, TestResult, StepResult, PatternMatch, RunConfig } from './types.js';
import { LogCollector } from './log-collector.js';
import { CONFIG } from './config.js';

const execAsync = promisify(exec);

/**
 * Strip ANSI escape codes from strings.
 */
function stripAnsi(str: string): string {
  return str.replace(
    /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\x1b[a-zA-Z]/g,
    ''
  );
}

export class TestExecutor {
  private config: RunConfig;
  private logCollector: LogCollector | null = null;
  private totalTests: number = 0;
  private currentTest: number = 0;
  private currentTestId: string | null = null;
  private variables: Record<string, string> = {};

  constructor(config: RunConfig) {
    this.config = config;
  }

  private progress(msg: string): void {
    process.stderr.write(msg + '\n');
  }

  private substituteVariables(command: string): string {
    return command.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = this.variables[varName] ?? process.env[varName];
      if (value === undefined) {
        this.progress(`    [WARN] Variable {{${varName}}} not found`);
        return match;
      }
      return value;
    });
  }

  /**
   * Resolve a dot-notation path with optional array find syntax.
   * Supports: "field", "nested.field", "data[name=foo].id"
   * Array find on field: arrayField[key=value] finds first element where element.key === value
   * Array find on root: $[key=value].field finds in top-level array
   */
  private resolvePath(obj: any, fieldPath: string): any {
    const segments = fieldPath.match(/[^.]+/g) || [];
    let current = obj;

    for (const segment of segments) {
      if (current === undefined || current === null) return undefined;

      // Top-level array find: $[key=value]
      const rootArrayMatch = segment.match(/^\$\[(\w+)=(.+)\]$/);
      if (rootArrayMatch) {
        const [, matchKey, matchValue] = rootArrayMatch;
        if (!Array.isArray(current)) return undefined;
        current = current.find((item: any) => String(item[matchKey]) === matchValue);
        continue;
      }

      // Named array find: fieldName[key=value]
      const arrayMatch = segment.match(/^(\w+)\[(\w+)=(.+)\]$/);
      if (arrayMatch) {
        const [, arrayField, matchKey, matchValue] = arrayMatch;
        const arr = current[arrayField];
        if (!Array.isArray(arr)) return undefined;
        current = arr.find((item: any) => String(item[matchKey]) === matchValue);
      } else {
        current = current[segment];
      }
    }

    return current;
  }

  private captureVariables(step: TestCase['steps'][0], result: StepResult): void {
    if (!step.capture || result.exitCode !== 0) return;

    try {
      let parsed = JSON.parse(result.stdout);

      // Handle MCP double-encoded responses: content[0].text wrapping
      const innerText = parsed?.content?.[0]?.text;
      if (innerText) {
        try { parsed = JSON.parse(innerText); } catch { /* use outer */ }
      }

      for (const [varName, fieldPath] of Object.entries(step.capture)) {
        const resolvedPath = this.substituteVariables(fieldPath);
        const value = this.resolvePath(parsed, resolvedPath);
        if (value !== undefined) {
          this.variables[varName] = String(value);
          this.progress(`    Captured: ${varName} = ${String(value).substring(0, 60)}`);
        } else {
          this.progress(`    [WARN] Capture field '${fieldPath}' not found in response`);
        }
      }
    } catch (e) {
      this.progress(`    [WARN] Failed to capture variables: ${e}`);
    }
  }

  private async executeStep(
    step: { name: string; command: string; timeout?: number },
    defaultTimeout: number
  ): Promise<StepResult> {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let timedOut = false;

    const timeout = step.timeout || defaultTimeout;

    const env = { ...process.env };
    if (this.currentTestId) {
      env.TEST_ID = this.currentTestId;
    }

    try {
      const result = await execAsync(step.command, {
        cwd: this.config.workingDir,
        timeout,
        maxBuffer: CONFIG.logs.maxBuffer,
        shell: '/bin/bash',
        env,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error: unknown) {
      const err = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
        code?: number;
        killed?: boolean;
      };
      stdout = err.stdout || '';
      stderr = err.stderr || err.message || 'Unknown error';
      exitCode = err.code || 1;
      timedOut = err.killed === true;
    }

    const duration = Date.now() - startTime;

    stdout = stripAnsi(stdout);
    stderr = stripAnsi(stderr);

    if (timedOut) {
      stderr = `[TIMEOUT] Command killed after ${timeout / 1000}s\n\n${stderr}`;
    }

    return {
      name: step.name,
      command: step.command,
      stdout,
      stderr,
      exitCode,
      duration,
    };
  }

  private checkPatterns(
    result: StepResult,
    expectPatterns?: string[],
    rejectPatterns?: string[]
  ): StepResult['patternMatches'] {
    if (!expectPatterns && !rejectPatterns) {
      return undefined;
    }

    const combined = result.stdout + '\n' + result.stderr;

    const expected: PatternMatch[] = (expectPatterns || []).map((pattern) => ({
      pattern,
      found: new RegExp(pattern, 'i').test(combined),
    }));

    const rejected: PatternMatch[] = (rejectPatterns || []).map((pattern) => ({
      pattern,
      found: new RegExp(pattern, 'i').test(combined),
    }));

    return { expected, rejected };
  }

  async executeTestCase(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    const timestamp = new Date().toISOString().substring(11, 19);

    this.currentTest++;
    this.currentTestId = testCase.id;
    this.variables = {};
    this.progress(
      `[${timestamp}] [${this.currentTest}/${this.totalTests}] ${testCase.id}: ${testCase.name}`
    );

    if (this.logCollector) {
      this.logCollector.markTestStart(testCase.id);
    }

    for (let i = 0; i < testCase.steps.length; i++) {
      const step = testCase.steps[i];
      const stepTimestamp = new Date().toISOString().substring(11, 19);

      this.progress(
        `  [${stepTimestamp}] Step ${i + 1}/${testCase.steps.length}: ${step.name}`
      );

      const resolvedCommand = this.substituteVariables(step.command);
      const cmdPreview =
        resolvedCommand.length > 80
          ? resolvedCommand.substring(0, 80) + '...'
          : resolvedCommand;
      this.progress(`    Command: ${cmdPreview}`);

      const resolvedStep = { ...step, command: resolvedCommand };
      const result = await this.executeStep(resolvedStep, testCase.timeout);

      result.patternMatches = this.checkPatterns(
        result,
        step.expectPatterns,
        step.rejectPatterns
      );

      this.captureVariables(step, result);

      stepResults.push(result);

      const status = result.exitCode === 0 ? '[PASS]' : '[FAIL]';
      const duration = `${(result.duration / 1000).toFixed(1)}s`;
      this.progress(`    ${status} Exit: ${result.exitCode} (${duration})`);

      if (result.patternMatches) {
        const expectedMissing = result.patternMatches.expected.filter(
          (p) => !p.found
        );
        const rejectedFound = result.patternMatches.rejected.filter(
          (p) => p.found
        );
        if (expectedMissing.length > 0) {
          this.progress(
            `    Missing patterns: ${expectedMissing.map((p) => p.pattern).join(', ')}`
          );
        }
        if (rejectedFound.length > 0) {
          this.progress(
            `    Rejected patterns found: ${rejectedFound.map((p) => p.pattern).join(', ')}`
          );
        }
      }

      if (result.exitCode !== 0 && result.stderr) {
        const errorPreview = result.stderr.split('\n')[0].substring(0, 100);
        this.progress(`    Error: ${errorPreview}`);
      }
    }

    const totalDuration = Date.now() - startTime;

    let logs = '';
    let logFile = '';
    if (this.logCollector) {
      this.logCollector.markTestEnd(testCase.id);
      logFile = this.logCollector.extractTestLogs(testCase.id);
      logs = this.logCollector.getLogsForTest(testCase.id);
    }
    this.currentTestId = null;

    if (!logs) {
      logs = stepResults
        .map(
          (r) =>
            `=== Step: ${r.name} ===
Command: ${r.command}
Exit Code: ${r.exitCode}
Duration: ${r.duration}ms

STDOUT:
${r.stdout || '(empty)'}

STDERR:
${r.stderr || '(empty)'}
`
        )
        .join('\n' + '='.repeat(50) + '\n');
    }

    return {
      testCase,
      steps: stepResults,
      totalDuration,
      logs,
      logFile,
    };
  }

  async executeAll(testCases: TestCase[]): Promise<TestResult[]> {
    const results: TestResult[] = [];

    this.totalTests = testCases.length;
    this.currentTest = 0;

    const startTimestamp = new Date().toISOString().substring(11, 19);
    this.progress(`\n[${startTimestamp}] Starting ${this.totalTests} test(s)...`);
    this.progress('-'.repeat(60));

    // Determine if we need the log collector (for Docker-based tests)
    const needsLogCollector = testCases.some(
      (tc) => tc.suite === 'integration' || tc.suite === 'e2e'
    );

    if (needsLogCollector) {
      this.logCollector = new LogCollector(
        this.config.dockerComposePath,
        this.config.outputDir
      );
      try {
        await this.logCollector.start();
        this.progress(`[LOG] Docker log collector started`);
      } catch (err) {
        this.progress(`[WARN] Failed to start log collector: ${err}`);
        this.logCollector = null;
      }
    }

    for (const tc of testCases) {
      const result = await this.executeTestCase(tc);
      results.push(result);
    }

    if (this.logCollector) {
      await this.logCollector.stop();
      this.logCollector.copySessionToOutput();
      this.progress(`[LOG] Docker log collector stopped`);
    }

    const endTimestamp = new Date().toISOString().substring(11, 19);
    this.progress('-'.repeat(60));
    this.progress(`[${endTimestamp}] Execution complete: ${results.length} test(s)`);

    return results;
  }
}
