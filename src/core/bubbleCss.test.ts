import test from 'node:test';
import assert from 'node:assert/strict';
import {safeBubbleCSS} from './bubbleCss';

test('bubble CSS keeps actual declarations and scopes both speakers to chat', () => {
  const css = '.message.mine .bubble { background: #ffd9eb; border-radius: 22px; }\n.message.theirs .bubble { color: #123456; }';
  const result = safeBubbleCSS(css);
  assert.ok(result.includes('.chat-view .message.mine .bubble{ background: #ffd9eb; border-radius: 22px; }'));
  assert.ok(result.includes('.chat-view .message.theirs .bubble{ color: #123456; }'));
  assert.ok(!result.includes('undefined'));
  assert.equal(safeBubbleCSS(''), '');
});

test('bubble CSS rejects external resources, script syntax and page overlays', () => {
  for (const body of ['background: url(https://example.invalid/a)', 'background: image-set("https://example.invalid/a" 1x)', 'position: fixed', 'position:/**/absolute', 'z-index:9999', 'content:"x"', 'behavior:evil', 'background:u\\72l(https://example.invalid/a)']) {
    assert.equal(safeBubbleCSS(`.message.mine .bubble {${body}}`), '', body);
  }
  assert.equal(safeBubbleCSS('@import "https://example.invalid/a";.message.mine .bubble{color:red}'), '');
  assert.equal(safeBubbleCSS('.message.mine .bubble { color:red }</style><script>bad()</script>'), '');
  assert.equal(safeBubbleCSS('body { background: red; }'), '');
  assert.equal(safeBubbleCSS('.message.mine .bubble, body { color: red; }'), '');
});
