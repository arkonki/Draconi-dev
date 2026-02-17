import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoadingSpinner } from './components/shared/LoadingSpinner';

const Navigation = lazy(() =>
  import('./components/Navigation').then((module) => ({ default: module.Navigation }))
);
const Characters = lazy(() =>
  import('./pages/Characters').then((module) => ({ default: module.Characters }))
);
const CharacterPage = lazy(() =>
  import('./pages/CharacterPage').then((module) => ({ default: module.CharacterPage }))
);
const Compendium = lazy(() =>
  import('./pages/Compendium').then((module) => ({ default: module.Compendium }))
);
const AdventureParty = lazy(() =>
  import('./pages/AdventureParty').then((module) => ({ default: module.AdventureParty }))
);
const Notes = lazy(() => import('./pages/Notes').then((module) => ({ default: module.Notes })));
const Settings = lazy(() =>
  import('./pages/Settings').then((module) => ({ default: module.Settings }))
);
const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const DiceRollerModal = lazy(() =>
  import('./components/dice/DiceRollerModal').then((module) => ({ default: module.DiceRollerModal }))
);
const PrivateRoute = lazy(() =>
  import('./components/auth/PrivateRoute').then((module) => ({ default: module.PrivateRoute }))
);
const PartyView = lazy(() =>
  import('./pages/PartyView').then((module) => ({ default: module.PartyView }))
);
const PartyJoinPage = lazy(() =>
  import('./pages/PartyJoinPage').then((module) => ({ default: module.PartyJoinPage }))
);
const EncounterChatView = lazy(() =>
  import('./components/party/EncounterChatView').then((module) => ({ default: module.EncounterChatView }))
);

export function AppRoutes() {
  const loadingFallback = (
    <div className="flex justify-center items-center h-64">
      <LoadingSpinner size="lg" />
    </div>
  );

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-4 focus:bg-white focus:text-blue-600"
      >
        Skip to main content
      </a>

      <Suspense fallback={loadingFallback}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="*"
            element={
              <PrivateRoute>
                <>
                  <Navigation />
                  <main id="main-content" className="container mx-auto px-4 py-8">
                    {/* Nested Routes for authenticated pages */}
                    <Routes>
                      <Route path="/" element={<Characters />} />
                      <Route path="/character/:id" element={<CharacterPage />} />
                      <Route path="/compendium" element={<Compendium />} />
                      <Route path="/adventure-party" element={<AdventureParty />} />
                      <Route path="/party/:id" element={<PartyView />} />
                      <Route path="/party/join/:inviteCode" element={<PartyJoinPage />} />
                      <Route path="/notes" element={<Notes />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>

                  <DiceRollerModal />
                  <EncounterChatView />
                </>
              </PrivateRoute>
            }
          />
        </Routes>
      </Suspense>
    </>
  );
}
