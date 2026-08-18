import React, { useEffect } from 'react';
import htmlToReact from 'html-to-react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LocationCheckMethod, ViewerControlMode } from '../../../../../utils/enum';
import { injectRetryLocationToken, processingInstructions } from '../helpers';

// This function rewrites the page HTML of every GPS-gated show on deploy, so
// the bar is "cannot deface a page", not just "usually works".
describe('injectRetryLocationToken', () => {
  it('adds a slot above the song list on an untouched template', () => {
    const page = '<body><h1>My Show</h1><div class="playlists">{PLAYLISTS}</div></body>';
    expect(injectRetryLocationToken(page)).toBe(
      '<body><h1>My Show</h1><div>{RETRY_LOCATION}</div><div class="playlists">{PLAYLISTS}</div></body>'
    );
  });

  it('anchors on {VOTES} for container-less voting pages', () => {
    const page = '<div><span>{VOTES}</span></div>';
    expect(injectRetryLocationToken(page)).toBe('<div><div>{RETRY_LOCATION}</div><span>{VOTES}</span></div>');
  });

  it('anchors on whichever token comes first', () => {
    const page = '<p>{VOTES}</p><p>{PLAYLISTS}</p>';
    const out = injectRetryLocationToken(page);
    expect(out.indexOf('{RETRY_LOCATION}')).toBeLessThan(out.indexOf('{VOTES}'));
  });

  // Operator placement is both the positioning mechanism AND the opt-out (a
  // display:none wrapper). Auto-injecting on top of it would break both.
  it('leaves a page alone when the operator placed the token themselves', () => {
    const page = '<div id="mine">{RETRY_LOCATION}</div><div>{PLAYLISTS}</div>';
    expect(injectRetryLocationToken(page)).toBe(page);
  });

  it('leaves a page with no song list untouched rather than guessing', () => {
    const page = '<body><h1>Coming soon</h1></body>';
    expect(injectRetryLocationToken(page)).toBe(page);
  });

  // Caught in a real browser against a real stock template, not by any of the
  // hand-written fixtures above. EVERY stock template opens with a doc comment
  // listing the placeholders, and on elwoodrdlightshow that comment holds the
  // first {PLAYLISTS} by ~17KB — anchoring on it put the control at the very
  // top of the page, above the operator's own <style> block.
  it('ignores an anchor token that appears in the template doc comment', () => {
    const page = [
      "<!--\n  The following are the variables used to populate your lists so DON'T MODIFY THESE!!:",
      '  {PLAYLISTS} - Displays the list of your sequences for the viewer',
      '-->',
      '<h1>My Show</h1>',
      '<div class="rtable">{PLAYLISTS}</div>'
    ].join('\n');
    const out = injectRetryLocationToken(page);
    expect(out.indexOf('{RETRY_LOCATION}')).toBeGreaterThan(out.indexOf('<h1>'));
    expect(out).toContain('<div>{RETRY_LOCATION}</div><div class="rtable">');
  });

  // Caught in a real browser too: anchoring on the song list put the slot
  // INSIDE {playlist-voting-dynamic-container}, which JUKEBOX mode blanks — so
  // the control rendered nothing at all on a stock jukebox page.
  it('anchors above the mode containers, not inside them', () => {
    const page = [
      '<div {jukebox-dynamic-container}>',
      '  <div id="playlists_container">{PLAYLISTS}</div>',
      '</div>'
    ].join('\n');
    const out = injectRetryLocationToken(page);
    expect(out.indexOf('{RETRY_LOCATION}')).toBeLessThan(out.indexOf('{jukebox-dynamic-container}'));
  });

  it('anchors above the FIRST mode container when a page has several', () => {
    const page =
      '<div {playlist-voting-dynamic-container}><div>{PLAYLISTS}</div></div><div {jukebox-dynamic-container}><div>{PLAYLISTS}</div></div>';
    const out = injectRetryLocationToken(page);
    expect(out.indexOf('{RETRY_LOCATION}')).toBeLessThan(out.indexOf('{playlist-voting-dynamic-container}'));
  });

  it('still anchors on the song list for custom pages with no containers', () => {
    const page = '<div class="rtable">{PLAYLISTS}</div>';
    expect(injectRetryLocationToken(page)).toBe('<div>{RETRY_LOCATION}</div><div class="rtable">{PLAYLISTS}</div>');
  });

  it('ignores anchor tokens inside style and script blocks', () => {
    const page = '<style>/* {PLAYLISTS} */</style><script>var t = "{VOTES}";</script><div>{PLAYLISTS}</div>';
    const out = injectRetryLocationToken(page);
    expect(out).toContain('<div>{RETRY_LOCATION}</div><div>{PLAYLISTS}</div>');
  });

  it('does not treat a commented-out operator token as an opt-out', () => {
    // A template that merely documents {RETRY_LOCATION} must still get a slot.
    const page = '<!-- {RETRY_LOCATION} - shows the location help --><div>{PLAYLISTS}</div>';
    expect(injectRetryLocationToken(page)).toContain('<div>{RETRY_LOCATION}</div><div>{PLAYLISTS}</div>');
  });

  it('survives an unterminated comment without crashing', () => {
    const page = '<!-- {PLAYLISTS} never closed';
    expect(injectRetryLocationToken(page)).toBe(page);
  });

  it('handles null and empty pages', () => {
    expect(injectRetryLocationToken(null)).toBeNull();
    expect(injectRetryLocationToken('')).toBe('');
  });

  it('injects exactly one slot even when the anchor token repeats', () => {
    const page = '<div>{PLAYLISTS}</div><div>{PLAYLISTS}</div>';
    expect(injectRetryLocationToken(page).match(/{RETRY_LOCATION}/g)).toHaveLength(1);
  });

  it('survives an anchor token that opens the document', () => {
    // No preceding '<' to back up to. Must not produce a negative slice.
    expect(injectRetryLocationToken('{PLAYLISTS}')).toBe('<div>{RETRY_LOCATION}</div>{PLAYLISTS}');
  });

  it('keeps the slot a sibling of the song list, never inside its text node', () => {
    // The token matcher requires {RETRY_LOCATION} to be its element's only
    // content, so splicing it into the same text node would silently never render.
    const out = injectRetryLocationToken('<div class="list">{PLAYLISTS}</div>');
    expect(out).not.toContain('{RETRY_LOCATION}{PLAYLISTS}');
    expect(out).toContain('<div>{RETRY_LOCATION}</div><div class="list">');
  });
});

// End-to-end through the real parser: inject, parse, and confirm the control
// actually lands as a live element. Unit-testing the string rewrite alone would
// not catch a token the parser refuses to match.
describe('injected token through parseWithInstructions', () => {
  const parser = new htmlToReact.Parser();
  const pnd = new htmlToReact.ProcessNodeDefinitions(React);

  const buildTree = (page, retryElement, nowPlayingTimer = 'timer') => {
    const instructions = processingInstructions(
      pnd,
      true,
      ViewerControlMode.JUKEBOX,
      LocationCheckMethod.GEO,
      <></>,
      <></>,
      'now',
      'next',
      0,
      <></>,
      nowPlayingTimer,
      <></>,
      retryElement
    );
    return <>{parser.parseWithInstructions(page, () => true, instructions)}</>;
  };

  const parse = (page, retryElement) => render(buildTree(page, retryElement));

  it('renders the control into an auto-injected slot', () => {
    const page = injectRetryLocationToken('<div><div class="list">{PLAYLISTS}</div></div>');
    const { getByText } = parse(page, <span>Enable location</span>);
    expect(getByText('Enable location')).toBeTruthy();
  });

  it('renders the control into an operator-placed slot', () => {
    const page = '<div><aside>{RETRY_LOCATION}</aside><div>{PLAYLISTS}</div></div>';
    const { container, getByText } = parse(page, <span>Enable location</span>);
    expect(getByText('Enable location')).toBeTruthy();
    // Operator position is respected, not relocated.
    expect(container.querySelector('aside')).toBeTruthy();
  });

  // The viewer page reparses roughly once a second while a song plays, which
  // rebuilds this whole tree. If that remounted the control, its shown-event
  // would fire ~60x/minute per viewer and the recovery-rate denominator would
  // be meaningless — and any transient state (the "Link copied" confirmation)
  // would be wiped a second after the viewer saw it.
  it('does not remount the control when the page is reparsed', () => {
    const onMount = vi.fn();
    const Probe = () => {
      useEffect(() => {
        onMount();
      }, []);
      return <span>probe</span>;
    };
    const page = injectRetryLocationToken('<div><h1>Show</h1><div class="list">{PLAYLISTS}</div></div>');
    // Same page, a ticking now-playing timer — exactly what drives the reparse.
    const { rerender } = render(buildTree(page, <Probe />, '0:01'));
    rerender(buildTree(page, <Probe />, '0:02'));
    rerender(buildTree(page, <Probe />, '0:03'));
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('leaves an empty slot behind when the control renders nothing', () => {
    const page = injectRetryLocationToken('<div><div class="list">{PLAYLISTS}</div></div>');
    const { container } = parse(page, <></>);
    expect(container.textContent).not.toContain('{RETRY_LOCATION}');
  });
});
