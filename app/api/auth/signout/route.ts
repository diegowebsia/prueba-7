import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    /* sin supabase: nada que cerrar */
  }
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
}

export async function GET(req: Request) {
  return POST(req);
}
