# Breadcrumb Navigation System

## 🎯 Overview

A complete breadcrumb navigation system has been implemented across key pages of the Dragonbane Character Manager application. Breadcrumbs provide users with contextual awareness of their location in the app hierarchy and quick navigation back to parent pages.

## 📦 Components Created

### 1. **Breadcrumbs.tsx** (`src/components/shared/Breadcrumbs.tsx`)

Core breadcrumb component with the following features:
- ✅ Clickable navigation links with hover effects
- ✅ Icon support for visual context
- ✅ Auto-truncation for long entity names
- ✅ Ellipsis rendering for deep hierarchies (max 4 items by default)
- ✅ Accessibility support (ARIA labels)
- ✅ Responsive design with Tailwind CSS
- ✅ Current page (last item) styled differently

### 2. **useBreadcrumbs Hook**

Helper hook for automatic breadcrumb generation based on:
- Current route path  
- Entity names (character, party, etc.)
- Entity types for context

## 🔌 Integration Points

### **CharacterPage** (`src/pages/CharacterPage.tsx`)
```
Home > Character Name
```
- Shows character name dynamically
- Home link navigates to character list

### **PartyView** (`src/pages/PartyView.tsx`)
```
Home > Adventure Party > Party Name > [Active Tab]
```
- Shows party name
- Dynamically adds active tab (e.g., "Combat", "Journal") when not on default "Roster" tab
- Tab icons included for visual context

### **Compendium** (`src/pages/Compendium.tsx`)
```
Home > Compendium
```
- Simple two-level breadcrumb
- Book icon for Compendium

## 🎨 Visual Design

The breadcrumb component uses a clean, modern design:
- **Separator**: ChevronRight icon (subtle gray)
- **Links**: Hover effects with indigo accent color
- **Current page**: Bold, dark text (non-clickable)
- **Icons**: Optional icons for each breadcrumb item
- **Truncation**: Max width of 200px per item with ellipsis

## 🔄 Dynamic Behavior

### Party View Tab Awareness
The PartyView dynamically updates breadcrumbs when users switch tabs:
- Default (Roster): `Home > Adventure Party > Party Name`
- Combat tab: `Home > Adventure Party > Party Name > Combat`
- Journal tab: `Home > Adventure Party > Party Name > Journal`
- etc.

## 📁 Files Modified

1. `/src/components/shared/Breadcrumbs.tsx` - **NEW** (Core component)
2. `/src/components/shared/BreadcrumbsExamples.tsx` - **NEW** (Integration examples)
3. `/src/pages/CharacterPage.tsx` - Added breadcrumbs
4. `/src/pages/PartyView.tsx` - Added dynamic breadcrumbs with tab support
5. `/src/pages/Compendium.tsx` - Added breadcrumbs

## 🚀 Usage

### Basic Usage
```tsx
import { Breadcrumbs } from '../components/shared/Breadcrumbs';
import { Home, Book } from 'lucide-react';

const breadcrumbs = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Current Page', icon: Book }
];

return <Breadcrumbs items={breadcrumbs} />;
```

### With Dynamic Data
```tsx
const breadcrumbs = [
  { label: 'Home', path: '/', icon: Home },
  { label: party?.name || 'Party' }
];
```

## ✨ Benefits

1. **Improved Navigation**: Users can quickly navigate back to parent pages
2. **Context Awareness**: Always know where you are in the app
3. **Better UX**: Especially valuable for deep navigation (Party > Tab views)
4. **Visual Hierarchy**: Clear representation of page structure
5. **Accessibility**: Proper ARIA labels for screen readers

## 🔮 Future Enhancements

Potential improvements for the breadcrumb system:
- Add breadcrumbs to Admin pages
- Implement breadcrumb persistence across navigation
- Add custom breadcrumb colors/themes
- Support for truncation preferences (user settings)
