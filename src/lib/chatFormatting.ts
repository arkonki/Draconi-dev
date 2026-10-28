// The formatting buttons of the chat box. Each one wraps the selection in a Markdown marker, or removes the marker
// when the selection is already wrapped, and says where the cursor goes next.

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function toggleWrap(value: string, start: number, end: number, marker: string): TextEdit {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  const size = marker.length;

  // Already wrapped just outside the selection: unwrap.
  if (before.endsWith(marker) && after.startsWith(marker) && !(marker === '*' && before.endsWith('**') && after.startsWith('**'))) {
    return { value: before.slice(0, -size) + selected + after.slice(size), selectionStart: start - size, selectionEnd: end - size };
  }
  // The selection itself includes the markers: unwrap.
  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(size, -size);
    return { value: before + inner + after, selectionStart: start, selectionEnd: start + inner.length };
  }
  // Wrap. With nothing selected the cursor lands between the markers, ready to type.
  return { value: before + marker + selected + marker + after, selectionStart: start + size, selectionEnd: end + size };
}

export function insertAt(value: string, start: number, end: number, text: string): TextEdit {
  const next = value.slice(0, start) + text + value.slice(end);
  const cursor = start + text.length;
  return { value: next, selectionStart: cursor, selectionEnd: cursor };
}
