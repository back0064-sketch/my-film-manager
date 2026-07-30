import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/middlewares/api-handler';
import { deleteClient, updateClient } from '@/lib/services/project-service';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    return NextResponse.json(await updateClient((await params).id, await readJson(request, 32_000)));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    await deleteClient((await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
