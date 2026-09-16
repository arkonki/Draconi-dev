# Live Character Sheet Fixes

Observed on the deployed character page at `draconi.ee` and checked at desktop, tablet, and phone widths.

## Implemented

- Prevent the desktop/tablet action row from extending beyond the sheet. The identity block and actions now stack until the wide desktop breakpoint, and actions can wrap safely.
- Reduce mobile header height by scaling the Dragonbane wordmark appropriately.
- Remove the repeated character-name block on phones. The sticky mobile summary remains the authoritative compact identity and HP/WP display.
- Remove the visible mobile breadcrumb scrollbar and shorten character-page breadcrumbs to Home, ellipsis, and the current character.
- Repair dialog headers with actions at phone widths. Titles and descriptions now receive a full row, while search/actions use a separate responsive row.
- Make the Skills search field fill the available mobile width without squeezing the title into a narrow column.

## Verified problems from the deployed build

- At tablet width, the document was 25px wider than its viewport because the More action ended outside the screen.
- At approximately 900px desktop width, the More action was visibly clipped by the sheet edge.
- At 375px phone width, the character name appeared twice near the top of the sheet.
- The mobile Skills dialog rendered its title and description as a very narrow vertical text column beside search.
- The character breadcrumb exposed a horizontal scrollbar and hid the current-character context off-screen.

## Follow-up checks after deployment

- Recheck the sheet at 375x812, 768x1024, 900px desktop, and 1280px desktop.
- Open Skills, Inventory, Spells, Rest, and More at phone width and confirm their header actions remain readable.
- Confirm the More menu stays anchored below the stacked tablet action row.
