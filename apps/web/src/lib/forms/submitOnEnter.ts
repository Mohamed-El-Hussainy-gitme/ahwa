import type React from 'react';

export function submitOnEnter(
  event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  action: () => void,
  options?: { allowTextarea?: boolean },
) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  const isTextarea = event.currentTarget instanceof HTMLTextAreaElement;
  if (isTextarea && !options?.allowTextarea) return;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  action();
}
