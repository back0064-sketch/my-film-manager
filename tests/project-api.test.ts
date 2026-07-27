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

  it('刪除客戶收到 204 回應時不會嘗試解析 JSON', async () => {
    const json = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json });
    vi.stubGlobal('fetch', fetchMock);

    await expect(projectApi.removeClient('client-id')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('/api/clients/client-id', expect.objectContaining({ method: 'DELETE' }));
    expect(json).not.toHaveBeenCalled();
  });

  it('合併客戶會傳送來源與目標 ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await projectApi.mergeClients('source-id', 'target-id');

    expect(fetchMock).toHaveBeenCalledWith('/api/clients/merge', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ sourceId: 'source-id', targetId: 'target-id' }),
    }));
  });
});
