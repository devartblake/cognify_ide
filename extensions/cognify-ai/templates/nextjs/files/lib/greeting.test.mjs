import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { greeting } from './greeting.mjs';

test('greets by name', () => {
	assert.equal(greeting('{{projectName}}'), 'Welcome to {{projectName}}');
});
