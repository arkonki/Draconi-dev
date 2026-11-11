-- Add container support to game_items
ALTER TABLE game_items 
ADD COLUMN is_container BOOLEAN DEFAULT FALSE,
ADD COLUMN container_capacity INTEGER DEFAULT 0; -- Capacity in terms of 'number of items' or 'weight' depending on logic.
