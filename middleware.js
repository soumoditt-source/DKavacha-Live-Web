import { NextResponse } from 'next/server';

export const config = {
  matcher: '/api/voice-detection',
};

// Simple In-Memory Rate Limiting (Per-Edge Instance)
const ratelimit = new Map();

export default function middleware(request) {
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  
  // Rate Limit: 3 requests per 60 seconds per IP (Aggressive Security)
  const windowMs = 60 * 1000;
  const limit = 3;
  
  const record = ratelimit.get(ip) || { count: 0, start: now };
  
  // Reset window if passed
  if (now - record.start > windowMs) {
      record.count = 1;
      record.start = now;
  } else {
      record.count += 1;
  }
  
  ratelimit.set(ip, record);

  if (record.count > limit) {
      // Calculate remaining time for Retry-After header
      const resetTime = Math.ceil((record.start + windowMs - now) / 1000);
      
      const response = NextResponse.json(
        { error: "Too Many Requests. Security Limit: 3 per minute.", retryAfter: resetTime },
        { status: 429 }
      );
      
      response.headers.set('Retry-After', String(resetTime));
      return response;
  }

  return NextResponse.next();
}