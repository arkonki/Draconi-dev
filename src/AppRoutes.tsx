import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { Characters } from './pages/Characters';
import { CharacterPage } from './pages/CharacterPage';
import { Compendium } from './pages/Compendium';
import { AdventureParty } from './pages/AdventureParty';
import { Notes } from './pages/Notes';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { DiceRollerModal } from './components/dice/DiceRollerModal';
import { PrivateRoute } from './components/auth/PrivateRoute';
import { PartyView } from './pages/PartyView';
import { PartyJoinPage } from './pages/PartyJoinPage';

// --- 1. IMPORT THE COMPONENT ---
// Make sure this line exists and is not commented out.
import { EncounterChatView } from './components/party/EncounterChatView';




export function AppRoutes() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-4 focus:bg-white focus:text-blue-600"
      >
        Skip to main content
      </a>

      <Routes>
        {/* Login route is outside the main layout */}
        <Route path="/login" element={<Login />} />

        {/* All other routes are protected and use the main layout */}
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
                
                {/* 
                  Global components available on all authenticated pages.
                  These float on top of the <main> content.
                */}
                <DiceRollerModal />

                {/* --- 2. ADD THE COMPONENT HERE --- */}
                {/* This is the line that makes the component exist on the page. */}
                <EncounterChatView />
              </>
            </PrivateRoute>
          }
        />
      </Routes>
    </>
  );
}
