///<reference types="node" />

import { suite, Test } from 'uvu';
import * as assert from 'uvu/assert';
import { invariant } from './invariant';

describe('invariant', (it) => {
  it('will proceed with truthy values', () => {
    invariant('yes', 'Strings are OK');
    invariant(1, 'Numbers are OK');
    invariant(true, 'Booleans are OK');
  });

  it('will throw on falsy values', () => {
    assert.throws(
      () => invariant('', 'Empty strings are not OK'),
      'Invariant violation: Empty strings are not OK'
    );
    assert.throws(() => invariant(0, 'Zero is not OK'), 'Invariant violation: Zero is not OK');
    assert.throws(
      () => invariant(false, 'False is not OK'),
      'Invariant violation: False is not OK'
    );
  });
});

function describe(title: string, def: (it: Test) => void) {
  const it = suite(title);

  def(it);

  it.run();
}
