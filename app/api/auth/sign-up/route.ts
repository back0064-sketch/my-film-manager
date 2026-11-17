import { apiError, PublicApiError } from '@/lib/middlewares/api-handler';

export async function POST() {
  try {
    throw new PublicApiError('此系統僅限既有帳號登入，不開放自行註冊', 403);
  } catch (error) {
    return apiError(error);
  }
}
