import { NextResponse } from 'next/server';

export const config = {
  matcher: '/api/voice-detection',
};

// Simple In-Memory Rate Limiting
const ratelimit = new Map();

export default function middleware(request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  
  // Rate Limit: 5 requests per 60 seconds per IP (More Aggressive)
  const windowMs = 60 * 1000;
  const limit = 5;
  
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
        JSON.stringify({ error: "Too Many Requests. Limit: 5 per minute.", retryAfter: 60 }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
  }

  return NextResponse.next();
}