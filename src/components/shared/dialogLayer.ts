import { createContext } from 'react';

// React context follows portals, so nested dialogs can escape clipping without
// losing their position above the dialog that opened them.
export const DialogLayerContext = createContext(0);
