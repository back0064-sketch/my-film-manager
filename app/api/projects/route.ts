import { NextResponse } from 'next/server';
import { apiError } from '@/lib/middlewares/api-handler';
import { listProjects } from '@/lib/services/project-service';

export async function GET() {
  try {
    return NextResponse.json(await listProjects());
  } catch (error) {
    return apiError(error);
  }
}
