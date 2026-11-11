-- Ensure the 'images' bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for Atlas images
-- Note: We use DROP IF EXISTS to allow re-running this migration safely

-- 1. INSERT
DROP POLICY IF EXISTS "Allow authenticated uploads to Atlas" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to Atlas"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'images' AND (storage.foldername(name))[1] = 'Atlas' );

-- 2. SELECT (Public)
DROP POLICY IF EXISTS "Allow public viewing of Atlas images" ON storage.objects;
CREATE POLICY "Allow public viewing of Atlas images"
ON storage.objects
FOR SELECT
TO public
USING ( bucket_id = 'images' );

-- 3. DELETE (Authenticated users)
DROP POLICY IF EXISTS "Allow authenticated deletion of Atlas images" ON storage.objects;
CREATE POLICY "Allow authenticated deletion of Atlas images"
ON storage.objects
FOR DELETE
TO authenticated
USING ( bucket_id = 'images' AND (storage.foldername(name))[1] = 'Atlas' );
