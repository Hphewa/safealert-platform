import type {
  AuthResponse,
  LoginRequest,
  LogoutRequest,
  MeResponse,
  RefreshRequest,
  RegisterRequest
} from '@safealert/contracts';

import { apiRequest } from '../../../services/api/client';

export function registerResident(input: RegisterRequest) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: input
  });
}

export function login(input: LoginRequest) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: input
  });
}

export function refresh(input: RefreshRequest) {
  return apiRequest<AuthResponse>('/auth/refresh', {
    method: 'POST',
    body: input
  });
}

export function logout(input: LogoutRequest) {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    body: input
  });
}

export function me(accessToken: string) {
  return apiRequest<MeResponse>('/auth/me', {
    accessToken
  });
}
