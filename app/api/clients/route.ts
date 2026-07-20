import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/middlewares/api-handler';
import { addClient, listClients } from '@/lib/services/project-service';

export async function GET() {
  try {
    return NextResponse.json(await listClients());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await addClient(await readJson(request)), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
