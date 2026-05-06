import { test, expect } from '@playwright/test';

test('UI health endpoint returns 200', async ({ request }) => {
  const response = await request.get('/health.json');
  expect(response.status()).toBe(200);
});

test('control-panel actuator health is reachable', async ({ request }) => {
  const response = await request.get('/remote-falcon-control-panel/actuator/health');
  expect(response.status()).toBe(200);
});
