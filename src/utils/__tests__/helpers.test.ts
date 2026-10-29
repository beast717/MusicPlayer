import { getDisplayDuration } from '../helpers';

describe('getDisplayDuration', () => {
  it("prefers YouTube's length over the player's doubled one", () => {
    expect(getDisplayDuration(7451, 14901)).toBe(7451);
  });

  it("falls back to the player's length when the track's is unknown", () => {
    expect(getDisplayDuration(0, 245)).toBe(245);
    expect(getDisplayDuration(undefined, 245)).toBe(245);
  });
});
