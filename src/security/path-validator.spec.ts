/**
 * 路径验证器单元测试 + 属性测试
 * 验证 PathValidator 的路径规范化、白名单验证和系统目录保护功能
 */

import * as path from 'path';
import * as fc from 'fast-check';
import { ErrorCode } from '../errors';
import {
  PathValidator,
  PathValidationError,
  SYSTEM_PROTECTED_DIRS,
} from './path-validator';

describe('PathValidator', () => {
  const allowedDirs = ['/data/project-a', '/data/project-b', '/etc'];
  let validator: PathValidator;

  beforeEach(() => {
    validator = new PathValidator(allowedDirs);
  });

  describe('SYSTEM_PROTECTED_DIRS', () => {
    it('should contain all system critical directories', () => {
      const expected = ['/etc', '/boot', '/sys', '/proc', '/dev', '/sbin', '/bin', '/usr/sbin'];
      expect(SYSTEM_PROTECTED_DIRS).toEqual(expected);
    });
  });

  describe('PathValidationError', () => {
    it('should set code, message and details correctly', () => {
      const error = new PathValidationError(
        ErrorCode.PATH_ACCESS_DENIED,
        'test error',
        { path: '/test' },
      );
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PathValidationError');
      expect(error.code).toBe(ErrorCode.PATH_ACCESS_DENIED);
      expect(error.message).toBe('test error');
      expect(error.details).toEqual({ path: '/test' });
    });

    it('should default details to empty object', () => {
      const error = new PathValidationError(ErrorCode.FILE_NOT_FOUND, 'not found');
      expect(error.details).toEqual({});
    });
  });

  describe('normalizePath', () => {
    it('should convert relative path to absolute', () => {
      const result = validator.normalizePath('some/relative/path');
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('should resolve .. path traversal', () => {
      const result = validator.normalizePath('/data/project-a/../project-b/file.txt');
      expect(result).toBe('/data/project-b/file.txt');
    });

    it('should resolve . current directory', () => {
      const result = validator.normalizePath('/data/project-a/./file.txt');
      expect(result).toBe('/data/project-a/file.txt');
    });

    it('should remove extra slashes', () => {
      const result = validator.normalizePath('/data///project-a//file.txt');
      expect(result).toBe('/data/project-a/file.txt');
    });

    it('should return absolute path unchanged', () => {
      const result = validator.normalizePath('/data/project-a/file.txt');
      expect(result).toBe('/data/project-a/file.txt');
    });
  });

  describe('validatePath', () => {
    describe('allowlist validation', () => {
      it('should allow read access to files in allowed directories', () => {
        const result = validator.validatePath('/data/project-a/src/index.ts', 'read');
        expect(result).toBe('/data/project-a/src/index.ts');
      });

      it('should allow write access to files in allowed directories', () => {
        const result = validator.validatePath('/data/project-a/src/index.ts', 'write');
        expect(result).toBe('/data/project-a/src/index.ts');
      });

      it('should allow access to allowed directory itself', () => {
        const result = validator.validatePath('/data/project-a', 'read');
        expect(result).toBe('/data/project-a');
      });

      it('should reject paths outside allowed directories', () => {
        expect(() => {
          validator.validatePath('/home/user/secret.txt', 'read');
        }).toThrow(PathValidationError);

        try {
          validator.validatePath('/home/user/secret.txt', 'read');
        } catch (e) {
          const err = e as PathValidationError;
          expect(err.code).toBe(ErrorCode.PATH_ACCESS_DENIED);
          expect(err.details.path).toBe('/home/user/secret.txt');
        }
      });

      it('should reject paths with similar prefix but not in allowlist', () => {
        expect(() => {
          validator.validatePath('/data/project-abc/file.txt', 'read');
        }).toThrow(PathValidationError);
      });

      it('should prevent path traversal attacks escaping allowed dirs', () => {
        expect(() => {
          validator.validatePath('/data/project-a/../../home/user/secret.txt', 'read');
        }).toThrow(PathValidationError);
      });
    });

    describe('system directory protection', () => {
      it('should allow reading system directories (when in allowlist)', () => {
        const result = validator.validatePath('/etc/hosts', 'read');
        expect(result).toBe('/etc/hosts');
      });

      it('should reject writing to system directories', () => {
        expect(() => {
          validator.validatePath('/etc/hosts', 'write');
        }).toThrow(PathValidationError);

        try {
          validator.validatePath('/etc/hosts', 'write');
        } catch (e) {
          const err = e as PathValidationError;
          expect(err.code).toBe(ErrorCode.SYSTEM_DIR_PROTECTED);
          expect(err.details.operation).toBe('write');
        }
      });

      it('should allow reading system directory itself', () => {
        const result = validator.validatePath('/etc', 'read');
        expect(result).toBe('/etc');
      });

      it('should reject writing to system directory itself', () => {
        expect(() => {
          validator.validatePath('/etc', 'write');
        }).toThrow(PathValidationError);
      });
    });

    describe('path normalization integration', () => {
      it('should normalize before validating', () => {
        const result = validator.validatePath('/data/project-a/./src/../src/index.ts', 'read');
        expect(result).toBe('/data/project-a/src/index.ts');
      });

      it('should return normalized path', () => {
        const result = validator.validatePath('/data///project-a//file.txt', 'write');
        expect(result).toBe('/data/project-a/file.txt');
      });
    });
  });

  describe('constructor', () => {
    it('should normalize input directories', () => {
      const v = new PathValidator(['/data/project-a/../project-b']);
      const result = v.validatePath('/data/project-b/file.txt', 'read');
      expect(result).toBe('/data/project-b/file.txt');
    });
  });
});

// ============================================================
// 属性测试（Property-Based Tests）
// ============================================================

/**
 * Property 2: 路径验证拒绝非白名单路径
 * **Validates: Requirements 2.2, 3.4, 4.3, 6.3, 7.4, 8.1**
 *
 * 对于任意不在 Allowed_Directory 列表中的路径，
 * 调用 validatePath 应抛出 PATH_ACCESS_DENIED 错误。
 */
describe('Property 2: 路径验证拒绝非白名单路径', () => {
  const allowedDirs = ['/data/project-a', '/data/project-b'];

  /**
   * 生成器：生成保证不在白名单目录下的绝对路径
   * 策略：使用不在 /data/project-a 或 /data/project-b 下的根目录前缀
   */
  const nonAllowedPathArb = fc.tuple(
    fc.constantFrom('/home', '/tmp', '/var', '/opt', '/root', '/usr/local', '/mnt'),
    fc.array(
      fc.stringOf(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
        { minLength: 1, maxLength: 10 },
      ),
      { minLength: 1, maxLength: 4 },
    ),
  ).map(([prefix, segments]) => prefix + '/' + segments.join('/'));

  const operationArb = fc.constantFrom('read' as const, 'write' as const);

  it('should reject any path outside allowed directories for any operation', () => {
    const validator = new PathValidator(allowedDirs);

    fc.assert(
      fc.property(nonAllowedPathArb, operationArb, (targetPath, operation) => {
        try {
          validator.validatePath(targetPath, operation);
          return false;
        } catch (e) {
          const err = e as PathValidationError;
          return err.code === ErrorCode.PATH_ACCESS_DENIED;
        }
      }),
      { numRuns: 100, verbose: true, endOnFailure: true },
    );
  });

  it('should include the normalized path in error details', () => {
    const validator = new PathValidator(allowedDirs);

    fc.assert(
      fc.property(nonAllowedPathArb, operationArb, (targetPath, operation) => {
        try {
          validator.validatePath(targetPath, operation);
          return false;
        } catch (e) {
          const err = e as PathValidationError;
          const normalized = path.resolve(targetPath);
          return err.details.path === normalized;
        }
      }),
      { numRuns: 100, verbose: true, endOnFailure: true },
    );
  });
});

/**
 * Property 6: 路径规范化防遍历
 * **Validates: Requirements 8.2, 8.3**
 *
 * 对于任意包含 ..、.、多余 / 的路径，经过规范化处理后，
 * 得到的绝对路径应与 path.resolve 的结果一致，
 * 且如果规范化后的路径不在 Allowed_Directory 范围内，操作应被拒绝。
 */
describe('Property 6: 路径规范化防遍历', () => {
  const allowedDirs = ['/data/project-a'];

  const safeSegmentArb = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 1, maxLength: 8 },
  );

  const traversalSegmentArb = fc.constantFrom('..', '.', '');

  const pathWithTraversalArb = fc.array(
    fc.oneof(traversalSegmentArb, safeSegmentArb),
    { minLength: 1, maxLength: 6 },
  ).map((segments) => '/data/project-a/' + segments.join('/'));

  it('should produce same result as path.resolve for normalization', () => {
    const validator = new PathValidator(allowedDirs);

    fc.assert(
      fc.property(pathWithTraversalArb, (inputPath) => {
        const normalized = validator.normalizePath(inputPath);
        const expected = path.resolve(inputPath);
        return normalized === expected;
      }),
      { numRuns: 100, verbose: true, endOnFailure: true },
    );
  });

  it('should reject traversal paths that escape allowed directories', () => {
    const validator = new PathValidator(allowedDirs);

    const escapingPathArb = fc.nat({ max: 5 }).map((extra) => {
      const ups = '../'.repeat(3 + extra);
      return '/data/project-a/' + ups + 'home/evil';
    });

    fc.assert(
      fc.property(escapingPathArb, (inputPath) => {
        const normalized = path.resolve(inputPath);
        const isInAllowed = allowedDirs.some(
          (dir) => normalized === dir || normalized.startsWith(dir + '/'),
        );
        if (isInAllowed) return true;

        try {
          validator.validatePath(inputPath, 'read');
          return false;
        } catch (e) {
          const err = e as PathValidationError;
          return err.code === ErrorCode.PATH_ACCESS_DENIED;
        }
      }),
      { numRuns: 100, verbose: true, endOnFailure: true },
    );
  });

  it('should always return absolute path from normalizePath', () => {
    const validator = new PathValidator(allowedDirs);

    const anyPathArb = fc.oneof(
      pathWithTraversalArb,
      safeSegmentArb.map((s) => './' + s),
      safeSegmentArb.map((s) => '../' + s),
    );

    fc.assert(
      fc.property(anyPathArb, (inputPath) => {
        const normalized = validator.normalizePath(inputPath);
        return path.isAbsolute(normalized);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true },
    );
  });
});

/**
 * Property 7: 系统目录读写权限差异
 * **Validates: Requirements 8.5, 8.6, 5.15**
 *
 * 对于任意系统关键目录下的路径，只读操作应被允许（当目录在白名单中时），
 * 但写操作应被拒绝并返回 SYSTEM_DIR_PROTECTED 错误。
 */
describe('Property 7: 系统目录读写权限差异', () => {
  const allowedDirs = [...SYSTEM_PROTECTED_DIRS];

  const systemDirArb = fc.constantFrom(...SYSTEM_PROTECTED_DIRS);

  const subPathArb = fc.array(
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
      { minLength: 1, maxLength: 8 },
    ),
    { minLength: 1, maxLength: 3 },
  ).map((segments) => segments.join('/'));

  const systemPathArb = fc.tuple(systemDirArb, subPathArb).map(
    ([dir, sub]) => dir + '/' + sub,
  );

  it('should allow read operations on system directory paths', () => {
    const validator = new PathValidator(allowedDirs);

    fc.assert(
      fc.property(systemPathArb, (targetPath) => {
        const result = validator.validatePath(targetPath, 'read');
        return typeof result === 'string' && path.isAbsolute(result);
      }),
      { numRuns: 100, verbose: true, endOnFailure: true },
    );
  });

  it('should reject write operations on system directory paths with SYSTEM_DIR_PROTECTED', () => {
    const validator = new PathValidator(allowedDirs);

    fc.assert(
      fc.property(systemPathArb, (targetPath) => {
        try {
          validator.validatePath(targetPath, 'write');
          return false;
        } catch (e) {
          const err = e as PathValidationError;
          return err.code === ErrorCode.SYSTEM_DIR_PROTECTED;
        }
      }),
      { numRuns: 100, verbose: true, endOnFailure: true },
    );
  });

  it('should show asymmetric behavior: same path allows read but rejects write', () => {
    const validator = new PathValidator(allowedDirs);

    fc.assert(
      fc.property(systemPathArb, (targetPath) => {
        // 读操作应成功
        const readResult = validator.validatePath(targetPath, 'read');
        const readOk = typeof readResult === 'string';

        // 写操作应失败
        let writeRejected = false;
        try {
          validator.validatePath(targetPath, 'write');
        } catch (e) {
          const err = e as PathValidationError;
          writeRejected = err.code === ErrorCode.SYSTEM_DIR_PROTECTED;
        }

        return readOk && writeRejected;
      }),
      { numRuns: 100, verbose: true, endOnFailure: true },
    );
  });
});
