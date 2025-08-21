# Dragonbane Character Manager

This project is a web application designed to help players manage their characters, parties, and game-related information for the Dragonbane RPG system. It provides features for character creation, viewing character sheets, managing party inventory and notes, and accessing a game compendium.

## Features

*   **Character Management**: Create, view, and manage Dragonbane characters.
    *   Step-by-step character creation wizard.
    *   Detailed character sheet view including attributes, skills, spells, equipment, and conditions.
    *   Experience and advancement tracking.
*   **Party Management**: Organize and track party details.
    *   View party members.
    *   Shared party inventory.
    *   Collaborative party notes (Markdown supported).
*   **Compendium**: Access game rules, items, spells, kin, professions, etc.
    *   View official game data.
    *   (Admin) Manage compendium entries.
    *   (Potential) Support for homebrew content rendering.
*   **Authentication**: Secure user login and registration.
*   **Settings**: Customize user profile, appearance, and notification preferences.
*   **Admin Panel**: (For authorized users) Manage users, game data (items, spells, etc.), and potentially system settings.
*   **Dice Roller**: Integrated dice rolling functionality.

## Tech Stack

*   **Frontend**: React, TypeScript, Vite
*   **Styling**: Tailwind CSS, clsx, tailwind-merge
*   **Routing**: React Router
*   **State Management**:
    *   TanStack Query (React Query): Server state management, caching, background updates.
    *   Zustand: Complex client-side state (e.g., character creation wizard).
    *   React Context API: Global state (Auth, App Settings, Session Timeout, Dice).
*   **Backend**: Supabase (Database, Authentication, potentially Edge Functions)
*   **Forms & Validation**: Zod
*   **Markdown**: `react-markdown`, `remark-gfm`, `rehype-raw`, `rehype-sanitize`
*   **Linting**: ESLint with plugins for React, JSX-A11y, TypeScript
*   **Testing**: Vitest, React Testing Library, JSDOM
*   **Deployment**: Netlify (inferred from `netlify.toml`)

## Prerequisites

*   Node.js (LTS version recommended)
*   npm (comes with Node.js)
*   A Supabase project (for database and authentication)

## Setup and Installation

1.  **Clone the repository** (or download the source code).
2.  **Navigate to the project directory**:
    ```bash
    cd your-project-directory
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Set up environment variables**:
    *   Create a `.env` file in the root directory by copying the example:
        ```bash
        cp .env.example .env
        ```
    *   Open the `.env` file and replace the placeholder values with your actual Supabase URL and Anon Key:
        ```env
        VITE_SUPABASE_URL=YOUR_SUPABASE_URL
        VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
        # Add any other required environment variables here (e.g., for SMTP if email features are used)
        ```
        *Note: The `.env` file is included in `.gitignore` and should not be committed to version control.*

## Running the Application

*   **Development Server**: Starts the app in development mode with hot-reloading.
    ```bash
    npm run dev
    ```
    Access the application at the URL provided by Vite (usually `http://localhost:5173`).

*   **Linting**: Checks the codebase for potential errors and style issues.
    ```bash
    npm run lint
    ```

*   **Testing**: Runs the automated tests using Vitest.
    ```bash
    npm run test
    ```

*   **Production Build**: Creates an optimized build of the application in the `dist/` folder.
    ```bash
    npm run build
    ```

*   **Preview Production Build**: Serves the production build locally.
    ```bash
    npm run preview
    ```

## Deployment

This project includes a `netlify.toml` file, suggesting it's configured for deployment on Netlify. Ensure your Supabase environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are correctly configured in your Netlify site's build & deploy settings.

The `netlify.toml` also includes security headers (like Content Security Policy). These might need adjustment based on specific deployment needs or third-party integrations.
