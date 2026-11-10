import { describe, expect, it } from "vitest";
import { isSafeHtml } from "./validation-utils";

// The node test setup stubs `document` without a parser, so this exercises the DOM-free scan
describe("isSafeHtml", () => {
  it.each([
    "",
    "Plain text, with a > and an &lt; entity",
    "<p>Paragraph</p>",
    '<p><a href="https://example.com">Safe</a></p>',
    '<a href="/relative/path">Relative</a>',
    '<a href="mailto:someone@example.com">Mail</a>',
    '<img src="https://example.com/a.png" alt="A picture" title="Tip" />',
    '<img src="data:image/png;base64,iVBORw0KGgo=" />',
    "<br/>",
    "<ul><li><strong>Bold</strong> <em>italic</em></li></ul>",
    '<span style="color: red">Red</span>',
    '<table><tbody><tr><td colspan="2" rowspan="1">Cell</td></tr></tbody></table>'
  ])("accepts %s", html => {
    expect(isSafeHtml(html)).toBe(true);
  });

  it.each([
    '<p onclick="alert(1)">Bad</p>',
    '<a href="javascript:alert(1)">Bad</a>',
    '<a href=" JaVaScRiPt:alert(1)">Bad</a>',
    '<img src="data:text/html,<script>">',
    "<script>alert(1)</script>",
    '<iframe src="https://example.com"></iframe>',
    '<p style="background:url(javascript:alert(1))">Bad</p>',
    '<p style="width: expression(alert(1))">Bad</p>',
    '<div data-whatever="1">Unknown attribute</div>',
    "<form><input></form>",
    "<!-- a comment -->",
    '<a href="https://example.com" onclick="alert(1)">Bad</a>'
  ])("refuses %s", html => {
    expect(isSafeHtml(html)).toBe(false);
  });
});
