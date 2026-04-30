import { getCollaborativeScope, isLiveCollaborativePath } from './collaborativeRoutes';

describe('collaborativeRoutes', () => {
  it('returns party scope for party views', () => {
    expect(getCollaborativeScope('/party/abc123')).toBe('party:abc123');
  });

  it('ignores non-collaborative party helper routes', () => {
    expect(getCollaborativeScope('/party/join/invite-code')).toBeNull();
  });

  it('detects live collaborative projector routes', () => {
    expect(isLiveCollaborativePath('/d/token-1')).toBe(true);
    expect(isLiveCollaborativePath('/display/token-2')).toBe(true);
  });
});
