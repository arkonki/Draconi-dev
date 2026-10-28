-- Chat messages are sent to every member's browser and shown in full, so keep each one to a sensible size.
-- NOT VALID: older messages stay as they are; every new or edited message is checked.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_length;
ALTER TABLE messages
  ADD CONSTRAINT messages_content_length CHECK (char_length(content) BETWEEN 1 AND 4000) NOT VALID;
