import { DomainError, ProjectorMessage, Result } from './model';

export const PROJECTOR_MESSAGE_MAX_LENGTH = 140;

function error(code: string, messageKey: string): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey } };
}

export function createProjectorMessage(
  text: string,
  mode: ProjectorMessage['mode'],
): Result<ProjectorMessage, DomainError> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return error('projectorMessageRequired', 'projectorMessage.required');
  }
  if (trimmedText.length > PROJECTOR_MESSAGE_MAX_LENGTH) {
    return error('projectorMessageTooLong', 'projectorMessage.tooLong');
  }
  return { ok: true, value: { text: trimmedText, mode } };
}
