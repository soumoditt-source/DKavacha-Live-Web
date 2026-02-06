import { NextResponse } from 'next/server';

export const config = {
  matcher: '/api/voice-detection',
};

// Simple In-Memory Rate Limiting (Note: State resets on redeploy/cold start)
const ratelimit = new Map();

export default function middleware(request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  
  // Rate Limit: 10 requests per 60 seconds per IP
  const windowMs = 60 * 1000;
  const limit = 10;
  
  const record = ratelimit.get(ip) || { count: 0, start: now };
  
  if (now - record.start > windowMs) {
      record.count = 1;
      record.start = now;
  } else {
      record.count += 1;
  }
  
  ratelimit.set(ip, record);

  if (record.count > limit) {
      return new NextResponse(
        JSON.stringify({ error: "Too Many Requests", retryAfter: 60 }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
  }

  return NextResponse.next();
}