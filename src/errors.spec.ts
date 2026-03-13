import {
  ErrorCode,
  McpError,
  ToolResult,
  createErrorResult,
  createSuccessResult,
} from './errors';

describe('errors 模块', () => {
  describe('ErrorCode 枚举', () => {
    it('应包含所有 10 个错误码', () => {
      const codes = Object.values(ErrorCode);
      expect(codes).toHaveLength(10);
    });

    it('每个错误码的键和值应一致', () => {
      expect(ErrorCode.PATH_ACCESS_DENIED).toBe('PATH_ACCESS_DENIED');
      expect(ErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ErrorCode.NOT_A_DIRECTORY).toBe('NOT_A_DIRECTORY');
      expect(ErrorCode.MATCH_NOT_FOUND).toBe('MATCH_NOT_FOUND');
      expect(ErrorCode.COMMAND_TIMEOUT).toBe('COMMAND_TIMEOUT');
      expect(ErrorCode.COMMAND_DANGEROUS).toBe('COMMAND_DANGEROUS');
      expect(ErrorCode.COMMAND_REQUIRES_AUTH).toBe('COMMAND_REQUIRES_AUTH');
      expect(ErrorCode.SYSTEM_DIR_PROTECTED).toBe('SYSTEM_DIR_PROTECTED');
      expect(ErrorCode.INVALID_ARGUMENT).toBe('INVALID_ARGUMENT');
      expect(ErrorCode.NO_ALLOWED_DIRS).toBe('NO_ALLOWED_DIRS');
    });
  });

  describe('createErrorResult', () => {
    it('应返回包含 isError: true 的 ToolResult', () => {
      const result = createErrorResult(
        ErrorCode.FILE_NOT_FOUND,
        '文件不存在',
      );
      expect(result.isError).toBe(true);
    });

    it('应返回正确的 content 结构', () => {
      const result = createErrorResult(
        ErrorCode.PATH_ACCESS_DENIED,
        '路径被拒绝',
      );
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });

    it('content.text 应为 JSON 格式，包含 error、message 字段', () => {
      const result = createErrorResult(
        ErrorCode.COMMAND_TIMEOUT,
        '命令超时',
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('COMMAND_TIMEOUT');
      expect(parsed.message).toBe('命令超时');
    });

    it('不传 details 时，JSON 中 details 应为 undefined', () => {
      const result = createErrorResult(
        ErrorCode.INVALID_ARGUMENT,
        '参数无效',
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.details).toBeUndefined();
    });

    it('传入 details 时，JSON 中应包含 details', () => {
      const details = { path: '/etc/passwd', allowed: ['/data'] };
      const result = createErrorResult(
        ErrorCode.PATH_ACCESS_DENIED,
        '路径被拒绝',
        details,
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.details).toEqual(details);
    });
  });

  describe('createSuccessResult', () => {
    it('应返回不包含 isError 的 ToolResult', () => {
      const result = createSuccessResult('操作成功');
      expect(result.isError).toBeUndefined();
    });

    it('应返回正确的 content 结构', () => {
      const result = createSuccessResult('文件内容');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('文件内容');
    });

    it('空字符串也应正常返回', () => {
      const result = createSuccessResult('');
      expect(result.content[0].text).toBe('');
    });
  });
});
