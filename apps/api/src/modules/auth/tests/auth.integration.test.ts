import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { loadConfig, type ApiConfig } from '../../../config/env.js';
import { InMemoryAuthRepository } from '../repositories/inMemoryAuth.repository.js';

function createTestContext(overrides: Partial<ApiConfig> = {}) {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '30d';

  const config = {
    ...loadConfig(),
    ...overrides
  };
  const repository = new InMemoryAuthRepository();
  const app = createApp({ config, authRepository: repository, enableRbacTestRoutes: true });

  return { app, repository, config };
}

async function registerResident(app: ReturnType<typeof createApp>, email = 'resident@example.com') {
  return request(app).post('/api/v1/auth/register').send({
    name: 'Resident User',
    email,
    password: 'password123',
    role: 'DISASTER_OFFICER'
  });
}

describe('auth API', () => {
  beforeEach(() => {
    delete process.env.JWT_ACCESS_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
  });

  it('registers a valid resident and never returns a password hash', async () => {
    const { app } = createTestContext();

    const response = await registerResident(app);

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('RESIDENT');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
  });

  it('rejects duplicate email registration', async () => {
    const { app } = createTestContext();

    await registerResident(app);
    const response = await registerResident(app);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects invalid registration email and weak password', async () => {
    const { app } = createTestContext();

    const invalidEmail = await request(app).post('/api/v1/auth/register').send({
      name: 'Resident User',
      email: 'not-an-email',
      password: 'password123'
    });
    const weakPassword = await request(app).post('/api/v1/auth/register').send({
      name: 'Resident User',
      email: 'valid@example.com',
      password: 'short'
    });

    expect(invalidEmail.status).toBe(400);
    expect(weakPassword.status).toBe(400);
  });

  it('does not allow public registration as privileged roles', async () => {
    const { app } = createTestContext();

    const officerAttempt = await request(app).post('/api/v1/auth/register').send({
      name: 'Officer Attempt',
      email: 'officer-attempt@example.com',
      password: 'password123',
      role: 'DISASTER_OFFICER'
    });
    const responderAttempt = await request(app).post('/api/v1/auth/register').send({
      name: 'Responder Attempt',
      email: 'responder-attempt@example.com',
      password: 'password123',
      role: 'EMERGENCY_RESPONDER'
    });

    expect(officerAttempt.body.user.role).toBe('RESIDENT');
    expect(responderAttempt.body.user.role).toBe('RESIDENT');
  });

  it('logs in with valid credentials and rejects invalid credentials safely', async () => {
    const { app } = createTestContext();

    await registerResident(app);
    const success = await request(app).post('/api/v1/auth/login').send({
      email: 'resident@example.com',
      password: 'password123'
    });
    const wrongPassword = await request(app).post('/api/v1/auth/login').send({
      email: 'resident@example.com',
      password: 'wrongpassword'
    });
    const unknownAccount = await request(app).post('/api/v1/auth/login').send({
      email: 'unknown@example.com',
      password: 'password123'
    });

    expect(success.status).toBe(200);
    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownAccount.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('does not authenticate inactive accounts', async () => {
    const { app, repository } = createTestContext();

    await registerResident(app);
    repository.setUserActive('resident@example.com', false);

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'resident@example.com',
      password: 'password123'
    });

    expect(response.status).toBe(401);
  });

  it('allows /auth/me with a valid token and rejects missing, invalid, and expired tokens', async () => {
    const { app, config } = createTestContext();
    const register = await registerResident(app);
    const expiredToken = jwt.sign({ role: 'RESIDENT' }, config.jwtAccessSecret, {
      subject: register.body.user.id,
      expiresIn: '-1s'
    });

    const valid = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${register.body.accessToken}`);
    const missing = await request(app).get('/api/v1/auth/me');
    const invalid = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer invalid-token');
    const expired = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expiredToken}`);

    expect(valid.status).toBe(200);
    expect(valid.body.user.email).toBe('resident@example.com');
    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(expired.status).toBe(401);
  });

  it('refreshes sessions with rotation and rejects reused or revoked refresh tokens', async () => {
    const { app } = createTestContext();
    const register = await registerResident(app);

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: register.body.refreshToken
    });
    const reusedOldToken = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: register.body.refreshToken
    });
    const logout = await request(app).post('/api/v1/auth/logout').send({
      refreshToken: refreshed.body.refreshToken
    });
    const afterLogout = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: refreshed.body.refreshToken
    });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(register.body.refreshToken);
    expect(reusedOldToken.status).toBe(401);
    expect(logout.status).toBe(204);
    expect(afterLogout.status).toBe(401);
  });

  it('enforces RBAC with 401 for unauthenticated and 403 for wrong role', async () => {
    const { app, repository } = createTestContext();
    const resident = await registerResident(app);
    const officer = await repository.createUser({
      name: 'Officer User',
      email: 'officer@example.com',
      passwordHash: 'not-used-in-this-test',
      role: 'DISASTER_OFFICER'
    });
    const officerToken = jwt.sign({ role: 'DISASTER_OFFICER' }, 'test-access-secret', {
      subject: officer.id,
      expiresIn: '15m'
    });

    const residentAllowed = await request(app)
      .get('/api/v1/test/rbac/resident-area')
      .set('Authorization', `Bearer ${resident.body.accessToken}`);
    const residentDenied = await request(app)
      .get('/api/v1/test/rbac/officer-area')
      .set('Authorization', `Bearer ${resident.body.accessToken}`);
    const officerAllowed = await request(app)
      .get('/api/v1/test/rbac/officer-area')
      .set('Authorization', `Bearer ${officerToken}`);
    const unauthenticated = await request(app).get('/api/v1/test/rbac/officer-area');

    expect(residentAllowed.status).toBe(200);
    expect(residentDenied.status).toBe(403);
    expect(officerAllowed.status).toBe(200);
    expect(unauthenticated.status).toBe(401);
  });
});
