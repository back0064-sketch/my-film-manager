import { NextResponse } from 'next/server';
import { apiError } from '@/lib/middlewares/api-handler';
import { deleteClient } from '@/lib/services/project-service';

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Context) {
  try {
    await deleteClient((await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
