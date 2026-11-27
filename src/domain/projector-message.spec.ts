import { describe, expect, it } from 'vitest';
import { createProjectorMessage, PROJECTOR_MESSAGE_MAX_LENGTH } from './projector-message';

describe('projector message', () => {
  it('trims plain text and preserves the selected display mode', () => {
    expect(createProjectorMessage('  Almuerzo hasta las 14:00  ', 'FULLSCREEN')).toEqual({
      ok: true,
      value: { text: 'Almuerzo hasta las 14:00', mode: 'FULLSCREEN' },
    });
  });

  it('rejects blank messages', () => {
    expect(createProjectorMessage(' \n ', 'BANNER')).toMatchObject({
      ok: false,
      error: { code: 'projectorMessageRequired' },
    });
  });

  it('accepts 140 characters and rejects longer messages', () => {
    const accepted = 'x'.repeat(PROJECTOR_MESSAGE_MAX_LENGTH);
    const rejected = 'x'.repeat(PROJECTOR_MESSAGE_MAX_LENGTH + 1);
    expect(createProjectorMessage(accepted, 'BANNER')).toMatchObject({
      ok: true,
      value: { text: accepted, mode: 'BANNER' },
    });
    expect(createProjectorMessage(rejected, 'BANNER')).toMatchObject({
      ok: false,
      error: { code: 'projectorMessageTooLong' },
    });
  });
});
