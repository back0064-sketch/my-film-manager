import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/middlewares/api-handler';
import { changeProjectClient, deleteProject, getProject, upsertProject } from '@/lib/services/project-service';

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    return NextResponse.json(await getProject((await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    return NextResponse.json(await upsertProject((await params).id, await readJson(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const body = await readJson(request) as { clientId?: unknown };
    const clientId = body.clientId === null ? null : typeof body.clientId === 'string' ? body.clientId : undefined;
    if (clientId === undefined) throw new Error('請指定客戶');
    await changeProjectClient((await params).id, clientId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    await deleteProject((await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
