import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectApi } from '@/lib/client/project-api';

describe('專案 API 用戶端', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('收到 204 回應時不會嘗試解析 JSON', async () => {
    const json = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204, json }));

    await expect(projectApi.remove('project-id')).resolves.toBeUndefined();

    expect(json).not.toHaveBeenCalled();
  });
});
