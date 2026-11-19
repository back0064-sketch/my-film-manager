import { NextResponse } from 'next/server';
import { apiError, PublicApiError, readJson } from '@/lib/middlewares/api-handler';
import { changeProjectClient, deleteProject, getProject, setProjectArchived, upsertProject } from '@/lib/services/project-service';

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
    const body = await readJson(request) as { clientId?: unknown; archived?: unknown };
    if (!body || typeof body !== 'object') throw new PublicApiError('請指定專案更新內容');
    if (typeof body.archived === 'boolean' && body.clientId === undefined) {
      return NextResponse.json(await setProjectArchived((await params).id, body.archived));
    }
    const clientId = body.clientId === null ? null : typeof body.clientId === 'string' ? body.clientId : undefined;
    if (clientId === undefined) throw new PublicApiError('請指定客戶');
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
