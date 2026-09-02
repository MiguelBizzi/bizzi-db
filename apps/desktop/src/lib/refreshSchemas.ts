import { invokeErrorMessage } from './invokeError';

export async function refreshConnectionSchemas(
  loadSchema: (connectionId: string) => Promise<unknown>,
  connectionId: string
): Promise<string | null> {
  try {
    await loadSchema(connectionId);
    return null;
  } catch (e: unknown) {
    return invokeErrorMessage(e);
  }
}
