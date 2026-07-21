import { NextResponse } from 'next/server';
import { ForbiddenError, UnauthorizedError } from './auth';

export function handleApiError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
}
