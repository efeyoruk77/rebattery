import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fromThisScreen} from './review.mjs';

// Regression (open problem "Review screen accepts requests from any page"): /api/sign checked no Host or Origin and
// parsed any body as JSON, so another page could trigger a real sign and Cardano write.
test('sign accepts only the local review page sending JSON', () => {
 const req = headers => ({headers: {host: '127.0.0.1:21952', 'content-type': 'application/json', ...headers}});
 assert.equal(fromThisScreen(req({origin: 'http://127.0.0.1:21952'}), 21952), true);
 assert.equal(fromThisScreen(req({host: 'localhost:21952', origin: 'http://localhost:21952'}), 21952), true);
 assert.equal(fromThisScreen(req({host: 'evil.example:21952'}), 21952), false);
 assert.equal(fromThisScreen(req({origin: 'https://evil.example'}), 21952), false);
 assert.equal(fromThisScreen(req({'content-type': 'text/plain'}), 21952), false);
});
