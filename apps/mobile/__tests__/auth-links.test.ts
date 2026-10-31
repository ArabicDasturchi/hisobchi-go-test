import { describe, expect, it } from 'vitest';
import { authError, parseAuthCallback } from '../src/backend/authLinks';

describe('parseAuthCallback', () => {
  it('PKCE code (dev build sxemasi va Expo Go)', () => {
    expect(parseAuthCallback('hisobchigo://auth/callback?code=abc-123')).toEqual({ kind: 'code', code: 'abc-123' });
    expect(parseAuthCallback('exp://192.168.1.5:8081/--/auth/callback?code=xyz')).toEqual({ kind: 'code', code: 'xyz' });
  });

  it('implicit tokenlar fragmentda', () => {
    expect(parseAuthCallback('hisobchigo://auth/callback#access_token=AT&refresh_token=RT&type=signup')).toEqual({
      kind: 'tokens',
      accessToken: 'AT',
      refreshToken: 'RT',
    });
  });

  it('token_hash + type', () => {
    expect(parseAuthCallback('hisobchigo://auth/callback?token_hash=h1&type=signup')).toEqual({
      kind: 'token_hash',
      tokenHash: 'h1',
      type: 'signup',
    });
    expect(parseAuthCallback('hisobchigo://auth/callback?token_hash=h1&type=hack')).toEqual({ kind: 'none' });
  });

  it('xato query yoki fragmentda — kod ustun', () => {
    expect(
      parseAuthCallback('hisobchigo://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
    ).toEqual({ kind: 'error', code: 'otp_expired', description: 'Email link is invalid or has expired' });
    expect(parseAuthCallback('hisobchigo://auth/callback?error=server_error')).toEqual({ kind: 'error', code: 'server_error', description: '' });
  });

  it("parametrsiz yoki bo'sh — none", () => {
    expect(parseAuthCallback(null)).toEqual({ kind: 'none' });
    expect(parseAuthCallback('hisobchigo://auth/callback')).toEqual({ kind: 'none' });
  });
});

describe('authError', () => {
  it.each([
    [{ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'auth', /tasdiqlanmagan/],
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'validation', /noto'g'ri/],
    [{ code: 'user_already_exists', message: 'User already registered' }, 'validation', /allaqachon/],
    [{ code: 'otp_expired' }, 'auth', /eskirgan/],
    [{ code: 'flow_state_not_found' }, 'auth', /boshqa joyda/],
    [{ code: 'weak_password', message: 'Password should be at least 8 characters' }, 'validation', /oddiy/],
    [{ code: 'over_email_send_rate_limit' }, 'auth', /Juda ko'p/],
    [{ name: 'AuthRetryableFetchError', message: 'Network request failed' }, 'network', /Internet/],
    [{ message: 'something odd' }, 'unknown', /Kirishda xato/],
  ])('%j', (err, kind, re) => {
    const e = authError(err);
    expect(e.kind).toBe(kind);
    expect(e.message).toMatch(re);
  });
});
