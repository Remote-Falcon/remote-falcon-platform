import { describe, it, expect } from 'vitest';

import {
  Environments,
  ViewerControlMode,
  LocationCheckMethod,
  StatusResponse
} from '../enum';

// Enum import smoke + value lock. Several conditional branches in
// services/contexts grep `error?.message === StatusResponse.X` — a
// silent rename here would flip "request again" warnings into generic
// error toasts and the user loses the helpful messaging.

describe('Environments', () => {
  it('exposes the three documented host environments', () => {
    expect(Environments).toEqual({ LOCAL: 'local', TEST: 'test', PROD: 'prod' });
  });
});

describe('ViewerControlMode', () => {
  it('matches the values stored in show.viewerControlMode', () => {
    expect(ViewerControlMode.JUKEBOX).toBe('JUKEBOX');
    expect(ViewerControlMode.VOTING).toBe('VOTING');
  });
});

describe('LocationCheckMethod', () => {
  it('exposes geo / code / none modes', () => {
    expect(LocationCheckMethod).toEqual({ GEO: 'GEO', CODE: 'CODE', NONE: 'NONE' });
  });
});

describe('StatusResponse', () => {
  it('matches the error.message values gateway returns', () => {
    expect(StatusResponse.SHOW_EXISTS).toBe('SHOW_EXISTS');
    expect(StatusResponse.EMAIL_NOT_VERIFIED).toBe('EMAIL_NOT_VERIFIED');
    expect(StatusResponse.EMAIL_CANNOT_BE_SENT).toBe('EMAIL_CANNOT_BE_SENT');
    expect(StatusResponse.SHOW_NOT_FOUND).toBe('SHOW_NOT_FOUND');
    expect(StatusResponse.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(StatusResponse.INVALID_JWT).toBe('INVALID_JWT');
    expect(StatusResponse.API_ACCESS_REQUESTED).toBe('API_ACCESS_REQUESTED');
    expect(StatusResponse.UNEXPECTED_ERROR).toBe('UNEXPECTED_ERROR');
    expect(StatusResponse.OWNER_REQUESTED).toBe('OWNER_REQUESTED');
  });
});
