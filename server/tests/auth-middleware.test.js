import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { optionalAuth, requireUser } from '../src/middleware/auth.js';
import { issueTokenPair } from '../src/services/authTokenService.js';

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function requestWithToken(token, headers = {}) {
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: {},
  };
}

function requestWithAuthorization(authorization, headers = {}, body = {}) {
  return {
    headers: { ...headers, authorization },
    body,
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('requireUser and optionalAuth accept signed anonymous and registered access JWTs', () => {
  for (const identity of [
    { userId: 'anonymous-jwt-user', kind: 'anonymous' },
    { userId: 'registered-jwt-user', kind: 'registered' },
  ]) {
    const { accessToken } = issueTokenPair(identity);

    for (const middleware of [requireUser, optionalAuth]) {
      const req = requestWithToken(accessToken);
      const res = responseRecorder();
      let nextCalls = 0;
      middleware(req, res, () => { nextCalls += 1; });

      assert.equal(nextCalls, 1);
      assert.equal(req.userId, identity.userId);
      assert.equal(res.statusCode, 200);
    }
  }
});

test('an invalid bearer JWT is never trusted or replaced by a spoofed legacy identity', () => {
  for (const middleware of [requireUser, optionalAuth]) {
    const req = requestWithToken('forged.jwt.token', { 'x-user-id': 'spoofed-user' });
    const res = responseRecorder();
    let nextCalls = 0;
    middleware(req, res, () => { nextCalls += 1; });

    assert.notEqual(req.userId, 'spoofed-user');
    if (middleware === requireUser) {
      assert.equal(nextCalls, 0);
      assert.equal(res.statusCode, 401);
    } else {
      assert.equal(nextCalls, 1);
      assert.equal(req.userId, null);
    }
  }
});

test('bearer scheme is case-insensitive for a valid signed access JWT', () => {
  const { accessToken } = issueTokenPair({ userId: 'lowercase-jwt-user', kind: 'anonymous' });

  for (const middleware of [requireUser, optionalAuth]) {
    const req = requestWithAuthorization(`bearer ${accessToken}`);
    const res = responseRecorder();
    let nextCalls = 0;
    middleware(req, res, () => { nextCalls += 1; });

    assert.equal(nextCalls, 1);
    assert.equal(req.userId, 'lowercase-jwt-user');
  }
});

test('lowercase forged bearer fails closed instead of trusting spoofed legacy identity', () => {
  for (const middleware of [requireUser, optionalAuth]) {
    const req = requestWithAuthorization('bearer forged.jwt.token', {
      'x-user-id': 'spoofed-header-user',
    }, { userId: 'spoofed-body-user' });
    const res = responseRecorder();
    let nextCalls = 0;
    middleware(req, res, () => { nextCalls += 1; });

    assert.notEqual(req.userId, 'spoofed-header-user');
    assert.notEqual(req.userId, 'spoofed-body-user');
    if (middleware === requireUser) {
      assert.equal(nextCalls, 0);
      assert.equal(res.statusCode, 401);
    } else {
      assert.equal(nextCalls, 1);
      assert.equal(req.userId, null);
    }
  }
});

test('empty bearer and unusual bearer whitespace fail closed', () => {
  for (const authorization of ['Bearer', 'bearer   ', ' \tBeArEr\t ', '  bearer  forged.jwt.token  ', ' \tbEaReR\tforged.jwt.token\t']) {
    for (const middleware of [requireUser, optionalAuth]) {
      const req = requestWithAuthorization(authorization, {
        'x-user-id': 'spoofed-header-user',
      }, { userId: 'spoofed-body-user' });
      const res = responseRecorder();
      let nextCalls = 0;
      middleware(req, res, () => { nextCalls += 1; });

      assert.notEqual(req.userId, 'spoofed-header-user', authorization);
      assert.notEqual(req.userId, 'spoofed-body-user', authorization);
      if (middleware === requireUser) {
        assert.equal(nextCalls, 0, authorization);
        assert.equal(res.statusCode, 401, authorization);
      } else {
        assert.equal(nextCalls, 1, authorization);
        assert.equal(req.userId, null, authorization);
      }
    }
  }
});

test('legacy identity fallback remains available when Authorization is absent', () => {
  for (const middleware of [requireUser, optionalAuth]) {
    const req = { headers: { 'x-user-id': 'legacy-header-user' }, body: { userId: 'legacy-body-user' } };
    const res = responseRecorder();
    let nextCalls = 0;
    middleware(req, res, () => { nextCalls += 1; });

    assert.equal(nextCalls, 1);
    assert.equal(req.userId, 'legacy-header-user');
  }
});

test('legacy local bearer identities remain compatible at the existing middleware boundary', () => {
  for (const middleware of [requireUser, optionalAuth]) {
    const req = requestWithToken('local-legacy-user');
    const res = responseRecorder();
    let nextCalls = 0;
    middleware(req, res, () => { nextCalls += 1; });

    assert.equal(nextCalls, 1);
    assert.equal(req.userId, 'legacy-user');
  }
});

test('a newly issued anonymous JWT can pull its cloud data without changing identity', async () => {
  await withServer(async (base) => {
    const authResponse = await fetch(`${base}/api/auth/anonymous`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const auth = await authResponse.json();
    assert.equal(authResponse.status, 201);

    const pullResponse = await fetch(`${base}/api/sync/pull`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.accessToken}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    const pulled = await pullResponse.json();

    assert.equal(pullResponse.status, 200);
    assert.equal(pulled.success, true);
    assert.deepEqual(pulled.cards, []);
  });
});
