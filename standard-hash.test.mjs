import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inputHash,resultHash} from './standard-hash.mjs';
test('fixed input shape uses canonical JSON and UTF-8',()=>{
 // Expected value from: printf '%s' 'aabbccddeeff0011;{"job":"{\"packs\":[\"A\"]}"}' | sha256sum
 assert.equal(inputHash({job:'{"packs":["A"]}'},'aabbccddeeff0011'),'685de0aa3d289e88e888c0927b41b33683ee76907be26a0c396729ab8b803e99');
});
test('Standard result uses raw newline bytes',()=>{
 assert.equal(resultHash('Line 1\nLine 2','aabbccddeeff0011'),'6fa3bfa69364318f78619b87652c725d705c90f18f8bdcb5d7041c17b73ea57a');
 assert.notEqual(resultHash('Line 1\nLine 2','aabbccddeeff0011'),resultHash('Line 1\\nLine 2','aabbccddeeff0011'));
});
