import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/middlewares/api-handler';
import { deleteProject, getProject, upsertProject } from '@/lib/services/project-service';

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

export async function DELETE(_: Request, { params }: Context) {
  try {
    await deleteProject((await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
